# GitHub 2FA Manager

> **团队 GitHub 账号集中管理平台** —— 统一托管团队所有 GitHub 账号的凭据、2FA 动态码、登录会话与访问令牌，一人一套密码，全员安全协作。

![version](https://img.shields.io/badge/version-1.2.0-blue) ![license](https://img.shields.io/badge/license-MIT-green) ![node](https://img.shields.io/badge/node-%3E%3D22-339933)

GitHub 2FA Manager 面向**需要批量管理多个 GitHub 账号的团队/个人**：将账号密码、2FA 密钥、恢复码、PAT 令牌集中加密保管，网页端实时查看 2FA 动态码，自动登录 GitHub 获取会话、一键生成 PAT，并内置审计日志与健康检查，让账号资产"看得见、管得住、查得清"。

---

## 📋 功能总览

| 模块 | 功能 | 说明 |
|------|------|------|
| 🔐 访问安全 | 默认密码 + 强制改密 | 首次登录密码 `sk-admin`，登录后强制修改，改密前禁止一切写操作 |
| | 登录失败锁定 | 连续失败 5 次锁定 15 分钟（IP 维度），防暴力破解 |
| | 敏感字段加密 | 密码/setup key/恢复码/PAT 全部 AES-256-GCM 字段级加密，密钥由登录密码 scrypt 派生 |
| | 会话吊销 | JWT 7 天有效 + tokenVersion 机制，改密码后旧会话立即失效 |
| 📥 批量导入 | 文本/文件导入 | 粘贴文本或上传 .txt/.json，自动解析「账号/邮箱/密码/setup key/otpauth/恢复码/PAT/备注」 |
| | 格式兼容 | 支持中文/英文字段别名、多行恢复码列表、JSON 数组 |
| | 智能去重 | 重复账号自动跳过：用户名已存在，或密码/setup key/otpauth 与库内账号完全一致（内容重复）均不重复入库，只导入库内没有的账号 |
| ⏱ 2FA 管理 | 实时动态码 | 每个账号 6 位 TOTP 大字显示 + 30 秒倒计时进度条，一键复制 |
| | 扫码添加 | 摄像头扫码 / 上传二维码图片 / 粘贴 otpauth URI 三种方式录入新账号（移动端优先） |
| | 生成二维码 | 账号详情生成 otpauth 二维码，手机 Authenticator 扫码即可添加 |
| | 恢复码标记 | 用过的恢复码逐条置灰标记「已用」，可恢复，剩余数量一目了然 |
| 🐙 GitHub 自动化 | 自动登录 | 账号密码 + 自动 2FA 动态码一键登录 GitHub，会话 Cookie 加密入库 |
| | 会话检测 | 探测已存会话是否有效（真实请求验证，非猜测） |
| | 生成 PAT | 选择权限 scope（repo/workflow/gist 等）与过期时间，自动创建并保存 |
| | PAT 管理 | 查看账号名下全部 PAT（名称/权限/过期/最后使用），一键撤销 |
| | 手动 Cookie | 自动登录失败时（风控/WebAuthn）可手动粘贴浏览器 Cookie |
| 🩺 运营管理 | 健康检查 | 批量检测所有账号的会话与 PAT 有效性，异常红色标记 |
| | 封号检测 | 自动探测账号是否被封（PAT/会话/公开资料页三信号），默认每天检测一次，可手动强制 |
| | 状态筛选排序 | 账号列表按正常/被封筛选，被封账号固定排最后 |
| | 审计日志 | 登录/改密/导入/删除/PAT/备份等关键操作全留痕（含 IP），可查看与清空 |
| | 标签分组 | 账号打标签（≤5 个），列表徽章展示 + 按标签筛选 |
| | 密钥导入 | opencode / freebuff 密钥按「账号-密钥」批量导入，写入对应账号授权记录 |
| | 固定格式导入 | 账号----密码----setup key 格式批量导入，自动标记为「被标记」 |
| | 被标记管理 | 标记徽章展示、一键导出被标记（弹窗预览/复制/下载）、批量删除被标记 |
| | 导出弹窗 | 普通导出与被标记导出均为弹窗预览，支持复制与下载 .txt |
| | 批量导出 | 按导入格式导出全部账号（.txt 下载），换机器/换团队无缝迁移 |
| 💾 数据安全 | 加密备份 | 导出加密备份文件，任意实例输入密码即可完整恢复（导入前自动备份现有数据） |
| | 字段级校验 | 导入字段长度/条数限长，防存储膨胀 |
| 📱 多端适配 | 移动端 | 390px 视口全页面可用，汉堡菜单抽屉，手机浏览器直接管理 |
| 🔄 更新检测 | 版本与更新 | 侧边栏/设置页显示当前版本，自动检测 GitHub Releases 新版本，一键跳转下载 |

---

## 🚀 快速开始（本地部署）

### 环境要求

- **Node.js ≥ 22**（推荐 22 LTS 或更高）
- 现代浏览器（Chrome / Edge / Safari 近两年版本）

### 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/t479842598/Github-2FA.git
cd Github-2FA

# 2. 安装依赖（分三部分）
npm install                          # 根依赖（开发脚本）
cd server && npm install             # 后端（express + qrcode）
cd ../webui && npm install --include=dev   # 前端（React/Vite/Tailwind）
cd ..

# 3. 构建前端
npm run build

# 4. 启动服务
npm start
```

浏览器访问 **http://localhost:3000**，使用默认密码 **`sk-admin`** 登录 → 系统强制要求修改密码 → 修改后即可导入账号开始使用。

> ⚠️ **安全提醒**：服务默认仅监听 `127.0.0.1`（仅本机可访问），请务必修改默认密码后再使用。

### 开发模式（热更新）

```bash
npm run dev   # 并行启动 API(3000) + Vite 开发服务器(5173)，访问 http://localhost:5173
```

### 运行测试

```bash
cd server && npm test    # 后端：TOTP RFC 向量对拍 / 导入解析 / 加密存储 / GitHub 协议 mock
cd webui && npm test     # 前端：otpauth URI 解析
```

---

## 🖥 服务器部署

### 方式一：systemd 常驻服务（Linux）

```ini
# /etc/systemd/system/github-2fa.service
[Unit]
Description=GitHub 2FA Manager
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/Github-2FA
ExecStart=/usr/bin/node server/index.js
Environment=PORT=3000
# 局域网/公网访问时放开（默认仅本机）：
Environment=HOST=0.0.0.0
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now github-2fa
sudo systemctl status github-2fa   # 查看状态
```

### 方式二：PM2 进程守护

```bash
npm install -g pm2
pm2 start server/index.js --name github-2fa --env PORT=3000
pm2 save && pm2 startup          # 开机自启
```

### 方式三：HTTPS 反向代理（Nginx，推荐公网部署）

```nginx
# /etc/nginx/conf.d/github-2fa.conf
server {
    listen 443 ssl;
    server_name 2fa.example.com;

    ssl_certificate     /etc/ssl/2fa.example.com.pem;
    ssl_certificate_key /etc/ssl/2fa.example.com.key;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

> 💡 **重要**：HTTPS 是**移动端摄像头扫码**（secure context）的前提，也是公网部署的安全底线。部署后务必修改默认密码、定期备份 `data/vault.json`。

### 数据备份与迁移

所有数据都在单文件 **`data/vault.json`**（密文）。迁移 = 复制该文件 + 记住登录密码：

```bash
# 自动备份（每日）
crontab -e
# 每天 3 点备份数据
0 3 * * * cp /opt/Github-2FA/data/vault.json /backup/vault-$(date +\%Y\%m\%d).json
```

也可以在设置页「数据备份」中一键导出加密备份文件（跨机器恢复）。

---

## 📖 使用指南

### 首次使用流程

1. 浏览器打开系统，输入默认密码 `sk-admin` 登录
2. 系统强制跳转「修改默认密码」页，设置强密码（≥6 位，不要与默认密码相同）
3. 进入「一键导入」页，粘贴团队账号文本或上传文件，解析预览确认后入库
4. 进入「账号管理」查看各账号实时 2FA 动态码，开始使用

### 导入格式示例

```
账号: tqH8iLZ7VEV9
邮箱: w38du6y79p3iqe@i.yutiankejiai.com
密码: pVBYB9Fh4Mu8ayNEF8
setup key: KDI5GIHR6P3HECLE
otpauth: otpauth://totp/GitHub:tqH8iLZ7VEV9?secret=KDI5GIHR6P3HECLE&issuer=GitHub
恢复码:
  3e54b-8f3af
  d5288-b2cba
  5ec8a-6b160
  85f99-0a029

────────

账号: CCryD7L6wWRd
邮箱: hf2a4744xxktuk@i.api2i.com
密码: c8Gk3avRHwGDN3fnRP
setup key: G3VDNO6VQNWAUZTW
otpauth: otpauth://totp/GitHub:CCryD7L6wWRd?secret=G3VDNO6VQNWAUZTW&issuer=GitHub
恢复码:
  179aa-047a1
  ec2b1-3ac1d
```

字段别名：`账号/用户名/账户`、`邮箱`、`密码`、`setup key/密钥/secret`、`otpauth/otp uri`、`恢复码/backup codes`、`PAT/令牌/token`、`备注/note`。也支持 JSON 数组格式。

### 团队账号管理流程建议

| 场景 | 操作路径 |
|------|---------|
| 新账号入库 | 一键导入（批量）或 扫码添加 OTP（手机扫已有二维码） |
| 登录 GitHub 拿会话 | GitHub 菜单 → 该账号「自动登录」（自动填 2FA） |
| 给开发人员开令牌 | GitHub 菜单 → 生成 PAT（最小权限 + 短过期） |
| 撤销泄露的令牌 | GitHub 菜单 → 管理 PAT → 撤销 |
| 定期巡检 | GitHub 菜单 → 健康检查（会话/PAT 有效性一目了然） |
| 排查操作记录 | 设置 → 审计日志（谁在何时做了什么） |
| 交接/迁移 | 账号管理 → 导出（txt 格式）或 设置 → 加密备份 |

---

## 🔒 安全设计

| 层 | 措施 |
|---|---|
| 传输 | 默认仅监听 127.0.0.1；公网部署建议 HTTPS 反向代理 |
| 认证 | scrypt 密码哈希；失败 5 次锁定 15 分钟；JWT + tokenVersion 吊销 |
| 数据 | AES-256-GCM 字段级加密（每字段独立 IV + authTag）；密钥由登录密码派生；**丢失密码数据不可恢复** |
| 前端 | 严格 CSP（脚本仅同源）；无内联脚本；React 自动转义防 XSS；no-store 禁缓存 |
| 响应 | 统一 JSON 错误（不泄露堆栈/框架信息）；API 404 无框架指纹 |
| GitHub | 会话 Cookie 加密入库；TOTP secret 永不下发前端（动态码由后端生成） |
| 审计 | 关键操作全留痕（含来源 IP），发现异常可追溯 |

---

## 🔄 版本与更新

| 项目 | 说明 |
|------|------|
| 当前版本 | v1.2.0（侧边栏底部与设置页可见） |
| 更新检测 | 设置页「检查更新」或侧边栏版本块，自动查询 GitHub Releases 最新版 |
| 下载更新 | 检测到新版本后点击链接跳转仓库 Releases 页下载 |
| 升级步骤 | 备份 data/vault.json → 拉取新代码 → `npm install && npm run build` → 重启服务 |

---

## 🛠 技术栈与结构

```
Github-2FA/
├── server/                  # Express API + 加密存储 + TOTP + GitHub 协议
│   ├── index.js             # 路由 / 安全中间件 / 登录限速 / 审计埋点
│   ├── github.js            # CookieJar / 自动登录(密码+2FA) / PAT 创建/列表/撤销 / 会话检测
│   ├── security.js          # 失败锁定 / CSP / 统一错误处理
│   ├── version.js           # 版本号 / GitHub Releases 更新检测
│   ├── crypto.js            # scrypt / AES-256-GCM（零第三方依赖）
│   ├── totp.js              # RFC 6238 TOTP（通过官方测试向量）
│   ├── parser.js            # 文本/JSON 导入解析 + 字段校验
│   ├── store.js             # vault.json 加密存储 / CRUD / 备份 / 导出 / 审计 / 标签
│   ├── auth.js              # 密码校验 / JWT 签发与吊销
│   └── tests/               # 53 个单元测试
├── webui/                   # React 18 + Vite + Tailwind 管理台
│   ├── src/features/accounts/   # 账号列表 / 实时 OTP / 二维码 / 恢复码标记
│   ├── src/features/scan/       # 扫码添加 OTP（摄像头/图片/URI）
│   ├── src/features/github/     # GitHub 会话 / PAT 生成与管理 / 健康检查
│   ├── src/features/import/     # 批量导入
│   ├── src/features/settings/   # 改密 / 备份 / 审计日志 / 更新检测
│   └── tests/               # otpauth 解析测试
└── scripts/dev.mjs          # 开发模式并行启动
```

**技术栈**：Node.js ≥ 22（内置 crypto，零第三方加解密依赖）· Express · React 18 · Vite · Tailwind CSS · lucide-react · jsQR · node:test

---

## 📄 版权信息

**GitHub 2FA Manager** © 2026 [t479842598](https://github.com/t479842598). 保留所有权利。

本项目基于 MIT 许可证发布，欢迎 Fork 与二次开发。请遵守 [GitHub 服务条款](https://docs.github.com/zh/site-policy/github-terms/github-terms-of-service)，仅用于管理您拥有或获授权的账号。**严禁用于任何违法违规用途，因使用本软件产生的任何后果由使用者自行承担。**
