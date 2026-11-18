# R2 private photo storage design and implementation plan

Goal: New photo files use a private Cloudflare R2 Standard bucket; inventory, offline merge, GitHub backups, personnel approval and old photo references keep existing behavior.

Approved approach: User selected R2, then confirmed phased photo-only migration. Cloudflare account exists but R2 is not enabled yet. No production activation, billing configuration, secret creation or old-photo migration is implied before configuration and verification.

Architecture: Reuse the existing Tencent warehouseQueryV1 service as the trusted signer. R2 access credentials and fixed bucket/account live only in server environment. Management uses the existing admin session key for upload tickets and private reads. The query photo action retains device authorization and stock visibility checks before reading R2. Browser sends binary JPEG directly to R2 with short-lived scoped signed URLs; no R2 secrets in HTML, inventory, local settings or GitHub. Private bucket CORS allows only management origin. Legacy GitHub photos remain readable and uploadable; new provider selection persists per-record, never globally relabels old records.

Metadata contract: record.storage={provider:'r2',bucket,full,thumbnail}; legacy record.github remains intact. Full key follows existing warehouse-images/YYYY/MM/DD/xx/SHA256.jpg pattern; thumbnail uses -thumb.jpg. record.hash is SHA256 of full bytes; record.thumbHash is SHA256 of thumbnail. bytes and thumbBytes retained. Upload stage marks uploaded variants only after verified server response. Failed/cancelled upload cannot commit inventory sync as successful. Existing local byte caching and original business callbacks retained.

API contract (admin authenticated): adminR2Info -> {enabled,bucket}; adminR2Upload -> args {record}, response {files:{full:{exists,url,headers},thumbnail:{exists,url,headers}}}; adminR2Verify -> args {record,variant}, response {verified:true}; adminR2Read -> args {record,variant}, response {url}. Maximum JPEG 4 MiB per variant, paths validated with strict hash/date pattern and bucket pinned. Query source.photo branches on storage.provider, still returns JPEG base64. Allow old query endpoint if R2 env absent; frontend default remains GitHub until successful R2 configuration explicitly selected.

- [ ] Server: R2 signing, scoped validation, upload verification, authorized query reading; tests using fake network; no production changes.
- [ ] Browser: shared R2 client, explicit connection/status/provider setting, provider-specific draft refs and upload/read routing; unchanged offline inventory; tests.
- [ ] Parent: integrate query snapshot projection, asset loading, diagnostics parity, admin UI setup guidance; test complete legacy and new paths.
- [ ] Real browser fake-service QA; server and browser review; opening guide, secret-safe deployment template and CORS.
- [ ] Activation waits on user-created private R2 bucket plus server-side credentials. Run actual smoke tests before switching new-photo default. Keep existing GitHub images and no destructive automatic cleanup.

Limits: No database migration; no automated photo deletion; no live speed claims until real tests; free R2 tier is not a hard spending cap. Read/write and storage usage must include verification requests. Existing query-access session needed for management R2 upload. Cost alerts and storage accounting can be added later without pretending exact usage from local references alone.

## Verification and activation status

2026-11-19: 164/164 automated tests passed. Fake-service real-browser R2 flow 15/15 checks passed (real MozJPEG draft, explicit enable, binary upload, lost-response resume, integrity verification, private reads, denied auth, provider rollback). Existing manager browser29/29 checks passed at390x844 with reduced-motion=no-preference. Read-only review findings on metadata identity/cache fixed and re-reviewed with19/19 targeted tests. No claim of physical iPhone or live R2 performance.

Server implementation reuses Tencent signing/authorization; R2 PUTs are immutable and sign the declared content length plus SHA256 and metadata. Browser automatically supplies Content-Length; do not manually set it. Live R2 smoke must confirm this browser transport, payload signature support, bucket-scoped credentials and CORS. Failed validation blocks photo completion; no silent fallback.

Implementation checklist: local server, browser, query projection, documentation, fake-service QA and review complete. Activation checklist remains open: user enables R2/private Standard bucket, sets CORS and scoped read/write credentials server-side; deploy server then management UI; real upload/read/denied-access/resume smoke; explicit provider switch. No production deployment or photo migration executed in this task.
