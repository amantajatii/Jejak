#![no_std]

#[cfg(test)]
mod tests {
    use jejak_asset_controller::{JejakAssetController, JejakAssetControllerClient};
    use jejak_claim_lifecycle::{JejakClaimLifecycle, JejakClaimLifecycleClient};
    use jejak_common::{AttestationRef, FacilityLimits, OnchainClaimState, Role};
    use jejak_eligibility_registry::{JejakEligibilityRegistry, JejakEligibilityRegistryClient};
    use jejak_facility::{JejakFacility, JejakFacilityClient};
    use jejak_resolution_manager::{JejakResolutionManager, JejakResolutionManagerClient};
    use jejak_servicing_waterfall::{JejakServicingWaterfall, JejakServicingWaterfallClient};
    use soroban_sdk::{
        testutils::Address as _,
        token::{StellarAssetClient, TokenClient},
        Address, BytesN, Env, Symbol,
    };

    fn hash(env: &Env, byte: u8) -> BytesN<32> {
        BytesN::from_array(env, &[byte; 32])
    }

    struct Fixture {
        env: Env,
        admin: Address,
        registry_id: Address,
        lifecycle_id: Address,
        asset_id: Address,
        facility_contract_id: Address,
        waterfall_id: Address,
        resolution_id: Address,
        oracle: Address,
        originator: Address,
        issuer: Address,
        operator: Address,
        treasury: Address,
        holder: Address,
        servicer: Address,
        resolver: Address,
        pauser: Address,
        seller: Address,
        facility_id: BytesN<32>,
        funding_sac: Address,
    }

    fn setup() -> Fixture {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let originator = Address::generate(&env);
        let issuer = Address::generate(&env);
        let operator = Address::generate(&env);
        let treasury = Address::generate(&env);
        let holder = Address::generate(&env);
        let servicer = Address::generate(&env);
        let resolver = Address::generate(&env);
        let pauser = Address::generate(&env);
        let seller = Address::generate(&env);
        let facility_id = hash(&env, 90);

        let registry_id = env.register(JejakEligibilityRegistry, ());
        let registry = JejakEligibilityRegistryClient::new(&env, &registry_id);
        registry.initialize(&admin, &oracle);

        let lifecycle_id = env.register(JejakClaimLifecycle, ());
        let lifecycle = JejakClaimLifecycleClient::new(&env, &lifecycle_id);
        lifecycle.initialize(&admin, &registry_id);
        lifecycle.set_role(&admin, &Role::Originator, &originator, &true);
        lifecycle.set_role(&admin, &Role::Issuer, &issuer, &true);
        lifecycle.set_role(&admin, &Role::Facility, &operator, &true);
        lifecycle.set_role(&admin, &Role::Servicer, &servicer, &true);
        lifecycle.set_role(&admin, &Role::Resolver, &resolver, &true);
        lifecycle.set_role(&admin, &Role::Pauser, &pauser, &true);

        let jclaim = env.register_stellar_asset_contract_v2(admin.clone());
        let jclaim_sac = jclaim.address();
        let funding = env.register_stellar_asset_contract_v2(admin.clone());
        let funding_sac = funding.address();

        let asset_id = env.register(JejakAssetController, ());
        let asset = JejakAssetControllerClient::new(&env, &asset_id);
        asset.initialize(&admin, &jclaim_sac, &lifecycle_id, &issuer);
        StellarAssetClient::new(&env, &jclaim_sac).set_admin(&asset_id);

        let facility_id_contract = env.register(JejakFacility, ());
        let facility = JejakFacilityClient::new(&env, &facility_id_contract);
        facility.initialize(&admin, &funding_sac, &asset_id, &lifecycle_id);
        facility.configure_facility(
            &admin,
            &facility_id,
            &operator,
            &treasury,
            &FacilityLimits {
                max_total_principal: 10_000_000_000,
                max_position_principal: 1_000_000_000,
                max_first_loss: 200_000_000,
                servicing_fee_cap: 100_000_000,
                financing_fee_cap: 100_000_000,
            },
        );
        facility.configure_servicing(&admin, &servicer, &true);

        let waterfall_id = env.register(JejakServicingWaterfall, ());
        let waterfall = JejakServicingWaterfallClient::new(&env, &waterfall_id);
        waterfall.initialize(&admin, &lifecycle_id, &facility_id_contract);
        waterfall.authorize_servicer(&admin, &servicer, &true);
        facility.set_waterfall(&admin, &waterfall_id);

        let resolution_id = env.register(JejakResolutionManager, ());
        let resolution = JejakResolutionManagerClient::new(&env, &resolution_id);
        resolution.initialize(&admin, &lifecycle_id);
        resolution.authorize_resolver(&admin, &resolver, &true);

        StellarAssetClient::new(&env, &funding_sac).mint(&treasury, &10_000_000_000);
        StellarAssetClient::new(&env, &funding_sac).mint(&servicer, &10_000_000_000);

        Fixture {
            env,
            admin,
            registry_id,
            lifecycle_id,
            asset_id,
            facility_contract_id: facility_id_contract,
            waterfall_id,
            resolution_id,
            oracle,
            originator,
            issuer,
            operator,
            treasury,
            holder,
            servicer,
            resolver,
            pauser,
            seller,
            facility_id,
            funding_sac,
        }
    }

    #[test]
    fn issued_claim_can_recover_to_controlled_after_compensating_redeem() {
        let f = setup();
        let registry = JejakEligibilityRegistryClient::new(&f.env, &f.registry_id);
        let lifecycle = JejakClaimLifecycleClient::new(&f.env, &f.lifecycle_id);
        let asset = JejakAssetControllerClient::new(&f.env, &f.asset_id);
        let claim_key = hash(&f.env, 21);
        let attestation_key = hash(&f.env, 61);
        registry.register_attestation(
            &f.oracle,
            &AttestationRef {
                attestation_key: attestation_key.clone(),
                claim_key: claim_key.clone(),
                envelope_hash: hash(&f.env, 22),
                data_snapshot_hash: hash(&f.env, 23),
                sds_bps: 2_000,
                esv_base_units: 8_000,
                expires_at: 10_000,
                oracle: f.oracle.clone(),
            },
        );
        lifecycle.create_claim(
            &f.originator,
            &claim_key,
            &hash(&f.env, 24),
            &f.facility_id,
            &10_000,
            &hash(&f.env, 25),
            &attestation_key,
            &640_000_000,
        );
        lifecycle.confirm_control(&f.originator, &claim_key, &hash(&f.env, 26), &9_000);
        asset.issue(&f.issuer, &claim_key, &f.holder, &640_000_000);
        lifecycle.pause(
            &f.pauser,
            &claim_key,
            &Symbol::new(&f.env, "FUNDING_FAILED"),
        );
        asset.redeem(&f.issuer, &claim_key, &f.holder, &640_000_000);
        lifecycle.resume(
            &f.admin,
            &claim_key,
            &OnchainClaimState::Controlled,
            &Symbol::new(&f.env, "COMPENSATED"),
        );
        assert_eq!(
            lifecycle.get_claim(&claim_key).state,
            OnchainClaimState::Controlled
        );
        assert_eq!(asset.get_issued_for_claim(&claim_key), 0);
    }

    fn create_funded_claim(f: &Fixture, seed: u8, first_loss: i128) -> BytesN<32> {
        let registry = JejakEligibilityRegistryClient::new(&f.env, &f.registry_id);
        let lifecycle = JejakClaimLifecycleClient::new(&f.env, &f.lifecycle_id);
        let asset = JejakAssetControllerClient::new(&f.env, &f.asset_id);
        let facility = JejakFacilityClient::new(&f.env, &f.facility_contract_id);
        let claim_key = hash(&f.env, seed);
        let attestation_key = hash(&f.env, seed.wrapping_add(40));
        registry.register_attestation(
            &f.oracle,
            &AttestationRef {
                attestation_key: attestation_key.clone(),
                claim_key: claim_key.clone(),
                envelope_hash: hash(&f.env, seed.wrapping_add(1)),
                data_snapshot_hash: hash(&f.env, seed.wrapping_add(2)),
                sds_bps: 2_000,
                esv_base_units: 8_000,
                expires_at: 10_000,
                oracle: f.oracle.clone(),
            },
        );
        lifecycle.create_claim(
            &f.originator,
            &claim_key,
            &hash(&f.env, seed.wrapping_add(3)),
            &f.facility_id,
            &10_000,
            &hash(&f.env, seed.wrapping_add(4)),
            &attestation_key,
            &640_000_000,
        );
        lifecycle.confirm_control(
            &f.originator,
            &claim_key,
            &hash(&f.env, seed.wrapping_add(5)),
            &9_000,
        );
        asset.issue(&f.issuer, &claim_key, &f.holder, &640_000_000);
        facility.fund(
            &f.operator,
            &claim_key,
            &f.treasury,
            &f.seller,
            &640_000_000,
            &first_loss,
        );
        claim_key
    }

    #[test]
    fn happy_path_conserves_money_and_closes() {
        let f = setup();
        let lifecycle = JejakClaimLifecycleClient::new(&f.env, &f.lifecycle_id);
        let asset = JejakAssetControllerClient::new(&f.env, &f.asset_id);
        let facility = JejakFacilityClient::new(&f.env, &f.facility_contract_id);
        let waterfall = JejakServicingWaterfallClient::new(&f.env, &f.waterfall_id);
        let claim = create_funded_claim(&f, 1, 100_000_000);
        let result = waterfall.execute(
            &f.servicer,
            &claim,
            &800_000_000,
            &0,
            &0,
            &hash(&f.env, 70),
            &true,
        );
        assert_eq!(result.principal_paid, 640_000_000);
        assert_eq!(result.seller_residual, 160_000_000);
        assert_eq!(result.first_loss_applied, 0);
        assert_eq!(result.senior_loss, 0);
        assert_eq!(lifecycle.get_claim(&claim).state, OnchainClaimState::Repaid);
        asset.redeem(&f.issuer, &claim, &f.holder, &640_000_000);
        asset.close_claim(&f.issuer, &claim, &Symbol::new(&f.env, "CLOSED"));
        assert_eq!(lifecycle.get_claim(&claim).state, OnchainClaimState::Closed);
        assert_eq!(
            facility.release_unused_first_loss(&f.operator, &claim),
            100_000_000
        );
        assert_eq!(
            TokenClient::new(&f.env, &f.funding_sac).balance(&f.seller),
            800_000_000
        );
    }

    #[test]
    fn adverse_path_consumes_first_loss_and_resolves() {
        let f = setup();
        let lifecycle = JejakClaimLifecycleClient::new(&f.env, &f.lifecycle_id);
        let waterfall = JejakServicingWaterfallClient::new(&f.env, &f.waterfall_id);
        let resolution = JejakResolutionManagerClient::new(&f.env, &f.resolution_id);
        let claim = create_funded_claim(&f, 2, 100_000_000);
        let result_hash = hash(&f.env, 71);
        let result = waterfall.execute(
            &f.servicer,
            &claim,
            &500_000_000,
            &0,
            &0,
            &result_hash,
            &true,
        );
        assert_eq!(result.principal_paid, 500_000_000);
        assert_eq!(result.first_loss_applied, 100_000_000);
        assert_eq!(result.senior_loss, 40_000_000);
        assert_eq!(
            lifecycle.get_claim(&claim).state,
            OnchainClaimState::Shortfall
        );
        let position = JejakFacilityClient::new(&f.env, &f.facility_contract_id).position(&claim);
        assert!(!position.active);
        assert_eq!(position.outstanding_principal, 0);
        resolution.open(
            &f.resolver,
            &claim,
            &Symbol::new(&f.env, "SETTLEMENT_SHORTFALL"),
            &hash(&f.env, 72),
        );
        resolution.close(&f.resolver, &claim, &0, &40_000_000, &hash(&f.env, 73));
        assert_eq!(
            lifecycle.get_claim(&claim).state,
            OnchainClaimState::ClosedWithLoss
        );
        assert!(waterfall
            .try_execute(
                &f.servicer,
                &claim,
                &500_000_000,
                &0,
                &0,
                &result_hash,
                &true
            )
            .is_err());
    }

    #[test]
    fn split_fee_allocation_and_bounds_hold() {
        let f = setup();
        let waterfall = JejakServicingWaterfallClient::new(&f.env, &f.waterfall_id);
        let claim = create_funded_claim(&f, 3, 100_000_000);
        for settlement in [1_i128, 50_000_000, 640_000_000, 800_000_000, 1_000_000_000] {
            let r = waterfall.calculate(
                &claim,
                &settlement,
                &10_000_000,
                &20_000_000,
                &hash(&f.env, (settlement % 200) as u8),
            );
            assert_eq!(
                r.servicing_fee_paid + r.principal_paid + r.financing_fee_paid + r.seller_residual,
                settlement
            );
            assert!(r.first_loss_applied >= 0 && r.senior_loss >= 0);
        }
    }

    #[test]
    fn expired_and_duplicate_attestations_are_rejected() {
        let f = setup();
        let registry = JejakEligibilityRegistryClient::new(&f.env, &f.registry_id);
        let claim = hash(&f.env, 9);
        let key = hash(&f.env, 49);
        let attestation = AttestationRef {
            attestation_key: key,
            claim_key: claim,
            envelope_hash: hash(&f.env, 10),
            data_snapshot_hash: hash(&f.env, 11),
            sds_bps: 10_001,
            esv_base_units: 1,
            expires_at: 10_000,
            oracle: f.oracle.clone(),
        };
        assert!(registry
            .try_register_attestation(&f.oracle, &attestation)
            .is_err());
    }
}
