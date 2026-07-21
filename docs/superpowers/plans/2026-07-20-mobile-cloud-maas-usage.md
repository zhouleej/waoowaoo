# Mobile Cloud MaaS Usage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure shared Mobile Cloud Seedance package and usage dashboard for every authenticated user.

**Architecture:** A focused server-only adapter normalizes Mobile Cloud console APIs behind one authenticated internal route. The profile page consumes a stable response model and renders a glass-style responsive dashboard without mixing provider usage with the internal billing ledger.

**Tech Stack:** Next.js 15 route handlers, React 19, TypeScript, next-intl, Vitest, existing authentication and UI primitives.

---

### Task 1: Pure Mobile Cloud domain helpers

**Files:**
- Create: `src/lib/mobile-cloud-maas/types.ts`
- Create: `src/lib/mobile-cloud-maas/usage.ts`
- Test: `tests/unit/mobile-cloud-maas/usage.test.ts`

- [ ] Write failing tests for inclusive 30-day splitting, response normalization, package totals, deduplication, trend aggregation and local pagination.
- [ ] Run `npx vitest run tests/unit/mobile-cloud-maas/usage.test.ts` and verify the missing module failure.
- [ ] Implement strict pure helpers with no network or environment dependencies.
- [ ] Re-run the focused test and verify all cases pass.

### Task 2: Configuration, upstream client and cache

**Files:**
- Create: `src/lib/mobile-cloud-maas/config.ts`
- Create: `src/lib/mobile-cloud-maas/client.ts`
- Test: `tests/unit/mobile-cloud-maas/client.test.ts`
- Modify: `.env.example`

- [ ] Write failing tests for missing configuration, request headers/body, multi-page fetching, retryable 5xx/network failures, non-retryable 401/403, fresh cache and stale fallback.
- [ ] Run the focused test and verify it fails because the client is absent.
- [ ] Implement server-only environment parsing, a timeout-aware fetch wrapper, upstream clients and bounded in-memory cache.
- [ ] Add documented placeholder environment variables without real credentials.
- [ ] Re-run focused tests and verify they pass.

### Task 3: Authenticated internal API

**Files:**
- Create: `src/app/api/user/mobile-cloud-usage/route.ts`
- Modify: `tests/contracts/route-catalog.ts`
- Create: `tests/integration/api/contract/mobile-cloud-usage-route.test.ts`

- [ ] Write a failing contract test for route registration, authentication, query validation and admin-only diagnostics.
- [ ] Run the focused contract test and confirm failure.
- [ ] Implement the `apiHandler` route using `requireUserAuth`, `checkPlatformAdmin`, strict query parsing and the normalized client.
- [ ] Return cache metadata and safe error details without exposing credentials.
- [ ] Re-run the focused contract test and route coverage guard.

### Task 4: Profile usage dashboard

**Files:**
- Create: `src/app/[locale]/profile/components/mobile-cloud-usage.ts`
- Create: `src/app/[locale]/profile/components/MobileCloudUsageTab.tsx`
- Modify: `src/app/[locale]/profile/page.tsx`
- Modify: `messages/zh/profile.json`
- Modify: `messages/en/profile.json`
- Test: `tests/unit/profile/mobile-cloud-usage.test.ts`

- [ ] Write failing tests for date presets, number formatting inputs, chart scaling and page reset behavior.
- [ ] Run the focused UI helper test and confirm failure.
- [ ] Implement the pure UI helpers and responsive dashboard using existing glass variables and `AppIcon`.
- [ ] Add the new profile navigation section and bilingual copy.
- [ ] Re-run the focused tests and TypeScript check.

### Task 5: Verification and commit

**Files:** all files above.

- [ ] Run all new unit and API contract tests.
- [ ] Run `npm run lint:all` and `npm run typecheck`.
- [ ] Run the relevant route/test guards and inspect `git diff --check` plus `git status`.
- [ ] Commit only this feature with an intentional message.
