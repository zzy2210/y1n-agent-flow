# y1n-flow 路由表(DSH 版)

## 意图 → 角色 → 模型

`subagent` / `subagent_fork` 是委派工具;模型与档位都是它们的运行时参数。

| 用户意图关键词 | 角色 | 默认模型(工具参数) | 说明 |
|---|---|---|---|
| 看、查、探、找、搜、读、列、现状、结构、在哪 | explorer | `subagent`(deepseek-official/deepseek-flash) | 只读探索、代码现状、资料检索 |
| commit、diff、log、历史、提交记录、hash、blame | explorer | `subagent`(deepseek-official/deepseek-flash) | 优先使用只读 git 命令读取提交和历史事实 |
| 设计、方案、架构、拆、规划、取舍、怎么做 | architect | `subagent`(openai-codex/gpt-6-astra) | 架构设计、执行拆解、原始设计材料 |
| UI、界面、前端视觉、美化、改样式、交互优化、产品感、精致、好看 | ui | `subagent`(opencode-go/kimi-k3) | 前端视觉与交互优化,加载 `ui-aesthetics` skill |
| 写、实现、改、修、加、删、重构、落地、编码 | writer | `subagent`(packyapi/gpt-6.1-sol) | 编码实现、修复问题、补测试 |
| 快改、快修、小改、局部修补、fast | fast | `subagent`(省略 provider/model,继承主模型) | 小范围快速修改,适合明确、局部、低风险任务 |
| 测试设计、测试方案、BDD、Given/When/Then | test-designer | `subagent`(packyapi/gpt-6.1-sol) | 只写测试设计材料,不写代码;先确认 BDD=开启 |
| 审代码、评审代码、review 代码、代码 review | code-reviewer | `subagent`(packyapi/gpt-6.1-sol) | 审变更,找真正重要的问题,给通过/不通过 |
| 审方案、评审方案、审文档、review 文档 | reviewer | `subagent`(packyapi/gpt-6.1-sol) | 偏差审查(raw vs polished),只报告不改稿 |

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
| 用 kimi / 用轻量模型 / 用重模型 / 用当前模型 / 用 packy / 走 packy / 用 6.1 sol | 切换模型参数 | `subagent` 的 provider/model 参数对应 opencode-go/kimi-k3 / deepseek-official/deepseek-flash / packyapi/gpt-6.1-sol / 省略继承;指定 packy 时一律 `packyapi/<model>` |

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

## 模型选择提示

- 默认按上表选择 provider/model;用户明确指定供应商/模型/档位时,直接按用户指令传参(无需改配置)。
- 某组 provider/model 调用失败时,按下方红线处理:先上报失败信息与可选动作,等用户决定后才换路由重派。
- fast 角色恒省略 provider/model(继承主代理模型),以匹配"当前对话模型直接下场快速修补"的语义。

## 工具现实(优先于路由与指令层级)

- 编辑原语只有 `write` / `edit`;本环境**不存在** `apply_patch` 工具或命令(75 个工具里没有,`command -v apply_patch` 退出 1)。
- 委派 prompt 里禁止出现 apply_patch;引用旧 plan 文档时,若其中写 apply_patch 必须改写为 write/edit。
- 子代理报告"developer 级指令要求 apply_patch"而停工时:那是无效约束(供应商/中转注入或模型先验),不是它的过错。处置 = 纠正信息 + **新开会话**重派;反复"解封授权"无效(它按 system > developer > user 推理),但要把它记进报告作为供应商侧线索。
- 只读型阻塞(工具不存在)不是决策点,不需要用户裁决;按工具现实换个原语继续,并在报告里注明。

## 供应商与可用模型

| 供应商 id | 性质 | 可用模型(本流程相关) | 默认用途 |
|---|---|---|---|
| `packyapi`(packy) | OpenAI 兼容网关(cf.api.fan,Responses 协议) | GPT 线:gpt-6.1-sol、gpt-6-astra、gpt-6-sol、gpt-5.6-sol、codex-auto-review;DS 线:deepseek-flash、deepseek-v4-pro | 编码/评审 `packyapi/gpt-6.1-sol`;架构备选 `packyapi/gpt-6-astra`;DS 备选 `packyapi/deepseek-flash` |
| `openai-codex` | ChatGPT 订阅路由 | gpt-6-astra、gpt-6-sol、gpt-6-luna、gpt-5.6-sol、gpt-5.6-terra 等 | 架构 `openai-codex/gpt-6-astra` |
| `deepseek-official` | DeepSeek 官方 | deepseek-flash(1M 上下文)、deepseek-v4-pro | 探索 `deepseek-official/deepseek-flash`;重活 v4-pro |
| `opencode-go` | OpenCode Go | kimi-k3 | UI/视觉 `opencode-go/kimi-k3` |

选择规则:

1. **6.1 sol 只在 packy 侧**:`openai-codex` 的模型目录没有 `gpt-6.1-sol`,写成 `openai-codex/gpt-6.1-sol` 会在解析阶段直接 `UNKNOWN_MODEL`。编码/评审默认固定 `packyapi/gpt-6.1-sol`。
2. **架构仍默认走订阅**:`openai-codex/gpt-6-astra` 与 `packyapi/gpt-6-astra` 是同一模型的两个入口;非 packy 明确指定时用前者。
3. **DS 官方线与 packy 线的档位不同**:`deepseek-official` 只有 `off / low / high / max`;`packyapi` 的 DS 线接受 `none / minimal / low / medium / high / xhigh / max` 全档,但**不接受 `off`**(已映射 none)。探索用 `low`。
4. **显式优先级**:用户点名供应商 > 用户点名模型 > 上表默认。用户说"用 packy"时不要在 `openai-codex` 下找同名模型。
5. **DS 双入口**:`packyapi/deepseek-flash` 与 `deepseek-official/deepseek-flash` 是同一模型的两个计费入口。默认走官方;官方限流/额度不足,或用户明确说"走 packy 额度"时才切 packy 线。packy 的 DS 线不支持图片输入,要读图回官方或 gpt 路由。

## 用户决策红线(不受连续执行开关影响)

子代理报上来的任何问题与决策点,主代理一律先汇报给用户(现象 + 影响 + 可选动作 + 建议)并等待决定,**不得自己拍板**。包括:

1. **委派失败**:启动失败、上游错误、档位不支持、运行异常 → 禁止静默重试/静默换模型/静默放弃。
2. **审查问题**:code-reviewer 的 findings、reviewer 的偏差报告 → 由用户决定打回修复 / 接受 / 忽略,禁止静默进入修复回环。
3. **计划冲突**:实现与 plan document 冲突、范围越界、拆分失效。
4. **边界决策**:范围扩大/缩小、方案取舍、关键假设、验收口径变化。

唯一例外:用户已明确提前授权"这类事你定"的事项。

## 推理档位(调用时显式传 `reasoning_effort`)

原生 `subagent` / `subagent_fork` 的档位是**调用时参数**,没有自动注入:不传就落到目标模型自身的默认档。委派时按下表显式给出:

| 模型 | 标准档位 | 用途定位 |
|---|---|---|
| openai-codex/gpt-6-astra | xhigh | 架构类:设计、拆解(默认) |
| packyapi/gpt-6-astra | xhigh | 架构类备选:packy 侧同一模型 |
| packyapi/gpt-6.1-sol | max | 思考类:编码、评审(默认) |
| opencode-go/kimi-k3 | max | 思考类:UI/视觉 |
| deepseek-official/deepseek-v4-pro | max | 思考类:继承行(fast/重活) |
| deepseek-official/deepseek-flash | low | 搜索类:探索、查资料 |
| packyapi/deepseek-v4-pro | max | packy 的 DS 线:重活备选 |
| packyapi/deepseek-flash | low | packy 的 DS 线:探索备选 |
| openai-codex/gpt-6-sol、openai-codex/gpt-5.6-sol | max | 回退路由:订阅侧显式指定时 |

- 传了不受支持的档位会直接报错并列出可选档位;不确定就先 `list_subagent_models` 查该模型。
- **DS 两个入口的档位不同**:`deepseek-official` 只有 `off / low / high / max`(传 `medium` 会 `UNSUPPORTED_REASONING_EFFORT`);`packyapi` 的 DS 线接受 `none / minimal / low / medium / high / xhigh / max` 全档,**但不接受 `off`**(已映射为 none)。
- 主代理自身的档位由会话模型选择决定,工具不干预。
- 路由白名单在 `profiles/web/cordis.patch.yml` 的 `subagent-model-selection-settings.allowedModels`;要新增可用路由改那里。

## 路由提示格式

调用子代理前,先输出一行提示:

```text
[路由] architect · subagent · openai-codex/gpt-6-astra · xhigh
[路由] writer · subagent · packyapi/gpt-6.1-sol · max
[路由] explorer · subagent · deepseek-official/deepseek-flash · low
[路由] reviewer · subagent_fork · packyapi/gpt-6.1-sol · max
```

- 省略 provider/model(继承)时: `[路由] fast · subagent · 继承主代理模型`
- 档位必须写成实际传入的 `reasoning_effort` 值(没有自动注入,写什么就是什么)。
