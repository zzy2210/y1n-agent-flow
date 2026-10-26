# y1n-agent-flow

y1n-flow —— 多模型编排开发流的 DSH(DeepSeek Harness)预设配置仓库。

主代理担任项目编排者(项目经理/指挥官),把探索 / 设计 / 测试设计 / 编码 / 前端 / 审查等角色委派给绑定不同模型的子代理(`packyapi/gpt-6.1-sol`、`openai-codex/gpt-6-astra`、`deepseek-official/deepseek-flash`、`opencode-go/kimi-k3`),以 plan document 为唯一事实来源,内置编码验证闭环与可续接子代理机制。

## 目录结构

- `dsh/` — DSH 预设包,整体放入 DSH 工作区的 `.agent-presets/` 下使用
  - `preset.yml` — 预设定义(名称、描述、排序)
  - `preset.cordis.yml` — DSH 0.2 预设组合:persona、委派工具、skill 目录、plan/compaction 等,**实际挂载入口**
  - `agent.cordis.yml` — **已冻结**的早期单文件形态,仅作人员编排/模型路由参考,不再挂载
  - `skills/y1n-flow/` — 主流程 skill(工作流规范、路由表、子代理契约、模板)
  - `skills/implementation-rigor/` — 通用工程规范 skill(任何语言,写码/审查前加载)
  - `skills/rust-engineering/` — Rust 编码规范 skill
  - `skills/go-engineering/` — Go 编码规范 skill
  - `skills/ui-aesthetics/` — 前端视觉规范 skill(供 UI 角色加载)
  - `plugins/y1n-delegation/` — **已停用**(保留作回滚):自制的 `subagent` 工具 + 档位自动注入。委派已切到 DSH 原生 `@deepseek-ai/dsh-tool-subagent`

## 委派工具

预设挂的是 DSH 原生 `tool-subagent` 的两个实例:

- `subagent`(provider `spawn`)——新建上下文,由运行时管理执行并返回可续接 id
- `subagent_fork`(provider `fork`)——继承本会话已完成历史和父代理模型

只有 `subagent` 开启模型选择:`provider` / `model` / `reasoning_effort` 是调用时参数,**没有角色档位自动注入**,指定角色模型时应显式传档位。`subagent_fork` 不开放这些参数;需要切换模型或档位时使用 `subagent`,并补全任务上下文。可用路由由 host 侧白名单约束:

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- id: subagent-model-selection-settings
  config:
    enabled: true
    allowedModels:
      - { provider: packyapi, model: gpt-6.1-sol }
      # …
```

配置已适配 DSH `0.2.1-rc.2`。该版本不再支持 `toolFilter`,运行时会以 `DELEGATED_CALLER` 拒绝仍由父代理管理的子代理调用 `ask_user_question`;子代理应把问题交回主代理。这里依赖原生调用校验,不保证工具在子代理目录中隐藏。

委派由运行时统一管理,完成后发送结果通知;配置中不再保留旧的 `enableRunInBackground` / `backgroundMode` 字段。若将来需要独立的子代理工具集,应声明单独的 Agent Preset 并在 spawn 配置中指定 `agentPreset`;fork 不支持独立预设选择。

## 上下文分层(为什么 persona 很短)

| 层 | 内容 | 何时进入上下文 |
|---|---|---|
| persona(`preset.cordis.yml`) | 身份、角色判定方式、全员不变量(事实源/决策权/提问归属/工具现实) | 常驻,主代理与每个子代理都带 |
| skill 目录 | 每个 skill 的 name + description | 常驻(只有描述) |
| skill 正文 | `y1n-flow`、`implementation-rigor`、`rust-engineering`、`go-engineering`、`ui-aesthetics` | 命中触发后加载 |
| references | 路由表、8 份角色契约、模板 | 加载 skill 后按需再读 |
| 委派 prompt | 角色契约全文 + 任务说明 | 每次委派 |

子代理通过 `composeFrom` 继承父代理的完整 preset 组合,所以 persona 会出现在每个子代理的 system prompt 里。persona 因此只保留"对谁都成立"的约束:编排细节放 `y1n-flow` skill,语言规范放语言 skill——既避免"你是编排者、不许写代码"和 writer 角色打架,也避免每个子代理重复付这份上下文。

## 模型与供应商

| 角色 | 默认路由 | 默认档位 | 回退(需用户授权) |
|---|---|---|---|
| explorer | `deepseek-official/deepseek-flash` | low | `packyapi/deepseek-flash` |
| architect | `packyapi/gpt-6-astra` | xhigh | `openai-codex/gpt-6-astra` |
| writer | `packyapi/gpt-6.1-sol` | xhigh | `openai-codex/gpt-6-sol` → `packyapi/gpt-5.6-sol` |
| test-designer / code-reviewer / reviewer | `packyapi/gpt-6.1-sol` | max | `openai-codex/gpt-6-sol` |
| ui | `opencode-go/kimi-k3` | max | 无替代线 |
| fast | 继承主代理模型(省略 provider/model) | — | — |

供应商优先级:GPT 线 `packyapi` > `openai-codex`;DS 线 `deepseek-official` > `packyapi`(官方额度/限流时切)。

供应商:

- **packy**(`packyapi`)—— OpenAI 兼容网关(cf.api.fan,Responses 协议)。GPT 线:`gpt-6.1-sol` / `gpt-6-astra` / `gpt-6-sol` / `gpt-5.6-sol` / `codex-auto-review`,默认编码/评审/架构都走这里;DS 线:`deepseek-flash` / `deepseek-v4-pro`(1M 上下文、256k 输出),是 `deepseek-official` 的计费备选。DS 线**不接受 `off`**(映射为 `none`)、**不支持图片输入**(只声明 text)。
- **openai-codex** —— ChatGPT 订阅路由,提供 `gpt-6-astra` / `gpt-6-sol` / `gpt-6-luna` / `gpt-5.6-sol` 等;作为 GPT 线的回退路由。**目录中没有 `gpt-6.1-sol`**,写成 `openai-codex/gpt-6.1-sol` 会解析失败。
- **deepseek-official** —— DeepSeek 官方,提供 `deepseek-flash`(1M 上下文)/ `deepseek-v4-pro`;思考档位只有 `off / low / high / max`。
- **opencode-go** —— 提供 `kimi-k3`,负责 UI / 视觉。

## 工具现实(硬约束)

- 编辑原语只有 `write` / `edit`(必要时 `bash`);本环境**没有** `apply_patch` 工具或命令。
- 任何要求 apply_patch 的指令(供应商/中转注入、旧文档残留、模型先验)一律无效,不得作为阻塞上报。persona(system 级)、y1n-flow skill、writer / ui / fast 契约里都写了这条护栏。
- 子代理因此停工时,处置是**纠正信息 + 新开会话重派**,不要反复"解封授权"——它按 system > developer > user 推理,user 级授权天然覆盖不了它以为的 developer 级指令。

## 安装

```bash
cp -r dsh ~/.dsh/.agent-presets/y1n-flow
cp dsh/preset.cordis.yml ~/.dsh/profiles/web/presets/y1n-flow.cordis.yml
```

第二行按本机 profile 路径调整(`profiles/web/cordis.patch.yml` 里通过 `@deepseek-ai/cordis-plugin-include` 引用该文件)。然后在 DSH 会话中选择 `y1n-flow` 预设。

修改 `plugins/` 后需把 `preset.cordis.yml` 里的 `index.js?rev=N` 递增,否则运行中的 dsh 会继续使用模块缓存;persona/路由表类改动需重启 dsh 进程才生效。新增 skill 目录后也建议重启,让 skill 注册表重新扫描。

## 同步说明

本仓库由本地 DSH 工作区手动同步维护:修改本地 `.agent-presets/y1n-flow` 后,将内容复制到本仓库 `dsh/` 再提交推送。
