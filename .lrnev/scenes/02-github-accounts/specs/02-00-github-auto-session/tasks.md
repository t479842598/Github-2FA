---
spec: '02-00-github-auto-session'
scene: '02-github-accounts'
created: '2026-08-06'
---

# 02-00 Github Auto Session - 任务清单

> 任务由 lrnev `task_create` 工具创建，不要手编。
> 状态机：pending → in_progress → completed / failed；blocked 可回 in_progress；failed 可回 pending 重试。

## 阶段 1

<!-- FILL: 使用 task_create 追加任务；任务会以 `### T-XXX 标题 <!-- lrnev-task: ... -->` 形式追加到这里 -->

## 验收标准（整体）

- <!-- FILL: 按本 Spec 调整整体验收清单 -->
- [ ] 所有任务完成
- [ ] 单元测试通过
- [ ] 集成测试通过

### T-001 实现 CookieJar（解析/匹配/序列化） <!-- lrnev-task: status=completed, created=2026-08-06T02:42:38.123Z, updated=2026-08-06T03:18:01.813Z, validates=D-01 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T03:18:01.752Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T03:18:01.813Z"}] -->

server/github.js 内实现：parse(setCookieHeaders, url)、buildHeader(url)（域+路径匹配）、toJSON/fromJSON/clear；单元测试覆盖解析、路径匹配、序列化

**验收**：
- Set-Cookie 解析正确（domain/path/expires/secure）
- buildHeader 按域+路径过滤
- toJSON→fromJSON 往返一致

### T-002 实现 GitHub 登录流程（密码 + 自动 2FA + 风控分类） <!-- lrnev-task: status=completed, created=2026-08-06T02:42:38.123Z, updated=2026-08-06T03:18:01.938Z, depends_on=T-001, validates=D-02 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T03:18:01.879Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T03:18:01.938Z"}] -->

GET /login 解析表单令牌 → POST /session → 检测 2FA 表单用 totp() 自动提交 → 302 成功；webauthn/验证码/密码错误/2FA 失败分类抛错；15s 超时；浏览器 header 模拟

**验收**：
- 成功登录后 cookie 全量入库
- 错误分类：BAD_CREDENTIALS/TWO_FA_FAILED/WEBAUTHN_REQUIRED/VERIFICATION_REQUIRED

**依赖**：T-001

### T-003 实现 PAT 创建（表单解析 + ghp_ 提取 + 自动保存） <!-- lrnev-task: status=completed, created=2026-08-06T02:42:38.123Z, updated=2026-08-06T03:18:02.054Z, depends_on=T-002, validates=D-03|D-04 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T03:18:01.997Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T03:18:02.054Z"}] -->

GET /settings/tokens/new 解析 authenticity_token/scopes → POST /settings/tokens（name/scopes/expiration）→ 提取 ghp_ 令牌 → 自动 updateAccount pat 字段；未登录抛 NOT_LOGGED_IN

**验收**：
- 创建成功返回 token 且账号 PAT 已更新
- 表单结构变化时抛 PAT_PARSE_FAILED 附片段

**依赖**：T-002

### T-004 store.js 扩展 ghSession 字段 + 状态/登出 <!-- lrnev-task: status=completed, created=2026-08-06T02:42:38.123Z, updated=2026-08-06T03:18:02.169Z, depends_on=T-001, validates=D-05 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T03:18:02.111Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T03:18:02.169Z"}] -->

账号记录新增可选 ghSession（AES 加密 cookie 序列化 + loggedInAt）；getGhSession/setGhSession/clearGhSession；登出尽力调用 GitHub logout 表单

**验收**：
- 旧数据无 ghSession 字段不报错
- 会话加密存储重启可读
- 状态接口返回 loggedIn/loggedInAt/cookieCount

**依赖**：T-001

### T-005 实现 github API 路由 + otpauth 二维码接口 <!-- lrnev-task: status=completed, created=2026-08-06T02:42:38.123Z, updated=2026-08-06T03:18:02.284Z, depends_on=T-002|T-003|T-004, validates=D-04|D-06|D-07 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T03:18:02.226Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T03:18:02.284Z"}] -->

POST /accounts/:id/github/login、GET /status、POST /pat、POST /logout；GET /accounts/:id/otpauth（解密返回 URI，无则 setupKey 拼接，皆空 404）

**验收**：
- curl 全流程可调通
- 错误返回 {detail, code}

**依赖**：T-002, T-003, T-004

### T-006 前端 GitHub 会话卡片 + PAT 弹窗 + 2FA 二维码弹窗 <!-- lrnev-task: status=completed, created=2026-08-06T02:42:38.123Z, updated=2026-08-06T03:18:02.399Z, depends_on=T-005, validates=D-06|D-07 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T03:18:02.341Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T03:18:02.399Z"}] -->

账号详情新增 GitHub 区块：登录按钮（自动 2FA）、登录状态徽章、生成 PAT 弹窗（scope 多选 + 过期时间）、退出登录、查看 cookie；二维码弹窗（qrcode 包渲染 + URI 复制）

**验收**：
- 未登录/已登录状态正确切换
- PAT 生成后显示一次并自动保存
- 二维码可扫码

**依赖**：T-005

### T-007 单测（CookieJar/解析/PAT 提取/mock 风控）+ 真实账号 e2e <!-- lrnev-task: status=completed, created=2026-08-06T02:42:38.123Z, updated=2026-08-06T03:18:02.517Z, depends_on=T-005|T-006, validates=D-01|D-02|D-03 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T03:18:02.457Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T03:18:02.517Z"}] -->

fixture HTML 测试表单解析与分类；真实账号 tqH8iLZ7VEV9 登录 + PAT 创建 e2e（如风控则记录并降级验证错误路径）

**验收**：
- 单测全绿
- e2e 记录结果（成功或风控分类正确）

**依赖**：T-005, T-006
