# 检查清单

## 数据层验证

* [ ] Organization 数据模型已正确添加到 prisma schema

* [ ] OrganizationMember 数据模型已正确添加，包含 role、quota、status 字段

* [ ] OrganizationBalance 数据模型已正确添加

* [ ] User 模型已更新，包含与组织的关联关系

* [ ] 数据库迁移文件已生成

* [ ] 数据库迁移已成功执行

## 后端 API 验证

* [ ] 创建组织 API (POST /api/organizations) 正确实现

* [ ] 获取组织列表 API (GET /api/organizations) 正确实现

* [ ] 获取组织详情 API (GET /api/organizations/\[id]) 正确实现

* [ ] 更新组织 API (PATCH /api/organizations/\[id]) 正确实现

* [ ] 删除组织 API (DELETE /api/organizations/\[id]) 正确实现

* [ ] 邀请成员 API (POST /api/organizations/\[id]/members) 正确实现

* [ ] 获取成员列表 API (GET /api/organizations/\[id]/members) 正确实现

* [ ] 更新成员信息 API (PATCH /api/organizations/\[id]/members/\[userId]) 正确实现

* [ ] 移除成员 API (DELETE /api/organizations/\[id]/members/\[userId]) 正确实现

* [ ] 组织充值 API (POST /api/organizations/\[id]/balance) 正确实现

* [ ] 获取组织余额 API (GET /api/organizations/\[id]/balance) 正确实现

* [ ] 获取组织消费统计 API (GET /api/organizations/\[id]/usage) 正确实现

* [ ] 获取成员消费记录 API 正确实现

## 计费逻辑验证

* [ ] 组织余额扣费逻辑已实现

* [ ] 优先扣除组织余额的策略已生效

* [ ] 配额使用量追踪功能正常

* [ ] 组合扣费（组织+个人）流程正常

## 认证与权限验证

* [ ] 认证流程支持组织上下文

* [ ] 组织成员身份校验中间件正常工作

* [ ] 角色权限校验 (Owner/Admin/Member) 正确执行

* [ ] 未授权访问被正确拒绝

## 前端验证

* [ ] 组织列表页面正常显示

* [ ] 组织切换器在导航栏正常显示

* [ ] 成员管理页面正确显示成员列表

* [ ] 计费管理页面正确显示余额和消费数据

* [ ] 权限控制正确（普通成员无法访问管理功能）

## 测试验证

* [ ] 组织 CRUD API 单元测试通过

* [ ] 成员管理 API 单元测试通过

* [ ] 计费逻辑单元测试通过

* [ ] 权限校验单元测试通过

* [ ] 组织创建和成员邀请集成测试通过

* [ ] 组织扣费和配额使用集成测试通过

* [ ] 权限控制集成测试通过

## 代码质量验证

* [ ] ESLint 检查通过

* [ ] TypeScript 类型检查通过

* [ ] 遵循现有代码风格和架构

* [ ] 新增 API 符合原有路由约定

