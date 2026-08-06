---
spec: '01-00-github-account-vault'
scene: '02-github-accounts'
created: '2026-08-06'
---

# 01-00 Github Account Vault - 设计

## L0 摘要

Node.js Express 后端（JSON 加密存储 + 原生 crypto 实现 scrypt/AES-GCM/TOTP/JWT）+ React/Vite/Tailwind 前端（复用 ds2apiNew 设计系统），单进程零编译依赖。

## L1 概览

### 架构思路

- 单仓库双目录：`server/`（Express API + 数据层）+ `webui/`（React 管理台）
- 零第三方安全依赖：全部用 Node 内置 `crypto` 实现 scrypt 密码哈希、AES-256-GCM 字段加密、HMAC-SHA1 TOTP、HMAC-SHA256 JWT
- 存储为单个 JSON 文件 `data/vault.json`：元数据明文，敏感字段密文（每个字段独立随机 IV）
- 数据密钥由登录密码 + 随机盐 scrypt 派生（`kdf`），改密码时重派生并全量重加密
- 前端展示实时 TOTP 由后端统一生成（批量接口），secret 永不下发前端

### 主要模块

| 模块 | 职责 |
|------|------|
| `server/index.js` | Express 入口、路由挂载、静态服务（生产托管 webui/dist） |
| `server/auth.js` | 密码哈希/校验、JWT 签发/校验中间件、首次设置密码 |
| `server/store.js` | vault.json 读写、账号 CRUD、重加密、备份导出/导入 |
| `server/crypto.js` | scrypt 派生、AES-256-GCM 加解密、随机工具 |
| `server/totp.js` | Base32 解码 + RFC 6238 TOTP 生成 |
| `server/parser.js` | 文本/JSON 导入解析（账号块分割、字段提取、恢复码列表） |
| `webui/src/` | React 管理台：Login / DashboardShell / Accounts / Import / Settings |

### 关键决策

| 决策 | 选项 | 倾向 | 是否产 ADR | 记录 |
|------|------|------|-----------|------|
| 存储 | SQLite vs JSON 文件 | JSON 文件（字段级 AES-GCM，单文件备份即全量） | 是 | ADR-0001 |
| 加密原语 | 第三方库 vs Node crypto | Node crypto 零依赖 | 是 | ADR-0001 |
| TOTP 生成位置 | 前端 vs 后端 | 后端（secret 不下发） | 否 | 安全默认 |

## L2 详情

### 模块详细设计

#### D-01 加密与密钥管理
- 首次设置密码：`scrypt(password, salt, N=16384)` → 32B `dataKey`；`salt` 存 vault.json meta
- 每次加密字段：随机 12B IV + AES-256-GCM 密文 + authTag，存 `enc:{iv,ct,tag}` 结构
- JWT 密钥：独立随机 32B 存 meta（`jwtSecret`），HMAC-SHA256 签名，7 天过期
- 修改密码：旧密码校验 → 新密码重派生 dataKey → 遍历所有账号重加密全部敏感字段
- 字段级解密按需进行，仅 /accounts/:id/full 与 /otps 会解密

#### D-02 TOTP 生成（RFC 6238）
- `totp(secretBase32, step=30, digits=6)`：Base32 解码（去空格/小写归一）→ 8 字节大端 counter → HMAC-SHA1 → 动态截断取 31 位 → mod 10^6 补零
- 批量接口 `GET /api/otps`：遍历账号解密 secret（优先 otpauth URI 内 secret，其次 setup key），返回 `{id: {code, remaining}}`
- 倒计时由前端本地 tick（每秒），remaining=0 时重新拉取

#### D-03 导入解析器
- 文本块分割：按 `─` 分隔线（连续 4+ 个）或连续空行切块
- 每块内逐行匹配 `键: 值`（键支持：账号/用户名、邮箱、密码、setup key/密钥、otpauth、PAT/令牌、备注），`恢复码:` 后连续缩进行收集为恢复码数组
- otpauth URI 解析：提取 `secret=` 参数作为 TOTP secret 优先值；secret 缺失时回退 setup key
- 输出规范化账号对象 `{username, email, password, setupKey, otpauth, secret, recoveryCodes[], pat, remark}`
- 兼容 JSON 数组（字段名同键或英文驼峰），按 username 去重（已存在则跳过并计入 skipped）

#### D-04 API 契约
- `GET /api/status` → `{setup: bool}`（免鉴权，仅判断是否已设密码）
- `POST /api/setup` {password} → 首次设置密码，返回 token
- `POST /api/login` {password} → {token}
- 以下全部需 `Authorization: Bearer <jwt>`：
  - `GET /api/accounts` → 列表（不含敏感明文，仅 `hasSecret/hasPat` 布尔）
  - `GET /api/otps` → 全部账号当前 TOTP + remaining
  - `GET /api/accounts/:id/full` → 完整解密凭据
  - `POST /api/accounts` → 手动添加
  - `POST /api/import` {text?|file} → 解析 + 入库，返回 {imported, skipped, errors}
  - `PUT /api/accounts/:id` → 编辑（含 pat 字段）
  - `DELETE /api/accounts/:id`
  - `POST /api/change-password` {oldPassword, newPassword}
  - `GET /api/backup` → 加密备份 JSON 下载
  - `POST /api/backup/import` {backup, password} → 用密码解出 dataKey 后整体还原
- 错误统一 `{detail}` JSON，401 触发前端登出

#### D-05 前端结构（复用 ds2apiNew 设计系统）
- `styles.css` 完整移植 DS2API 设计令牌（slate 深色 + 琥珀 accent + light/dark 主题），tailwind.config 同款 CSS 变量映射
- `Login.jsx`：首次为"设置密码"，已设置则密码登录，卡片布局 + 主题切换
- `DashboardShell.jsx`：侧边栏（账号/导入/设置 + 统计卡 + 退出）+ 顶栏标题区
- Accounts 页：搜索、列表行（TOTP 大字 mono + 倒计时进度条 + 复制）、行展开详情（掩码 + 显示明文 + 复制）、编辑弹窗（含 PAT）、删除确认
- Import 页：文本域粘贴 + 文件上传 + 解析预览表格 + 确认导入
- Settings 页：修改密码、导出备份、导入备份（需密码）

### 数据模型

```json
{
  "meta": { "version": 1, "salt": "<hex>", "jwtSecret": "<hex>", "createdAt": 0 },
  "accounts": [
    {
      "id": "uuid",
      "username": "tqH8iLZ7VEV9",
      "email": "<enc>", "password": "<enc>", "setupKey": "<enc>",
      "otpauth": "<enc>", "recoveryCodes": "<enc>",
      "pat": "<enc>", "remark": "<enc>",
      "hasSecret": true, "hasPat": false,
      "createdAt": 0, "updatedAt": 0
    }
  ]
}
```

`<enc>` 结构：`{ iv: hex, ct: hex, tag: hex }`。解密失败（密钥不符）时该字段按 `__decrypt_failed__` 处理并在接口中标记。

### 接口契约

见 D-04；前后端联调：dev 模式 vite proxy `/api` → `http://localhost:3000`；生产由 Express 托管 `webui/dist`。

### 错误处理

- 解密失败：单字段置 `__decrypt_failed__` 并返回 warning 标记，不整体 500
- 导入解析：逐块容错，坏块收集进 `errors` 数组，不中断整批
- TOTP 无 secret：账号行显示"未配置 2FA"
- 备份导入：密码错误或结构非法 → 400 + 明确提示，导入前自动备份当前数据

### 测试策略

- `server/totp.test.mjs`：与标准 TOTP 已知向量对拍（RFC 6238 附录 B 用例）
- `server/parser.test.mjs`：用户提供的三段示例文本解析断言（字段完整、恢复码 16 条）
- `server/crypto.test.mjs`：加密→解密往返、错误密钥解密失败
- 手工 e2e：启动服务 → 设置密码 → 导入 → 查看 OTP → 改密码 → 备份导出/导入
