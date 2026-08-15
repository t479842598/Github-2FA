---
spec: 06-00-key-import
scene: 02-github-accounts
status: completed
priority: P1
created: '2026-08-15'
updated: '2026-08-16'
---

# 06-00 Key Import - 需求

## L0 摘要

导入页新增 opencode / freebuff 两个密钥导入模块：按「账号-key」格式解析，将密钥写入对应账号的授权记录（KV），title 分别为 opencode / freebuff。

## L1 概览

### 目标

- 导入页提供两个独立模块：opencode 密钥导入、freebuff 密钥导入（格式相同，title 不同）
- 文本格式：每行一个 `账号-key`，第一个 `-` 之前是账号，之后是密钥
  - opencode 示例：`SiND2Fvct4w4-sk-FtB58T2AmVG4XE285L8FY0qXn0uO4iUZG3nIFuDBv6VSWJkKS4YVGRIrLKJuiQ04`
  - freebuff 示例：`SiND2Fvct4w4-f54b73eb-6ff2-4f7a-b3ce-0660a70d2c66`
- 保存到对应账号授权记录：title=`opencode`（或 `freebuff`），content=密钥
- 账号不存在 → 提示跳过；已有同名记录且密钥相同 → 跳过；密钥不同 → 新增一条，title 加日期标注（如 `opencode 2026-08-15`）

### 用户故事

- 作为账号管理员，我希望把 opencode/freebuff 的 API key 批量挂到对应 GitHub 账号下，以便集中管理密钥与账号的对应关系

### 范围

**包含**：key 解析器、导入 API（含 dry 预览）、导入页两个模块 UI、结果反馈（新增/跳过/账号不存在/密钥更新）
**不包含**：key 有效性校验（不调第三方接口验证）、自动补建账号（账号不存在只提示）

## L2 详情

### 详细需求

#### F-01 key 文本解析
- 每行 `账号-key`：取第一个 `-` 之前为账号，之后（含 `-`）为密钥；空行/无 `-` 行跳过
- 支持 GitHub 账号大小写不敏感匹配
- 验收：WHEN 输入示例文本 THEN 正确解析出账号与密钥对

#### F-02 保存到授权记录
- 目标账号存在：
  - 已有 `title=opencode/freebuff` 记录且 content 相同 → 跳过（已存在）
  - 已有同名记录但密钥不同 → 追加一条，title=`<name> YYYY-MM-DD`（日期标注），保留旧记录
  - 无同名记录 → 追加一条 `title=<name>`
- 账号不存在 → 记入 notFound 列表并在结果中提示
- 授权记录 ≤20 条上限（沿用现有 normalizeKvRecords）
- 验收：WHEN 导入 THEN 密钥出现在账号详情授权记录中且加密存储

#### F-03 导入 API
- `POST /api/import/keys`，body `{ text, name }`，name ∈ {opencode, freebuff}
- 支持 `dry=1` 预览：返回每行的 {账号, 密钥, 状态: 新增/重复/更新/账号不存在}
- 审计日志：`key_import` 记录数量
- 验收：WHEN dry THEN 不改数据仅预览；WHEN 非 dry THEN 落库并返回统计

#### F-04 导入页 UI
- 导入页新增模块切换：账号导入 / opencode 密钥 / freebuff 密钥
- opencode 与 freebuff 共用同一组件，仅标题/占位符/title 不同
- 结果展示：新增数 / 跳过数 / 账号不存在列表
- 验收：WHEN 进入模块 THEN 看到对应示例格式；WHEN 导入 THEN 看到分项统计

### 非功能性需求

- 安全性：密钥走现有 AES-256-GCM 加密存储
- 兼容性：沿用现有导入页风格与 API 封装

### 边界与依赖

- 依赖 01-00 github-account-vault（账号 CRUD 与授权记录）
- 不校验 key 真实有效性（opencode/freebuff 密钥格式仅按用户提供的样本解析）

### 验收标准

- [x] 两个模块可按示例文本导入，密钥正确落入对应账号授权记录
- [x] 账号不存在、密钥重复、密钥更新（日期标注）三种情况反馈正确
