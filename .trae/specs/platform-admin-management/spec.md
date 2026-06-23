# 平台级系统管理功能规格

## 为什么

当前系统仅有租户级别（Organization Level）的管理功能，缺乏平台级别的系统管理能力。SaaS 运营需要：
1. 平台超级管理员可以对所有组织进行管理
2. 查看全局运营数据统计
3. 管理平台配置和系统设置

## 什么变化

- 新增系统管理员角色（Platform Admin）
- 新增系统配置管理模型
- 新增全局组织和用户的平台级管理接口
- 保持现有租户管理功能不变

## 影响

- 受影响的规格：用户认证、组织管理、计费系统
- 受影响代码：
  - `prisma/schema.prisma` - 扩展 User 模型添加管理员标识
  - `src/lib/auth.ts` - 扩展认证逻辑支持管理员角色
  - `src/app/api/admin/` - 新增系统管理 API
  - 前端页面 - 系统管理后台

## 新增需求

### 需求：平台管理员认证

系统 SHALL 提供平台管理员身份验证，管理员拥有比组织所有者更高的权限。

#### 场景：管理员登录
- **WHEN** 管理员使用管理员账号登录系统
- **THEN** 系统验证管理员身份，返回管理员会话

#### 场景：权限校验
- **WHEN** 非管理员用户访问系统管理页面
- **THEN** 系统拒绝访问，返回 403 禁止

### 需求：全局组织管理

系统 SHALL 提供平台级组织管理功能，管理员可查看、禁用所有组织。

#### 场景：查看所有组织
- **WHEN** 管理员访问组织管理页面
- **THEN** 系统返回所有组织的列表，包含组织余额、成员数量等信息

#### 场景：禁用组织
- **WHEN** 管理员禁用某个组织
- **THEN** 该组织所有成员无法使用系统功能，组织余额冻结

#### 场景：启用组织
- **WHEN** 管理员重新启用被禁用的组织
- **THEN** 组织恢复正常使用

### 需求：全局用户管理

系统 SHALL 提供平台级用户管理功能。

#### 场景：查看所有用户
- **WHEN** 管理员访问用户管理页面
- **THEN** 系统返回所有用户的列表

#### 场景：查看用户详情
- **WHEN** 管理员查看某用户详情
- **THEN** 系统返回该用户的组织归属、消费记录等信息

### 需求：全局消费统计

系统 SHALL 提供平台级消费统计功能。

#### 场景：查看平台消费概览
- **WHEN** 管理员查看平台消费统计
- **THEN** 系统返回平台总消费、各组织消费排行等数据

### 需求：系统配置管理

系统 SHALL 提供系统配置管理功能。

#### 场景：查看系统配置
- **WHEN** 管理员查看系统配置
- **THEN** 返回当前系统配置项

#### 场景：更新系统配置
- **WHEN** 管理员更新系统配置（如计费模式、功能开关等）
- **THEN** 系统保存配置并应用

## 修改需求

### 需求：用户模型扩展

现有需求：用户通过邮箱或 OAuth 注册

修改后：添加 isPlatformAdmin 字段标识平台管理员

## 技术设计要点

### 数据库扩展

```prisma
// User 模型扩展
model User {
  // ... existing fields
  isPlatformAdmin Boolean @default(false)  // 平台管理员标识
  isGlobalLocked   Boolean @default(false) // 全局锁定（可禁用所有组织）
  
  // 平台管理员操作日志
  adminAuditLogs   AdminAuditLog[]
}

// AdminAuditLog - 管理员操作日志
model AdminAuditLog {
  id          String   @id @default(uuid())
  adminId     String
  action      String   // 操作类型
  targetType  String   // 目标类型 (Organization, User, SystemConfig)
  targetId    String?  // 目标ID
  details     String?  @db.Text // 操作详情 JSON
  ipAddress   String?
  createdAt   DateTime @default(now())
  
  admin       User     @relation(fields: [adminId], references: [id])
}

// SystemConfig - 系统配置
model SystemConfig {
  id          String   @id @default(uuid())
  key         String   @unique
  value       String   @db.Text
  description String?  @db.Text
  updatedAt   DateTime @updatedAt
  updatedBy   String?
}
```

### API 设计

- `GET /api/platform/admin/check` - 验证当前管理员身份
- `GET /api/platform/organizations` - 获取所有组织（分页）
- `POST /api/platform/organizations/[id]/disable` - 禁用组织
- `POST /api/platform/organizations/[id]/enable` - 启用组织
- `GET /api/platform/users` - 获取所有用户（分页）
- `GET /api/platform/users/[id]` - 获取用户详情
- `GET /api/platform/stats` - 获取平台统计数据
- `GET /api/platform/config` - 获取系统配置
- `PATCH /api/platform/config` - 更新系统配置
- `GET /api/platform/audit-logs` - 获取管理员操作日志

### 前端页面

- `/admin/platform` - 系统管理首页
- `/admin/platform/organizations` - 全局组织管理
- `/admin/platform/users` - 全局用户管理
- `/admin/platform/stats` - 平台数据统计
- `/admin/platform/config` - 系统配置管理
- `/admin/platform/audit` - 操作日志

### 权限层级

1. **Platform Admin** - 平台管理员，可管理所有组织和用户
2. **Organization Owner** - 组织所有者，可管理自己组织
3. **Organization Admin** - 组织管理员
4. **Organization Member** - 组织成员
5. **Regular User** - 普通用户（未加入任何组织）

### 环境变量配置

```env
# 平台管理员邮箱（多个用逗号分隔）
PLATFORM_ADMIN_EMAILS=admin@example.com,superuser@example.com
```