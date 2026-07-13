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
  - Run ID: `pre-fix`
- Instrumentation only; no business behavior was changed:
  1. Node `src/lib/generators/video/maas-seedance.ts`: after all MAAS media URL normalization/body construction and immediately before sending to Python.
  2. Python `py_api/maas_seedance_api.py`: immediately before each `require_public_url` rejection.
  3. Python `py_api/maas_seedance_api.py`: after `request_data` construction and immediately before SDK submission.
- Every event contains only field name, scheme, hostname, port, pathname category, and localhost/private/internal booleans. Query strings, signatures, keys, authorization, and credentials are excluded.
- Reporting uses Debug Server HTTP only; failures are swallowed and do not alter control flow, return values, or exceptions.
- Validation passed: `npm run typecheck`; `python -m py_compile py_api\maas_seedance_api.py`.

## Reproduction Steps (pre-fix)

1. Keep the Debug Server running and restart/reload the Node worker and Python MAAS adapter so the instrumentation is active.
2. In the application, open the same video generation flow and select the same MAAS Seedance model/input image that produced the 400 response.
3. Click generate video exactly once and wait for success or the existing `400 image_url must not use a local/private hostname` response.
4. Confirm `.dbg/trae-debug-log-maas-private-image-url.ndjson` exists and has new `runId: "pre-fix"` events from `before-python` and either a Python rejection location or `before-sdk`.
5. Do not paste full media URLs into the record; inspect only the sanitized event metadata.
