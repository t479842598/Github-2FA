---
spec: 03-00-mobile-scan-otp
scene: 02-github-accounts
status: completed
priority: P1
created: '2026-08-06'
updated: '2026-08-06'
---

# 03-00 Mobile Scan Otp - 需求

## L0 摘要

移动端适配 + 摄像头扫码添加 OTP（录入已有 otpauth 二维码）+ GitHub 会话功能独立为导航菜单。

## L1 概览

### 目标

- 全页面移动端响应式适配（列表/详情/弹窗/导入/设置/登录）
- 手机摄像头扫码添加 OTP：扫描 Authenticator 二维码（otpauth URI）→ 自动解析 → 确认入库
- GitHub 会话管理（自动登录/PAT/cookie）从账号详情独立为侧边栏菜单页，与账号 2FA 管理分开

### 用户故事

- 作为手机用户，我希望在手机上正常浏览账号列表并复制 2FA 码，以便移动端使用
- 作为手机用户，我希望用摄像头扫已有账号的 otpauth 二维码快速入库，以便免手动输入
- 作为账号管理者，我希望 GitHub 登录/PAT/cookie 在独立菜单统一管理，以便与 2FA 凭据区分

### 范围

**包含**：
- 移动端响应式适配（现有全部页面）
- 摄像头扫码 + 图片上传 + 粘贴 URI 三种方式添加 OTP
- 侧边栏新增「GitHub」菜单，集中管理所有账号的会话/PAT/cookie
- 账号管理页保留 2FA 码、凭据、二维码展示

**不包含**：
- PWA 离线能力
- 原生 App 打包

## L2 详情

### 详细需求

#### F-01 移动端适配
- 账号列表行、详情展开、OTP 显示、操作按钮在小屏（≤640px）不溢出、可触达
- 弹窗（编辑/二维码/删除确认）小屏全宽可用
- 导入页文本域与预览表格小屏可用（表格横向滚动）
- 验收：WHEN 用 390px 宽视口浏览全部页面 THEN 无横向溢出、按钮可点

#### F-02 扫码添加 OTP
- 新功能页（并入账号管理的「扫码添加」）：摄像头实时扫码（getUserMedia + jsQR 解码帧）
- 识别 otpauth://totp URI → 解析 username/secret/issuer → 预览表单（可改）→ 保存创建账号
- 降级：摄像头不可用（非 HTTPS 环境）时支持上传二维码图片 / 粘贴 URI 文本
- 验收：WHEN 摄像头对准 otpauth 二维码 THEN 自动识别并填入表单；WHEN 上传图片或粘贴 URI THEN 同样解析

#### F-03 GitHub 菜单独立
- 侧边栏新增「GitHub」菜单：账号维度展示会话状态（未登录/已登录/登录时间/cookie 数），支持自动登录、生成 PAT、手动 cookie、退出
- 账号管理页移除 GitHub 会话卡片（保留凭据与 2FA 能力）
- 验收：WHEN 打开 GitHub 菜单 THEN 展示全部账号会话状态并可操作；WHEN 打开账号管理 THEN 无 GitHub 会话内容

### 非功能性需求

- 性能：扫码帧率 ≥ 8fps（640×480 摄像头分辨率）
- 兼容性：Chrome/Safari 移动端；非 HTTPS 时摄像头禁用并有降级入口

### 验收标准

- [ ] 390px 视口下所有页面无横向溢出
- [ ] 扫码添加 OTP 三种方式（摄像头/图片/URI）均可解析入库
- [ ] GitHub 会话功能在独立菜单页可完整操作
