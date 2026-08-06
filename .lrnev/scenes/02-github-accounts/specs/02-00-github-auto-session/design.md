---
spec: '02-00-github-auto-session'
scene: '02-github-accounts'
created: '2026-08-06'
---

# 02-00 Github Auto Session - 设计

## L0 摘要

纯 Node fetch + 手写 CookieJar 模拟 GitHub 登录（密码 + TOTP 2FA）与 Classic PAT 创建，cookie/PAT 沿用 AES-256-GCM 加密入库，无新增第三方依赖。

## L1 概览

### 架构思路

- `server/github.js` 单模块封装 GitHub 网页协议：CookieJar、CSRF 表单令牌管理、登录/2FA/PAT 流程、HTML 解析
- 会话序列化（cookie 数组 + csrf）加密存入账号记录的 `ghSession` 字段，重启复用
- 所有 GitHub 请求模拟浏览器 header（UA/Origin/Referer/Accept），独立 fetch 实例
- 风控识别：响应含 webauthn/passkey 标记或验证码表单 → 分类抛错

### 主要模块

| 模块 | 职责 |
|------|------|
| `server/github.js` | CookieJar、登录流程（session→2FA）、PAT 创建、状态查询、登出 |
| `server/store.js` 扩展 | 账号记录新增 `ghSession` 加密字段（不影响既有数据） |
| `server/index.js` 扩展 | 新增 `/api/accounts/:id/github/*` 路由 |
| `webui` AccountsPage 扩展 | 账号详情新增 GitHub 会话卡片 + PAT 生成弹窗 |

### 关键决策

| 决策 | 选项 | 倾向 | 是否产 ADR | 记录 |
|------|------|------|-----------|------|
| 自动化方式 | 纯 HTTP vs Playwright | 纯 HTTP（零依赖、轻量；风控时明确报错） | 否 | 风险已知，降级明确 |

## L2 详情

### 模块详细设计

#### D-01 CookieJar
- `parse(setCookieHeaders, url)`：解析 name/value/domain/path/expires/secure/httpOnly/samesite
- `buildHeader(url)`：按域+路径匹配输出 `Cookie: a=b; c=d`（HttpOnly 也发送）
- 序列化：`toJSON()/fromJSON()` 供加密入库；`clear()` 清空
- 持久化仅存必要字段，登录后重新校验

#### D-02 登录流程（login）
1. `GET https://github.com/login`（UA 浏览器头）→ 记录 Set-Cookie（`_gh_sess` 等）→ 解析 `authenticity_token`、`timestamp_secret`、`required_field_*`
2. `POST https://github.com/session`（form-urlencoded：commit=Sign in, authenticity_token, login, password, timestamp_secret, required_field_*=空）
3. 分支判断：
   - 302 → 登录成功（跟随至 /，验证 `logged_in=yes` cookie）
   - 200 且含 `two-factor` 表单 → 进入 2FA：
     a. 用账号 secret 调 `totp(secret)` 生成动态码
     b. `POST https://github.com/sessions/two-factor`（authenticity_token(新), otp, timestamp_secret(新), app_otp=空）
     c. 302 → 成功；200 含错误 → 2FA 失败
   - 200 且含 `webauthn`/`passkey` → 抛 `WEBAUTHN_REQUIRED`
   - 200 且含验证码表单（`device verification`/`captcha`）→ 抛 `VERIFICATION_REQUIRED`
4. 成功后：cookie 全量序列化 + 记录 loggedInAt；`user_session` 过期时间取 cookie Max-Age/Expires

#### D-03 表单解析
- `getFormToken(html, name)`：正则/属性解析 `<input name="authenticity_token" value="...">`
- `extractScopes(html)`：解析 `/settings/tokens/new` 页面 scope 复选框（name=`token_scopes[]`）与过期选项，供前端选择
- `extractPat(html)`：PAT 创建后从返回页提取 `ghp_[A-Za-z0-9]{36}`（flash 成功区）

#### D-04 PAT 创建（createPat）
1. 前置：已登录（本地 cookie + csrf 有效），否则抛 `NOT_LOGGED_IN`
2. `GET https://github.com/settings/tokens/new` → authenticity_token + scopes + 过期选项
3. `POST https://github.com/settings/tokens`（token_name=`{username}-{ts}`、`token_scopes[]`、`token_expiration`=90/30/7/1/custom）
4. 页面含 `ghp_` → 提取；新 token 自动 `vault.updateAccount(id, {pat})` 保存并返回一次
5. 未提取到 → 抛 `PAT_PARSE_FAILED`（含页面片段提示）

#### D-05 会话状态与登出
- `getStatus(account)`：本地有 ghSession → `{loggedIn, loggedInAt, cookieCount, username}`；无 → `{loggedIn:false}`
- `logout(account)`：尽力 `GET/POST https://github.com/logout`（带 csrf 提交 sign_out 表单），本地 cookie 清除 + ghSession 置空

#### D-06 2FA 二维码
- `GET /api/accounts/:id/otpauth`（鉴权）→ 解密 otpauth；为空时用 setupKey 拼 `otpauth://totp/GitHub:{username}?secret={setupKey}&issuer=GitHub`；两者皆空返回 404
- 前端用 `qrcode` 包（纯 JS）将 URI 渲染为 canvas 二维码，弹窗展示 + URI 复制

#### D-07 API 契约（均需 JWT）
- `POST /api/accounts/:id/github/login` → `{success, status}`；错误 `{detail, code}`
- `GET /api/accounts/:id/github/status` → `{loggedIn, loggedInAt?, cookieCount?, username?}`
- `GET /api/accounts/:id/github/pat-form` → `{scopes: [{name,label}], expirations: [...]}`（可选项，前端直接默认集）
- `POST /api/accounts/:id/github/pat` `{scopes:[], expiration}` → `{token}`（保存后仅此一次返回）
- `POST /api/accounts/:id/github/logout` → `{success}`
- 错误码：`NOT_LOGGED_IN` / `WEBAUTHN_REQUIRED` / `VERIFICATION_REQUIRED` / `BAD_CREDENTIALS` / `TWO_FA_FAILED` / `PAT_PARSE_FAILED` / `NETWORK_ERROR`

### 数据模型（扩展）

账号记录新增（可选字段，旧数据兼容）：
```json
{
  "ghSession": "<enc: {cookies: [{name,value,domain,path,expires,secure}], loggedInAt: number}>"
}
```

### 接口契约

见 D-06；前端所有 github 操作按钮带 loading 态与错误 toast。

### 错误处理

- GitHub 表单结构变化 → 解析不到令牌时抛 `PARSE_FAILED`，错误信息附响应片段前 200 字符便于排查
- 请求超时：AbortController 15s
- 风控（验证码/webauthn）不重试，直接提示用户手动处理

### 测试策略

- 单测：CookieJar 解析/匹配、表单令牌解析、scope 解析、PAT 提取（fixture HTML）
- e2e：真实账号登录 + PAT 创建（若账号可用）；风控错误路径用 mock 响应验证分类
