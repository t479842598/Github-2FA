---
spec: '05-00-account-banned-status'
scene: '02-github-accounts'
status: in-progress
priority: P1
created: '2026-08-15'
---

# 05-00 Account Banned Status - 设计

## D-01 数据模型

账号记录新增两个明文（非敏感）字段：

```json
{
  "banned": "normal | banned | unknown",
  "bannedCheckedAt": 1755270000000
}
```

- 新账号创建默认 `banned: 'unknown'`、`bannedCheckedAt: null`
- `listAccounts()` 返回这两个字段；旧数据缺失时兜底 `'unknown'` / `null`
- `Vault.setBannedStatus(id, banned, checkedAt)` 写入并更新 `updatedAt`

## D-02 封号探测（github.js `checkBanned`）

信号优先级（返回 `{ banned, via }`）：

| 优先级 | 信号 | 判定 |
|--------|------|------|
| ① | 有 PAT → `api.github.com/user` | 200=normal；403 文本含 suspend/blocked/banned=banned；401/403 无关键字→降级；其它状态=unknown |
| ② | 已存会话 → 主页 `/` | 文本含 suspended 横幅=banned；正常登录态=normal；会话失效→降级 |
| ③ | 兜底 → `github.com/{username}` | 200=normal；404=banned（被封/删除）；网络异常=unknown |

- 公开页 404 无法区分「被封/删除/改名」，统一归为 banned（符合用户"封号排最后"诉求）
- 每个请求 20s 超时（沿用 TIMEOUT_MS），网络失败降级不抛错

## D-03 批量检测 API（index.js）

`POST /api/accounts/banned-check`，body `{ force?: boolean }`

- 遍历全部账号；`bannedCheckedAt` 距今 <24h 且非 force → 直接返回缓存结果（`cached: true`）
- 需检测的账号串行探测，每账号间隔 600ms（GitHub 限流保护）
- 结果写回 `vault.setBannedStatus` 并 `save()`，审计日志 `banned_check`
- 响应 `{ results: [{id, username, banned, via, cached}], checked, total }`

## D-04 前端（AccountsPage）

- 页面加载自动调用 `api.bannedCheck(false)`（服务端 24h 缓存 → 默认每天一次），完成后 `load()` 刷新徽章；静默失败保留旧状态
- 工具栏：「全部状态/正常/被封」筛选下拉 + 「检测封号」按钮（force）
- 每行显示 `BannedBadge`：被封=红/正常=绿/未知=不显示
- 排序：`filtered.sort` 将 `banned === 'banned'` 移到末尾，其余保持原序（稳定排序）
- 筛选与搜索/标签筛选组合生效

## 关键决策

- **状态三值**：normal/banned/unknown（网络异常不误报被封）
- **每天一次**：服务端 24h 缓存比前端节流更可靠（多端访问也只每天探测一次）
- **不合并健康检查**：健康检查是手动、即时、全量会话+PAT；封号检测是自动、缓存、独立关注点
