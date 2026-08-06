---
spec: 02-00-github-auto-session
scene: 02-github-accounts
status: completed
priority: P1
created: '2026-08-06'
updated: '2026-08-06'
---

# 02-00 Github Auto Session - 需求

## L0 摘要

自动登录 GitHub 账号（账号密码 + 自动 2FA 动态码），保存会话 cookie；基于登录态一键生成并保存 PAT 令牌。

## L1 概览

### 目标

- 网页端一键"登录 GitHub"：使用库内账号密码 + TOTP 自动完成 GitHub 登录，cookie 加密入库
- 登录态可视化：显示是否已登录、登录时间、cookie 状态；支持一键退出（本地清除）
- 一键"生成 PAT"：选择权限 scope 与过期时间，自动创建 GitHub PAT 并保存到账号（加密）
- 自动降级：GitHub 触发风控（验证码/webauthn）时返回明确提示，不阻塞其他功能

### 用户故事

- 作为账号使用者，我希望在网页点击一次即可自动登录 GitHub 并保存 cookie，以便后续直接使用登录态
- 作为账号管理员，我希望一键生成指定权限的 PAT 并自动保存，以便免去手工进 GitHub 设置页创建
- 作为谨慎用户，我希望登录 cookie 与 PAT 加密存储且可随时清除，以便控制凭据风险

### 范围

**包含**：
- GitHub 登录自动化（密码 + TOTP 2FA），CookieJar 会话管理
- 会话 cookie 加密持久化与状态查询、本地退出
- Classic PAT 自动创建（scope 多选 + 过期时间）并保存到账号 PAT 字段
- 登录/PAT 过程错误识别与明确提示（验证码、webauthn、密码错误、2FA 失败）

**不包含**：
- Fine-grained PAT 创建
- 浏览器级反检测（不保证绕过 GitHub 风控，风控时明确报错）
- 使用 cookie 调用 GitHub API 的业务（本次只保存与会话管理）

## L2 详情

### 详细需求

#### F-01 自动登录 GitHub
- 流程：GET /login 获取表单令牌 → POST /session 提交账号密码 → 若存在 2FA 表单则用账号 secret 生成 TOTP 提交 → 登录成功提取 cookie
- cookie 序列化加密存入账号记录（含名称/值/域/路径/过期），重启后可复用
- 失败分类返回：密码错误 / 2FA 失败 / 需要验证码 / 需要 webauthn / 网络错误
- 验收：WHEN 账号密码正确且 2FA secret 有效 THEN 登录成功且 cookie 入库；WHEN 触发风控 THEN 返回明确错误信息

#### F-02 会话状态与退出
- 状态接口返回：是否已登录、登录时间、cookie 数量、GitHub 用户名
- 退出：清除库内 cookie 并调用 GitHub /logout（尽力而为）
- 验收：WHEN 已登录 THEN 状态显示已登录及时间；WHEN 点击退出 THEN cookie 清除且状态变为未登录

#### F-03 一键生成 PAT
- 登录态下：GET /settings/tokens/new 获取表单 → POST /settings/tokens 提交（token_name 自动生成、scopes 多选、过期 1/7/30/90/自定义）
- 成功后从返回页提取 `ghp_` 令牌，自动保存到账号 PAT 字段（加密）并返回给前端展示一次
- 验收：WHEN 登录成功且选择 scopes 后点击生成 THEN 返回新 PAT 且账号 PAT 字段更新；WHEN 未登录 THEN 提示先登录

#### F-04 2FA 二维码
- 账号详情提供"扫码添加 2FA"：后端解密 otpauth（无则用 setupKey 拼 URI）返回，前端渲染为二维码（otpauth://totp/GitHub:{username}?secret=...&issuer=GitHub）
- 二维码弹窗同时展示 otpauth URI 文本可复制
- 验收：WHEN 账号有 secret THEN 二维码可扫码且内容为有效 otpauth URI；WHEN 无 secret THEN 按钮禁用并提示

### 非功能性需求

- 性能：登录全流程 < 10s；PAT 创建 < 10s
- 兼容性：GitHub 表单结构变化时错误信息含提示；Node fetch 内置实现，无新第三方依赖
- 安全性：cookie/PAT 沿用 AES-256-GCM 加密；前端仅展示 PAT 一次后不再下发

### 边界与依赖

- 依赖 Spec 01-00 的加密存储（vault）与 TOTP 生成（totp.js）
- GitHub 网页表单为外部依赖，结构变化需适配

### 验收标准

- [ ] 真实账号自动登录成功，cookie 加密入库且重启后可查询状态
- [ ] 登录态下生成 PAT 成功并保存到账号 PAT 字段
- [ ] 未登录/密码错误/2FA 错误时返回明确错误
- [ ] 退出登录后 cookie 清除、状态复位
