#![no_std]

use jejak_common::{
    extend_instance_ttl, extend_persistent_ttl, require_positive, ContractError,
    EligibilityRegistryClient, OnchainClaim, OnchainClaimState, Role, VERSION,
};
use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, Address, BytesN, Env, Symbol,
};

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Registry,
    Role(Role, Address),
    Claim(BytesN<32>),
}

#[contractevent(topics = ["claim", "created"])]
pub struct ClaimCreated {
    #[topic]
    pub claim_key: BytesN<32>,
    #[topic]
    pub actor: Address,
    pub facility_id: BytesN<32>,
    pub approved_principal: i128,
}

#[contractevent(topics = ["claim", "control"])]
pub struct ControlConfirmed {
    #[topic]
    pub claim_key: BytesN<32>,
    #[topic]
    pub actor: Address,
    pub evidence_hash: BytesN<32>,
    pub expires_at: u64,
}

#[contractevent(topics = ["claim", "transition"])]
pub struct ClaimTransitioned {
    #[topic]
    pub claim_key: BytesN<32>,
    #[topic]
    pub actor: Address,
    pub previous: OnchainClaimState,
    pub next: OnchainClaimState,
    pub reason_code: Symbol,
    pub version: u32,
}

#[contract]
pub struct JejakClaimLifecycle;

#[contractimpl]
impl JejakClaimLifecycle {
    pub fn initialize(
        env: Env,
        admin: Address,
        eligibility_registry: Address,
    ) -> Result<(), ContractError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(ContractError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::Registry, &eligibility_registry);
        extend_instance_ttl(&env);
        Ok(())
    }

    pub fn set_role(
        env: Env,
        admin: Address,
        role: Role,
        actor: Address,
        enabled: bool,
    ) -> Result<(), ContractError> {
        Self::require_admin(&env, &admin)?;
        env.storage()
            .instance()
            .set(&DataKey::Role(role, actor), &enabled);
        extend_instance_ttl(&env);
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_claim(
        env: Env,
        originator: Address,
        claim_key: BytesN<32>,
        seller_subject_hash: BytesN<32>,
        facility_id: BytesN<32>,
        source_amount: i128,
        source_currency_hash: BytesN<32>,
        attestation_key: BytesN<32>,
        approved_principal_base_units: i128,
    ) -> Result<OnchainClaim, ContractError> {
        Self::require_role(&env, Role::Originator, &originator)?;
        require_positive(source_amount)?;
        require_positive(approved_principal_base_units)?;
        let key = DataKey::Claim(claim_key.clone());
        if env.storage().persistent().has(&key) {
            return Err(ContractError::ClaimAlreadyEncumbered);
        }
        let registry = Self::registry(&env)?;
        let registry_client = EligibilityRegistryClient::new(&env, &registry);
        if !registry_client.is_active(&attestation_key, &env.ledger().timestamp()) {
            return Err(ContractError::AttestationExpired);
        }
        let attestation = registry_client.get_attestation(&attestation_key);
        if attestation.claim_key != claim_key {
            return Err(ContractError::ValidationFailed);
        }
        let claim = OnchainClaim {
            claim_key: claim_key.clone(),
            seller_subject_hash,
            facility_id: facility_id.clone(),
            source_amount,
            source_currency_hash,
            approved_principal_base_units,
            attestation_key,
            state: OnchainClaimState::Eligible,
            state_version: 1,
            evidence_hash: None,
            control_expires_at: 0,
            paused_from: OnchainClaimState::Eligible,
            has_paused_from: false,
        };
        env.storage().persistent().set(&key, &claim);
        extend_persistent_ttl(&env, &key);
        ClaimCreated {
            claim_key,
            actor: originator,
            facility_id,
            approved_principal: approved_principal_base_units,
        }
        .publish(&env);
        Ok(claim)
    }

    pub fn confirm_control(
        env: Env,
        actor: Address,
        claim_key: BytesN<32>,
        evidence_hash: BytesN<32>,
        expires_at: u64,
    ) -> Result<OnchainClaim, ContractError> {
        actor.require_auth();
        if !Self::has_role(&env, Role::Originator, &actor)
            && !Self::has_role(&env, Role::Control, &actor)
        {
            return Err(ContractError::Forbidden);
        }
        if expires_at <= env.ledger().timestamp() {
            return Err(ContractError::ValidationFailed);
        }
        let key = DataKey::Claim(claim_key.clone());
        let mut claim: OnchainClaim = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(ContractError::NotFound)?;
        if claim.state != OnchainClaimState::Eligible {
            return Err(ContractError::InvalidStateTransition);
        }
        claim.state = OnchainClaimState::Controlled;
        claim.state_version = claim
            .state_version
            .checked_add(1)
            .ok_or(ContractError::ArithmeticOverflow)?;
        claim.evidence_hash = Some(evidence_hash.clone());
        claim.control_expires_at = expires_at;
        env.storage().persistent().set(&key, &claim);
        extend_persistent_ttl(&env, &key);
        ControlConfirmed {
            claim_key,
            actor,
            evidence_hash,
            expires_at,
        }
        .publish(&env);
        Ok(claim)
    }

    pub fn transition(
        env: Env,
        actor: Address,
        claim_key: BytesN<32>,
        expected_state: OnchainClaimState,
        next_state: OnchainClaimState,
        reason_code: Symbol,
    ) -> Result<OnchainClaim, ContractError> {
        actor.require_auth();
        let key = DataKey::Claim(claim_key.clone());
        let mut claim: OnchainClaim = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(ContractError::NotFound)?;
        if claim.state.is_terminal() {
            return Err(ContractError::TerminalState);
        }
        if claim.state != expected_state {
            return Err(ContractError::VersionConflict);
        }
        Self::validate_transition(&env, &actor, &claim, next_state)?;
        let previous = claim.state;
        claim.state = next_state;
        claim.state_version = claim
            .state_version
            .checked_add(1)
            .ok_or(ContractError::ArithmeticOverflow)?;
        env.storage().persistent().set(&key, &claim);
        extend_persistent_ttl(&env, &key);
        ClaimTransitioned {
            claim_key,
            actor,
            previous,
            next: next_state,
            reason_code,
            version: claim.state_version,
        }
        .publish(&env);
        Ok(claim)
    }

    pub fn pause(
        env: Env,
        pauser: Address,
        claim_key: BytesN<32>,
        reason_code: Symbol,
    ) -> Result<OnchainClaim, ContractError> {
        Self::require_role(&env, Role::Pauser, &pauser)?;
        let key = DataKey::Claim(claim_key.clone());
        let mut claim: OnchainClaim = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(ContractError::NotFound)?;
        if claim.state.is_terminal() {
            return Err(ContractError::TerminalState);
        }
        if claim.state == OnchainClaimState::Paused {
            return Err(ContractError::Replay);
        }
        let previous = claim.state;
        claim.paused_from = previous;
        claim.has_paused_from = true;
        claim.state = OnchainClaimState::Paused;
        claim.state_version += 1;
        env.storage().persistent().set(&key, &claim);
        extend_persistent_ttl(&env, &key);
        ClaimTransitioned {
            claim_key,
            actor: pauser,
            previous,
            next: OnchainClaimState::Paused,
            reason_code,
            version: claim.state_version,
        }
        .publish(&env);
        Ok(claim)
    }

    pub fn resume(
        env: Env,
        admin: Address,
        claim_key: BytesN<32>,
        target_state: OnchainClaimState,
        reason_code: Symbol,
    ) -> Result<OnchainClaim, ContractError> {
        Self::require_admin(&env, &admin)?;
        let key = DataKey::Claim(claim_key.clone());
        let mut claim: OnchainClaim = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(ContractError::NotFound)?;
        let exact_resume = claim.paused_from == target_state;
        let compensated_funding_failure = claim.paused_from == OnchainClaimState::Issued
            && target_state == OnchainClaimState::Controlled;
        if claim.state != OnchainClaimState::Paused
            || !claim.has_paused_from
            || (!exact_resume && !compensated_funding_failure)
        {
            return Err(ContractError::InvalidStateTransition);
        }
        claim.state = target_state;
        claim.has_paused_from = false;
        claim.state_version += 1;
        env.storage().persistent().set(&key, &claim);
        extend_persistent_ttl(&env, &key);
        ClaimTransitioned {
            claim_key,
            actor: admin,
            previous: OnchainClaimState::Paused,
            next: target_state,
            reason_code,
            version: claim.state_version,
        }
        .publish(&env);
        Ok(claim)
    }

    pub fn get_claim(env: Env, claim_key: BytesN<32>) -> Result<OnchainClaim, ContractError> {
        let key = DataKey::Claim(claim_key);
        let claim = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(ContractError::NotFound)?;
        extend_persistent_ttl(&env, &key);
        Ok(claim)
    }

    pub fn attestation_active(env: Env, claim_key: BytesN<32>) -> Result<bool, ContractError> {
        let claim = Self::get_claim(env.clone(), claim_key)?;
        let registry = Self::registry(&env)?;
        Ok(EligibilityRegistryClient::new(&env, &registry)
            .is_active(&claim.attestation_key, &env.ledger().timestamp()))
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
    fn registry(env: &Env) -> Result<Address, ContractError> {
        env.storage()
            .instance()
            .get(&DataKey::Registry)
            .ok_or(ContractError::NotFound)
    }
    fn has_role(env: &Env, role: Role, actor: &Address) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Role(role, actor.clone()))
            .unwrap_or(false)
    }
    fn require_role(env: &Env, role: Role, actor: &Address) -> Result<(), ContractError> {
        actor.require_auth();
        if !Self::has_role(env, role, actor) {
            return Err(ContractError::Forbidden);
        }
        Ok(())
    }
    fn require_admin(env: &Env, actor: &Address) -> Result<(), ContractError> {
        actor.require_auth();
        if Self::admin(env)? != *actor {
            return Err(ContractError::Forbidden);
        }
        Ok(())
    }

    fn validate_transition(
        env: &Env,
        actor: &Address,
        claim: &OnchainClaim,
        next: OnchainClaimState,
    ) -> Result<(), ContractError> {
        let valid = match (claim.state, next) {
            (OnchainClaimState::Controlled, OnchainClaimState::Issued) => {
                Self::has_role(env, Role::Issuer, actor)
                    && claim.control_expires_at > env.ledger().timestamp()
            }
            (OnchainClaimState::Issued, OnchainClaimState::Funded) => {
                Self::has_role(env, Role::Facility, actor)
            }
            (OnchainClaimState::Funded, OnchainClaimState::Settling)
            | (OnchainClaimState::Settling, OnchainClaimState::Repaid)
            | (OnchainClaimState::Settling, OnchainClaimState::Shortfall) => {
                Self::has_role(env, Role::Servicer, actor)
            }
            (OnchainClaimState::Repaid, OnchainClaimState::Redeemed)
            | (OnchainClaimState::Redeemed, OnchainClaimState::Closed) => {
                Self::has_role(env, Role::Issuer, actor)
            }
            (OnchainClaimState::Shortfall, OnchainClaimState::Resolution)
            | (OnchainClaimState::Resolution, OnchainClaimState::Closed)
            | (OnchainClaimState::Resolution, OnchainClaimState::ClosedWithLoss) => {
                Self::has_role(env, Role::Resolver, actor)
            }
            _ => false,
        };
        if !valid {
            return Err(ContractError::InvalidStateTransition);
        }
        Ok(())
    }
}
