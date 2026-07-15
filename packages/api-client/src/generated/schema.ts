/* AUTO-GENERATED FROM apps/api/openapi/openapi.json. DO NOT EDIT. */
export interface paths {
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Process liveness */
        get: operations["getHealth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Required dependency readiness */
        get: operations["getReadiness"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/sellers": {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
            };
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create a seller and record consent */
        post: operations["createSeller"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/sellers/{sellerId}": {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
            };
            path?: never;
            cookie?: never;
        };
        /** Read a seller profile */
        get: operations["getSeller"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/marketplace-connections": {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
            };
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create a sandbox or production marketplace connector */
        post: operations["createMarketplaceConnection"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/marketplace-connections/{id}/sync": {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
            };
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Enqueue marketplace ingestion */
        post: operations["syncMarketplaceConnection"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/ingestions/csv": {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
            };
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Submit a previously authorized CSV object for ingestion
         * @description The request carries a private storage object key and content hash, never raw CSV content.
         */
        post: operations["createCsvIngestion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/ingestions/{id}": {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
            };
            path?: never;
            cookie?: never;
        };
        /** Read ingestion status and quality report */
        get: operations["getIngestion"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/claims": {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
            };
            path?: never;
            cookie?: never;
        };
        /** List authorized claims with cursor pagination */
        get: operations["listClaims"];
        put?: never;
        /** Create a claim from an unencumbered settlement stream */
        post: operations["createClaim"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/claims/{id}": {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
            };
            path?: never;
            cookie?: never;
        };
        /** Read an authorized claim */
        get: operations["getClaim"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/claims/{id}/analyze": {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
            };
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Freeze a decision snapshot and request evaluation */
        post: operations["analyzeClaim"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/claims/{id}/control-evidence": {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
            };
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Submit control evidence metadata and hash */
        post: operations["submitControlEvidence"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/claims/{id}/control-decision": {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
            };
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Verify, reject, or revoke claim control */
        post: operations["decideControlEvidence"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/claims/{id}/offers": {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
            };
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create a financing offer */
        post: operations["createFinancingOffer"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/offers/{id}/accept": {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
            };
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Accept the exact hashed financing terms */
        post: operations["acceptFinancingOffer"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/claims/{id}/issue": {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
            };
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Authorize on-chain issuance */
        post: operations["issueClaim"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/claims/{id}/fund": {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
            };
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Fund an accepted facility position */
        post: operations["fundClaim"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/settlement-events": {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
            };
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Ingest a verified settlement event */
        post: operations["createSettlementEvent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/claims/{id}/reconcile": {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
            };
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Calculate realized claim position */
        post: operations["reconcileClaim"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/claims/{id}/waterfall": {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
            };
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Execute a guarded settlement waterfall */
        post: operations["executeClaimWaterfall"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/claims/{id}/resolution": {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
            };
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Open, update, or close an authorized resolution */
        post: operations["resolveClaim"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/claims/{id}/pause": {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
            };
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Trigger a claim-level circuit breaker */
        post: operations["pauseClaim"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/portfolio/summary": {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
            };
            path?: never;
            cookie?: never;
        };
        /** Read tenant-scoped exposure and performance */
        get: operations["getPortfolioSummary"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/audit-events": {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
            };
            path?: never;
            cookie?: never;
        };
        /** Search the append-only tenant audit log */
        get: operations["listAuditEvents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/institutional-invitations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Invite an institutional member into the selected tenant */
        post: operations["createInstitutionalInvitation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/institutional-invitations/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Preview a valid invitation without exposing its token */
        post: operations["previewInstitutionalInvitation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/institutional-invitations/accept": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Accept an invitation using the authenticated matching email */
        post: operations["acceptInstitutionalInvitation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/institutional-invitations/{id}/revoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Revoke a pending institutional invitation */
        post: operations["revokeInstitutionalInvitation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Money: components["schemas"]["money.schema"];
        Seller: components["schemas"]["seller.schema"];
        MarketplaceConnection: components["schemas"]["marketplace-connection.schema"];
        Claim: components["schemas"]["claim.schema"];
        FinancingOffer: components["schemas"]["financing-offer.schema"];
        SettlementEvent: components["schemas"]["settlement-event.schema"];
        WaterfallResult: components["schemas"]["waterfall-result.schema"];
        ResolutionCase: components["schemas"]["resolution-case.schema"];
        ApiSuccess: components["schemas"]["success-envelope.schema"];
        ApiError: components["schemas"]["error-envelope.schema"];
        /** Format: uuid-v7 */
        uuidV7: string;
        /**
         * UtcTimestamp
         * Format: utc-rfc3339
         */
        "timestamp.schema": string;
        /** ApiSuccess */
        "success-envelope.schema": {
            data: unknown;
            meta: {
                requestId: components["schemas"]["uuidV7"];
                timestamp: components["schemas"]["timestamp.schema"];
                sandbox: boolean;
                nextCursor?: string;
            };
        };
        /**
         * ErrorCode
         * @enum {string}
         */
        "error-code.schema": "AUTH_REQUIRED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION_FAILED" | "VERSION_CONFLICT" | "IDEMPOTENCY_CONFLICT" | "INVALID_STATE_TRANSITION" | "ATTESTATION_MISSING" | "ATTESTATION_EXPIRED" | "ATTESTATION_REVOKED" | "CONTROL_NOT_VERIFIED" | "CLAIM_ALREADY_ENCUMBERED" | "INSUFFICIENT_FACILITY_LIQUIDITY" | "HOLDER_NOT_AUTHORIZED" | "ASSET_OPERATION_FAILED" | "PARTNER_TIMEOUT" | "PARTNER_REJECTED" | "SETTLEMENT_DUPLICATE" | "WATERFALL_INVARIANT_FAILED" | "CIRCUIT_BREAKER_ACTIVE" | "INVITATION_INVALID" | "INVITATION_EXPIRED" | "INVITATION_REVOKED" | "INTERNAL_ERROR";
        /** ApiError */
        "error-envelope.schema": {
            error: {
                code: components["schemas"]["error-code.schema"];
                message: string;
                requestId: components["schemas"]["uuidV7"];
                retryable: boolean;
                details?: {
                    [key: string]: unknown;
                };
            };
        };
        currency: string;
        CreateSeller: {
            displayName: string;
            country: string;
            baseCurrency: components["schemas"]["currency"];
            consentVersion: string;
        };
        /**
         * PartnerMode
         * @enum {string}
         */
        "partner-mode.schema": "SANDBOX" | "PRODUCTION";
        CreateMarketplaceConnection: {
            sellerId: components["schemas"]["uuidV7"];
            provider: string;
            mode: components["schemas"]["partner-mode.schema"];
            externalAccountRef: string;
            /** @description Opaque handle; never a raw credential. */
            credentialHandle: string;
        };
        SyncMarketplaceConnection: {
            /** @default false */
            force: boolean;
        };
        /** Format: sha256-hex */
        sha256Hex: string;
        CreateCsvIngestion: {
            sellerId: components["schemas"]["uuidV7"];
            storageObjectKey: string;
            contentHash: components["schemas"]["sha256Hex"];
        };
        /**
         * ClaimState
         * @enum {string}
         */
        "claim-state.schema": "DRAFT" | "DATA_PENDING" | "ANALYZED" | "ELIGIBLE" | "CONTROLLED" | "ISSUED" | "FUNDED" | "SETTLING" | "REPAID" | "REDEEMED" | "CLOSED" | "SHORTFALL" | "RESOLUTION" | "CLOSED_WITH_LOSS" | "REVIEW" | "REJECTED" | "FROZEN" | "SUSPENDED" | "PAUSED" | "CANCELLED";
        integerString: string;
        /** Format: stellar-address */
        stellarAddress: string;
        /** Money */
        "money.schema": {
            amountMinor: components["schemas"]["integerString"];
            currency: components["schemas"]["currency"];
            scale: number;
            issuer?: components["schemas"]["stellarAddress"];
        };
        CreateClaim: {
            sellerId: components["schemas"]["uuidV7"];
            settlementStreamId: components["schemas"]["uuidV7"];
            facilityId: components["schemas"]["uuidV7"];
            requestedAdvance: components["schemas"]["money.schema"];
        };
        AnalyzeClaim: {
            snapshotCutoffAt: components["schemas"]["timestamp.schema"];
        };
        SubmitControlEvidence: {
            evidenceHash: components["schemas"]["sha256Hex"];
            /** @enum {string} */
            evidenceType: "ASSIGNMENT_NOTICE" | "ACCOUNT_CONTROL" | "MARKETPLACE_ACKNOWLEDGEMENT";
        };
        /**
         * ReasonCode
         * @enum {string}
         */
        "reason-code.schema": "HIGH_REFUND_RATE" | "HIGH_RTO_RATE" | "CHARGEBACK_SPIKE" | "ACCOUNT_HOLD" | "MISSING_PAYOUT_HISTORY" | "DATA_INCONSISTENT" | "CONCENTRATION_HIGH" | "STALE_SNAPSHOT" | "CONTROL_NOT_VERIFIED" | "POLICY_LIMIT" | "MODEL_UNAVAILABLE" | "MANUAL_REVIEW_REQUIRED" | "SETTLEMENT_SHORTFALL" | "PARTNER_UNAVAILABLE";
        ControlDecision: {
            /** @enum {string} */
            decision: "VERIFY" | "REJECT" | "REVOKE";
            reasonCodes: components["schemas"]["reason-code.schema"][];
        };
        CreateOffer: {
            principal: components["schemas"]["money.schema"];
            fee: components["schemas"]["money.schema"];
            annualizedRateBps: number;
            advanceRateBps: number;
            expiresAt: components["schemas"]["timestamp.schema"];
            termsHash: components["schemas"]["sha256Hex"];
        };
        AcceptOffer: {
            acceptedTermsHash: components["schemas"]["sha256Hex"];
        };
        IssueClaim: {
            attestationId: components["schemas"]["uuidV7"];
            controlEvidenceId: components["schemas"]["uuidV7"];
        };
        FundClaim: {
            offerId: components["schemas"]["uuidV7"];
            maximumAmount: components["schemas"]["money.schema"];
        };
        CreateSettlementEvent: {
            claimId: components["schemas"]["uuidV7"];
            externalEventId: string;
            /** @enum {string} */
            eventType: "SETTLEMENT" | "REFUND" | "CHARGEBACK" | "ADJUSTMENT";
            amount: components["schemas"]["money.schema"];
            occurredAt: components["schemas"]["timestamp.schema"];
            sourceHash: components["schemas"]["sha256Hex"];
        };
        ReconcileClaim: {
            through: components["schemas"]["timestamp.schema"];
        };
        ExecuteWaterfall: {
            settlementEventId: components["schemas"]["uuidV7"];
        };
        ResolveClaim: {
            /** @enum {string} */
            action: "OPEN" | "UPDATE" | "CLOSE";
            reasonCodes: components["schemas"]["reason-code.schema"][];
            recoveryRealized?: components["schemas"]["money.schema"];
            evidenceHashes?: components["schemas"]["sha256Hex"][];
        };
        PauseClaim: {
            reasonCodes: components["schemas"]["reason-code.schema"][];
        };
        CreateInstitutionalInvitation: {
            /** Format: email */
            email: string;
            roles: ("ORIGINATOR" | "ISSUER" | "FACILITY" | "SERVICER" | "RESOLVER" | "ADMIN")[];
        };
        InvitationToken: {
            token: string;
        };
        RevokeInstitutionalInvitation: {
            reason: string;
        };
        /** Seller */
        "seller.schema": {
            id: components["schemas"]["uuidV7"];
            tenantId: components["schemas"]["uuidV7"];
            publicSubjectHash: components["schemas"]["sha256Hex"];
            displayName: string;
            country: string;
            baseCurrency: components["schemas"]["currency"];
            consentVersion: string;
            consentedAt: components["schemas"]["timestamp.schema"];
            createdAt: components["schemas"]["timestamp.schema"];
            updatedAt: components["schemas"]["timestamp.schema"];
            version: number;
        };
        /** MarketplaceConnection */
        "marketplace-connection.schema": {
            id: components["schemas"]["uuidV7"];
            tenantId: components["schemas"]["uuidV7"];
            sellerId: components["schemas"]["uuidV7"];
            provider: string;
            mode: components["schemas"]["partner-mode.schema"];
            /** @enum {string} */
            status: "PENDING" | "ACTIVE" | "ERROR" | "REVOKED";
            externalAccountRef: string;
            credentialSecretRef?: string;
            lastSuccessfulSyncAt?: components["schemas"]["timestamp.schema"];
            createdAt: components["schemas"]["timestamp.schema"];
            updatedAt: components["schemas"]["timestamp.schema"];
            version: number;
        };
        /** Claim */
        "claim.schema": {
            id: components["schemas"]["uuidV7"];
            claimKey: components["schemas"]["sha256Hex"];
            tenantId: components["schemas"]["uuidV7"];
            sellerId: components["schemas"]["uuidV7"];
            settlementStreamId: components["schemas"]["uuidV7"];
            facilityId: components["schemas"]["uuidV7"];
            state: components["schemas"]["claim-state.schema"];
            sourceCurrency: components["schemas"]["currency"];
            grossUnsettled: components["schemas"]["money.schema"];
            eligibleSettlementValue: components["schemas"]["money.schema"];
            advanceAmount: components["schemas"]["money.schema"];
            outstandingPrincipal: components["schemas"]["money.schema"];
            latestAttestationId?: components["schemas"]["uuidV7"];
            controlEvidenceId?: components["schemas"]["uuidV7"];
            onchainContractId?: string;
            onchainTxHash?: components["schemas"]["sha256Hex"];
            expectedSettlementAt?: components["schemas"]["timestamp.schema"];
            stateReasonCodes: components["schemas"]["reason-code.schema"][];
            createdAt: components["schemas"]["timestamp.schema"];
            updatedAt: components["schemas"]["timestamp.schema"];
            version: number;
        };
        /** FinancingOffer */
        "financing-offer.schema": {
            id: components["schemas"]["uuidV7"];
            claimId: components["schemas"]["uuidV7"];
            originatorId: components["schemas"]["uuidV7"];
            principal: components["schemas"]["money.schema"];
            fee: components["schemas"]["money.schema"];
            annualizedRateBps: number;
            advanceRateBps: number;
            expiresAt: components["schemas"]["timestamp.schema"];
            termsHash: components["schemas"]["sha256Hex"];
            /** @enum {string} */
            status: "DRAFT" | "OFFERED" | "ACCEPTED" | "EXPIRED" | "CANCELLED";
            createdAt: components["schemas"]["timestamp.schema"];
            version: number;
        };
        /** SettlementEvent */
        "settlement-event.schema": {
            id: components["schemas"]["uuidV7"];
            claimId: components["schemas"]["uuidV7"];
            externalEventId: string;
            source: string;
            /** @enum {string} */
            type: "PAYOUT" | "REFUND" | "RETURN" | "CHARGEBACK" | "FEE" | "ADJUSTMENT";
            amount: components["schemas"]["money.schema"];
            occurredAt: components["schemas"]["timestamp.schema"];
            receivedAt: components["schemas"]["timestamp.schema"];
            payloadHash: components["schemas"]["sha256Hex"];
            createdAt: components["schemas"]["timestamp.schema"];
        };
        /** WaterfallResult */
        "waterfall-result.schema": {
            id: components["schemas"]["uuidV7"];
            claimId: components["schemas"]["uuidV7"];
            runNumber: number;
            inputSettlement: components["schemas"]["money.schema"];
            principalPaid: components["schemas"]["money.schema"];
            feesPaid: components["schemas"]["money.schema"];
            firstLossApplied: components["schemas"]["money.schema"];
            seniorLoss: components["schemas"]["money.schema"];
            sellerResidual: components["schemas"]["money.schema"];
            resultHash: components["schemas"]["sha256Hex"];
            onchainTxHash?: components["schemas"]["sha256Hex"];
            executedAt: components["schemas"]["timestamp.schema"];
        };
        /**
         * ResolutionStatus
         * @enum {string}
         */
        "resolution-status.schema": "OPEN" | "RECOVERING" | "SETTLED" | "WRITTEN_OFF";
        /** ResolutionCase */
        "resolution-case.schema": {
            id: components["schemas"]["uuidV7"];
            claimId: components["schemas"]["uuidV7"];
            status: components["schemas"]["resolution-status.schema"];
            resolverAddress: components["schemas"]["stellarAddress"];
            openedReasonCodes: components["schemas"]["reason-code.schema"][];
            recoveryExpected: components["schemas"]["money.schema"];
            recoveryRealized: components["schemas"]["money.schema"];
            finalLoss: components["schemas"]["money.schema"];
            evidenceHashes: components["schemas"]["sha256Hex"][];
            openedAt: components["schemas"]["timestamp.schema"];
            closedAt?: components["schemas"]["timestamp.schema"];
            version: number;
        };
    };
    responses: {
        /** @description Successful operation. */
        Ok: {
            headers: {
                "X-Request-Id": components["headers"]["RequestId"];
                "X-Jejak-Sandbox": components["headers"]["Sandbox"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["success-envelope.schema"];
            };
        };
        /** @description Invalid input. */
        BadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["error-envelope.schema"];
            };
        };
        /** @description Unexpected server failure with no sensitive implementation details. */
        InternalError: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["error-envelope.schema"];
            };
        };
        /** @description A required dependency is unavailable. */
        Unavailable: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["error-envelope.schema"];
            };
        };
        /** @description Resource created. */
        Created: {
            headers: {
                "X-Request-Id": components["headers"]["RequestId"];
                "X-Jejak-Sandbox": components["headers"]["Sandbox"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["success-envelope.schema"];
            };
        };
        /** @description Authentication is required or invalid. */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["error-envelope.schema"];
            };
        };
        /** @description The authenticated actor lacks the required tenant, role, or object permission. */
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["error-envelope.schema"];
            };
        };
        /** @description Idempotency, encumbrance, or state conflict. */
        Conflict: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["error-envelope.schema"];
            };
        };
        /** @description The requested resource does not exist or is not visible to the actor. */
        NotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["error-envelope.schema"];
            };
        };
        /** @description Command accepted for asynchronous processing. */
        Accepted: {
            headers: {
                "X-Request-Id": components["headers"]["RequestId"];
                "X-Jejak-Sandbox": components["headers"]["Sandbox"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["success-envelope.schema"];
            };
        };
        /** @description Aggregate version or domain precondition did not match. */
        PreconditionFailed: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["error-envelope.schema"];
            };
        };
    };
    parameters: {
        /** @description Explicit active tenant selected by the authenticated actor. */
        TenantId: string;
        /** @description Stable caller-generated key; replaying the same key and payload returns the original result. */
        IdempotencyKey: string;
        CorrelationId: string;
        SellerId: string;
        ResourceId: string;
        /** @description Decimal aggregate version expected by the caller. */
        IfMatch: number;
        Cursor: string;
        Limit: number;
        ClaimState: components["schemas"]["claim-state.schema"];
    };
    requestBodies: {
        CreateSeller: {
            content: {
                "application/json": components["schemas"]["CreateSeller"];
            };
        };
        CreateMarketplaceConnection: {
            content: {
                "application/json": components["schemas"]["CreateMarketplaceConnection"];
            };
        };
        SyncMarketplaceConnection: {
            content: {
                "application/json": components["schemas"]["SyncMarketplaceConnection"];
            };
        };
        CreateCsvIngestion: {
            content: {
                "application/json": components["schemas"]["CreateCsvIngestion"];
            };
        };
        CreateClaim: {
            content: {
                "application/json": components["schemas"]["CreateClaim"];
            };
        };
        AnalyzeClaim: {
            content: {
                "application/json": components["schemas"]["AnalyzeClaim"];
            };
        };
        SubmitControlEvidence: {
            content: {
                "application/json": components["schemas"]["SubmitControlEvidence"];
            };
        };
        ControlDecision: {
            content: {
                "application/json": components["schemas"]["ControlDecision"];
            };
        };
        CreateOffer: {
            content: {
                "application/json": components["schemas"]["CreateOffer"];
            };
        };
        AcceptOffer: {
            content: {
                "application/json": components["schemas"]["AcceptOffer"];
            };
        };
        IssueClaim: {
            content: {
                "application/json": components["schemas"]["IssueClaim"];
            };
        };
        FundClaim: {
            content: {
                "application/json": components["schemas"]["FundClaim"];
            };
        };
        CreateSettlementEvent: {
            content: {
                "application/json": components["schemas"]["CreateSettlementEvent"];
            };
        };
        ReconcileClaim: {
            content: {
                "application/json": components["schemas"]["ReconcileClaim"];
            };
        };
        ExecuteWaterfall: {
            content: {
                "application/json": components["schemas"]["ExecuteWaterfall"];
            };
        };
        ResolveClaim: {
            content: {
                "application/json": components["schemas"]["ResolveClaim"];
            };
        };
        PauseClaim: {
            content: {
                "application/json": components["schemas"]["PauseClaim"];
            };
        };
        CreateInstitutionalInvitation: {
            content: {
                "application/json": components["schemas"]["CreateInstitutionalInvitation"];
            };
        };
        InvitationToken: {
            content: {
                "application/json": components["schemas"]["InvitationToken"];
            };
        };
        RevokeInstitutionalInvitation: {
            content: {
                "application/json": components["schemas"]["RevokeInstitutionalInvitation"];
            };
        };
    };
    headers: {
        /** @description UUIDv7 request identifier used for support and tracing. */
        RequestId: string;
        /** @description Whether this response was produced using sandbox behavior. */
        Sandbox: boolean;
    };
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getHealth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: components["responses"]["Ok"];
            400: components["responses"]["BadRequest"];
            500: components["responses"]["InternalError"];
        };
    };
    getReadiness: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: components["responses"]["Ok"];
            400: components["responses"]["BadRequest"];
            503: components["responses"]["Unavailable"];
        };
    };
    createSeller: {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
                /** @description Stable caller-generated key; replaying the same key and payload returns the original result. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: components["requestBodies"]["CreateSeller"];
        responses: {
            201: components["responses"]["Created"];
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            409: components["responses"]["Conflict"];
        };
    };
    getSeller: {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path: {
                sellerId: components["parameters"]["SellerId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: components["responses"]["Ok"];
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
        };
    };
    createMarketplaceConnection: {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
                /** @description Stable caller-generated key; replaying the same key and payload returns the original result. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: components["requestBodies"]["CreateMarketplaceConnection"];
        responses: {
            201: components["responses"]["Created"];
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            409: components["responses"]["Conflict"];
        };
    };
    syncMarketplaceConnection: {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
                /** @description Stable caller-generated key; replaying the same key and payload returns the original result. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
                /** @description Decimal aggregate version expected by the caller. */
                "If-Match": components["parameters"]["IfMatch"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path: {
                id: components["parameters"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody: components["requestBodies"]["SyncMarketplaceConnection"];
        responses: {
            202: components["responses"]["Accepted"];
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            412: components["responses"]["PreconditionFailed"];
        };
    };
    createCsvIngestion: {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
                /** @description Stable caller-generated key; replaying the same key and payload returns the original result. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: components["requestBodies"]["CreateCsvIngestion"];
        responses: {
            202: components["responses"]["Accepted"];
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            409: components["responses"]["Conflict"];
        };
    };
    getIngestion: {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path: {
                id: components["parameters"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: components["responses"]["Ok"];
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
        };
    };
    listClaims: {
        parameters: {
            query?: {
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
                state?: components["parameters"]["ClaimState"];
            };
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: components["responses"]["Ok"];
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    createClaim: {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
                /** @description Stable caller-generated key; replaying the same key and payload returns the original result. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: components["requestBodies"]["CreateClaim"];
        responses: {
            201: components["responses"]["Created"];
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            409: components["responses"]["Conflict"];
        };
    };
    getClaim: {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path: {
                id: components["parameters"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: components["responses"]["Ok"];
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
        };
    };
    analyzeClaim: {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
                /** @description Stable caller-generated key; replaying the same key and payload returns the original result. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
                /** @description Decimal aggregate version expected by the caller. */
                "If-Match": components["parameters"]["IfMatch"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path: {
                id: components["parameters"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody: components["requestBodies"]["AnalyzeClaim"];
        responses: {
            202: components["responses"]["Accepted"];
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            412: components["responses"]["PreconditionFailed"];
        };
    };
    submitControlEvidence: {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
                /** @description Stable caller-generated key; replaying the same key and payload returns the original result. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
                /** @description Decimal aggregate version expected by the caller. */
                "If-Match": components["parameters"]["IfMatch"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path: {
                id: components["parameters"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody: components["requestBodies"]["SubmitControlEvidence"];
        responses: {
            201: components["responses"]["Created"];
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            412: components["responses"]["PreconditionFailed"];
        };
    };
    decideControlEvidence: {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
                /** @description Stable caller-generated key; replaying the same key and payload returns the original result. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
                /** @description Decimal aggregate version expected by the caller. */
                "If-Match": components["parameters"]["IfMatch"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path: {
                id: components["parameters"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody: components["requestBodies"]["ControlDecision"];
        responses: {
            200: components["responses"]["Ok"];
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            412: components["responses"]["PreconditionFailed"];
        };
    };
    createFinancingOffer: {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
                /** @description Stable caller-generated key; replaying the same key and payload returns the original result. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
                /** @description Decimal aggregate version expected by the caller. */
                "If-Match": components["parameters"]["IfMatch"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path: {
                id: components["parameters"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody: components["requestBodies"]["CreateOffer"];
        responses: {
            201: components["responses"]["Created"];
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            412: components["responses"]["PreconditionFailed"];
        };
    };
    acceptFinancingOffer: {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
                /** @description Stable caller-generated key; replaying the same key and payload returns the original result. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
                /** @description Decimal aggregate version expected by the caller. */
                "If-Match": components["parameters"]["IfMatch"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path: {
                id: components["parameters"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody: components["requestBodies"]["AcceptOffer"];
        responses: {
            200: components["responses"]["Ok"];
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            412: components["responses"]["PreconditionFailed"];
        };
    };
    issueClaim: {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
                /** @description Stable caller-generated key; replaying the same key and payload returns the original result. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
                /** @description Decimal aggregate version expected by the caller. */
                "If-Match": components["parameters"]["IfMatch"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path: {
                id: components["parameters"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody: components["requestBodies"]["IssueClaim"];
        responses: {
            202: components["responses"]["Accepted"];
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            412: components["responses"]["PreconditionFailed"];
        };
    };
    fundClaim: {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
                /** @description Stable caller-generated key; replaying the same key and payload returns the original result. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
                /** @description Decimal aggregate version expected by the caller. */
                "If-Match": components["parameters"]["IfMatch"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path: {
                id: components["parameters"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody: components["requestBodies"]["FundClaim"];
        responses: {
            202: components["responses"]["Accepted"];
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            412: components["responses"]["PreconditionFailed"];
        };
    };
    createSettlementEvent: {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
                /** @description Stable caller-generated key; replaying the same key and payload returns the original result. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: components["requestBodies"]["CreateSettlementEvent"];
        responses: {
            201: components["responses"]["Created"];
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            409: components["responses"]["Conflict"];
        };
    };
    reconcileClaim: {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
                /** @description Stable caller-generated key; replaying the same key and payload returns the original result. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
                /** @description Decimal aggregate version expected by the caller. */
                "If-Match": components["parameters"]["IfMatch"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path: {
                id: components["parameters"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody: components["requestBodies"]["ReconcileClaim"];
        responses: {
            200: components["responses"]["Ok"];
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            412: components["responses"]["PreconditionFailed"];
        };
    };
    executeClaimWaterfall: {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
                /** @description Stable caller-generated key; replaying the same key and payload returns the original result. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
                /** @description Decimal aggregate version expected by the caller. */
                "If-Match": components["parameters"]["IfMatch"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path: {
                id: components["parameters"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody: components["requestBodies"]["ExecuteWaterfall"];
        responses: {
            200: components["responses"]["Ok"];
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            412: components["responses"]["PreconditionFailed"];
        };
    };
    resolveClaim: {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
                /** @description Stable caller-generated key; replaying the same key and payload returns the original result. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
                /** @description Decimal aggregate version expected by the caller. */
                "If-Match": components["parameters"]["IfMatch"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path: {
                id: components["parameters"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody: components["requestBodies"]["ResolveClaim"];
        responses: {
            200: components["responses"]["Ok"];
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            412: components["responses"]["PreconditionFailed"];
        };
    };
    pauseClaim: {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
                /** @description Stable caller-generated key; replaying the same key and payload returns the original result. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
                /** @description Decimal aggregate version expected by the caller. */
                "If-Match": components["parameters"]["IfMatch"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path: {
                id: components["parameters"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody: components["requestBodies"]["PauseClaim"];
        responses: {
            200: components["responses"]["Ok"];
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            412: components["responses"]["PreconditionFailed"];
        };
    };
    getPortfolioSummary: {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: components["responses"]["Ok"];
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    listAuditEvents: {
        parameters: {
            query?: {
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
            };
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: components["responses"]["Ok"];
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    createInstitutionalInvitation: {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
                /** @description Stable caller-generated key; replaying the same key and payload returns the original result. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: components["requestBodies"]["CreateInstitutionalInvitation"];
        responses: {
            201: components["responses"]["Created"];
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            409: components["responses"]["Conflict"];
        };
    };
    previewInstitutionalInvitation: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable caller-generated key; replaying the same key and payload returns the original result. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: components["requestBodies"]["InvitationToken"];
        responses: {
            200: components["responses"]["Ok"];
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
        };
    };
    acceptInstitutionalInvitation: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable caller-generated key; replaying the same key and payload returns the original result. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: components["requestBodies"]["InvitationToken"];
        responses: {
            200: components["responses"]["Ok"];
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
        };
    };
    revokeInstitutionalInvitation: {
        parameters: {
            query?: never;
            header: {
                /** @description Explicit active tenant selected by the authenticated actor. */
                "X-Jejak-Tenant-Id": components["parameters"]["TenantId"];
                /** @description Stable caller-generated key; replaying the same key and payload returns the original result. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
                /** @description Decimal aggregate version expected by the caller. */
                "If-Match": components["parameters"]["IfMatch"];
                "X-Correlation-Id"?: components["parameters"]["CorrelationId"];
            };
            path: {
                id: components["parameters"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody: components["requestBodies"]["RevokeInstitutionalInvitation"];
        responses: {
            200: components["responses"]["Ok"];
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            412: components["responses"]["PreconditionFailed"];
        };
    };
}
