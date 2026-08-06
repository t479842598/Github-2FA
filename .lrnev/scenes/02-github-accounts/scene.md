---
id: '02-github-accounts'
number: 2
name: 'github-accounts'
status: draft
created: '2026-08-06'
intent: 'GitHub 账号信息保险库：批量导入账号凭据、网页端实时显示 2FA TOTP 码、PAT 令牌管理，密码登录保护'
---

# Github Accounts

## L0 摘要

GitHub 账号保险库：批量导入账号凭据（账号/邮箱/密码/setup key/otpauth/恢复码/PAT），网页端实时显示 2FA TOTP 码，密码登录 + AES 加密存储保护。

## L1 概览

### 背景

批量使用 GitHub 账号的场景需要集中管理凭据与 2FA，现有工具无法统一存放密码、setup key、恢复码并实时生成动态码。

### 边界

本 Scene 仅管理凭据信息与动态码展示，不包含自动登录 GitHub、账号状态检测、PAT 有效性校验。

### 关键概念

- 保险库（Vault）：单 JSON 文件加密存储，敏感字段 AES-256-GCM
- TOTP：RFC 6238 动态码，后端生成，30 秒步长
- 导入解析器：支持用户文本格式与 JSON 数组批量解析

## L2 详情

### 业务背景

（为什么需要这个 Scene？它解决什么问题？）

### 边界与范围

**包含**：
- 批量导入与解析（文本/JSON）
- 实时 2FA 动态码展示
- PAT 令牌管理
- 密码登录与加密存储
- 备份导出/导入

**不包含**：
- 自动登录 GitHub / 账号状态抓取
- 多用户体系
- PAT 有效性自动校验

### 关键术语

| 术语 | 定义 |
|------|------|
| TOTP | 基于时间的一次性密码，RFC 6238，30 秒变化 |
| PAT | GitHub Personal Access Token，个人访问令牌 |
| setup key | 2FA 初始密钥（Base32），用于生成动态码 |
| 恢复码 | 2FA 备用一次性恢复码 |

### 相关 Scene

- <!-- FILL: 相关 Scene 或无 -->

## 维护说明

- 本文档由用户主导编写，AI 协助填空
- 修改后 AI 应同步更新 `.abstract.md` / `.overview.md`
