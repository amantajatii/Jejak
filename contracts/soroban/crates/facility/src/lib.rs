#![no_std]

use jejak_common::{
    checked_add, checked_sub, extend_instance_ttl, extend_persistent_ttl, require_nonnegative,
    require_positive, AssetControllerClient, ContractError, FacilityLimits, LifecycleClient,
    OnchainClaimState, Position, VERSION,
};
use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, token::TokenClient, Address, BytesN, Env,
    MuxedAddress, Symbol,
};

#[contracttype]
#[derive(Clone)]
struct FacilityConfig {
    operator: Address,
    treasury: Address,
    limits: FacilityLimits,
    outstanding: i128,
    paused: bool,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    FundingSac,
    JclaimController,
    Lifecycle,
    Servicer(Address),
    Waterfall,
    Facility(BytesN<32>),
    Position(BytesN<32>),
    Repayment(BytesN<32>),
    FirstLoss(BytesN<32>),
    Loss(BytesN<32>),
}

#[contractevent(topics = ["position", "funded"])]
pub struct PositionFunded {
    #[topic]
    pub claim_key: BytesN<32>,
    #[topic]
    pub actor: Address,
    pub principal: i128,
    pub first_loss: i128,
    pub seller: Address,
}
#[contractevent(topics = ["repayment", "recorded"])]
pub struct RepaymentRecorded {
    #[topic]
    pub claim_key: BytesN<32>,
    #[topic]
    pub actor: Address,
    pub amount: i128,
    pub result_hash: BytesN<32>,
}

#[contractevent(topics = ["position", "written_off"])]
pub struct PositionWrittenOff {
    #[topic]
    pub claim_key: BytesN<32>,
    #[topic]
    pub actor: Address,
    pub amount: i128,
    pub result_hash: BytesN<32>,
}

#[contract]
pub struct JejakFacility;

#[contractimpl]
impl JejakFacility {
    pub fn initialize(
        env: Env,
        admin: Address,
        funding_sac: Address,
        jclaim_controller: Address,
        lifecycle: Address,
    ) -> Result<(), ContractError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(ContractError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::FundingSac, &funding_sac);
        env.storage()
            .instance()
            .set(&DataKey::JclaimController, &jclaim_controller);
        env.storage()
            .instance()
            .set(&DataKey::Lifecycle, &lifecycle);
        extend_instance_ttl(&env);
        Ok(())
    }

    pub fn configure_facility(
        env: Env,
        admin: Address,
        facility_id: BytesN<32>,
        operator: Address,
        treasury: Address,
        limits: FacilityLimits,
    ) -> Result<(), ContractError> {
        Self::require_admin(&env, &admin)?;
        require_positive(limits.max_total_principal)?;
        require_positive(limits.max_position_principal)?;
        require_nonnegative(limits.max_first_loss)?;
        env.storage().persistent().set(
            &DataKey::Facility(facility_id.clone()),
            &FacilityConfig {
                operator,
                treasury,
                limits,
                outstanding: 0,
                paused: false,
            },
        );
        extend_persistent_ttl(&env, &DataKey::Facility(facility_id));
        Ok(())
    }

    pub fn configure_servicing(
        env: Env,
        admin: Address,
        servicer: Address,
        enabled: bool,
    ) -> Result<(), ContractError> {
        Self::require_admin(&env, &admin)?;
        env.storage()
            .instance()
            .set(&DataKey::Servicer(servicer), &enabled);
        Ok(())
    }

    pub fn set_waterfall(
        env: Env,
        admin: Address,
        waterfall: Address,
    ) -> Result<(), ContractError> {
        Self::require_admin(&env, &admin)?;
        env.storage()
            .instance()
            .set(&DataKey::Waterfall, &waterfall);
        Ok(())
    }

    pub fn pause_facility(
        env: Env,
        admin: Address,
        facility_id: BytesN<32>,
        paused: bool,
    ) -> Result<(), ContractError> {
        Self::require_admin(&env, &admin)?;
        let key = DataKey::Facility(facility_id);
        let mut cfg: FacilityConfig = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(ContractError::NotFound)?;
        cfg.paused = paused;
        env.storage().persistent().set(&key, &cfg);
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn fund(
        env: Env,
        operator: Address,
        claim_key: BytesN<32>,
        source: Address,
        seller_payout_account: Address,
        principal: i128,
        first_loss: i128,
    ) -> Result<Position, ContractError> {
        operator.require_auth();
        source.require_auth();
        require_positive(principal)?;
        require_nonnegative(first_loss)?;
        let lifecycle = LifecycleClient::new(&env, &Self::lifecycle(&env)?);
        let claim = lifecycle.get_claim(&claim_key);
        if claim.state != OnchainClaimState::Issued {
            return Err(ContractError::InvalidStateTransition);
        }
        if !lifecycle.attestation_active(&claim_key) {
            return Err(ContractError::AttestationExpired);
        }
        let cfg_key = DataKey::Facility(claim.facility_id.clone());
        let mut cfg: FacilityConfig = env
            .storage()
            .persistent()
            .get(&cfg_key)
            .ok_or(ContractError::NotFound)?;
        if cfg.operator != operator || cfg.treasury != source {
            return Err(ContractError::Forbidden);
        }
        if cfg.paused {
            return Err(ContractError::CircuitBreakerActive);
        }
        if principal > cfg.limits.max_position_principal || first_loss > cfg.limits.max_first_loss {
            return Err(ContractError::ValidationFailed);
        }
        if checked_add(cfg.outstanding, principal)? > cfg.limits.max_total_principal {
            return Err(ContractError::InsufficientFacilityLiquidity);
        }
        if principal != claim.approved_principal_base_units
            || AssetControllerClient::new(&env, &Self::controller(&env)?)
                .get_issued_for_claim(&claim_key)
                != principal
        {
            return Err(ContractError::ValidationFailed);
        }
        let position_key = DataKey::Position(claim_key.clone());
        if env.storage().persistent().has(&position_key) {
            return Err(ContractError::ClaimAlreadyEncumbered);
        }
        let token = TokenClient::new(&env, &Self::funding_sac_addr(&env)?);
        if token.balance(&source) < checked_add(principal, first_loss)? {
            return Err(ContractError::InsufficientFacilityLiquidity);
        }
        token.transfer(
            &source,
            MuxedAddress::from(seller_payout_account.clone()),
            &principal,
        );
        if first_loss > 0 {
            token.transfer(
                &source,
                MuxedAddress::from(env.current_contract_address()),
                &first_loss,
            );
        }
        let position = Position {
            claim_key: claim_key.clone(),
            facility_id: claim.facility_id,
            source,
            seller_payout_account: seller_payout_account.clone(),
            principal,
            outstanding_principal: principal,
            first_loss_funded: first_loss,
            first_loss_consumed: 0,
            repaid: 0,
            active: true,
        };
        cfg.outstanding = checked_add(cfg.outstanding, principal)?;
        env.storage().persistent().set(&cfg_key, &cfg);
        env.storage().persistent().set(&position_key, &position);
        extend_persistent_ttl(&env, &position_key);
        lifecycle.transition(
            &operator,
            &claim_key,
            &OnchainClaimState::Issued,
            &OnchainClaimState::Funded,
            &Symbol::new(&env, "POSITION_FUNDED"),
        );
        PositionFunded {
            claim_key,
            actor: operator,
            principal,
            first_loss,
            seller: seller_payout_account,
        }
        .publish(&env);
        Ok(position)
    }

    pub fn record_repayment(
        env: Env,
        servicer: Address,
        claim_key: BytesN<32>,
        amount: i128,
    ) -> Result<Position, ContractError> {
        let hash = BytesN::from_array(&env, &[0; 32]);
        Self::apply_repayment(env, servicer, claim_key, amount, hash)
    }

    pub fn apply_repayment(
        env: Env,
        servicer: Address,
        claim_key: BytesN<32>,
        amount: i128,
        result_hash: BytesN<32>,
    ) -> Result<Position, ContractError> {
        Self::require_servicer(&env, &servicer)?;
        require_nonnegative(amount)?;
        let replay_key = DataKey::Repayment(result_hash.clone());
        if env.storage().persistent().has(&replay_key) {
            return Err(ContractError::Replay);
        }
        let key = DataKey::Position(claim_key.clone());
        let mut position: Position = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(ContractError::NotFound)?;
        if amount > position.outstanding_principal {
            return Err(ContractError::ValidationFailed);
        }
        position.outstanding_principal = checked_sub(position.outstanding_principal, amount)?;
        position.repaid = checked_add(position.repaid, amount)?;
        if position.outstanding_principal == 0 {
            position.active = false;
        }
        env.storage().persistent().set(&key, &position);
        env.storage().persistent().set(&replay_key, &true);
        let cfg_key = DataKey::Facility(position.facility_id.clone());
        let mut cfg: FacilityConfig = env
            .storage()
            .persistent()
            .get(&cfg_key)
            .ok_or(ContractError::NotFound)?;
        cfg.outstanding = checked_sub(cfg.outstanding, amount)?;
        env.storage().persistent().set(&cfg_key, &cfg);
        RepaymentRecorded {
            claim_key,
            actor: servicer,
            amount,
            result_hash,
        }
        .publish(&env);
        Ok(position)
    }

    pub fn consume_first_loss(
        env: Env,
        servicer: Address,
        claim_key: BytesN<32>,
        amount: i128,
        destination: Address,
        result_hash: BytesN<32>,
    ) -> Result<i128, ContractError> {
        Self::require_waterfall(&env)?;
        Self::require_servicer(&env, &servicer)?;
        require_nonnegative(amount)?;
        let replay_key = DataKey::FirstLoss(result_hash);
        if env.storage().persistent().has(&replay_key) {
            return Err(ContractError::Replay);
        }
        let key = DataKey::Position(claim_key);
        let mut position: Position = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(ContractError::NotFound)?;
        let available = checked_sub(position.first_loss_funded, position.first_loss_consumed)?;
        if amount > available {
            return Err(ContractError::ValidationFailed);
        }
        if amount > 0 {
            TokenClient::new(&env, &Self::funding_sac_addr(&env)?).transfer(
                &env.current_contract_address(),
                MuxedAddress::from(destination),
                &amount,
            );
        }
        position.first_loss_consumed = checked_add(position.first_loss_consumed, amount)?;
        env.storage().persistent().set(&key, &position);
        env.storage().persistent().set(&replay_key, &true);
        Ok(amount)
    }

    pub fn release_unused_first_loss(
        env: Env,
        operator: Address,
        claim_key: BytesN<32>,
    ) -> Result<i128, ContractError> {
        operator.require_auth();
        let key = DataKey::Position(claim_key);
        let mut position: Position = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(ContractError::NotFound)?;
        let cfg: FacilityConfig = env
            .storage()
            .persistent()
            .get(&DataKey::Facility(position.facility_id.clone()))
            .ok_or(ContractError::NotFound)?;
        if cfg.operator != operator || position.outstanding_principal != 0 {
            return Err(ContractError::Forbidden);
        }
        let unused = checked_sub(position.first_loss_funded, position.first_loss_consumed)?;
        if unused > 0 {
            TokenClient::new(&env, &Self::funding_sac_addr(&env)?).transfer(
                &env.current_contract_address(),
                MuxedAddress::from(cfg.treasury),
                &unused,
            );
            position.first_loss_funded = position.first_loss_consumed;
            env.storage().persistent().set(&key, &position);
        }
        Ok(unused)
    }

    pub fn finalize_shortfall(
        env: Env,
        servicer: Address,
        claim_key: BytesN<32>,
        result_hash: BytesN<32>,
    ) -> Result<i128, ContractError> {
        Self::require_waterfall(&env)?;
        Self::require_servicer(&env, &servicer)?;
        let replay_key = DataKey::Loss(result_hash.clone());
        if env.storage().persistent().has(&replay_key) {
            return Err(ContractError::Replay);
        }
        let loss = Self::write_off_position(&env, &claim_key)?;
        env.storage().persistent().set(&replay_key, &true);
        PositionWrittenOff {
            claim_key,
            actor: servicer,
            amount: loss,
            result_hash,
        }
        .publish(&env);
        Ok(loss)
    }

    /// Admin recovery for positions closed before `finalize_shortfall` was
    /// introduced. It is only valid for a terminal CLOSED_WITH_LOSS claim.
    pub fn reconcile_closed_loss(
        env: Env,
        admin: Address,
        claim_key: BytesN<32>,
    ) -> Result<i128, ContractError> {
        Self::require_admin(&env, &admin)?;
        if LifecycleClient::new(&env, &Self::lifecycle(&env)?)
            .get_claim(&claim_key)
            .state
            != OnchainClaimState::ClosedWithLoss
        {
            return Err(ContractError::InvalidStateTransition);
        }
        let loss = Self::write_off_position(&env, &claim_key)?;
        PositionWrittenOff {
            claim_key,
            actor: admin,
            amount: loss,
            result_hash: BytesN::from_array(&env, &[0; 32]),
        }
        .publish(&env);
        Ok(loss)
    }

    pub fn available_liquidity(env: Env, facility_id: BytesN<32>) -> Result<i128, ContractError> {
        let cfg: FacilityConfig = env
            .storage()
            .persistent()
            .get(&DataKey::Facility(facility_id))
            .ok_or(ContractError::NotFound)?;
        let policy = checked_sub(cfg.limits.max_total_principal, cfg.outstanding)?;
        Ok(core::cmp::min(
            policy,
            TokenClient::new(&env, &Self::funding_sac_addr(&env)?).balance(&cfg.treasury),
        ))
    }
    pub fn position(env: Env, claim_key: BytesN<32>) -> Result<Position, ContractError> {
        env.storage()
            .persistent()
            .get(&DataKey::Position(claim_key))
            .ok_or(ContractError::NotFound)
    }
    pub fn treasury(env: Env, facility_id: BytesN<32>) -> Result<Address, ContractError> {
        let cfg: FacilityConfig = env
            .storage()
            .persistent()
            .get(&DataKey::Facility(facility_id))
            .ok_or(ContractError::NotFound)?;
        Ok(cfg.treasury)
    }
    pub fn funding_sac(env: Env) -> Result<Address, ContractError> {
        Self::funding_sac_addr(&env)
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
    fn funding_sac_addr(env: &Env) -> Result<Address, ContractError> {
        env.storage()
            .instance()
            .get(&DataKey::FundingSac)
            .ok_or(ContractError::NotFound)
    }
    fn controller(env: &Env) -> Result<Address, ContractError> {
        env.storage()
            .instance()
            .get(&DataKey::JclaimController)
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
    fn require_servicer(env: &Env, actor: &Address) -> Result<(), ContractError> {
        actor.require_auth();
        if !env
            .storage()
            .instance()
            .get(&DataKey::Servicer(actor.clone()))
            .unwrap_or(false)
        {
            return Err(ContractError::Forbidden);
        }
        Ok(())
    }
    fn require_waterfall(env: &Env) -> Result<(), ContractError> {
        let waterfall: Address = env
            .storage()
            .instance()
            .get(&DataKey::Waterfall)
            .ok_or(ContractError::NotFound)?;
        waterfall.require_auth();
        Ok(())
    }

    fn write_off_position(env: &Env, claim_key: &BytesN<32>) -> Result<i128, ContractError> {
        let key = DataKey::Position(claim_key.clone());
        let mut position: Position = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(ContractError::NotFound)?;
        let loss = position.outstanding_principal;
        if loss <= 0 || !position.active {
            return Err(ContractError::ValidationFailed);
        }
        position.outstanding_principal = 0;
        position.active = false;
        env.storage().persistent().set(&key, &position);
        let cfg_key = DataKey::Facility(position.facility_id);
        let mut cfg: FacilityConfig = env
            .storage()
            .persistent()
            .get(&cfg_key)
            .ok_or(ContractError::NotFound)?;
        cfg.outstanding = checked_sub(cfg.outstanding, loss)?;
        env.storage().persistent().set(&cfg_key, &cfg);
        Ok(loss)
    }
}
