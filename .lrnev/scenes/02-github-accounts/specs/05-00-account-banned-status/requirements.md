---
spec: 05-00-account-banned-status
scene: 02-github-accounts
status: completed
priority: P1
created: '2026-08-15'
updated: '2026-08-16'
---

# 05-00 Account Banned Status - 需求

## L0 摘要

检测 GitHub 账号是否被封（正常/被封/未知），账号列表支持状态筛选与排序（被封排最后），默认每天检测一次。

## L1 概览

### 目标

- 自动探测每个账号的封号状态：正常 / 被封 / 未知（网络异常等）
- 账号列表页加载时自动触发检测（服务端 24h 缓存，默认每天检测一次），也可手动强制重新检测
- 列表新增状态筛选：全部 / 正常 / 被封
- 排序：被封账号固定排最后

### 用户故事

- 作为多账号管理员，我希望批量知道哪些 GitHub 账号被封，以便及时清理或申诉
- 作为运营人员，我希望列表默认把被封账号排到最后，以免干扰正常账号的日常使用

### 范围

**包含**：封号探测逻辑（PAT/会话/公开资料页三信号）、状态字段持久化、批量检测 API、前端筛选与排序
**不包含**：封号申诉流程、封号原因详情追踪、与健康检查的合并

## L2 详情

### 详细需求

#### F-01 封号探测
- 探测信号优先级：① 账号有 PAT → 调 `api.github.com/user`（200=正常，403 含 suspend/blocked=被封）；② 已存会话 → 主页文本含 suspended 横幅=被封；③ 兜底 → 公开资料页 `github.com/{username}`（200=正常，404=被封/删除）
- 网络异常/无凭据且无法判定 → `unknown`
- 验收：WHEN 账号被封 THEN 返回 banned；WHEN 正常 THEN 返回 normal；WHEN 网络失败 THEN 返回 unknown 且不误报被封

#### F-02 状态持久化
- 账号记录新增 `banned`（'normal'|'banned'|'unknown'）与 `bannedCheckedAt` 字段，`listAccounts` 返回
- 旧数据无字段 → 默认 'unknown'
- 验收：WHEN 检测完成 THEN 状态写入磁盘；WHEN 重启 THEN 状态仍在

#### F-03 批量检测 API
- `POST /api/accounts/banned-check`：遍历全部账号，24h 内已检测的直接返回缓存（默认每天检测一次），`force: true` 强制全量重测
- 逐账号间隔 600ms 防 GitHub 限流
- 验收：WHEN 24h 内调用 THEN 不重复请求 GitHub；WHEN force THEN 全部重新探测

#### F-04 列表筛选与排序
- 账号列表页自动调用检测（页面加载时），完成后刷新状态徽章
- 顶部筛选下拉：全部状态 / 正常 / 被封；被封账号固定排最后
- 手动「重新检测」按钮（force）
- 验收：WHEN 筛选"被封" THEN 仅显示被封账号；WHEN 排序 THEN 被封在末尾；WHEN 点击重新检测 THEN 强制全量刷新

### 非功能性需求

- 性能：批量检测串行 + 600ms 间隔，避免触发 GitHub 限流
- 兼容性：旧 vault 数据（无 banned 字段）不报错

### 边界与依赖

- 依赖 02-00 github-auto-session（会话/PAT 存储）
- 公开资料页 404 无法区分"被封/删除/改名"，统一标记 banned 并在徽章 tooltip 标注探测途径

### 验收标准

- [x] 账号列表加载即触发检测，状态徽章正确显示，筛选/排序生效
- [x] 每天检测一次的缓存机制生效，force 可强制刷新
