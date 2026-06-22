# SaaS 多租户组织管理功能规格

## 为什么

当前系统仅支持单用户账号体系，无法满足企业级 SaaS 场景的需求。企业需要：
1. 以组织为单位管理团队成员
2. 组织管理员可统一管理成员的计费和资产
3. 实现团队协作和资源统一分配

## 什么变化

- 新增组织（Organization）数据模型，支持多租户架构
- 新增组织成员（OrganizationMember）关联模型，实现用户与组织的关联
- 新增组织管理员角色，可管理组织内成员的余额、套餐和资产
- 新增组织维度计费体系，支持组织统一充值和成员配额管理
- 保持现有单用户模式兼容，原有功能不受影响

## 影响

- 受影响的规格：用户认证、项目管理、计费系统、资产管理
- 受影响代码：
  - `prisma/schema.prisma` - 新增数据模型
  - `src/lib/auth.ts` - 认证逻辑扩展
  - `src/lib/billing/` - 计费系统扩展
  - `src/app/api/` - API 路由扩展
  - 前端页面 - 组织管理相关页面

## 新增需求

### 需求：组织管理

系统 SHALL 提供组织创建、查询、更新、删除功能，组织所有者可邀请成员加入组织。

#### 场景：创建组织
- **WHEN** 用户通过组织管理页面创建新组织（输入组织名称）
- **THEN** 系统创建组织记录，创建者为组织所有者，返回组织信息

#### 场景：邀请成员
- **WHEN** 组织所有者/管理员通过邮箱邀请新成员
- **THEN** 系统发送邀请链接，被邀请用户通过链接加入组织

#### 场景：移除成员
- **WHEN** 组织所有者/管理员移除组织成员
- **THEN** 系统解除成员与组织的关联，该成员的个人资产和项目不受影响

### 需求：组织成员角色管理

系统 SHALL 提供组织成员角色管理功能，支持三种角色：所有者(Owner)、管理员(Admin)、成员(Member)。

#### 场景：角色分配
- **WHEN** 组织所有者将某成员角色从 Member 变更为 Admin
- **THEN** 系统更新成员角色，该成员获得组织管理权限

#### 场景：权限校验
- **WHEN** 普通成员尝试访问组织管理页面
- **THEN** 系统拒绝访问，仅允许 Owner 和 Admin 角色访问

### 需求：组织余额管理

系统 SHALL 提供组织维度余额管理功能，组织管理者可查看和操作组织余额。

#### 场景：组织充值
- **WHEN** 组织所有者/管理员为组织账户充值
- **THEN** 系统增加组织余额，记录充值流水

#### 场景：组织消费扣费
- **WHEN** 组织成员产生消费
- **THEN** 优先扣除组织余额，若组织余额不足则扣除成员个人余额

### 需求：成员计费管理

系统 SHALL 提供组织管理员管理成员计费的权限。

#### 场景：查看成员消费
- **WHEN** 组织管理员查看组织内某成员的消费记录
- **THEN** 系统返回该成员在组织内的消费明细

#### 场景：配额分配
- **WHEN** 组织管理员为某成员设置月度配额
- **THEN** 系统记录配额设置，成员消费时优先使用配额

#### 场景：强制冻结
- **WHEN** 组织管理员冻结某成员的账户
- **THEN** 该成员无法使用组织资源，但可使用个人余额

### 需求：成员资产管理

系统 SHALL 提供组织管理员查看和管理组织内成员资产的权限。

#### 场景：资产转移
- **WHEN** 组织管理员将某成员的项目/资产转移给其他成员
- **THEN** 系统更新资产所有权，记录转移日志

## 修改需求

### 需求：认证系统改造

现有需求：用户通过邮箱/密码或 OAuth 登录

修改后：在登录基础上增加组织上下文选择，用户可选择以个人账号或组织成员身份使用系统。

#### 场景：登录后组织选择
- **WHEN** 用户属于多个组织
- **THEN** 登录后弹出组织选择界面，用户选择进入某一组织或继续使用个人账号

### 需求：项目权限改造

现有需求：用户创建的项目仅自己能访问

修改后：新增组织项目类型，组织成员可访问组织项目。

## 移除需求

无

## 技术设计要点

### 数据库扩展

```prisma
model Organization {
  id          String   @id @default(uuid())
  name        String
  slug        String   @unique
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  ownerId     String
  owner       User     @relation("OrganizationOwner", fields: [ownerId], references: [id])
  members     OrganizationMember[]
  balance     OrganizationBalance?
  projects    Project[]
  assets      OrganizationAsset[]
}

model OrganizationMember {
  id             String   @id @default(uuid())
  organizationId String
  userId         String
  role           String   @default("member") // owner, admin, member
  quota          Decimal? @db.Decimal(18, 6) // 月度配额
  status         String   @default("active") // active, frozen
  joinedAt       DateTime @default(now())
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([organizationId, userId])
}

model OrganizationBalance {
  id             String   @id @default(uuid())
  organizationId String   @unique
  balance        Decimal  @default(0) @db.Decimal(18, 6)
  frozenAmount   Decimal  @default(0) @db.Decimal(18, 6)
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
}
```

### API 设计

- `POST /api/organizations` - 创建组织
- `GET /api/organizations` - 获取用户所属组织列表
- `GET /api/organizations/[id]` - 获取组织详情
- `PATCH /api/organizations/[id]` - 更新组织
- `DELETE /api/organizations/[id]` - 删除组织
- `POST /api/organizations/[id]/members` - 邀请成员
- `GET /api/organizations/[id]/members` - 获取成员列表
- `PATCH /api/organizations/[id]/members/[userId]` - 更新成员角色/状态
- `DELETE /api/organizations/[id]/members/[userId]` - 移除成员
- `POST /api/organizations/[id]/balance` - 组织充值
- `GET /api/organizations/[id]/balance` - 获取组织余额
- `GET /api/organizations/[id]/usage` - 获取组织消费统计
- `GET /api/organizations/[id]/members/[userId]/usage` - 获取成员消费记录

### 前端页面

- `/[locale]/admin/organizations` - 组织管理首页
- `/[locale]/admin/organizations/[id]` - 组织详情/设置
- `/[locale]/admin/organizations/[id]/members` - 成员管理
- `/[locale]/admin/organizations/[id]/billing` - 组织计费管理
- `/[locale]/admin/organizations/[id]/assets` - 组织资产管理

### 兼容性设计

1. 现有用户不强制加入组织，保持个人账号模式
2. 用户可同时属于多个组织
3. 个人资产与组织资产分离存储
4. 计费优先扣除组织配额，再扣除个人余额