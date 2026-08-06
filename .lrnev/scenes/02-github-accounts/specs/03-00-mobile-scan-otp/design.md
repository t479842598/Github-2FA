---
spec: '03-00-mobile-scan-otp'
scene: '02-github-accounts'
created: '2026-08-06'
---

# 03-00 Mobile Scan Otp - 设计

## L0 摘要

前端改造为主：jsQR 摄像头扫码添加 OTP、GitHub 会话独立菜单页、全站响应式优化；后端仅新增 otpauth URI 解析辅助。

## L1 概览

### 架构思路

- 新增 `webui/src/features/scan/ScanPage.jsx`：扫码添加（摄像头/图片/粘贴三入口）
- 新增 `webui/src/features/github/GithubPage.jsx`：账号×GitHub 会话矩阵（复用 GitHubSession 组件改造为列表卡片）
- `GitHubSession.jsx` 重构为可复用组件，从 AccountsPage 移除
- 二维码解码：`jsQR`（纯 JS，从 video/canvas 帧解码）；otpauth 解析复用前端工具函数
- 响应式：Tailwind 断点梳理（sm/md/lg），列表行与弹窗小屏布局修正

### 主要模块

| 模块 | 职责 |
|------|------|
| `webui/src/features/scan/ScanPage.jsx` | 摄像头流 + 帧解码循环 + 图片文件解码 + URI 粘贴 + 结果表单 |
| `webui/src/utils/otpUri.js` | otpauth URI 解析（username/secret/issuer/digits/period）与组装 |
| `webui/src/features/github/GithubPage.jsx` | 账号 GitHub 会话列表与操作 |
| `GitHubSession.jsx` | 保持组件化，供 GithubPage 复用 |
| AccountsPage / DashboardShell / ImportPage / SettingsPage | 响应式修正 |

### 关键决策

| 决策 | 选项 | 倾向 | 是否产 ADR | 记录 |
|------|------|------|-----------|------|
| 扫码库 | jsQR vs zxing-wasm | jsQR（纯 JS 无 wasm，移动端够用） | 否 | 帧率需求低 |

## L2 详情

### 模块详细设计

#### D-01 扫码流程
- `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 640 } })` → video 元素 → requestAnimationFrame/setInterval 循环：drawImage 到 canvas → jsQR(imageData) → 命中 otpauth:// 即停止并解析
- 非 secure context（`!window.isSecureContext`）→ 隐藏摄像头入口，展示图片/粘贴降级
- 图片上传：`createImageBitmap(file)` → canvas → jsQR
- 粘贴：textarea 输入 URI → 前端解析

#### D-02 otpauth 解析
`otpauth://totp/{label}?secret=X&issuer=Y&digits=6&period=30`
- label 支持 `Issuer:account` 或纯 account 格式；缺 secret 报错
- 解析结果 → 表单预填：username(label 账号部分)、setupKey(secret)、otpauth(原文)、secret 派生

#### D-03 GitHub 菜单页
- 拉取全部账号 → 每账号一张会话卡（紧凑版 GitHubSession：状态徽章 + 登录/退出 + 生成 PAT + 手动 cookie 折叠）
- 保持现有 API 不变（复用 github/status、login、pat、logout、cookies）

#### D-04 响应式修正清单
- AccountsPage 行：OTP 区 `min-w-0 flex-1` 已有；按钮组加 `gap-1.5` 与触达尺寸 `min-h-[40px]`
- 详情区：`px-4 lg:px-6`，恢复码网格 `grid-cols-2 sm:grid-cols-3`
- 弹窗：`max-w-lg` 外框加 `w-full` 已有；编辑表单字段 `grid-cols-1 sm:grid-cols-2`
- 侧边栏：现有 drawer 机制，加 `w-72` 固定宽 + 遮罩
- 导入预览表格：`overflow-x-auto` + 最小宽 560px

### 接口契约

- 复用 `POST /api/accounts`（扫码添加最终落库）；无新后端接口

### 错误处理

- 摄像头拒绝授权 → 提示 + 降级图片/粘贴
- 解码超时（30s 无命中）→ 提示移动二维码/换图片
- 解析失败（非 otpauth URI）→ 明确报错

### 测试策略

- 单测：otpUri 解析函数（label/secret/issuer/digits/period 各变体）
- 浏览器 e2e：390px 视口截图检查无溢出；扫码页三种入口解析同一 URI 结果一致
