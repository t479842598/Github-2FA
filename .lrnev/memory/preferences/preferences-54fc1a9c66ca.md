---
id: preferences-54fc1a9c66ca
category: preferences
scope: global
source: reasonix 迁移（~/.reasonix/memory/global）
created: '2026-08-11T10:17:19.056Z'
reference_count: 0
---

VPS 部署任何新项目时不可影响其他运行中的项目：绝不可停止或修改 nginx（所有站点入口）；新项目通过新增 nginx server block + certbot SSL 反代到本地端口；端口冲突用不冲突的本地端口，不抢占 80/443；新服务用 systemd 管理，不替换已有服务；部署前先用 ss -tlnp 检查端口占用；改 nginx 配置后必须 nginx -t 验证再 reload。
