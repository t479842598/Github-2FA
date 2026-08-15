---
spec: '07-00-flagged-accounts'
scene: '02-github-accounts'
created: '2026-08-16'
---

# 07-00 07 00 Flagged Accounts - 任务清单

> 任务由 lrnev `task_create` 工具创建，不要手编。
> 状态机：pending → in_progress → completed / failed；blocked 可回 in_progress；failed 可回 pending 重试。

## 阶段 1

<!-- FILL: 使用 task_create 追加任务；任务会以 `### T-XXX 标题 <!-- lrnev-task: ... -->` 形式追加到这里 -->

## 验收标准（整体）

- <!-- FILL: 按本 Spec 调整整体验收清单 -->
- [ ] 所有任务完成
- [ ] 单元测试通过
- [ ] 集成测试通过

### T-001 固定格式解析与标记标识 <!-- lrnev-task: status=completed, created=2026-08-15T17:15:31.418Z, updated=2026-08-15T17:16:05.911Z, validates=F-01|F-02 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-15T17:16:05.839Z"},{"from":"in_progress","to":"completed","at":"2026-08-15T17:16:05.911Z","reason":"实现并 E2E 验证通过"}] -->

parser 支持 账号----密码----setupkey；store flagged 字段；导入预览标记列

### T-002 导出弹窗与导出被标记 <!-- lrnev-task: status=completed, created=2026-08-15T17:15:31.490Z, updated=2026-08-15T17:16:06.035Z, validates=F-03|F-04 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-15T17:16:05.971Z"},{"from":"in_progress","to":"completed","at":"2026-08-15T17:16:06.035Z","reason":"实现并 E2E 验证通过"}] -->

ExportModal（预览/复制/下载）；/api/export?flagged=1；普通导出弹窗化

### T-003 批量删除被标记账号 <!-- lrnev-task: status=completed, created=2026-08-15T17:15:31.551Z, updated=2026-08-15T17:16:06.158Z, validates=F-05 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-15T17:16:06.097Z"},{"from":"in_progress","to":"completed","at":"2026-08-15T17:16:06.158Z","reason":"实现并 E2E 验证通过"}] -->

POST /api/accounts/flagged/delete + 前端确认弹窗
