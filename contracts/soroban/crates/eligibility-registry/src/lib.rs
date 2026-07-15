#![no_std]

use jejak_common::{
    extend_instance_ttl, extend_persistent_ttl, AttestationRef, ContractError, VERSION,
};
use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, Address, BytesN, Env, Symbol,
};

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Oracle(Address),
    Attestation(BytesN<32>),
    Revoked(BytesN<32>),
}

#[contractevent(topics = ["attestation", "registered"])]
pub struct AttestationRegistered {
    #[topic]
    pub claim_key: BytesN<32>,
    #[topic]
    pub actor: Address,
    pub attestation_key: BytesN<32>,
    pub envelope_hash: BytesN<32>,
    pub expires_at: u64,
}

#[contractevent(topics = ["attestation", "revoked"])]
pub struct AttestationRevoked {
    #[topic]
    pub attestation_key: BytesN<32>,
    #[topic]
    pub actor: Address,
    pub reason_code: Symbol,
}

#[contract]
pub struct JejakEligibilityRegistry;

#[contractimpl]
impl JejakEligibilityRegistry {
    pub fn initialize(env: Env, admin: Address, oracle: Address) -> Result<(), ContractError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(ContractError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::Oracle(oracle), &true);
        extend_instance_ttl(&env);
        Ok(())
    }

    pub fn set_oracle(
        env: Env,
        admin: Address,
        oracle: Address,
        enabled: bool,
    ) -> Result<(), ContractError> {
        Self::require_admin(&env, &admin)?;
        env.storage()
            .instance()
            .set(&DataKey::Oracle(oracle), &enabled);
        extend_instance_ttl(&env);
        Ok(())
    }

    pub fn register_attestation(
        env: Env,
        oracle: Address,
        attestation: AttestationRef,
    ) -> Result<(), ContractError> {
        oracle.require_auth();
        if !Self::oracle_enabled(&env, &oracle) {
            return Err(ContractError::Forbidden);
        }
        if attestation.oracle != oracle
            || attestation.sds_bps > 10_000
            || attestation.esv_base_units < 0
        {
            return Err(ContractError::ValidationFailed);
        }
        if attestation.expires_at <= env.ledger().timestamp() {
            return Err(ContractError::AttestationExpired);
        }
        let key = DataKey::Attestation(attestation.attestation_key.clone());
        if env.storage().persistent().has(&key) {
            return Err(ContractError::Replay);
        }
        env.storage().persistent().set(&key, &attestation);
        extend_persistent_ttl(&env, &key);
        AttestationRegistered {
            claim_key: attestation.claim_key,
            actor: oracle,
            attestation_key: attestation.attestation_key,
            envelope_hash: attestation.envelope_hash,
            expires_at: attestation.expires_at,
        }
        .publish(&env);
        Ok(())
    }

    pub fn revoke_attestation(
        env: Env,
        actor: Address,
        attestation_key: BytesN<32>,
        reason_code: Symbol,
    ) -> Result<(), ContractError> {
        actor.require_auth();
        let admin = Self::admin(&env)?;
        if actor != admin && !Self::oracle_enabled(&env, &actor) {
            return Err(ContractError::Forbidden);
        }
        let attestation_key_data = DataKey::Attestation(attestation_key.clone());
        if !env.storage().persistent().has(&attestation_key_data) {
            return Err(ContractError::AttestationMissing);
        }
        let revoked_key = DataKey::Revoked(attestation_key.clone());
        if env.storage().persistent().has(&revoked_key) {
            return Err(ContractError::Replay);
        }
        env.storage().persistent().set(&revoked_key, &reason_code);
        extend_persistent_ttl(&env, &revoked_key);
        AttestationRevoked {
            attestation_key,
            actor,
            reason_code,
        }
        .publish(&env);
        Ok(())
    }

    pub fn get_attestation(
        env: Env,
        attestation_key: BytesN<32>,
    ) -> Result<AttestationRef, ContractError> {
        let key = DataKey::Attestation(attestation_key);
        let value = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(ContractError::AttestationMissing)?;
        extend_persistent_ttl(&env, &key);
        Ok(value)
    }

    pub fn is_active(env: Env, attestation_key: BytesN<32>, now: u64) -> bool {
        let key = DataKey::Attestation(attestation_key.clone());
        let Some(attestation): Option<AttestationRef> = env.storage().persistent().get(&key) else {
            return false;
        };
        extend_persistent_ttl(&env, &key);
        !env.storage()
            .persistent()
            .has(&DataKey::Revoked(attestation_key))
            && now < attestation.expires_at
    }

    pub fn version() -> u32 {
        VERSION
    }

    pub fn upgrade(
        env: Env,
        admin: Address,
        new_wasm_hash: BytesN<32>,
    ) -> Result<(), ContractError> {
        Self::require_admin(&env, &admin)?;
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Ok(())
    }

    fn admin(env: &Env) -> Result<Address, ContractError> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ContractError::NotFound)
    }

    fn require_admin(env: &Env, actor: &Address) -> Result<(), ContractError> {
        actor.require_auth();
        if Self::admin(env)? != *actor {
            return Err(ContractError::Forbidden);
        }
        Ok(())
    }

    fn oracle_enabled(env: &Env, oracle: &Address) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Oracle(oracle.clone()))
            .unwrap_or(false)
    }
}
