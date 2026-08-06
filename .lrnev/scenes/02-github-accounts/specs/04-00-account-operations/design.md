---
spec: '04-00-account-operations'
scene: '02-github-accounts'
created: '2026-08-06'
---

# 04-00 Account Operations - 设计

## L0 摘要

后端扩展（审计日志存储、GitHub 会话/PAT 探测、PAT 列表解析、导出、恢复码标记、标签字段）+ 前端增强（日志面板、健康检查、PAT 管理弹窗、导出按钮、标签 UI）。

## L1 概览

### 架构思路

- 审计日志：vault.json 新增 `auditLog` 数组（明文，不含敏感数据），`log(action, object, ip)` 工具函数，超 2000 条裁剪
- 会话检测：github.js 新增 `checkSession(jar)` → GET /settings/profile 跟随重定向：200=有效，302→/login=失效
- PAT 有效性：`GET https://api.github.com/user` + Bearer PAT → 200 有效 / 401 失效
- PAT 列表：解析 `/settings/tokens` 表格（token 行含 id/名称/权限/过期/最后使用），撤销走表单 POST
- 导出：复用 decrypt 全量解密 → 按导入格式拼文本
- 恢复码：账号记录新增 `recoveryCodesUsed`（加密布尔数组，与 recoveryCodes 平行）；旧数据无此字段视为全未用
- 标签：账号记录新增 `tags`（明文字符串数组），列表接口返回

### 主要模块

| 模块 | 职责 |
|------|------|
| `server/github.js` 扩展 | checkSession / checkPat / listPats / revokePat |
| `server/store.js` 扩展 | auditLog 追加与读取、recoveryCodesUsed、tags、exportText |
| `server/index.js` 扩展 | /api/audit、/api/accounts/health、/api/accounts/:id/pats、/api/export、/api/accounts/:id/recovery-used、tags 支持 |
| 前端 | Settings 审计面板、GitHub 页检测/健康/PAT 管理、账号页导出/标签/恢复码标记 |

### 关键决策

| 决策 | 选项 | 倾向 | 是否产 ADR | 记录 |
|------|------|------|-----------|------|
| 审计日志存储 | 加密 vs 明文 | 明文（无敏感数据），便于排查 | 否 | 日志不含凭据 |

## L2 详情

### 模块详细设计

#### D-01 审计日志
- `store.log(action, object, ip, result)`：push `{ts, action, object, ip, result}`，裁剪至 2000 条，save
- 动作名：login_ok / login_fail / password_changed / import / account_add / account_update / account_delete / pat_create / gh_login / gh_logout / backup_export / backup_import / health_check
- API：`GET /api/audit?limit=100` 倒序；`DELETE /api/audit` 清空
- 登录失败也记录（含 IP），便于发现爆破

#### D-02 会话检测
- `checkSession(jar)`：GET `https://github.com/settings/profile`（redirect manual，ghFetch 自动跟随）→ 若最终页面含 "Sign in to GitHub" 或 jar 无 user_session → 失效；否则有效并返回 `{valid, username?}`
- 失效时前端提示重新登录（不清 cookie，供用户判断）

#### D-03 PAT 有效性
- `checkPat(pat)`：GET `https://api.github.com/user`，Authorization: Bearer，UA 浏览器头；200 → `{valid:true, login}`；401 → `{valid:false}`；其他 → `{valid:null, error}`
- 健康检查组合：会话（D-02）+ PAT（D-03），批量间隔 600ms

#### D-04 PAT 列表与撤销
- `listPats(jar)`：GET `/settings/tokens` → 正则解析 `token-id` 卡片：`<li class="list-group-item" data-token-id="...">` 内含名称/权限 badge/过期/最后使用；解析失败返回错误
- `revokePat(jar, id)`：GET `/settings/tokens` 取 authenticity_token → POST `/settings/tokens/{id}`（表单 commit=Delete 或对应按钮名）；成功返回 true
- API：`GET /api/accounts/:id/github/pats`、`POST /api/accounts/:id/github/pats/:tokenId/revoke`

#### D-05 批量导出
- `store.exportText()`：全量解密 → 文本：
  ```
  账号: u\n邮箱: e\n密码: p\nsetup key: s\notpauth: o\n恢复码:\n  xxxx-xxxx\n...\nPAT: t\n\n────────\n...
  ```
- API：`GET /api/export` → `{text}`（前端下载/复制）；审计 log

#### D-06 恢复码标记
- `recoveryCodesUsed` 平行布尔数组；`setRecoveryUsed(id, index, used)` 校验越界
- API：`PUT /api/accounts/:id/recovery-used` `{index, used}`；getFullAccount 返回 used 数组
- 前端详情行：已用码置灰 + strikethrough + 「已用」徽章，点击切换（confirm）

#### D-07 标签
- 账号 `tags: []`（明文）；create/update 支持 `tags`（字符串数组，规范化：trim、去空、≤5 个、每项 ≤20 字符）
- 列表接口返回 tags；`GET /api/tags` 返回全部标签（去重）
- 前端：编辑弹窗标签输入（逗号分隔）、列表行标签徽章、账号页顶部标签筛选下拉

### 数据模型（扩展）

```json
{
  "meta": { ..., "auditLog": [{ "ts": 0, "action": "login_ok", "object": "", "ip": "", "result": "ok" }] },
  "accounts": [{
    ..., "tags": ["备用"], "recoveryCodesUsed": [false, true, ...]
  }]
}
```

### 接口契约

- `GET /api/audit?limit=100` / `DELETE /api/audit`（auth）
- `POST /api/accounts/health` → `[{id, username, session: 'valid'|'invalid'|'none'|'error', pat: 'valid'|'invalid'|'none'|'error', patLogin?}]`
- `GET /api/accounts/:id/github/pats` → `[{id, name, scopes, expiration, lastUsed}]`
- `POST /api/accounts/:id/github/pats/:tokenId/revoke`
- `GET /api/export` → `{text}`
- `PUT /api/accounts/:id/recovery-used` `{index, used}`
- `GET /api/tags` → `[tag]`
- create/update account 接受 `tags`；列表返回 `tags`

### 错误处理

- PAT 列表解析失败 → 明确错误（页面结构变化）；会话检测网络错误 → `error` 状态不误报"失效"
- 健康检查单个失败不影响其他账号

### 测试策略

- 单测：导出文本往返（export → parser 解析一致）、恢复码标记（含旧数据兼容）、审计裁剪、标签规范化
- mock：checkSession/checkPat/listPats/revokePat 响应解析
- e2e：真实会话检测 + 健康检查 + 导出往返 + PAT 列表（真实账号）
