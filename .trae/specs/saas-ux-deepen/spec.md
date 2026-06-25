# SaaS 交互深化与功能完善

## 为什么

现有 SaaS 管理功能的后端 API 和基础页面已完备，但交互体验仍需打磨：
1. 组织管理页面（普通用户视角）缺少搜索、分页等基础功能
2. 组织详情页缺少成员邀请、编辑组织信息等操作
3. 平台管理员首页统计数据展示不够直观
4. 错误处理和用户反馈不够友好

## 什么变化

### 组织管理（普通用户视角 - /admin/organizations）
- 组织列表页添加搜索和创建优化
- 组织详情页添加成员邀请、编辑组织、删除组织功能
- 成员管理添加角色修改、移除成员功能
- 计费 Tab 添加充值和消费明细

### 平台管理首页（/admin/platform）
- 统计卡片数据从 API 实时获取
- 快捷操作入口优化

### 通用交互优化
- 统一错误提示（toast 替代 alert）
- 统一确认弹窗样式
- 加载状态优化

## 影响

- 受影响代码：
  - `src/app/[locale]/admin/organizations/page.tsx`
  - `src/app/[locale]/admin/organizations/[id]/page.tsx`
  - `src/app/[locale]/admin/platform/page.tsx`
  - `messages/zh/organizations.json`
  - `messages/en/organizations.json`

## ADDED Requirements

### 需求：组织列表页增强
系统 SHALL 为普通用户提供完整的组织管理入口。

#### 场景：搜索组织
- **WHEN** 用户在搜索框输入关键词
- **THEN** 按组织名称过滤列表

#### 场景：创建组织
- **WHEN** 用户点击创建组织并填写信息
- **THEN** 创建成功后自动跳转到组织详情页

### 需求：组织详情页增强
系统 SHALL 为组织 owner/admin 提供完整的管理功能。

#### 场景：邀请成员
- **WHEN** owner/admin 输入邮箱邀请成员
- **THEN** 成功后成员出现在列表中

#### 场景：修改成员角色
- **WHEN** owner 修改成员角色
- **THEN** 成功后角色状态更新

#### 场景：移除成员
- **WHEN** owner/admin 移除成员
- **THEN** 成功后成员从列表中消失

#### 场景：组织充值
- **WHEN** owner/admin 为组织充值
- **THEN** 成功后余额更新

### 需求：平台首页优化
系统 SHALL 为管理员提供直观的数据概览。

#### 场景：实时统计
- **WHEN** 管理员访问平台首页
- **THEN** 显示实时统计数据（组织数、用户数、总消费）
