# SaaS 平台完善执行计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Use `superpowers:test-driven-development` for behavior changes, `superpowers:systematic-debugging` for failures, `build-web-apps:react-best-practices` for React/Next.js UI changes, and `superpowers:verification-before-completion` before reporting completion.

**Goal:** 以 `feature/platform-admin` 为共享基线，在个人分支中补齐 SaaS 平台权限、租户隔离、组织计费、订阅订单状态机、平台后台质量和测试保障。

**Architecture:** 先把共享分支快进到远程最新 `origin/wyk`，再在个人分支中按后端权限、计费、租户隔离、前端后台、测试验收五个独立切片推进。后端统一权限 wrapper、DTO serializer、billing service 和 API guard；前端统一 admin 请求、导航、状态和 i18n。

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma, MySQL, NextAuth, Vitest, ESLint, BullMQ.

---

## Git 协作规范

- 中性共享分支：`feature/platform-admin`。
- 个人工作分支：`ygr-saas-platform-hardening-20260628`。
- 说明：仓库已有 `ygr` 分支，Git 不允许同时存在 `ygr` 和 `ygr/...`，所以个人分支使用横线命名。
- 不直接长期开发在 `wyk`；`wyk` 只作为对方个人分支来源。
- `feature/platform-admin` 只用于共享集成；个人改动完成后通过 PR 合回它。
- 提交信息使用中文，按阶段提交：
  - `docs: 新增 SaaS 平台完善执行计划`
  - `fix: 修复平台组织权限与管理员入口`
  - `fix: 修复企业余额和组织计费一致性`
  - `feat: 完善租户上下文与资源隔离`
  - `feat: 补齐订阅订单支付状态机`
  - `refactor: 拆分平台后台页面和请求逻辑`
  - `test: 补充 SaaS 权限计费与状态机覆盖`

## 子代理执行方式

使用 `multi_agent_v1` 和 `superpowers:subagent-driven-development`：

- Worker A：平台权限与组织成员接口，负责平台 admin API、平台组织成员接口、Navbar/admin check。
- Worker B：组织计费一致性，负责 `src/lib/billing/*`、`src/lib/saas/*`、组织余额、充值、冻结、确认、回滚。
- Worker C：租户上下文与资源隔离，负责项目、任务、资产、媒体、运行记录中的 `organizationId` 读写过滤。
- Worker D：平台前端质量，负责平台后台页面、admin hooks、DTO 类型、i18n、Link 导航和请求错误态。
- Worker E：测试与验收，负责新增/修复 Vitest、API guard、CI 失败定位。

每个 worker 必须报告：状态、改动文件、测试命令和结果、未完成风险。主线程负责集成、review、提交和最终验证。

## Task 1: Git 基线与计划文档

**Files:**
- Create: `docs/superpowers/plans/2026-06-28-saas-platform-hardening.md`

- [x] 清理未跟踪 `.tmp-analysis/`，确保它不进入提交。
- [x] `feature/platform-admin` 快进到 `origin/wyk@36c5dca`。
- [x] 推送 `origin/feature/platform-admin`。
- [x] 创建个人工作分支 `ygr-saas-platform-hardening-20260628`。
- [ ] 提交计划文档。

## Task 2: 平台权限与组织成员接口

**Targets:**
- `src/app/api/platform/admin/check/route.ts`
- `src/app/api/platform/organizations/[id]/members/route.ts`
- `src/app/[locale]/admin/platform/organizations/page.tsx`
- `src/components/Navbar.tsx`

Acceptance:

- 平台管理员不是组织成员时，仍可查看任意组织成员。
- 非平台管理员访问平台组织成员接口返回 401/403。
- Navbar 和平台入口使用 `/api/platform/admin/check` 判断权限，兼容数据库管理员和 `PLATFORM_ADMIN_EMAILS`。
- 平台首页所有内部导航使用页面路由，不链接 API URL。

## Task 3: 组织计费一致性

**Targets:**
- `src/lib/billing/organization.ts`
- `src/lib/saas/entitlements.ts`
- `src/app/api/organizations/[id]/billing/route.ts`
- `src/app/api/platform/organizations/[id]/balance/route.ts`

Acceptance:

- 企业充值同一幂等键重复提交只增加一次余额。
- 组织计费有独立冻结记录或等价状态，不使用 `OrganizationBalance.id` 冒充 freezeId。
- 组织计费支持冻结、确认、回滚。
- 权益校验覆盖任务类型、月度额度、成员配额和余额超额策略。

## Task 4: 租户上下文与资源隔离

**Targets:**
- `src/lib/api-auth.ts`
- `src/app/api/organizations/*`
- 项目、任务、资产、媒体和运行记录相关 API

Acceptance:

- 用户可读取和切换当前组织。
- 所有组织资源请求都二次校验成员身份。
- 项目、任务、资产、媒体、运行记录按 `organizationId` 写入和过滤。
- 跨组织访问返回 403 或 404，不泄露资源存在性。

## Task 5: 订阅订单状态机

**Targets:**
- `src/app/api/platform/orders/*`
- `src/app/api/platform/subscriptions/*`
- `src/app/api/platform/invoices/*`
- `src/lib/saas/*`

Acceptance:

- 订单支付成功只激活一次订阅。
- 重复支付回调不会重复充值、重复激活订阅或重复开票。
- 订阅取消、到期、欠费能影响组织业务状态。
- 发票状态跟随订单和订阅状态变化。

## Task 6: 平台前端质量

**Targets:**
- `src/app/[locale]/admin/platform/page.tsx`
- `src/app/[locale]/admin/platform/organizations/page.tsx`
- `src/app/[locale]/admin/platform/users/page.tsx`
- `src/app/[locale]/admin/platform/billing/page.tsx`
- `messages/zh/platform.json`
- `messages/en/platform.json`

Acceptance:

- 组织、用户、计费页面拆分出组件、hooks、DTO 类型。
- 内部导航全部使用 `next/link`。
- 补齐 `platform.saving` 等缺失 i18n key。
- 请求层检查 `res.ok`，显示 loading、error、empty、retry。
- 平台后台没有错误 API 链接，没有明显硬编码中英文。

## Task 7: 测试与最终验收

阶段性命令：

```powershell
npm run lint:all
npm run typecheck
npm run check:api-handler
npm run test:billing:unit
npm run test:integration:api
```

最终命令：

```powershell
npm run verify:push
```

必须覆盖：

- 平台管理员查看非成员组织成员。
- 非平台管理员访问平台接口被拒绝。
- 企业充值幂等。
- 组织计费冻结、确认、回滚。
- 当前组织切换后资源隔离。
- 跨组织访问被拒绝。
- 订单支付幂等激活订阅。
- 订阅到期、取消、欠费影响组织状态。
- 套餐权益不支持的任务类型被拒绝。
- 平台后台无缺失 i18n key、错误 API 链接和 `<a href>` 内部导航。
