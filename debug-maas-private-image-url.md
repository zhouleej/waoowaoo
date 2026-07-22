# Debug Session: maas-private-image-url

- Status: [OPEN]
- Symptom: MAAS video generation returns `400 image_url must not use a local/private hostname`.
- Expected: Python adapter receives a public MinIO presigned URL for all outbound media.

## Hypotheses

1. Worker is still running old code and sends localhost, minio, or private-network URLs.
2. Environment variables changed but Next/Worker were not fully restarted, so MINIO_PUBLIC_ENDPOINT is not active.
3. The original image URL cannot be resolved back to a MinIO storage key, so it cannot be publicly re-signed.
4. MINIO_PUBLIC_ENDPOINT points to a Console/private/invalid endpoint.
5. Node and Python run in different network contexts; Python receives a hostname only Node can access.

## Evidence plan

- Capture the final normalized media URL at the Node MAAS adapter boundary.
- Capture the final Python request_data before SDK invocation.
- Record only URL scheme/host/port/path classification; never report query signatures, API keys, or credentials.

## Timeline

- Session initialized. No business logic modified.
- Debug Server started with `--outdir .dbg --clean --idle 1200`.
  - Event endpoint: `http://127.0.0.1:7777/event`
  - Health endpoint: `http://127.0.0.1:7777/health`
  - Environment: `.dbg/maas-private-image-url.env`
  - Evidence: `.dbg/trae-debug-log-maas-private-image-url.ndjson`
  - Run ID: `post-fix` (instrumentation retained in Node and Python)
- Debug Server restarted without `--clean`, so pre-fix evidence remains in `.dbg/trae-debug-log-maas-private-image-url.ndjson`.
- Health verified at `http://127.0.0.1:7777/health`; server remains running with `--idle 1200`.

## Pre-fix Evidence

1. `.dbg/trae-debug-log-maas-private-image-url.ndjson:1` and `:3`: the Node boundary sent `image_url` with `scheme=http`, `hostname=localhost`, `port=3000`, `pathnameCategory=object-path`.
2. The same file `:2` and `:4`: Python received the same metadata and rejected it at `require_public_url:hostname`.
3. `logs/app.log:3381`, `:3384`, and `:3387`: the corresponding video jobs failed with `400 image_url must not use a local/private hostname`.
4. The observed `object-path` is the MinIO path-style bucket/object shape: `/<MINIO_BUCKET>/<storage-key>`; in this environment that means `/wakuwaku/images/...`. The regression test uses the equivalent sanitized value `http://localhost:3000/wakuwaku/images/panel-source.png`.

## Root Cause

- Before the current outbound normalization work, `src/lib/media/outbound-image.ts` returned every absolute HTTP(S) input unchanged. Therefore an already-absolute `http://localhost:3000/<bucket>/<object>` survived normalization.
- Storage keys were previously signed through synchronous `getSignedUrl`, which returns application routes (`/api/files/...` or `/api/storage/sign?...`). `absoluteBaseUrl: getPublicBaseUrl()` then prepended `NEXTAUTH_URL`; with `NEXTAUTH_URL=http://localhost:3000`, this reconstructed another localhost URL.
- The recoverable object shape is path-style MinIO `/<bucket>/<key>` (or virtual-host bucket plus `/<key>`). The prior broad provider extractor could treat arbitrary private paths as storage keys, so recovery needed explicit route/bucket/key validation.
- Confirmed hypothesis 3. Hypotheses 1 and 5 describe the observed boundary mismatch but are not the root cause. Hypothesis 2 is relevant to restart/config activation, while hypothesis 4 is independently guarded by MinIO endpoint validation.

## Minimal Fix

1. `src/lib/media/outbound-image.ts`
   - Private/local/internal HTTP URLs no longer pass through.
   - Recover storage keys explicitly from `/api/files/<encoded-key>`, `/api/storage/sign?key=...`, `/m/<publicId>`, direct `/images|video|voice/...`, path-style `/<MINIO_BUCKET>/<key>`, and virtual-host bucket/object URLs.
   - Recoverable keys use async `getSignedObjectUrl`, so MinIO signs directly with `MINIO_PUBLIC_ENDPOINT`; `NEXTAUTH_URL` is not used for the resulting object URL.
   - Unrecoverable private URLs throw `OUTBOUND_IMAGE_UNSUPPORTED_INPUT`; public HTTP(S) URLs remain unchanged.
2. `src/lib/storage/providers/minio.ts`
   - Public presigning uses a client configured with `MINIO_PUBLIC_ENDPOINT`; normal object operations continue using `MINIO_ENDPOINT`.
3. Instrumentation remains in `src/lib/generators/video/maas-seedance.ts` and `py_api/maas_seedance_api.py`, with `runId: post-fix`.

## Regression Coverage

- `src/lib/media/outbound-image.test.ts`: actual localhost path-style bucket/object input; localhost `/api/files`, `/api/storage/sign`, and `/m`; public URL pass-through; unrecoverable private URL failure.
- `tests/unit/storage/minio-provider.test.ts`: public endpoint host is used for presigning and internal endpoint fallback behavior remains covered.
- `tests/unit/worker/video-worker.test.ts`: MAAS first/last frame normalization flow remains covered.

## Validation

- Related tests passed: `src/lib/media/outbound-image.test.ts`, `tests/unit/storage/minio-provider.test.ts`, `tests/unit/worker/video-worker.test.ts`.
- `npm run typecheck` passed.
- `npm run lint:all` passed.
- `python -m py_compile py_api\\maas_seedance_api.py` passed.

## Reproduction Steps (post-fix)

1. Keep the Debug Server running.
2. Restart/reload the Node video worker and Python MAAS adapter so both load the fix and `runId: post-fix` instrumentation.
3. Verify `MINIO_PUBLIC_ENDPOINT` is the externally reachable S3 API endpoint (not a Console endpoint) and restart the worker after any environment change.
4. In the same project/panel and MAAS Seedance flow used pre-fix, click generate video exactly once.
5. Inspect `.dbg/trae-debug-log-maas-private-image-url.ndjson` for new `post-fix` events:
   - Node `before-python` and Python `before-sdk` should report the public MinIO host, not localhost/private/internal.
   - There should be no Python `require_public_url:*` rejection for `image_url`.
6. Report whether generation succeeds or provide the new sanitized `post-fix` event metadata. Do not paste full signed URLs or credentials.
