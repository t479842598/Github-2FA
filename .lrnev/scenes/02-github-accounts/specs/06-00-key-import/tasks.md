---
spec: '06-00-key-import'
scene: '02-github-accounts'
created: '2026-08-15'
---

# 06-00 06 00 Key Import - 任务清单

> 任务由 lrnev `task_create` 工具创建，不要手编。
> 状态机：pending → in_progress → completed / failed；blocked 可回 in_progress；failed 可回 pending 重试。

## 阶段 1

<!-- FILL: 使用 task_create 追加任务；任务会以 `### T-XXX 标题 <!-- lrnev-task: ... -->` 形式追加到这里 -->

## 验收标准（整体）

- <!-- FILL: 按本 Spec 调整整体验收清单 -->
- [ ] 所有任务完成
- [ ] 单元测试通过
- [ ] 集成测试通过

### T-001 key 解析与保存到授权记录 <!-- lrnev-task: status=completed, created=2026-08-15T15:57:53.386Z, updated=2026-08-15T16:33:06.642Z, validates=F-01|F-02|F-03 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-15T15:58:54.191Z"},{"from":"in_progress","to":"completed","at":"2026-08-15T16:33:06.642Z","reason":"实现并验证通过"}] -->

parser 新增 parseKeyList()；/api/import/keys 保存到对应账号授权记录（同名同key跳过/不同加日期标注/账号不存在提示）

### T-002 导入页 opencode/freebuff 密钥模块 <!-- lrnev-task: status=completed, created=2026-08-15T15:57:53.444Z, updated=2026-08-15T16:35:42.813Z, validates=F-04 -->
<!-- lrnev-task-history: [{"from":"pending","to":"in_progress","at":"2026-08-15T16:35:42.754Z"},{"from":"in_progress","to":"completed","at":"2026-08-15T16:35:42.813Z"}] -->

导入页模块切换，opencode/freebuff 共用组件，预览与结果统计
