---
id: patterns-025d26d45c4e
category: patterns
scope: global
source: 05-00 spec 实现
created: '2026-08-15T16:36:36.877Z'
reference_count: 0
---

GitHub 封号检测三信号：① PAT 调 api.github.com/user（403+suspended=被封）② 会话主页文本含 suspended 横幅 ③ 兜底公开资料页 github.com/{username} 404=被封。公开页 404 无法区分被封/删除/改名，统一归 banned。批量检测每账号间隔 600ms 防限流，24h 缓存实现每天检测一次。
