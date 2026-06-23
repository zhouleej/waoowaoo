# 任务清单

## 数据模型层

- [ ] 任务 1: 扩展用户模型 - 在 prisma/schema.prisma 中为 User 添加管理员字段
  - [ ] 子任务 1.1: 添加 isPlatformAdmin 字段
  - [ ] 子任务 1.2: 添加 isGlobalLocked 字段
  - [ ] 子任务 1.3: 创建 AdminAuditLog 模型
  - [ ] 子任务 1.4: 创建 SystemConfig 模型

- [ ] 任务 2: 数据库迁移 - 执行 Prisma 迁移
  - [ ] 子任务 2.1: 运行 prisma migrate 生成迁移文件
  - [ ] 子任务 2.2: 执行数据库迁移

## 后端 API 层

- [ ] 任务 3: 管理员认证 API
  - [ ] 子任务 3.1: 验证管理员身份 API (GET /api/platform/admin/check)
  - [ ] 子任务 3.2: 创建管理员认证中间件

- [ ] 任务 4: 全局组织管理 API
  - [ ] 子任务 4.1: 获取所有组织 API (GET /api/platform/organizations)
  - [ ] 子任务 4.2: 禁用组织 API (POST /api/platform/organizations/[id]/disable)
  - [ ] 子任务 4.3: 启用组织 API (POST /api/platform/organizations/[id]/enable)

- [ ] 任务 5: 全局用户管理 API
  - [ ] 子任务 5.1: 获取所有用户 API (GET /api/platform/users)
  - [ ] 子任务 5.2: 获取用户详情 API (GET /api/platform/users/[id])

- [ ] 任务 6: 平台统计 API
  - [ ] 子任务 6.1: 获取平台统计数据 API (GET /api/platform/stats)

- [ ] 任务 7: 系统配置 API
  - [ ] 子任务 7.1: 获取系统配置 API (GET /api/platform/config)
  - [ ] 子任务 7.2: 更新系统配置 API (PATCH /api/platform/config)

- [ ] 任务 8: 操作日志 API
  - [ ] 子任务 8.1: 获取管理员操作日志 API (GET /api/platform/audit-logs)

## 环境配置

- [ ] 任务 9: 环境变量配置
  - [ ] 子任务 9.1: 在 .env.example 中添加 PLATFORM_ADMIN_EMAILS 配置项

## 前端页面

- [ ] 任务 10: 系统管理页面
  - [ ] 子任务 10.1: 创建系统管理首页
  - [ ] 子任务 10.2: 创建全局组织管理页面
  - [ ] 子任务 10.3: 创建全局用户管理页面
  - [ ] 子任务 10.4: 创建平台统计页面
  - [ ] 子任务 10.5: 创建系统配置页面
  - [ ] 子任务 10.6: 创建操作日志页面

- [ ] 任务 11: 导航和权限
  - [ ] 子任务 11.1: 在导航栏添加系统管理入口（仅管理员可见）

## 任务依赖关系

- 任务 1 → 任务 2（数据库模型须先完成才能迁移）
- 任务 2 → 任务 3、4、5、6、7、8（API 依赖数据库）
- 任务 3 → 任务 10、11（前端依赖后端 API 和认证）
- 任务 9 与其他任务并行执行