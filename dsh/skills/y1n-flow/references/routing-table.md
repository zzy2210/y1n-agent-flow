# y1n-flow 路由表(DSH 版)

## 意图 → 角色 → 模型行

| 用户意图关键词 | 角色 | 默认模型行(工具) | 说明 |
|---|---|---|---|
| 看、查、探、找、搜、读、列、现状、结构、在哪 | explorer | `subagent_gpt54`(gpt-5.4) | 只读探索、代码现状、资料检索 |
| commit、diff、log、历史、提交记录、hash、blame | explorer | `subagent_gpt54`(gpt-5.4) | 优先使用只读 git 命令读取提交和历史事实 |
| 设计、方案、架构、拆、规划、取舍、怎么做 | architect | `subagent_gpt56`(gpt-5.6-sol) | 架构设计、执行拆解、原始设计材料 |
| UI、界面、前端视觉、美化、改样式、交互优化、产品感、精致、好看 | ui | `subagent_kimi3`(kimi-k3) | 前端视觉与交互优化,加载 `ui-aesthetics` skill |
| 写、实现、改、修、加、删、重构、落地、编码 | writer | `subagent_gpt56`(gpt-5.6-sol) | 编码实现、修复问题、补测试 |
| 快改、快修、小改、局部修补、fast | fast | `subagent`(继承主代理模型) | 小范围快速修改,适合明确、局部、低风险任务 |
| 测试设计、测试方案、BDD、Given/When/Then | test-designer | `subagent_gpt56`(gpt-5.6-sol) | 只写测试设计材料,不写代码;先确认 BDD=开启 |
| 审代码、评审代码、review 代码、代码 review | code-reviewer | `subagent_gpt56`(gpt-5.6-sol) | 审变更,找真正重要的问题,给通过/不通过 |
| 审方案、评审方案、审文档、review 文档 | reviewer | `subagent_gpt56`(gpt-5.6-sol) | 偏差审查(raw vs polished),只报告不改稿 |

## 控制指令 → 开关

| 用户表达 | 开关 | 说明 |
|---|---|---|
| 连续执行 / 自动往下走 / 不用每阶段确认 | 连续执行=开启 | 阶段间不再暂停等确认,但仍遵守强制暂停条件 |
| 阶段暂停 / 每阶段确认 / 做完先停 | 连续执行=关闭 | 恢复默认 |
| 要测试 / 走 BDD / 先设计测试 | BDD=开启 | 语义是"测试设计先行开关";在设计/执行阶段引入 test-designer 子任务 |
| 不用测试设计 / 先别写测试 | BDD=关闭 | 恢复默认 |
| mixed / 前后端都要改 | 强制拆分 | ui + writer,声明写入范围并做冲突锁 |
| 只改前端 | 锁定 ui | 禁止顺手改后端 |
| 只改后端 | 锁定 writer | 禁止顺手改前端 |
| 用 kimi / 用轻量模型 / 用重模型 / 用当前模型 | 切换模型行 | 对应 `subagent_kimi3` / `subagent_gpt54` / `subagent_gpt56` / `subagent` |

## 路由原则

1. 需要知道当前事实、代码位置、外部资料时,用 explorer。
2. 需要方案取舍、阶段拆分、风险分析时,用 architect。
3. 需要做前端界面、视觉、排版、交互细节优化时,用 ui。
4. 需要实际改代码时,用 writer。
5. 需要做小范围、明确、低风险的快速修改时,用 fast。
6. 需要先定义测试边界和 Given/When/Then 时,用 test-designer(仅 BDD=开启)。
7. 编码完成后,用 code-reviewer 走验证闭环。
8. 担心润色改歪了原始材料时,用 reviewer 做偏差校验。

## 组合与顺序规则

- 如果同一轮里既有"查现状"又有"想方案",先 explorer,后 architect。
- 如果用户明确要看某个 commit、hash、diff、提交文件列表,优先 explorer,不要绕过 git 去猜。
- 如果用户明确说"允许执行",且方案已明确,可直接进入 writer 或先 test-designer。

## 多子任务拆分(mixed stage)

1. 阶段同时涉及前端与后端时,必须拆:
   - 前端设计子任务 → ui(产出视觉方案、组件规格、交互定义)
   - 后端子任务 → writer
   - 前端实现:
     - ui 直接实现(适合设计驱动的改动,ui 可一并完成设计与实现)
     - 或 writer 基于 ui 的设计产物实现(适合可靠性优先的编码任务;writer 收到设计产物后方可执行前端编码,不可自主做设计决策)
2. 如果存在共享写入点(接口 schema、共享类型、生成代码、共用契约文件等),必须额外拆出 `shared` 子任务,默认交给 writer,并与前后端串行(避免顺序错乱)。
3. 每个子任务必须声明写入范围;同一文件或祖先/子孙目录不可并发。

## 模型行选择提示

- 默认按上表选择模型行;用户明确指定模型时,遵循用户指令切换工具行。
- 某条模型行失败时,改派其他可用模型行完成同一角色任务,并向用户报告。
- fast 角色恒用 `subagent`(继承主代理模型),以匹配"当前对话模型直接下场快速修补"的语义。

## 推理档位(自动注入)

preset 自带插件为委派子代理按模型注入推理档位,无需手动指定:

| 模型 | 自动档位 | 用途定位 |
|---|---|---|
| openai/gpt-5.6-sol | max | 思考类:设计、编码、评审 |
| opencode-go/kimi-k3 | max | 思考类:UI/视觉 |
| deepseek-official/deepseek-v4-pro | max | 思考类:继承行(fast/重活) |
| openai/gpt-5.4 | medium | 搜索类:探索、查资料 |

- 用户显式选择/持久化配置的档位优先,插件不覆盖。
- 主代理自身的档位由会话模型选择决定,插件不干预。
- 如需调整档位,编辑 `plugins/y1n-reasoning/index.js` 的 `EFFORT_BY_ROUTE` 表。

## 路由提示格式

调用子代理前,先输出一行提示:

```text
[路由] architect · subagent_gpt56 · gpt-5.6-sol
```

- 用 `subagent`(继承)时: `[路由] fast · subagent · 继承主代理模型`
- 用 `subagent_kimi3` 时: `[路由] ui · subagent_kimi3 · kimi-k3`
