# 检查清单

## 数据层验证

- [x] Organization 数据模型已正确添加到 prisma schema
- [x] OrganizationMember 数据模型已正确添加，包含 role、quota、status 字段
- [x] OrganizationBalance 数据模型已正确添加
- [x] User 模型已更新，包含与组织的关联关系
- [x] 数据库迁移已成功执行

## 后端 API 验证

- [x] 创建组织 API (POST /api/organizations) 正确实现
- [x] 获取组织列表 API (GET /api/organizations) 正确实现
- [x] 获取组织详情 API (GET /api/organizations/[id]) 正确实现
- [x] 更新组织 API (PATCH /api/organizations/[id]) 正确实现
- [x] 删除组织 API (DELETE /api/organizations/[id]) 正确实现
- [x] 邀请成员 API (POST /api/organizations/[id]/members) 正确实现
- [x] 获取成员列表 API (GET /api/organizations/[id]/members) 正确实现
- [x] 更新成员信息 API (PATCH /api/organizations/[id]/members/[userId]) 正确实现
- [x] 移除成员 API (DELETE /api/organizations/[id]/members/[userId]) 正确实现
- [x] 组织充值 API (POST /api/organizations/[id]/balance) 正确实现
- [x] 获取组织余额 API (GET /api/organizations/[id]/balance) 正确实现
- [x] 获取组织消费统计 API (GET /api/organizations/[id]/usage) 正确实现
- [x] 获取成员消费记录 API 正确实现

## 计费逻辑验证

- [x] 组织余额扣费逻辑已实现
- [x] 优先扣除组织余额的策略已生效
- [x] 配额使用量追踪功能正常
- [x] 组合扣费（组织+个人）流程正常

## 认证与权限验证

- [x] 认证流程支持组织上下文
- [x] 组织成员身份校验中间件正常工作
- [x] 角色权限校验 (Owner/Admin/Member) 正确执行
- [x] 未授权访问被正确拒绝

## 前端验证

- [x] 组织列表页面正常显示
- [x] 组织详情页正常显示（概览、成员、计费 Tab）
- [x] 成员管理页面正确显示成员列表
- [x] 计费管理页面正确显示余额和消费数据
- [x] 权限控制正确（普通成员无法访问管理功能）

## 测试验证

- [x] 组织计费单元测试通过（7 个测试）
- [x] 计费逻辑单元测试通过

## 代码质量验证

- [x] TypeScript 类型检查通过
- [x] 遵循现有代码风格和架构
- [x] 新增 API 符合原有路由约定
