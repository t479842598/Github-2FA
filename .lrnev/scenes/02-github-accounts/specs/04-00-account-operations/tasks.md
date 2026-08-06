---
spec: '04-00-account-operations'
scene: '02-github-accounts'
created: '2026-08-06'
---

# 04-00 Account Operations - 任务清单

> 任务由 lrnev `task_create` 工具创建，不要手编。
> 状态机：pending → in_progress → completed / failed；blocked 可回 in_progress；failed 可回 pending 重试。

## 阶段 1

<!-- FILL: 使用 task_create 追加任务；任务会以 `### T-XXX 标题 <!-- lrnev-task: ... -->` 形式追加到这里 -->

## 验收标准（整体）

- <!-- FILL: 按本 Spec 调整整体验收清单 -->
- [ ] 所有任务完成
- [ ] 单元测试通过
- [ ] 集成测试通过

### T-001 实现审计日志（store.log + API + 设置页面板） <!-- lrnev-task: status=completed, created=2026-08-06T03:21:53.950Z, updated=2026-08-06T03:30:19.380Z, validates=D-01 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T03:30:19.299Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T03:30:19.380Z"}] -->

store.js 加 auditLog（明文数组，裁剪 2000）；log(action, object, ip, result)；index.js 挂 GET /api/audit、DELETE /api/audit，关键操作埋点（login_ok/fail、password_changed、import、account_*、pat_create、gh_*、backup_*、health_check）；SettingsPage 加审计面板（倒序列表+清空）

**验收**：
- 登录/导入/改密等操作产生日志
- 超过 2000 条自动裁剪
- 设置页可查看与清空

### T-002 实现会话检测 + PAT 有效性（github.js + 健康检查 API） <!-- lrnev-task: status=completed, created=2026-08-06T03:21:53.950Z, updated=2026-08-06T03:30:19.510Z, depends_on=T-001, validates=D-02|D-03 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T03:30:19.445Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T03:30:19.510Z"}] -->

checkSession(jar)（/settings/profile 跟随重定向判定）；checkPat(pat)（api.github.com/user Bearer）；POST /api/accounts/health 批量（间隔 600ms）；前端 GitHub 页检测按钮 + 账号页/GitHub 页状态徽章

**验收**：
- 有效会话判 valid、失效判 invalid
- 网络错误返回 error 不误报
- 批量健康检查全账号状态展示

**依赖**：T-001

### T-003 实现 PAT 列表与撤销（listPats/revokePat + API + 前端弹窗） <!-- lrnev-task: status=completed, created=2026-08-06T03:21:53.950Z, updated=2026-08-06T03:30:19.638Z, depends_on=T-002, validates=D-04 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T03:30:19.576Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T03:30:19.638Z"}] -->

github.js 解析 /settings/tokens 表格（data-token-id/名称/权限/过期/最后使用）；revokePat 表单 POST；API GET pats、POST revoke；GitHub 页账号卡「管理 PAT」弹窗（列表+撤销）

**验收**：
- 列表显示名称/权限/过期/最后使用
- 撤销后 GitHub 侧删除
- 解析失败明确报错

**依赖**：T-002

### T-004 实现批量导出（store.exportText + API + 前端下载/复制） <!-- lrnev-task: status=completed, created=2026-08-06T03:21:53.950Z, updated=2026-08-06T03:30:19.763Z, depends_on=T-001, validates=D-05 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T03:30:19.700Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T03:30:19.763Z"}] -->

全量解密拼用户导入格式文本（账号/邮箱/密码/setup key/otpauth/恢复码缩进/PAT，块间 ────）；GET /api/export 返回 text；账号页或设置页导出按钮（下载 .txt + 复制）；审计埋点

**验收**：
- 导出文本与本系统导入往返一致
- 含 PAT/备注字段

**依赖**：T-001

### T-005 实现恢复码使用标记（recoveryCodesUsed + API + 前端置灰） <!-- lrnev-task: status=completed, created=2026-08-06T03:21:53.950Z, updated=2026-08-06T03:30:19.886Z, depends_on=T-004, validates=D-06 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T03:30:19.824Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T03:30:19.886Z"}] -->

store 加 recoveryCodesUsed 平行数组（旧数据兼容=全 false）；setRecoveryUsed 校验；API PUT /accounts/:id/recovery-used；getFullAccount 返回 used；详情行已用码置灰+徽章，点击切换需确认

**验收**：
- 标记后详情置灰且持久化
- 旧数据（无 used 字段）不报错

**依赖**：T-004

### T-006 实现账号标签分组（tags 字段 + API + 前端徽章/筛选） <!-- lrnev-task: status=completed, created=2026-08-06T03:21:53.950Z, updated=2026-08-06T03:30:20.011Z, depends_on=T-005, validates=D-07 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T03:30:19.949Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T03:30:20.011Z"}] -->

store 支持 tags（规范化 ≤5 个每项 ≤20 字符）；create/update/列表返回；GET /api/tags 去重列表；编辑弹窗标签输入（逗号分隔）；列表行徽章 + 顶部筛选下拉

**验收**：
- 设置标签后列表显示徽章
- 按标签筛选生效
- 旧数据无 tags 不报错

**依赖**：T-005

### T-007 单测（导出往返/恢复码兼容/审计裁剪/标签/mock 检测解析）+ e2e <!-- lrnev-task: status=completed, created=2026-08-06T03:21:53.950Z, updated=2026-08-06T03:30:20.135Z, depends_on=T-006, validates=D-01|D-02|D-04|D-05 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T03:30:20.074Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T03:30:20.135Z"}] -->

导出→parser 解析一致；recoveryCodesUsed 旧数据兼容；审计 2000 裁剪；标签规范化；mock checkSession/checkPat/listPats 解析；真实账号会话检测 + PAT 列表 e2e

**验收**：
- 单测全绿
- e2e 记录真实结果

**依赖**：T-006

### T-008 --title <!-- lrnev-task: status=pending, created=2026-08-06T04:32:03.337Z -->

store 新增 kvRecords 加密字段（每条 {title, content}）；parser 支持记录多行导出格式往返；前端详情区授权记录区块（添加/编辑/删除/掩码显示）
