---
spec: '03-00-mobile-scan-otp'
scene: '02-github-accounts'
created: '2026-08-06'
---

# 03-00 Mobile Scan Otp - 任务清单

> 任务由 lrnev `task_create` 工具创建，不要手编。
> 状态机：pending → in_progress → completed / failed；blocked 可回 in_progress；failed 可回 pending 重试。

## 阶段 1

<!-- FILL: 使用 task_create 追加任务；任务会以 `### T-XXX 标题 <!-- lrnev-task: ... -->` 形式追加到这里 -->

## 验收标准（整体）

- <!-- FILL: 按本 Spec 调整整体验收清单 -->
- [ ] 所有任务完成
- [ ] 单元测试通过
- [ ] 集成测试通过

### T-001 实现 otpUri 解析工具 + 单测 <!-- lrnev-task: status=completed, created=2026-08-06T03:10:14.274Z, updated=2026-08-06T03:18:02.750Z, validates=D-02 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T03:18:02.692Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T03:18:02.750Z"}] -->

webui/src/utils/otpUri.js：解析 otpauth://totp/{label}?secret=..&issuer=..&digits=..&period=..；支持 Issuer:account 与纯 account；组装 URI 函数；node 单测覆盖变体

**验收**：
- label/secret/issuer 解析正确
- 异常 URI 明确报错

### T-002 实现扫码添加页（摄像头/图片/粘贴三入口） <!-- lrnev-task: status=completed, created=2026-08-06T03:10:14.274Z, updated=2026-08-06T03:18:02.866Z, depends_on=T-001, validates=D-01|D-02 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T03:18:02.808Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T03:18:02.866Z"}] -->

ScanPage.jsx：getUserMedia 环境摄像头 + jsQR 帧循环（640x480，8fps）；非 secure context 隐藏摄像头；createImageBitmap 图片解码；URI 粘贴；结果表单预填可改后 POST /api/accounts

**验收**：
- 摄像头帧识别 otpauth 码
- 图片上传解码
- 粘贴 URI 解析
- 保存后账号出现在列表

**依赖**：T-001

### T-003 实现 GitHub 菜单页 + 从账号页移除会话卡片 <!-- lrnev-task: status=completed, created=2026-08-06T03:10:14.274Z, updated=2026-08-06T03:18:02.981Z, depends_on=T-002, validates=D-03 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T03:18:02.924Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T03:18:02.981Z"}] -->

GithubPage.jsx：全部账号会话卡片列表（状态/登录/退出/PAT/手动 cookie）；GitHubSession.jsx 改紧凑可复用；AccountsPage 移除 GitHubSession 区块；DashboardShell 新增 GitHub 菜单

**验收**：
- GitHub 菜单展示全部账号会话状态
- 账号页无 GitHub 会话内容
- 会话操作全部可用

**依赖**：T-002

### T-004 全站移动端响应式修正 <!-- lrnev-task: status=completed, created=2026-08-06T03:10:14.274Z, updated=2026-08-06T03:18:03.095Z, depends_on=T-003, validates=D-04 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T03:18:03.039Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T03:18:03.095Z"}] -->

390px 视口检查：账号列表行/详情/弹窗/导入预览表格/设置页/侧边栏；触达尺寸、横向滚动、栅格断点修正

**验收**：
- 390px 视口无横向溢出
- 核心操作可触达

**依赖**：T-003

### T-005 e2e 验证（移动视口截图 + 三入口扫码一致 + GitHub 菜单操作） <!-- lrnev-task: status=completed, created=2026-08-06T03:10:14.274Z, updated=2026-08-06T03:18:03.209Z, depends_on=T-004, validates=D-01|D-03|D-04 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-06T03:18:03.152Z"},{"from":"in_progress","to":"completed","at":"2026-08-06T03:18:03.209Z"}] -->

浏览器 390px 视口遍历页面截图；扫码页三入口解析同一 URI 结果一致；GitHub 菜单页真实登录操作验证

**验收**：
- 截图无溢出
- 三入口结果一致
- GitHub 菜单操作正常

**依赖**：T-004
