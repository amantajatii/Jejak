#![no_std]

use soroban_sdk::{contractclient, contracterror, contracttype, Address, BytesN, Env, Symbol};

pub const VERSION: u32 = 1;
pub const DAY_LEDGERS: u32 = 17_280;
pub const TTL_THRESHOLD: u32 = 30 * DAY_LEDGERS;
pub const TTL_TARGET: u32 = 180 * DAY_LEDGERS;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    AlreadyInitialized = 1,
    AuthRequired = 2,
    Forbidden = 3,
    NotFound = 4,
    ValidationFailed = 5,
    InvalidStateTransition = 6,
    AttestationMissing = 7,
    AttestationExpired = 8,
    AttestationRevoked = 9,
    ControlNotVerified = 10,
    ClaimAlreadyEncumbered = 11,
    InsufficientFacilityLiquidity = 12,
    HolderNotAuthorized = 13,
    AssetOperationFailed = 14,
    WaterfallInvariantFailed = 15,
    CircuitBreakerActive = 16,
    ArithmeticOverflow = 17,
    Replay = 18,
    TerminalState = 19,
    AmountNotPositive = 20,
    VersionConflict = 21,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Role {
    Admin = 0,
    Oracle = 1,
    Originator = 2,
    Control = 3,
    Issuer = 4,
    Facility = 5,
    Servicer = 6,
    Resolver = 7,
    Pauser = 8,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum OnchainClaimState {
    Eligible = 0,
    Controlled = 1,
    Issued = 2,
    Funded = 3,
    Settling = 4,
    Repaid = 5,
    Redeemed = 6,
    Shortfall = 7,
    Resolution = 8,
    Closed = 9,
    ClosedWithLoss = 10,
    Paused = 11,
}

impl OnchainClaimState {
    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Closed | Self::ClosedWithLoss)
    }
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AttestationRef {
    pub attestation_key: BytesN<32>,
    pub claim_key: BytesN<32>,
    pub envelope_hash: BytesN<32>,
    pub data_snapshot_hash: BytesN<32>,
    pub sds_bps: u32,
    pub esv_base_units: i128,
    pub expires_at: u64,
    pub oracle: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OnchainClaim {
    pub claim_key: BytesN<32>,
    pub seller_subject_hash: BytesN<32>,
    pub facility_id: BytesN<32>,
    pub source_amount: i128,
    pub source_currency_hash: BytesN<32>,
    pub approved_principal_base_units: i128,
    pub attestation_key: BytesN<32>,
    pub state: OnchainClaimState,
    pub state_version: u32,
    pub evidence_hash: Option<BytesN<32>>,
    pub control_expires_at: u64,
    pub paused_from: OnchainClaimState,
    pub has_paused_from: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FacilityLimits {
    pub max_total_principal: i128,
    pub max_position_principal: i128,
    pub max_first_loss: i128,
    pub servicing_fee_cap: i128,
    pub financing_fee_cap: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Position {
    pub claim_key: BytesN<32>,
    pub facility_id: BytesN<32>,
    pub source: Address,
    pub seller_payout_account: Address,
    pub principal: i128,
    pub outstanding_principal: i128,
    pub first_loss_funded: i128,
    pub first_loss_consumed: i128,
    pub repaid: i128,
    pub active: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WaterfallAllocation {
    pub claim_key: BytesN<32>,
    pub settlement_amount: i128,
    pub servicing_fee_paid: i128,
    pub principal_paid: i128,
    pub financing_fee_paid: i128,
    pub first_loss_applied: i128,
    pub senior_loss: i128,
    pub seller_residual: i128,
    pub result_hash: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ResolutionStatus {
    Open = 0,
    Recovering = 1,
    Settled = 2,
    WrittenOff = 3,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Resolution {
    pub claim_key: BytesN<32>,
    pub resolver: Address,
    pub status: ResolutionStatus,
    pub reason_code: Symbol,
    pub opening_evidence_hash: BytesN<32>,
    pub recovered: i128,
    pub final_loss: i128,
    pub resolution_hash: Option<BytesN<32>>,
}

pub fn require_positive(amount: i128) -> Result<(), ContractError> {
    if amount <= 0 {
        Err(ContractError::AmountNotPositive)
    } else {
        Ok(())
    }
}

pub fn require_nonnegative(amount: i128) -> Result<(), ContractError> {
    if amount < 0 {
        Err(ContractError::ValidationFailed)
    } else {
        Ok(())
    }
}

pub fn checked_add(a: i128, b: i128) -> Result<i128, ContractError> {
    a.checked_add(b).ok_or(ContractError::ArithmeticOverflow)
}

pub fn checked_sub(a: i128, b: i128) -> Result<i128, ContractError> {
    a.checked_sub(b).ok_or(ContractError::ArithmeticOverflow)
}

pub fn extend_instance_ttl(env: &Env) {
    let target = core::cmp::min(TTL_TARGET, env.storage().max_ttl());
    if target > 0 {
        env.storage()
            .instance()
            .extend_ttl(core::cmp::min(TTL_THRESHOLD, target), target);
    }
}

pub fn extend_persistent_ttl<K: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &K) {
    let target = core::cmp::min(TTL_TARGET, env.storage().max_ttl());
    if target > 0 {
        env.storage()
            .persistent()
            .extend_ttl(key, core::cmp::min(TTL_THRESHOLD, target), target);
    }
}

#[contractclient(name = "EligibilityRegistryClient")]
pub trait EligibilityRegistryInterface {
    fn get_attestation(env: Env, attestation_key: BytesN<32>) -> AttestationRef;
    fn is_active(env: Env, attestation_key: BytesN<32>, now: u64) -> bool;
}

#[contractclient(name = "LifecycleClient")]
pub trait LifecycleInterface {
    fn get_claim(env: Env, claim_key: BytesN<32>) -> OnchainClaim;
    fn attestation_active(env: Env, claim_key: BytesN<32>) -> bool;
    fn transition(
        env: Env,
        actor: Address,
        claim_key: BytesN<32>,
        expected_state: OnchainClaimState,
        next_state: OnchainClaimState,
        reason_code: Symbol,
    ) -> OnchainClaim;
}

#[contractclient(name = "AssetControllerClient")]
pub trait AssetControllerInterface {
    fn get_issued_for_claim(env: Env, claim_key: BytesN<32>) -> i128;
}

#[contractclient(name = "FacilityClient")]
pub trait FacilityInterface {
    fn position(env: Env, claim_key: BytesN<32>) -> Position;
    fn apply_repayment(
        env: Env,
        servicer: Address,
        claim_key: BytesN<32>,
        amount: i128,
        result_hash: BytesN<32>,
    ) -> Position;
    fn consume_first_loss(
        env: Env,
        servicer: Address,
        claim_key: BytesN<32>,
        amount: i128,
        destination: Address,
        result_hash: BytesN<32>,
    ) -> i128;
    fn finalize_shortfall(
        env: Env,
        servicer: Address,
        claim_key: BytesN<32>,
        result_hash: BytesN<32>,
    ) -> i128;
    fn treasury(env: Env, facility_id: BytesN<32>) -> Address;
    fn funding_sac(env: Env) -> Address;
}
