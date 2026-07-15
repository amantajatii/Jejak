#![no_std]

use jejak_common::{
    extend_instance_ttl, extend_persistent_ttl, require_positive, ContractError, LifecycleClient,
    OnchainClaimState, VERSION,
};
use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype,
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env, Symbol,
};

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Sac,
    Lifecycle,
    IssuerOperator,
    Pauser(Address),
    Issued(BytesN<32>),
    Holder(BytesN<32>),
    Frozen(Address),
    GlobalPause,
}

#[contractevent(topics = ["asset", "issued"])]
pub struct AssetIssued {
    #[topic]
    pub claim_key: BytesN<32>,
    #[topic]
    pub actor: Address,
    pub holder: Address,
    pub amount: i128,
}
#[contractevent(topics = ["asset", "redeemed"])]
pub struct AssetRedeemed {
    #[topic]
    pub claim_key: BytesN<32>,
    #[topic]
    pub actor: Address,
    pub holder: Address,
    pub amount: i128,
}
#[contractevent(topics = ["holder", "authorized"])]
pub struct HolderAuthorized {
    #[topic]
    pub holder: Address,
    #[topic]
    pub actor: Address,
    pub authorized: bool,
}
#[contractevent(topics = ["holder", "frozen"])]
pub struct HolderFrozen {
    #[topic]
    pub holder: Address,
    #[topic]
    pub actor: Address,
    pub reason_code: Symbol,
}
#[contractevent(topics = ["asset", "clawback"])]
pub struct AssetClawedBack {
    #[topic]
    pub holder: Address,
    #[topic]
    pub actor: Address,
    pub amount: i128,
    pub reason_code: Symbol,
}

#[contractevent(topics = ["asset", "claim_clawback"])]
pub struct ClaimAssetClawedBack {
    #[topic]
    pub claim_key: BytesN<32>,
    #[topic]
    pub actor: Address,
    pub holder: Address,
    pub amount: i128,
    pub remaining: i128,
    pub reason_code: Symbol,
}

#[contract]
pub struct JejakAssetController;

#[contractimpl]
impl JejakAssetController {
    pub fn initialize(
        env: Env,
        admin: Address,
        sac: Address,
        lifecycle: Address,
        issuer_operator: Address,
    ) -> Result<(), ContractError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(ContractError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Sac, &sac);
        env.storage()
            .instance()
            .set(&DataKey::Lifecycle, &lifecycle);
        env.storage()
            .instance()
            .set(&DataKey::IssuerOperator, &issuer_operator);
        env.storage().instance().set(&DataKey::GlobalPause, &false);
        extend_instance_ttl(&env);
        Ok(())
    }

    pub fn set_pauser(
        env: Env,
        admin: Address,
        pauser: Address,
        enabled: bool,
    ) -> Result<(), ContractError> {
        Self::require_admin(&env, &admin)?;
        env.storage()
            .instance()
            .set(&DataKey::Pauser(pauser), &enabled);
        Ok(())
    }

    pub fn set_global_pause(env: Env, pauser: Address, paused: bool) -> Result<(), ContractError> {
        pauser.require_auth();
        if !env
            .storage()
            .instance()
            .get(&DataKey::Pauser(pauser))
            .unwrap_or(false)
        {
            return Err(ContractError::Forbidden);
        }
        env.storage().instance().set(&DataKey::GlobalPause, &paused);
        Ok(())
    }

    pub fn authorize_holder(
        env: Env,
        issuer_operator: Address,
        holder: Address,
        authorized: bool,
    ) -> Result<(), ContractError> {
        Self::require_operator(&env, &issuer_operator)?;
        Self::require_unpaused(&env)?;
        StellarAssetClient::new(&env, &Self::sac(&env)?).set_authorized(&holder, &authorized);
        env.storage()
            .persistent()
            .set(&DataKey::Frozen(holder.clone()), &!authorized);
        HolderAuthorized {
            holder,
            actor: issuer_operator,
            authorized,
        }
        .publish(&env);
        Ok(())
    }

    pub fn issue(
        env: Env,
        issuer_operator: Address,
        claim_key: BytesN<32>,
        facility_holder: Address,
        amount: i128,
    ) -> Result<i128, ContractError> {
        Self::require_operator(&env, &issuer_operator)?;
        Self::require_unpaused(&env)?;
        require_positive(amount)?;
        let issued_key = DataKey::Issued(claim_key.clone());
        let outstanding: i128 = env.storage().persistent().get(&issued_key).unwrap_or(0);
        if outstanding != 0 {
            return Err(ContractError::Replay);
        }
        if env
            .storage()
            .persistent()
            .get(&DataKey::Frozen(facility_holder.clone()))
            .unwrap_or(false)
        {
            return Err(ContractError::HolderNotAuthorized);
        }
        let lifecycle = LifecycleClient::new(&env, &Self::lifecycle(&env)?);
        let claim = lifecycle.get_claim(&claim_key);
        if claim.state != OnchainClaimState::Controlled
            || claim.control_expires_at <= env.ledger().timestamp()
        {
            return Err(ContractError::ControlNotVerified);
        }
        if !lifecycle.attestation_active(&claim_key) {
            return Err(ContractError::AttestationExpired);
        }
        if amount > claim.approved_principal_base_units {
            return Err(ContractError::ValidationFailed);
        }
        StellarAssetClient::new(&env, &Self::sac(&env)?).mint(&facility_holder, &amount);
        env.storage().persistent().set(&issued_key, &amount);
        env.storage()
            .persistent()
            .set(&DataKey::Holder(claim_key.clone()), &facility_holder);
        extend_persistent_ttl(&env, &issued_key);
        lifecycle.transition(
            &issuer_operator,
            &claim_key,
            &OnchainClaimState::Controlled,
            &OnchainClaimState::Issued,
            &Symbol::new(&env, "ASSET_ISSUED"),
        );
        AssetIssued {
            claim_key,
            actor: issuer_operator,
            holder: facility_holder,
            amount,
        }
        .publish(&env);
        Ok(amount)
    }

    pub fn redeem(
        env: Env,
        issuer_operator: Address,
        claim_key: BytesN<32>,
        facility_holder: Address,
        amount: i128,
    ) -> Result<i128, ContractError> {
        Self::require_operator(&env, &issuer_operator)?;
        facility_holder.require_auth();
        require_positive(amount)?;
        let key = DataKey::Issued(claim_key.clone());
        let outstanding: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if amount > outstanding
            || env
                .storage()
                .persistent()
                .get::<_, Address>(&DataKey::Holder(claim_key.clone()))
                != Some(facility_holder.clone())
        {
            return Err(ContractError::ValidationFailed);
        }
        TokenClient::new(&env, &Self::sac(&env)?).burn(&facility_holder, &amount);
        let remaining = outstanding
            .checked_sub(amount)
            .ok_or(ContractError::ArithmeticOverflow)?;
        env.storage().persistent().set(&key, &remaining);
        let lifecycle = LifecycleClient::new(&env, &Self::lifecycle(&env)?);
        let claim = lifecycle.get_claim(&claim_key);
        if remaining == 0 && claim.state == OnchainClaimState::Repaid {
            lifecycle.transition(
                &issuer_operator,
                &claim_key,
                &OnchainClaimState::Repaid,
                &OnchainClaimState::Redeemed,
                &Symbol::new(&env, "ASSET_REDEEMED"),
            );
        }
        AssetRedeemed {
            claim_key,
            actor: issuer_operator,
            holder: facility_holder,
            amount,
        }
        .publish(&env);
        Ok(remaining)
    }

    pub fn freeze(
        env: Env,
        actor: Address,
        holder: Address,
        reason_code: Symbol,
    ) -> Result<(), ContractError> {
        actor.require_auth();
        if actor != Self::operator(&env)?
            && !env
                .storage()
                .instance()
                .get(&DataKey::Pauser(actor.clone()))
                .unwrap_or(false)
        {
            return Err(ContractError::Forbidden);
        }
        StellarAssetClient::new(&env, &Self::sac(&env)?).set_authorized(&holder, &false);
        env.storage()
            .persistent()
            .set(&DataKey::Frozen(holder.clone()), &true);
        HolderFrozen {
            holder,
            actor,
            reason_code,
        }
        .publish(&env);
        Ok(())
    }

    pub fn clawback(
        env: Env,
        issuer_operator: Address,
        holder: Address,
        amount: i128,
        reason_code: Symbol,
    ) -> Result<(), ContractError> {
        Self::require_operator(&env, &issuer_operator)?;
        require_positive(amount)?;
        StellarAssetClient::new(&env, &Self::sac(&env)?).clawback(&holder, &amount);
        AssetClawedBack {
            holder,
            actor: issuer_operator,
            amount,
            reason_code,
        }
        .publish(&env);
        Ok(())
    }

    /// Emergency clawback that also reconciles the per-claim outstanding
    /// issuance. The frozen Section 21 `clawback` entrypoint remains available;
    /// orchestration should prefer this claim-aware additive entrypoint.
    pub fn clawback_claim(
        env: Env,
        issuer_operator: Address,
        claim_key: BytesN<32>,
        facility_holder: Address,
        amount: i128,
        reason_code: Symbol,
    ) -> Result<i128, ContractError> {
        Self::require_operator(&env, &issuer_operator)?;
        require_positive(amount)?;
        let key = DataKey::Issued(claim_key.clone());
        let outstanding: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if amount > outstanding
            || env
                .storage()
                .persistent()
                .get::<_, Address>(&DataKey::Holder(claim_key.clone()))
                != Some(facility_holder.clone())
        {
            return Err(ContractError::ValidationFailed);
        }
        StellarAssetClient::new(&env, &Self::sac(&env)?).clawback(&facility_holder, &amount);
        let remaining = outstanding
            .checked_sub(amount)
            .ok_or(ContractError::ArithmeticOverflow)?;
        env.storage().persistent().set(&key, &remaining);
        extend_persistent_ttl(&env, &key);
        ClaimAssetClawedBack {
            claim_key,
            actor: issuer_operator,
            holder: facility_holder,
            amount,
            remaining,
            reason_code,
        }
        .publish(&env);
        Ok(remaining)
    }

    pub fn close_claim(
        env: Env,
        issuer_operator: Address,
        claim_key: BytesN<32>,
        reason_code: Symbol,
    ) -> Result<(), ContractError> {
        Self::require_operator(&env, &issuer_operator)?;
        if Self::get_issued_for_claim(env.clone(), claim_key.clone()) != 0 {
            return Err(ContractError::ValidationFailed);
        }
        LifecycleClient::new(&env, &Self::lifecycle(&env)?).transition(
            &issuer_operator,
            &claim_key,
            &OnchainClaimState::Redeemed,
            &OnchainClaimState::Closed,
            &reason_code,
        );
        Ok(())
    }

    pub fn get_issued_for_claim(env: Env, claim_key: BytesN<32>) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Issued(claim_key))
            .unwrap_or(0)
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
    fn sac(env: &Env) -> Result<Address, ContractError> {
        env.storage()
            .instance()
            .get(&DataKey::Sac)
            .ok_or(ContractError::NotFound)
    }
    fn lifecycle(env: &Env) -> Result<Address, ContractError> {
        env.storage()
            .instance()
            .get(&DataKey::Lifecycle)
            .ok_or(ContractError::NotFound)
    }
    fn operator(env: &Env) -> Result<Address, ContractError> {
        env.storage()
            .instance()
            .get(&DataKey::IssuerOperator)
            .ok_or(ContractError::NotFound)
    }
    fn require_admin(env: &Env, actor: &Address) -> Result<(), ContractError> {
        actor.require_auth();
        if Self::admin(env)? != *actor {
            return Err(ContractError::Forbidden);
        }
        Ok(())
    }
    fn require_operator(env: &Env, actor: &Address) -> Result<(), ContractError> {
        actor.require_auth();
        if Self::operator(env)? != *actor {
            return Err(ContractError::Forbidden);
        }
        Ok(())
    }
    fn require_unpaused(env: &Env) -> Result<(), ContractError> {
        if env
            .storage()
            .instance()
            .get(&DataKey::GlobalPause)
            .unwrap_or(false)
        {
            Err(ContractError::CircuitBreakerActive)
        } else {
            Ok(())
        }
    }
}
