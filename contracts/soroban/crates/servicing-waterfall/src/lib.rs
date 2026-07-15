#![no_std]

use jejak_common::{
    checked_add, checked_sub, extend_instance_ttl, extend_persistent_ttl, require_nonnegative,
    require_positive, ContractError, FacilityClient, LifecycleClient, OnchainClaimState, Position,
    WaterfallAllocation, VERSION,
};
use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, token::TokenClient, Address, BytesN, Env,
    MuxedAddress, Symbol,
};

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Lifecycle,
    Facility,
    Servicer(Address),
    Result(BytesN<32>),
    Processed(BytesN<32>),
    GlobalPause,
}

#[contractevent(topics = ["waterfall", "executed"])]
pub struct WaterfallExecuted {
    #[topic]
    pub claim_key: BytesN<32>,
    #[topic]
    pub actor: Address,
    pub result_hash: BytesN<32>,
    pub settlement: i128,
    pub principal_paid: i128,
    pub first_loss: i128,
    pub senior_loss: i128,
}

#[contractevent(topics = ["shortfall", "detected"])]
pub struct ShortfallDetected {
    #[topic]
    pub claim_key: BytesN<32>,
    #[topic]
    pub actor: Address,
    pub senior_loss: i128,
    pub result_hash: BytesN<32>,
}

#[contract]
pub struct JejakServicingWaterfall;

#[contractimpl]
impl JejakServicingWaterfall {
    pub fn initialize(
        env: Env,
        admin: Address,
        lifecycle: Address,
        facility: Address,
    ) -> Result<(), ContractError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(ContractError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::Lifecycle, &lifecycle);
        env.storage().instance().set(&DataKey::Facility, &facility);
        env.storage().instance().set(&DataKey::GlobalPause, &false);
        extend_instance_ttl(&env);
        Ok(())
    }

    pub fn authorize_servicer(
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

    pub fn set_global_pause(env: Env, admin: Address, paused: bool) -> Result<(), ContractError> {
        Self::require_admin(&env, &admin)?;
        env.storage().instance().set(&DataKey::GlobalPause, &paused);
        Ok(())
    }

    pub fn calculate(
        env: Env,
        claim_key: BytesN<32>,
        settlement_amount: i128,
        servicing_fee_due: i128,
        financing_fee_due: i128,
        result_hash: BytesN<32>,
    ) -> Result<WaterfallAllocation, ContractError> {
        require_nonnegative(settlement_amount)?;
        require_nonnegative(servicing_fee_due)?;
        require_nonnegative(financing_fee_due)?;
        let position = FacilityClient::new(&env, &Self::facility(&env)?).position(&claim_key);
        Self::allocation(
            claim_key,
            &position,
            settlement_amount,
            servicing_fee_due,
            financing_fee_due,
            result_hash,
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn execute(
        env: Env,
        servicer: Address,
        claim_key: BytesN<32>,
        settlement_amount: i128,
        servicing_fee_due: i128,
        financing_fee_due: i128,
        result_hash: BytesN<32>,
        final_settlement: bool,
    ) -> Result<WaterfallAllocation, ContractError> {
        Self::require_servicer(&env, &servicer)?;
        if env
            .storage()
            .instance()
            .get(&DataKey::GlobalPause)
            .unwrap_or(false)
        {
            return Err(ContractError::CircuitBreakerActive);
        }
        require_positive(settlement_amount)?;
        let replay_key = DataKey::Processed(result_hash.clone());
        if env.storage().persistent().has(&replay_key) {
            return Err(ContractError::Replay);
        }
        let facility_addr = Self::facility(&env)?;
        let facility = FacilityClient::new(&env, &facility_addr);
        let position = facility.position(&claim_key);
        let mut allocation = Self::allocation(
            claim_key.clone(),
            &position,
            settlement_amount,
            servicing_fee_due,
            financing_fee_due,
            result_hash.clone(),
        )?;
        let token = TokenClient::new(&env, &facility.funding_sac());
        token.transfer(
            &servicer,
            MuxedAddress::from(env.current_contract_address()),
            &settlement_amount,
        );
        let treasury = facility.treasury(&position.facility_id);
        if allocation.servicing_fee_paid > 0 {
            token.transfer(
                &env.current_contract_address(),
                MuxedAddress::from(servicer.clone()),
                &allocation.servicing_fee_paid,
            );
        }
        let cash_to_treasury =
            checked_add(allocation.principal_paid, allocation.financing_fee_paid)?;
        if cash_to_treasury > 0 {
            token.transfer(
                &env.current_contract_address(),
                MuxedAddress::from(treasury.clone()),
                &cash_to_treasury,
            );
        }
        if allocation.first_loss_applied > 0 {
            facility.consume_first_loss(
                &servicer,
                &claim_key,
                &allocation.first_loss_applied,
                &env.current_contract_address(),
                &result_hash,
            );
            token.transfer(
                &env.current_contract_address(),
                MuxedAddress::from(treasury),
                &allocation.first_loss_applied,
            );
        }
        if allocation.seller_residual > 0 {
            token.transfer(
                &env.current_contract_address(),
                MuxedAddress::from(position.seller_payout_account.clone()),
                &allocation.seller_residual,
            );
        }
        let total_principal_repaid =
            checked_add(allocation.principal_paid, allocation.first_loss_applied)?;
        let updated =
            facility.apply_repayment(&servicer, &claim_key, &total_principal_repaid, &result_hash);
        allocation.senior_loss = if final_settlement {
            updated.outstanding_principal
        } else {
            0
        };
        if final_settlement && allocation.senior_loss > 0 {
            let finalized = facility.finalize_shortfall(&servicer, &claim_key, &result_hash);
            if finalized != allocation.senior_loss {
                return Err(ContractError::WaterfallInvariantFailed);
            }
        }
        let lifecycle = LifecycleClient::new(&env, &Self::lifecycle(&env)?);
        let claim = lifecycle.get_claim(&claim_key);
        if claim.state == OnchainClaimState::Funded {
            lifecycle.transition(
                &servicer,
                &claim_key,
                &OnchainClaimState::Funded,
                &OnchainClaimState::Settling,
                &Symbol::new(&env, "SETTLEMENT_STARTED"),
            );
        } else if claim.state != OnchainClaimState::Settling {
            return Err(ContractError::InvalidStateTransition);
        }
        if final_settlement {
            if updated.outstanding_principal == 0 {
                lifecycle.transition(
                    &servicer,
                    &claim_key,
                    &OnchainClaimState::Settling,
                    &OnchainClaimState::Repaid,
                    &Symbol::new(&env, "REPAID"),
                );
            } else {
                lifecycle.transition(
                    &servicer,
                    &claim_key,
                    &OnchainClaimState::Settling,
                    &OnchainClaimState::Shortfall,
                    &Symbol::new(&env, "SETTLEMENT_SHORTFALL"),
                );
                ShortfallDetected {
                    claim_key: claim_key.clone(),
                    actor: servicer.clone(),
                    senior_loss: updated.outstanding_principal,
                    result_hash: result_hash.clone(),
                }
                .publish(&env);
            }
        }
        env.storage()
            .persistent()
            .set(&DataKey::Result(claim_key.clone()), &allocation);
        env.storage().persistent().set(&replay_key, &true);
        extend_persistent_ttl(&env, &DataKey::Result(claim_key.clone()));
        WaterfallExecuted {
            claim_key,
            actor: servicer,
            result_hash,
            settlement: settlement_amount,
            principal_paid: allocation.principal_paid,
            first_loss: allocation.first_loss_applied,
            senior_loss: allocation.senior_loss,
        }
        .publish(&env);
        Ok(allocation)
    }

    pub fn get_last_result(
        env: Env,
        claim_key: BytesN<32>,
    ) -> Result<WaterfallAllocation, ContractError> {
        env.storage()
            .persistent()
            .get(&DataKey::Result(claim_key))
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

    fn allocation(
        claim_key: BytesN<32>,
        position: &Position,
        settlement: i128,
        servicing_due: i128,
        financing_due: i128,
        result_hash: BytesN<32>,
    ) -> Result<WaterfallAllocation, ContractError> {
        let servicing_fee_paid = core::cmp::min(settlement, servicing_due);
        let after_servicing = checked_sub(settlement, servicing_fee_paid)?;
        let principal_paid = core::cmp::min(after_servicing, position.outstanding_principal);
        let after_principal = checked_sub(after_servicing, principal_paid)?;
        let financing_fee_paid = core::cmp::min(after_principal, financing_due);
        let seller_residual = checked_sub(after_principal, financing_fee_paid)?;
        let principal_gap = checked_sub(position.outstanding_principal, principal_paid)?;
        let first_loss_available =
            checked_sub(position.first_loss_funded, position.first_loss_consumed)?;
        let first_loss_applied = core::cmp::min(principal_gap, first_loss_available);
        let senior_loss = checked_sub(principal_gap, first_loss_applied)?;
        let cash_allocated = checked_add(
            checked_add(servicing_fee_paid, principal_paid)?,
            checked_add(financing_fee_paid, seller_residual)?,
        )?;
        if cash_allocated != settlement {
            return Err(ContractError::WaterfallInvariantFailed);
        }
        Ok(WaterfallAllocation {
            claim_key,
            settlement_amount: settlement,
            servicing_fee_paid,
            principal_paid,
            financing_fee_paid,
            first_loss_applied,
            senior_loss,
            seller_residual,
            result_hash,
        })
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
    fn facility(env: &Env) -> Result<Address, ContractError> {
        env.storage()
            .instance()
            .get(&DataKey::Facility)
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
}
