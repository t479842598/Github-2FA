---
spec: '05-00-account-banned-status'
scene: '02-github-accounts'
created: '2026-08-15'
---

# 05-00 05 00 Account Banned Status - 任务清单

> 任务由 lrnev `task_create` 工具创建，不要手编。
> 状态机：pending → in_progress → completed / failed；blocked 可回 in_progress；failed 可回 pending 重试。

## 阶段 1

<!-- FILL: 使用 task_create 追加任务；任务会以 `### T-XXX 标题 <!-- lrnev-task: ... -->` 形式追加到这里 -->

## 验收标准（整体）

- <!-- FILL: 按本 Spec 调整整体验收清单 -->
- [ ] 所有任务完成
- [ ] 单元测试通过
- [ ] 集成测试通过

### T-001 封号探测与状态持久化 <!-- lrnev-task: status=completed, created=2026-08-15T15:57:43.270Z, updated=2026-08-15T16:33:06.473Z, validates=F-01|F-02 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-15T15:58:54.132Z"},{"from":"in_progress","to":"completed","at":"2026-08-15T16:33:06.473Z","reason":"实现并验证通过"}] -->

github.js 新增 checkBanned()，store 新增 banned/bannedCheckedAt 字段并持久化

### T-002 批量封号检测 API <!-- lrnev-task: status=completed, created=2026-08-15T15:57:43.326Z, updated=2026-08-15T16:35:42.580Z, validates=F-03 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-15T16:35:42.518Z"},{"from":"in_progress","to":"completed","at":"2026-08-15T16:35:42.580Z"}] -->

POST /api/accounts/banned-check，24h 缓存 + force 强制，600ms 限流间隔

### T-003 账号列表筛选排序与自动检测 <!-- lrnev-task: status=completed, created=2026-08-15T15:57:43.381Z, updated=2026-08-15T16:35:42.696Z, validates=F-04 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-15T16:35:42.639Z"},{"from":"in_progress","to":"completed","at":"2026-08-15T16:35:42.696Z"}] -->

前端状态徽章/筛选下拉/封号排最后/自动触发与手动重检
