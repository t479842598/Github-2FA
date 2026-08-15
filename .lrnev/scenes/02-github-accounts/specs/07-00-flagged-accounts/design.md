---
spec: '07-00-flagged-accounts'
scene: '02-github-accounts'
status: in-progress
priority: P1
created: '2026-08-15'
---

# 07-00 Flagged Accounts - 设计

## D-01 固定格式解析（parser.js）

`parseAccountBlock` 每行先尝试 `line.split('----')`：

- 段数 ≥3 且三段均非空 → `username/password/setupKey` 赋值 + `flagged: true`，视为已识别字段
- 段数不足或含空 → 不命中，走原有 `key: value` 解析
- `emptyAccount()` 增加 `flagged: false` 默认值；`sanitizeAccount` 用 spread 透传

## D-02 数据模型（store.js）

账号记录新增明文字段 `flagged: boolean`：

- `createAccount`：`flagged: Boolean(acc.flagged)`
- `listAccounts`：`flagged: Boolean(a.flagged)`（旧数据缺省 → false）
- `exportText({ flaggedOnly })`：`flaggedOnly=true` 时跳过非 flagged 账号
- `deleteFlaggedAccounts()`：过滤掉所有 flagged，返回删除数量

## D-03 API（index.js）

- `GET /api/export?flagged=1|true` → 仅导出被标记账号；审计日志标记 `flagged only`
- `POST /api/accounts/flagged/delete` → 批量删除（`requirePasswordChanged` 保护），返回 `{ count }`
- 导入 dry 预览增加 `flagged` 字段供前端展示「标记」列

## D-04 前端（AccountsPage / ImportPage）

- **ExportModal** 组件：只读 textarea 预览 + 复制（1.5s「已复制」反馈）+ 下载 .txt
- 「导出」→ `exportAll()` 弹窗；「导出被标记」→ `exportFlagged()` 弹窗（标题带数量）
- 「删除被标记」按钮仅在存在 flagged 账号时显示 → 确认弹窗 → `deleteFlagged()`
- 列表行紫色「标记」徽章（Flag 图标）
- ImportPage 预览表新增「标记」列；占位符展示固定格式示例

## 关键决策

- **flagged 为明文非敏感**：仅标识用途，不涉及凭据，不入 SENSITIVE_FIELDS
- **固定格式三段齐全才命中**：避免 `aaa----bbb` 等不完整行被误解析
- **导出弹窗复用**：普通导出与被标记导出共用 ExportModal，仅标题/文件名不同
- **按钮按需显示**：无被标记账号时不显示导出/删除被标记按钮，减少干扰
