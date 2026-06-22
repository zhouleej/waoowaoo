# 任务清单

## 数据模型层

- [ ] 任务 1: 数据库 Schema 扩展 - 在 prisma/schema.prisma 中新增 Organization、OrganizationMember、OrganizationBalance 模型
  - [ ] 子任务 1.1: 添加 Organization 模型
  - [ ] 子任务 1.2: 添加 OrganizationMember 模型，包含角色和配额字段
  - [ ] 子任务 1.3: 添加 OrganizationBalance 模型
  - [ ] 子任务 1.4: 更新 User 模型，添加与组织成员的关联

- [ ] 任务 2: 数据库迁移 - 执行 Prisma 迁移，生成新表
  - [ ] 子任务 2.1: 运行 prisma migrate 生成迁移文件
  - [ ] 子任务 2.2: 执行数据库迁移

## 后端 API 层

- [ ] 任务 3: 组织管理 API - 实现组织的 CRUD 接口
  - [ ] 子任务 3.1: 创建组织 API (POST /api/organizations)
  - [ ] 子任务 3.2: 获取组织列表 API (GET /api/organizations)
  - [ ] 子任务 3.3: 获取组织详情 API (GET /api/organizations/[id])
  - [ ] 子任务 3.4: 更新组织 API (PATCH /api/organizations/[id])
  - [ ] 子任务 3.5: 删除组织 API (DELETE /api/organizations/[id])

- [ ] 任务 4: 组织成员管理 API - 实现成员管理接口
  - [ ] 子任务 4.1: 邀请成员 API (POST /api/organizations/[id]/members)
  - [ ] 子任务 4.2: 获取成员列表 API (GET /api/organizations/[id]/members)
  - [ ] 子任务 4.3: 更新成员信息 API (PATCH /api/organizations/[id]/members/[userId])
  - [ ] 子任务 4.4: 移除成员 API (DELETE /api/organizations/[id]/members/[userId])

- [ ] 任务 5: 组织计费 API - 实现组织和成员计费管理接口
  - [ ] 子任务 5.1: 组织充值 API (POST /api/organizations/[id]/balance)
  - [ ] 子任务 5.2: 获取组织余额 API (GET /api/organizations/[id]/balance)
  - [ ] 子任务 5.3: 获取组织消费统计 API (GET /api/organizations/[id]/usage)
  - [ ] 子任务 5.4: 获取成员消费记录 API (GET /api/organizations/[id]/members/[userId]/usage)

- [ ] 任务 6: 计费逻辑改造 - 修改现有计费系统支持组织扣费
  - [ ] 子任务 6.1: 在Billing服务中添加组织余额扣费逻辑
  - [ ] 子任务 6.2: 实现优先扣除组织余额的策略
  - [ ] 子任务 6.3: 添加配额使用量追踪

## 认证与权限层

- [ ] 任务 7: 认证中间件扩展 - 支持组织上下文
  - [ ] 子任务 7.1: 在认证流程中添加当前组织上下文
  - [ ] 子任务 7.2: 实现组织成员身份校验中间件

- [ ] 任务 8: 权限控制 - 实现基于角色的访问控制
  - [ ] 子任务 8.1: 创建组织角色权限校验工具函数
  - [ ] 子任务 8.2: 在组织管理 API 中添加权限校验

## 前端页面

- [ ] 任务 9: 组织管理页面 - 创建组织管理相关页面
  - [ ] 子任务 9.1: 创建组织列表页面（个人/组织切换入口）
  - [ ] 子任务 9.2: 创建组织详情/设置页面
  - [ ] 子任务 9.3: 创建成员管理页面
  - [ ] 子任务 9.4: 创建组织计费管理页面

- [ ] 任务 10: 导航和布局更新 - 适配组织管理模式
  - [ ] 子任务 10.1: 在导航栏添加组织切换器
  - [ ] 子任务 10.2: 根据用户角色显示/隐藏管理菜单

- [ ] 任务 11: 前端 API 调用 - 集成组织管理 API
  - [ ] 子任务 11.1: 添加组织管理 API 的前端调用函数
  - [ ] 子任务 11.2: 实现 React Query hooks 管理组织状态

## 测试

- [ ] 任务 12: 单元测试 - 为新功能编写单元测试
  - [ ] 子任务 12.1: 为组织 CRUD API 编写测试
  - [ ] 子任务 12.2: 为成员管理 API 编写测试
  - [ ] 子任务 12.3: 为计费逻辑编写测试
  - [ ] 子任务 12.4: 为权限校验编写测试

- [ ] 任务 13: 集成测试 - 端到端场景测试
  - [ ] 子任务 13.1: 组织创建和成员邀请流程测试
  - [ ] 子任务 13.2: 组织扣费和配额使用测试
  - [ ] 子任务 13.3: 权限控制测试

## 任务依赖关系

- 任务 1 → 任务 2（数据库模型须先完成才能迁移）
- 任务 2 → 任务 3、4、5（API 依赖数据库表）
- 任务 3、4、5 → 任务 6（计费逻辑依赖 API 定义）
- 任务 2 → 任务 7（认证扩展依赖数据库）
- 任务 7、8 → 任务 9、10（前端依赖后端接口和权限体系）
- 任务 9、10、11 → 任务 12、13（测试依赖功能实现）