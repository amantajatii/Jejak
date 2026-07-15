# Jejak Evidence Storage and Observability Design

**Date:** 15 July 2026  
**Owner:** BE / Integration Steward  
**Scope:** `BE-19` and the evidence-storage hardening portion of `BE-17`  
**Status:** Approved

## 1. Outcome

Jejak will gain a production-shaped private evidence-storage boundary using Supabase Storage and a deterministic in-memory sandbox adapter. The implementation will not require Docker, MinIO, a local object-storage service, or a local OpenTelemetry collector.

The module will provide secure upload intent, finalization, authorized download intent, and abandoned-object cleanup services. It will not create a second control-evidence domain model, add public HTTP operations, or modify the DATA/RISK/claim-lifecycle modules currently being implemented in parallel.

## 2. Scope boundaries

### In scope

- framework-neutral evidence-storage port;
- Supabase private-bucket adapter;
- deterministic in-memory sandbox/test adapter;
- canonical object-key construction;
- signed upload intents using Supabase's fixed two-hour validity and configurable short-lived downloads;
- a Jejak finalization deadline independent of the storage-token validity;
- content-type, size, metadata, and SHA-256 verification;
- immutable evidence versions with no overwrite/upsert;
- safe object reference returned after finalization;
- cleanup of abandoned, unfinalized objects;
- readiness probe, metrics, traces, redaction, and shutdown behavior;
- offline tests and dedicated Supabase acceptance suite;
- configuration template, runbook, CI checks, and evidence-based tracker updates.

### Out of scope

- public evidence HTTP endpoints or an OpenAPI contract change;
- control-evidence claim-state transitions owned by the parallel lifecycle work;
- raw legal-document persistence in Postgres, events, logs, or Stellar;
- FE upload UI or browser cryptography;
- application-managed envelope encryption without a production key-management dependency;
- public buckets, permanent URLs, or direct Data API access;
- MinIO, Docker, or a second S3-compatible production adapter;
- marking `BE-19` complete before real Supabase acceptance and handler integration.

## 3. Selected approach

Use a Supabase-first storage implementation behind an internal port, with an in-memory adapter for sandbox and tests.

This approach matches the approved direct-upload architecture, uses the existing Supabase backend dependency, and avoids making assumptions about another storage vendor. The port preserves replaceability without adding a generalized S3 abstraction that the baseline does not need.

Rejected alternatives:

1. **Backend-proxied envelope encryption.** This would route document bytes through Fastify, increase memory/bandwidth pressure, complicate streaming and retry semantics, and contradict the approved direct signed-upload flow. It can be reconsidered only when a production KMS and custody requirement exist.
2. **S3/MinIO-first abstraction.** This adds operational weight and frequently requires Docker locally. The user explicitly prefers a Docker-free workflow.
3. **Filesystem sandbox.** Filesystem behavior differs materially from signed-object storage and introduces cleanup/path-permission variability. A deterministic in-memory adapter is safer for tests.

## 4. Module boundaries

All new implementation files live under:

```text
apps/api/src/modules/evidence/
├── application/
│   ├── create-upload-intent.ts
│   ├── finalize-evidence.ts
│   ├── create-download-intent.ts
│   └── cleanup-abandoned-evidence.ts
├── domain/
│   ├── evidence-key.ts
│   ├── evidence-policy.ts
│   └── types.ts
├── ports/
│   └── evidence-storage.ts
└── adapters/
    ├── in-memory-evidence-storage.ts
    └── supabase-evidence-storage.ts
```

The module depends only on approved shared primitives: tenant/actor authorization context, UUIDv7 identifiers, canonical error classification, hashing, configuration, and telemetry. It does not import claim lifecycle internals.

The future control-evidence handler will call the application services through exported interfaces. The handler remains responsible for claim assignment/state authorization and for persisting the returned final `documentSecretRef` in the existing canonical control-evidence record.

## 5. Storage port

The `EvidenceStorage` port exposes capability-focused operations rather than leaking the Supabase client:

```text
createUploadIntent(input) -> UploadIntent
inspectObject(objectKey) -> StoredObject | null
readObject(objectKey) -> byte stream
createDownloadIntent(objectKey, expiresInSeconds) -> DownloadIntent
removeObject(objectKey) -> void
listAbandoned(prefix, olderThan, cursor, limit) -> page
close() -> void
```

The application service owns policy and hash verification. The adapter owns storage-specific calls, normalized error mapping, timeouts, and safe response parsing.

The port never returns service keys, raw authorization headers, internal Supabase responses, or public URLs.

## 6. Canonical object identity

Every object key is constructed by backend code:

```text
tenant/{tenantId}/claim/{claimId}/evidence/{evidenceId}/{version}
```

Rules:

- every ID must be a canonical UUIDv7;
- `version` is a positive integer;
- user filenames never affect the object key;
- tenant/claim/evidence identifiers cannot contain separators;
- one key identifies one immutable version;
- an existing key causes a conflict; it is never overwritten;
- corrections receive a new evidence ID or version according to the owning lifecycle policy.

## 7. Upload flow

```text
authorized lifecycle handler
→ EvidenceService.createUploadIntent
→ validate tenant/claim/evidence IDs, version, content type, expected size/hash
→ construct canonical key
→ prove key is absent
→ create a Supabase signed upload intent with fixed two-hour validity
→ return safe intent, storage expiry, and a 15-minute Jejak finalization deadline
→ client uploads directly to private Supabase bucket
```

The allowed content-type list and maximum object size are configuration with secure defaults. The initial baseline allows only explicitly enumerated evidence formats; it does not trust filename extensions.

The current Supabase API fixes signed-upload validity at two hours. Jejak does not claim or simulate an earlier storage-token expiry. Instead, it applies a default 15-minute application deadline: an object uploaded after that deadline cannot be finalized into canonical evidence and is removed by cleanup. The upload intent contains the minimum client material required by Supabase. It is treated as sensitive, excluded from logs/traces/events, and not persisted as a reusable credential.

## 8. Finalization flow

```text
authorized lifecycle handler
→ EvidenceService.finalize
→ inspect object metadata and size
→ stream stored bytes through backend SHA-256 verifier
→ compare expected and actual content type, size, and hash
→ on success return immutable documentSecretRef + safe metadata
→ lifecycle transaction persists reference/hash and emits audit/outbox
```

The backend verifies stored bytes rather than trusting client metadata. Hashing is streaming and bounded; document bytes are never converted to logs or events.

If verification fails, the object is removed when safe or left quarantined for cleanup, a stable non-retryable integrity error is returned, and the mismatch metric/audit classification is emitted. No canonical control-evidence reference is produced.

Finalization is idempotent for the same object identity and expected metadata. Reusing the same identity with different expected metadata is a conflict.

## 9. Download flow

```text
authorized lifecycle handler
→ EvidenceService.createDownloadIntent
→ validate canonical secret reference belongs to tenant/claim/evidence
→ confirm object exists
→ create short-lived signed download URL
→ return expiry-bound intent
```

There are no public URLs. A stored signed URL is not considered a durable evidence reference. The durable reference is the canonical bucket/key identity returned by finalization.

## 10. Cleanup flow

The cleanup worker uses the `jejak_worker` application boundary and scans only canonical tenant prefixes. It removes objects older than the configured threshold that have not been finalized by the owning lifecycle persistence.

Because this module cannot import claim persistence internals, finalization lookup is injected as an `EvidenceReferenceRegistry` port:

```text
isFinalized(tenantId, objectKey) -> boolean
```

Cleanup is paginated, bounded per run, idempotent, and safe under retries. A storage listing failure stops the current page without treating unseen objects as abandoned.

## 11. Security model

- The evidence bucket is private.
- Supabase secret/service credentials remain backend-only.
- No grants are added to Jejak business tables for `anon`, `authenticated`, or `service_role`.
- Storage access is mediated by short-lived signed intents after Fastify authorization.
- The adapter does not read or modify Supabase-managed Auth/Storage schema objects directly.
- Raw bytes, upload tokens, signed URLs, authorization headers, emails, filenames, legal text, and service keys are excluded from logs, traces, events, fixtures, and database records.
- `documentSecretRef` contains only the configured bucket and canonical object key; it contains no credential or signed query string.
- Storage failures are mapped to stable safe classes such as unavailable, timeout, conflict, not found, and integrity mismatch.
- The in-memory adapter refuses production mode.
- Platform private-storage encryption and transport security are used for the baseline. Application-managed envelope encryption requires a separately approved KMS design and is not silently simulated.

## 12. Configuration

Backend-only configuration:

```text
SUPABASE_STORAGE_EVIDENCE_BUCKET=jejak-evidence
EVIDENCE_STORAGE_MODE=IN_MEMORY | SUPABASE
EVIDENCE_FINALIZATION_DEADLINE_SECONDS=900
EVIDENCE_DOWNLOAD_TTL_SECONDS
EVIDENCE_MAX_BYTES
EVIDENCE_ALLOWED_CONTENT_TYPES
EVIDENCE_ABANDONED_AFTER_SECONDS
EVIDENCE_CLEANUP_BATCH_SIZE
```

Defaults are valid for test/development without secrets. Production rejects `IN_MEMORY`, missing Supabase backend configuration, a public bucket, invalid deadline/download-TTL ranges, unbounded size, or an empty content-type allowlist. The application never represents the finalization deadline as the Supabase upload-token expiry.

## 13. Readiness and lifecycle

Storage readiness is conditional:

- disabled/unconfigured evidence storage does not break dependency-free `/health`;
- when evidence storage is required, `/ready` performs a bounded private-bucket capability probe without uploading user content;
- configuration errors fail readiness safely without returning bucket credentials or connection details;
- shutdown closes adapter resources and waits only for bounded in-flight verification work.

No local collector is required. OTLP export remains optional.

## 14. Observability

Low-cardinality metrics:

- `jejak.evidence.upload_intent.total` by outcome/mode;
- `jejak.evidence.finalization.total` by outcome/error class;
- `jejak.evidence.integrity_mismatch.total`;
- `jejak.evidence.cleanup.total` by outcome;
- upload-intent, finalization, hash-verification, and cleanup duration;
- verification bytes processed as a bounded histogram.

Manual spans:

- `evidence.create_upload_intent`;
- `evidence.finalize`;
- `evidence.create_download_intent`;
- `evidence.cleanup`.

Allowed attributes are restricted to operation, outcome, storage mode, tenant ID, claim/evidence IDs, version, safe error class, and bounded size bucket. Object URLs, tokens, keys, filenames, hashes, document references, and content are prohibited attributes.

## 15. Error and retry behavior

- validation, unsupported content type, oversize, and integrity mismatch do not retry;
- storage timeout/unavailability may retry with bounded exponential backoff and jitter;
- conflict does not overwrite and requires a new version or idempotent replay;
- not-found during finalization returns a stable non-leaking error;
- lost upload response is resolved by inspecting the canonical key before issuing another intent;
- cleanup deletion is idempotent;
- circuit-breaker behavior may stop new upload intents while preserving authorized downloads and cleanup according to policy.

## 16. Testing and acceptance

### Offline tests

- canonical key validation and path-confusion rejection;
- allowed content types and size bounds;
- high-entropy signed-intent shape with distinct two-hour storage expiry and 15-minute finalization deadline, without token logging;
- immutable no-overwrite behavior;
- successful streaming SHA-256 finalization;
- size/content-type/hash mismatch rejection and cleanup;
- idempotent finalization and conflicting replay;
- authorized download reference parsing;
- paginated abandoned-object cleanup and failure recovery;
- in-memory adapter production rejection;
- telemetry allowlist and secret-redaction proof;
- readiness behavior for disabled, healthy, unavailable, and misconfigured storage.

### Dedicated Supabase acceptance

- guard proves the configured URL and project are the approved test project;
- create or verify the configured bucket is private;
- signed upload succeeds and public access fails;
- finalization hashes the actually stored bytes;
- signed download expires and cannot be reused as a permanent reference;
- overwrite is rejected;
- cross-tenant key/reference attempts fail before storage access;
- synthetic objects/users are removed in unconditional teardown;
- security advisors are reviewed when available.

### Completion rules

- `BE-19` remains `DOING` after the standalone module passes offline tests.
- `BE-19` becomes `DONE` only after dedicated Supabase acceptance, lifecycle-handler integration, and the production-shaped interface evidence pass.
- `BE-17` remains `DOING` until deployment-visible trace/readiness evidence exists; local Docker is not a completion requirement under the approved project workflow.

## 17. Parallel-work safety

The implementation avoids edits to the concurrent work under:

```text
apps/api/src/modules/claims/
apps/api/src/modules/ingestion/
apps/api/src/modules/jcc/
apps/api/src/modules/reconciliation/
apps/api/src/modules/risk/
apps/api/src/db/schema/lifecycle.ts
```

Shared files such as configuration, readiness registration, telemetry initialization, CI, documentation, and tracker are edited only after checking their current worktree state. Commits stage explicit paths and never absorb another session's files.

## 18. Implementation sequence

1. Publish this approved design and implementation plan.
2. Add domain types, policy, canonical key, and storage ports.
3. Add deterministic in-memory adapter and exhaustive offline tests.
4. Add Supabase adapter with current pinned client APIs.
5. Add application services and failure-injection tests.
6. Add conditional readiness and redacted telemetry.
7. Add guarded dedicated-project acceptance suite and runbook.
8. Integrate with the lifecycle handler only after its parallel work stabilizes.
9. Update tracker strictly from completed evidence.
