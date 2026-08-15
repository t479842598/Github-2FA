---
spec: '06-00-key-import'
scene: '02-github-accounts'
status: in-progress
priority: P1
created: '2026-08-15'
---

# 06-00 Key Import - 设计

## D-01 密钥文本解析（parser.js `parseKeyList`）

- 按行解析，每行取**第一个 `-` 之前**为账号、之后（含 `-`）为密钥
- 空行/无 `-` 行跳过；返回 `[{ username, key }]`
- 示例：`SiND2Fvct4w4-sk-FtB58...` → `{ username: 'SiND2Fvct4w4', key: 'sk-FtB58...' }`；
  `SiND2Fvct4w4-f54b73eb-6ff2-...` → `{ username: 'SiND2Fvct4w4', key: 'f54b73eb-6ff2-...' }`

## D-02 导入 API（index.js `POST /api/import/keys`）

body `{ text, name: 'opencode'|'freebuff', dry?: boolean }`，`name` 非 freebuff 时默认 opencode

- **dry 预览**：逐行返回 `{ username, key, status }`，status ∈ {new, update, duplicate, not_found}，不改数据
- **正式导入**（`requirePasswordChanged` 保护）：
  1. 账号匹配：`username` 不区分大小写查库；不存在 → `notFound` 列表
  2. 已存在：
     - 授权记录存在 `title===name` 且 `content===key` → `skipped`（密钥已存在）
     - 存在同名但密钥不同 → 追加 `{ title: '${name} YYYY-MM-DD', content: key }`（日期标注，保留旧记录）
     - 无同名 → 追加 `{ title: name, content: key }`
  3. 授权记录 >20 条 → `skipped`（上限提示）
- 落库后审计日志 `key_import`；响应 `{ imported, skipped, notFound, name }`

## D-03 前端（ImportPage）

- 页面顶部模块切换：账号导入 / opencode 密钥 / freebuff 密钥
- `KeyImportModule` 组件复用：接收 `name`，标题、占位符、title 由 name 决定
- 预览表格列：账号 / 密钥 / 判定徽章（新增/密钥更新/重复跳过/账号不存在）
- 结果区三栏统计：新增 / 跳过 / 账号不存在，附详细列表
- 占位符展示用户提供的真实示例格式

## 关键决策

- **单文件解析规则**：第一个 `-` 前为账号（用户明确约定），后续 `-` 全部属于密钥（sk- 前缀与 UUID 均含 `-`）
- **复用授权记录 KV**：密钥与现有"授权记录"共用存储与加密（AES-256-GCM 字段级加密）
- **日期标注 title**：`opencode 2026-08-15`，旧记录保留、新密钥另起一行，避免覆盖
- **不自动建号**：账号不存在仅提示（安全优先，避免误建无关账号）
