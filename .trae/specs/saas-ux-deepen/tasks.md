# 任务清单

## 组织列表页增强（普通用户视角）

- [x] Task 1: 组织列表页添加搜索和优化
  - [x] SubTask 1.1: 添加搜索栏（按组织名称过滤）
  - [x] SubTask 1.2: 优化创建组织弹窗（slug 自动生成、表单验证）
  - [x] SubTask 1.3: 创建成功后跳转到组织详情页

## 组织详情页增强

- [x] Task 2: 成员管理功能
  - [x] SubTask 2.1: 添加邀请成员弹窗（输入邮箱 + 选择角色）
  - [x] SubTask 2.2: 添加修改成员角色功能（owner 可操作）
  - [x] SubTask 2.3: 添加移除成员功能（带确认弹窗）
  - [x] SubTask 2.4: 成员列表显示角色标识和操作按钮

- [x] Task 3: 组织信息管理
  - [x] SubTask 3.1: 添加编辑组织名称功能
  - [x] SubTask 3.2: 添加删除组织功能（带二次确认）

- [x] Task 4: 计费 Tab 完善
  - [x] SubTask 4.1: 添加组织充值功能（金额输入 + 充值按钮）
  - [x] SubTask 4.2: 添加消费明细列表

## 平台首页优化

- [x] Task 5: 统计数据实时化
  - [x] SubTask 5.1: 平台首页统计数据从 API 获取并展示

## 翻译补充

- [x] Task 6: 补充翻译键
  - [x] SubTask 6.1: 更新 messages/zh/organizations.json
  - [x] SubTask 6.2: 更新 messages/en/organizations.json

## 任务依赖关系

- Task 2、3 依赖 Task 1（组织列表页先能正常使用）
- Task 4 与 Task 2、3 并行
- Task 5 独立
- Task 6 与所有任务并行
