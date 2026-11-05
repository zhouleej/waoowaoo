# 团队创作空间

团队复用 `Organization`。新团队使用 `team_api_key` 费用来源；已有组织继续使用 `platform_balance`，保留原余额、订阅和套餐。

## 使用

顶部导航提供“个人创作空间”和“团队创作空间”。个人入口直接切换；团队入口提供选择团队、管理和创建操作。顶部持续显示当前空间名称。每个标签页通过 `sessionStorage` 保存自己的选择，切换会重新加载页面并关闭旧订阅。

1. 在 `/zh/teams` 填写名称创建团队。
2. 添加服务商连接、密钥、可用模型、估算单价和默认模型。保存产生不可变版本，不再返回密钥明文。
3. 按已注册用户名邀请成员。邀请有效期 7 天，对方接受后才能访问团队全部项目与资产。重复或并发接受仅建立一条成员关系。
4. 切换到团队空间创建内容。个人资产中心支持复制资产到团队，保留个人原件；私人账号的远端音色须在团队下重建。
5. 用量统计支持月份、成员、项目和模型筛选及分页。负责人和管理员查看团队记录，成员只能查看自己的用量与预算。

负责人可配置管理员和转让负责人；管理员只管理普通成员。成员能创建和编辑内容，不能删除整个项目或共享资产。负责人须先转让才能退出。退出、冻结或移除不删除团队内容。旧邮箱邀请仍可查询和撤销；新团队禁止通过旧成员接口直接加入账号。

## 预算与任务

- 预算以人民币计，六位小数，`0` 为不限额。完全停止访问使用冻结状态。
- 月份按 `Asia/Shanghai` 计算，跨月任务计入提交月份。退出再加入不会清空月份账本。
- 团队预算独立于 `BILLING_MODE`，不扣平台余额。提交与每次新外部调用预占预算，MySQL 行锁防止并发超额。
- 文本根据输入规模与输出上限预占；返回 token 用量后调整估算。页面始终称“估算消耗”，与最终账单区分。失败但可能已收费的调用保守结算并标记“待核对”。
- Worker 从数据库读取发起人、归属、配置版本和内容版本。更换密钥后旧任务继续使用原版本，团队任务不回退个人密钥。
- 冻结、退出或移除后取消未开始任务、停止新外部调用并关闭事件流；已受理调用继续收取结果和结算。
- 保存携带 `X-Resource-Revisions`，冲突返回 `409` 并保留本地草稿。生成写回冲突时保存 `Task.result.candidate`，从团队概览查看并手动复制。

## 接口约定

集合和创建接口使用 `X-Workspace-Scope: personal` 或 `team:<organizationId>`。个人查询同时限定 `userId` 和 `organizationId = null`。具体资源始终按数据库归属授权。缓存和虚拟资产任务事件频道均包含空间标识。

| 接口 | 方法 | 用途 |
| --- | --- | --- |
| `/api/organizations` | GET / POST | 列出、创建团队 |
| `/api/organizations/:id/accounts` | GET | 精确查找已注册用户名 |
| `/api/organizations/:id/invitations` | GET / POST | 查询、发送邀请 |
| `/api/user/team-invitations` | GET | 当前用户邀请收件箱 |
| `/api/user/team-invitations/:id` | POST | `{ action: "accept" / "reject" }` |
| `/api/organizations/:id/leave` | POST | 退出 |
| `/api/organizations/:id/transfer-owner` | POST | `{ userId }` 转让 |
| `/api/organizations/:id/model-config` | GET / PUT | 安全读取、版本化保存 |
| `/api/organizations/:id/model-config/test` | POST | 测试已保存连接，不执行付费生成 |
| `/api/organizations/:id/usage-statistics` | GET | 月度筛选、分页与全量汇总 |
| `/api/asset-hub/copy-to-team` | POST | 复制个人资产 |

新媒体记录 `MediaScopeGrant`。预览、文件和签名接口校验归属或有效成员身份；团队外部素材签名最长 15 分钟。复制资产显式授权目标团队，同时保留原个人访问。

## 升级与回滚

先备份数据库与媒体，再执行增量迁移。**不要为本功能清空数据库。**

```sh
npx prisma migrate deploy
npx prisma generate
npm run media:backfill-workspaces
npm run media:backfill-workspaces -- --apply
npm run build
```

媒体回填默认仅扫描，加 `--apply` 才写入，可重复执行。它根据项目、分镜、剧集、灵感视频和全局资产引用补齐旧媒体授权，并保留原授权。无归属的旧系统素材继续按旧逻辑兼容。开放团队共享前须完成回填。

若旧环境通过 `prisma db push` 建库且没有迁移历史，应先根据该环境已有 schema 建立迁移基线，再部署本次增量迁移，不能直接重放初始建表迁移。开发环境也应在启动网页和 Worker 前同步本次 schema。

网页、Worker、watchdog 必须统一更新，保留原密钥加密环境变量。旧配置版本仍被任务引用时不得删除。

回滚优先设置 `TEAM_WORKSPACES_ENABLED=false` 停止新团队创建，设置 `TEAM_TASKS_ENABLED=false` 停止新任务提交与后续外部调用，再关闭团队网页入口。保留团队数据、配置版本和预算账本；已受理请求仍需保留新版 Worker 收取结果和结算。禁止把团队任务改用个人密钥重跑。

## 验证

```sh
npm run typecheck
npm run lint:all
npm run test:local
npm run test:teams:local
```

团队验收需要本地 MySQL、Redis、存储及运行中的网页与 Worker。脚本创建独立测试账号、团队和媒体，结束仅清理自己创建的记录；使用本地模拟服务商，不调用真实付费模型。覆盖邀请并发、权限与空间隔离、编辑冲突、团队 Worker 任务、密钥轮换、真实 MySQL 预算并发、媒体权限、退出再加入与负责人转让。
