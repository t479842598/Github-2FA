---
id: preferences-81b9eeac9f21
category: preferences
scope: global
source: reasonix 迁移（~/.reasonix/memory/global）
created: '2026-08-11T10:17:18.949Z'
reference_count: 0
---

Git push/pull 或 curl 访问 GitHub 时直连 443 失败（HTTP2 framing layer / Couldn't connect），须用本地代理 http://127.0.0.1:7897：git -c http.proxy=http://127.0.0.1:7897 push origin main；也可配置仓库级 git config http.proxy http://127.0.0.1:7897 持久生效。沙箱内访问外部服务（models.dev、openai API 等）同样受网络限制，需用户本机验证。
