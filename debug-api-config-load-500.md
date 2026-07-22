# Debug Session: api-config-load-500

- 状态：OPEN
- 症状：优化模型发现/健康检测后，GET API 配置返回 HTTP 500，已有 OpenAI 与移动云 Seedance 配置无法加载。
- 约束：取得运行时证据前不修改业务逻辑。

## 可证伪假设

1. 新增 `ModelHealthStatus` Prisma relation 后，Prisma Client 未完整重新生成，API 配置查询运行时与 schema 不一致。
2. 新增 migration 尚未应用，API 配置 GET 已直接查询 `model_health_status`，导致表不存在。
3. API 配置 GET 的新健康状态合并逻辑错误地访问了不存在字段或错误 relation。
4. 原有 `customProviders/customModels` 数据在新规范化逻辑中触发未处理异常。
5. Windows 下 Prisma engine 被占用，`generate --no-engine` 产生的客户端运行配置不完整。

## 运行时证据

- `logs/app.log` 08:50：`prisma.modelHealthStatus` 为 `undefined`，健康状态接口在 `findMany/findUnique` 处失败，确认运行中的 Prisma Client 未包含新 delegate。
- `logs/app.log` 08:51：所有 Prisma 查询报 `P6001`，要求 `prisma://`，确认此前 `prisma generate --no-engine` 将客户端生成成 Data Proxy/Accelerate 模式，普通 MySQL URL 无法使用。
- `npx prisma migrate status`：`20260716150000` 和 `20260716170000` 均未应用。
- 数据库 `UserPreference` 仍有 1 条记录，原 OpenAI/Seedance 配置未被删除。

## 根因判定

1. **确认**：标准 Prisma Client 未完整生成，运行时缺少 `modelHealthStatus` delegate。
2. **确认但非配置 GET 直接原因**：健康状态 migration 未应用。
3. 排除：基础 `/api/user/api-config` 没有查询健康状态表。
4. 排除：恢复数据库访问后用户与偏好记录均存在。
5. **确认**：`generate --no-engine` 导致 P6001，是配置加载 HTTP 500 的直接原因。

## 修复

- 执行标准 `npx prisma generate`，恢复 MySQL query engine Client。
- 修正 MySQL migration：MySQL 不允许同一个 ALTER 中删除并用同名重建外键，拆成 DROP、MODIFY、ADD 三步。
- 将失败 migration 标记 rolled back 后重新执行 `npx prisma migrate deploy`。
- 两个待应用 migration 均成功。

## 后续症状

配置恢复加载后，单模型健康检测对 403 返回 `AUTH_FAILED`。历史运行时日志表明相同服务商的真实 403 原因是 `balance billing is disabled for this key`，不是密钥无效。

已修复错误分类：

- 401 或明确无效密钥 → `AUTH_FAILED`
- 计费关闭、余额/配额不足、需要升级套餐 → `PROVIDER_BILLING_UNAVAILABLE`
- 模型访问被禁止 → `MODEL_ACCESS_FORBIDDEN`
- 无法识别的 403 → `ACCESS_FORBIDDEN`

供应商原始正文仅用于瞬时分类，不持久化、不返回，避免泄露敏感信息。
