#![no_std]

use jejak_common::{
    checked_add, extend_instance_ttl, extend_persistent_ttl, require_nonnegative, ContractError,
    LifecycleClient, OnchainClaimState, Resolution, ResolutionStatus, VERSION,
};
use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, Address, BytesN, Env, Symbol,
};

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Lifecycle,
    Resolver(Address),
    Resolution(BytesN<32>),
    Evidence(BytesN<32>),
}

#[contractevent(topics = ["resolution", "opened"])]
pub struct ResolutionOpened {
    #[topic]
    pub claim_key: BytesN<32>,
    #[topic]
    pub actor: Address,
    pub reason_code: Symbol,
    pub evidence_hash: BytesN<32>,
}
#[contractevent(topics = ["recovery", "recorded"])]
pub struct RecoveryRecorded {
    #[topic]
    pub claim_key: BytesN<32>,
    #[topic]
    pub actor: Address,
    pub amount: i128,
    pub evidence_hash: BytesN<32>,
}
#[contractevent(topics = ["resolution", "closed"])]
pub struct ResolutionClosed {
    #[topic]
    pub claim_key: BytesN<32>,
    #[topic]
    pub actor: Address,
    pub recovered: i128,
    pub final_loss: i128,
    pub resolution_hash: BytesN<32>,
}

#[contract]
pub struct JejakResolutionManager;

#[contractimpl]
impl JejakResolutionManager {
    pub fn initialize(env: Env, admin: Address, lifecycle: Address) -> Result<(), ContractError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(ContractError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::Lifecycle, &lifecycle);
        extend_instance_ttl(&env);
        Ok(())
    }

    pub fn authorize_resolver(
        env: Env,
        admin: Address,
        resolver: Address,
        enabled: bool,
    ) -> Result<(), ContractError> {
        Self::require_admin(&env, &admin)?;
        env.storage()
            .instance()
            .set(&DataKey::Resolver(resolver), &enabled);
        Ok(())
    }

    pub fn open(
        env: Env,
        resolver: Address,
        claim_key: BytesN<32>,
        reason_code: Symbol,
        evidence_hash: BytesN<32>,
    ) -> Result<Resolution, ContractError> {
        Self::require_resolver(&env, &resolver)?;
        let key = DataKey::Resolution(claim_key.clone());
        if env.storage().persistent().has(&key) {
            return Err(ContractError::Replay);
        }
        let lifecycle = LifecycleClient::new(&env, &Self::lifecycle(&env)?);
        if lifecycle.get_claim(&claim_key).state != OnchainClaimState::Shortfall {
            return Err(ContractError::InvalidStateTransition);
        }
        let resolution = Resolution {
            claim_key: claim_key.clone(),
            resolver: resolver.clone(),
            status: ResolutionStatus::Open,
            reason_code: reason_code.clone(),
            opening_evidence_hash: evidence_hash.clone(),
            recovered: 0,
            final_loss: 0,
            resolution_hash: None,
        };
        env.storage().persistent().set(&key, &resolution);
        env.storage()
            .persistent()
            .set(&DataKey::Evidence(evidence_hash.clone()), &true);
        extend_persistent_ttl(&env, &key);
        lifecycle.transition(
            &resolver,
            &claim_key,
            &OnchainClaimState::Shortfall,
            &OnchainClaimState::Resolution,
            &reason_code,
        );
        ResolutionOpened {
            claim_key,
            actor: resolver,
            reason_code,
            evidence_hash,
        }
        .publish(&env);
        Ok(resolution)
    }

    pub fn record_recovery(
        env: Env,
        resolver: Address,
        claim_key: BytesN<32>,
        amount: i128,
        evidence_hash: BytesN<32>,
    ) -> Result<Resolution, ContractError> {
        Self::require_resolver(&env, &resolver)?;
        require_nonnegative(amount)?;
        let evidence_key = DataKey::Evidence(evidence_hash.clone());
        if env.storage().persistent().has(&evidence_key) {
            return Err(ContractError::Replay);
        }
        let key = DataKey::Resolution(claim_key.clone());
        let mut resolution: Resolution = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(ContractError::NotFound)?;
        if resolution.resolver != resolver
            || matches!(
                resolution.status,
                ResolutionStatus::Settled | ResolutionStatus::WrittenOff
            )
        {
            return Err(ContractError::Forbidden);
        }
        resolution.recovered = checked_add(resolution.recovered, amount)?;
        resolution.status = ResolutionStatus::Recovering;
        env.storage().persistent().set(&key, &resolution);
        env.storage().persistent().set(&evidence_key, &true);
        RecoveryRecorded {
            claim_key,
            actor: resolver,
            amount,
            evidence_hash,
        }
        .publish(&env);
        Ok(resolution)
    }

    pub fn close(
        env: Env,
        resolver: Address,
        claim_key: BytesN<32>,
        recovered: i128,
        final_loss: i128,
        resolution_hash: BytesN<32>,
    ) -> Result<Resolution, ContractError> {
        Self::require_resolver(&env, &resolver)?;
        require_nonnegative(recovered)?;
        require_nonnegative(final_loss)?;
        let hash_key = DataKey::Evidence(resolution_hash.clone());
        if env.storage().persistent().has(&hash_key) {
            return Err(ContractError::Replay);
        }
        let key = DataKey::Resolution(claim_key.clone());
        let mut resolution: Resolution = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(ContractError::NotFound)?;
        if resolution.resolver != resolver || recovered < resolution.recovered {
            return Err(ContractError::ValidationFailed);
        }
        resolution.recovered = recovered;
        resolution.final_loss = final_loss;
        resolution.resolution_hash = Some(resolution_hash.clone());
        resolution.status = if final_loss == 0 {
            ResolutionStatus::Settled
        } else {
            ResolutionStatus::WrittenOff
        };
        env.storage().persistent().set(&key, &resolution);
        env.storage().persistent().set(&hash_key, &true);
        let next = if final_loss == 0 {
            OnchainClaimState::Closed
        } else {
            OnchainClaimState::ClosedWithLoss
        };
        LifecycleClient::new(&env, &Self::lifecycle(&env)?).transition(
            &resolver,
            &claim_key,
            &OnchainClaimState::Resolution,
            &next,
            &Symbol::new(
                &env,
                if final_loss == 0 {
                    "RESOLUTION_SETTLED"
                } else {
                    "LOSS_FINALIZED"
                },
            ),
        );
        ResolutionClosed {
            claim_key,
            actor: resolver,
            recovered,
            final_loss,
            resolution_hash,
        }
        .publish(&env);
        Ok(resolution)
    }

    pub fn get_resolution(env: Env, claim_key: BytesN<32>) -> Result<Resolution, ContractError> {
        env.storage()
            .persistent()
            .get(&DataKey::Resolution(claim_key))
            .ok_or(ContractError::NotFound)
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
    fn lifecycle(env: &Env) -> Result<Address, ContractError> {
        env.storage()
            .instance()
            .get(&DataKey::Lifecycle)
            .ok_or(ContractError::NotFound)
    }
    fn require_admin(env: &Env, actor: &Address) -> Result<(), ContractError> {
        actor.require_auth();
        if Self::admin(env)? != *actor {
            return Err(ContractError::Forbidden);
        }
        Ok(())
    }
    fn require_resolver(env: &Env, actor: &Address) -> Result<(), ContractError> {
        actor.require_auth();
        if !env
            .storage()
            .instance()
            .get(&DataKey::Resolver(actor.clone()))
            .unwrap_or(false)
        {
            return Err(ContractError::Forbidden);
        }
        Ok(())
    }
}
