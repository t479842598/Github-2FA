---
spec: '01-00-github-account-vault'
scene: '02-github-accounts'
created: '2026-08-06'
---

# 01-00 Github Account Vault - 任务清单

> 任务由 lrnev `task_create` 工具创建，不要手编。
> 状态机：pending → in_progress → completed / failed；blocked 可回 in_progress；failed 可回 pending 重试。

## 阶段 1

<!-- FILL: 使用 task_create 追加任务；任务会以 `### T-XXX 标题 <!-- lrnev-task: ... -->` 形式追加到这里 -->

## 验收标准（整体）

- <!-- FILL: 按本 Spec 调整整体验收清单 -->
- [ ] 所有任务完成
- [ ] 单元测试通过
- [ ] 集成测试通过

### T-001 实现 crypto.js（scrypt 派生 / AES-256-GCM / 随机工具） <!-- lrnev-task: status=completed, created=2026-08-06T02:23:29.838Z, updated=2026-08-06T02:37:10.113Z, validates=D-01 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T02:37:10.045Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T02:37:10.113Z"}] -->

零依赖 Node crypto 封装：deriveKey(password, salt)、encrypt(dataKey, plaintext)、decrypt(dataKey, enc)、randomHex/randomBytes；enc 结构 {iv, ct, tag}，hex 编码

**验收**：
- 加密→解密往返一致
- 错误密钥解密抛错
- 纯 Node crypto 无第三方依赖

### T-002 实现 totp.js（RFC 6238 TOTP） <!-- lrnev-task: status=completed, created=2026-08-06T02:23:29.838Z, updated=2026-08-06T02:37:10.249Z, depends_on=T-001, validates=D-02 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T02:37:10.181Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T02:37:10.249Z"}] -->

Base32 解码（去空格、大写归一）+ HMAC-SHA1 动态截断；totp(secret, step=30, digits=6)；剩余秒数计算

**验收**：
- 与 RFC 6238 附录测试向量对拍一致
- 用户提供的 3 个 secret 能生成 6 位码

**依赖**：T-001

### T-003 实现 parser.js（文本/JSON 导入解析） <!-- lrnev-task: status=completed, created=2026-08-06T02:23:29.838Z, updated=2026-08-06T02:37:10.373Z, validates=D-03 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T02:37:10.311Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T02:37:10.373Z"}] -->

文本块分割（─ 分隔线/空行）、键值行解析（账号/邮箱/密码/setup key/otpauth/恢复码/PAT）、恢复码缩进列表、otpauth secret 提取、JSON 兼容、重复检测

**验收**：
- 解析用户提供的 3 段示例文本：字段完整、每账号 16 条恢复码
- otpauth 无 secret 时回退 setup key

### T-004 实现 store.js（vault.json 加密存储 + CRUD） <!-- lrnev-task: status=completed, created=2026-08-06T02:23:29.838Z, updated=2026-08-06T02:37:10.498Z, depends_on=T-001, validates=D-01|D-04 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T02:37:10.434Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T02:37:10.498Z"}] -->

读写 data/vault.json；账号增删改查；敏感字段 AES-GCM 加密；修改密码重派生重加密；备份导出/导入（带自动备份）；解密失败单字段标记

**验收**：
- 重启后数据不丢
- 改密码后旧密钥解密失败新密钥可读
- 备份导入完整还原

**依赖**：T-001

### T-005 实现 auth.js（设置密码 / 登录 / JWT 中间件） <!-- lrnev-task: status=completed, created=2026-08-06T02:23:29.838Z, updated=2026-08-06T02:37:10.624Z, depends_on=T-001, validates=D-01|D-04 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T02:37:10.562Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T02:37:10.624Z"}] -->

首次设置密码（scrypt 哈希 + 派生 dataKey + 随机 jwtSecret）；登录校验发 JWT（HMAC-SHA256，7 天）；Authorization 中间件；401 统一响应

**验收**：
- 未登录访问受保护接口返回 401
- 错误密码登录 401
- token 有效期 7 天

**依赖**：T-001

### T-006 实现 server/index.js（Express 路由 + 静态托管） <!-- lrnev-task: status=completed, created=2026-08-06T02:23:29.838Z, updated=2026-08-06T02:37:10.748Z, depends_on=T-004|T-005|T-002|T-003, validates=D-04 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T02:37:10.686Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T02:37:10.748Z"}] -->

挂载全部 API（status/setup/login/accounts/otps/full/import/change-password/backup）；生产托管 webui/dist；vite dev 代理友好；端口 3000（PORT 可配）

**验收**：
- 全部 API 按设计契约工作
- GET /api/otps 批量返回 code+remaining

**依赖**：T-004, T-005, T-002, T-003

### T-007 搭建 webui（Vite+React+Tailwind，移植 ds2apiNew 设计系统） <!-- lrnev-task: status=completed, created=2026-08-06T02:23:29.838Z, updated=2026-08-06T02:37:10.874Z, validates=D-05 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T02:37:10.812Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T02:37:10.874Z"}] -->

package.json/vite.config（/api 代理 3000）/tailwind.config（CSS 变量映射）/postcss/styles.css（slate+琥珀双主题）/main.jsx/theme.js

**验收**：
- npm run dev 正常启动
- 深色/浅色主题切换生效

### T-008 实现登录/设置密码页（参考 ds2apiNew Login.jsx） <!-- lrnev-task: status=completed, created=2026-08-06T02:23:29.838Z, updated=2026-08-06T02:37:11.003Z, depends_on=T-007, validates=D-05 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T02:37:10.936Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T02:37:11.003Z"}] -->

status 接口判断 setup 状态；设置密码流程；密码登录存 token（localStorage）；卡片布局 + 主题切换

**验收**：
- 未设置密码显示设置流程
- 登录后进入主界面，token 持久化

**依赖**：T-007

### T-009 实现 DashboardShell（侧边栏 + 页面骨架） <!-- lrnev-task: status=completed, created=2026-08-06T02:23:29.838Z, updated=2026-08-06T02:37:11.129Z, depends_on=T-008, validates=D-05 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T02:37:11.067Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T02:37:11.129Z"}] -->

侧边栏导航（账号/导入/设置 + 统计 + 登出）；顶栏标题；消息提示条；401 自动登出

**验收**：
- 三个页面可切换
- 401 时自动登出回登录页

**依赖**：T-008

### T-010 实现账号管理页（列表 + 实时 OTP + 详情/编辑/删除） <!-- lrnev-task: status=completed, created=2026-08-06T02:23:29.838Z, updated=2026-08-06T02:37:11.253Z, depends_on=T-009|T-006, validates=D-05 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T02:37:11.191Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T02:37:11.253Z"}] -->

搜索、TOTP 大字 mono + 30s 倒计时进度条（每秒 tick、归零重新拉 /api/otps）、复制；展开详情（掩码/明文/复制密码 setup key 恢复码）；编辑弹窗含 PAT；删除确认

**验收**：
- 列表实时显示 6 位码与倒计时
- 敏感字段默认掩码可切换明文
- PAT 保存后可复制完整值

**依赖**：T-009, T-006

### T-011 实现导入页（粘贴/上传 + 解析预览 + 确认入库） <!-- lrnev-task: status=completed, created=2026-08-06T02:23:29.838Z, updated=2026-08-06T02:37:11.378Z, depends_on=T-009|T-006, validates=D-05 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T02:37:11.315Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T02:37:11.378Z"}] -->

文本域粘贴 + txt/json 文件上传；调用后端解析预览（POST /api/import?dry=1）展示识别字段数；确认后导入显示 imported/skipped/errors

**验收**：
- 粘贴 3 段示例文本预览正确
- 确认导入后账号出现在列表

**依赖**：T-009, T-006

### T-012 实现设置页（改密码 / 备份导出导入） <!-- lrnev-task: status=completed, created=2026-08-06T02:23:29.838Z, updated=2026-08-06T02:37:11.504Z, depends_on=T-009|T-006, validates=D-05 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T02:37:11.440Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T02:37:11.504Z"}] -->

修改密码（旧+新）；导出加密备份 JSON 下载；导入备份（输密码）+ 导入前本地备份确认

**验收**：
- 改密码后旧 token 失效需重新登录
- 导出文件可被再次导入

**依赖**：T-009, T-006

### T-013 编写并跑通单测（totp/parser/crypto）+ 手工 e2e 验证 <!-- lrnev-task: status=completed, created=2026-08-06T02:23:29.838Z, updated=2026-08-06T02:37:30.400Z, depends_on=T-006|T-010|T-011|T-012, validates=D-02|D-03 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T02:37:30.327Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T02:37:30.400Z","reason":"22 个单测全绿 + 全流程 e2e 验证通过（含重启持久化、备份恢复、浏览器 UI 实测）"}] -->

totp.test.mjs（RFC 向量）、parser.test.mjs（用户 3 段示例）、crypto.test.mjs（往返/错误密钥）；启动服务全流程手工验证并记录结果

**验收**：
- npm test 全绿
- e2e：设置密码→导入→OTP→改密码→备份→重启数据完好

**依赖**：T-006, T-010, T-011, T-012
