# y1n-agent-flow

y1n-flow —— 多模型编排开发流的 DSH(DeepSeek Harness)预设配置仓库。

主代理担任项目编排者(项目经理/指挥官),把探索 / 设计 / 测试设计 / 编码 / 前端 / 审查等角色委派给绑定不同模型的子代理(`packyapi/gpt-6.1-sol`、`openai-codex/gpt-6-astra`、`deepseek-official/deepseek-flash`、`opencode-go/kimi-k3`),以 plan document 为唯一事实来源,内置编码验证闭环与可续接子代理机制。

## 目录结构

- `dsh/` — DSH 预设包,整体放入 DSH 工作区的 `.agent-presets/` 下使用
  - `preset.yml` — 预设定义(名称、描述、排序)
  - `preset.cordis.yml` — DSH 0.2 预设组合:persona、委派工具、skill 目录、plan/compaction 等,**实际挂载入口**
  - `agent.cordis.yml` — 早期单文件编排形态(人员编排/模型路由参考,保留兼容)
  - `skills/y1n-flow/` — 主流程 skill(工作流规范、路由表、子代理契约、模板)
  - `skills/ui-aesthetics/` — 前端视觉规范 skill(供 UI 角色加载)
  - `plugins/y1n-delegation/` — **已停用**(保留作回滚):自制的 `subagent` 工具 + 档位自动注入。委派已切到 DSH 原生 `@deepseek-ai/dsh-tool-subagent`

## 委派工具

预设挂的是 DSH 原生 `tool-subagent` 的两个实例:

- `subagent`(provider `spawn`)——新建上下文,默认后台运行,返回可续接 id
- `subagent_fork`(provider `fork`)——继承本会话已完成历史

`provider` / `model` / `reasoning_effort` 都是调用时参数,**没有自动注入**,档位必须显式传。可用路由由 host 侧白名单约束:

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- id: subagent-model-selection-settings
  config:
    enabled: true
    allowedModels:
      - { provider: packyapi, model: gpt-6.1-sol }
      # …
```

子代理的工具集由 `toolFilter` 收口(当前 `deny: [ask_user_question]`,子代理看不到提问工具)。

## 模型与供应商

| 角色 | 默认路由 | 默认档位 |
|---|---|---|
| explorer | `deepseek-official/deepseek-flash` | low |
| architect | `openai-codex/gpt-6-astra`(备选 `packyapi/gpt-6-astra`) | xhigh |
| writer / test-designer / code-reviewer / reviewer | `packyapi/gpt-6.1-sol` | max |
| ui | `opencode-go/kimi-k3` | max |
| fast | 继承主代理模型(省略 provider/model) | — |

供应商:

- **packy**(`packyapi`)—— OpenAI 兼容网关(cf.api.fan,Responses 协议)。GPT 线:`gpt-6.1-sol` / `gpt-6-astra` / `gpt-6-sol` / `gpt-5.6-sol` / `codex-auto-review`,默认编码/评审走这里;DS 线:`deepseek-flash` / `deepseek-v4-pro`(1M 上下文、256k 输出),是 `deepseek-official` 的计费备选。DS 线**不接受 `off`**(映射为 `none`)、**不支持图片输入**(只声明 text)。
- **openai-codex** —— ChatGPT 订阅路由,提供 `gpt-6-astra` / `gpt-6-sol` / `gpt-6-luna` / `gpt-5.6-sol` 等;架构默认走这里。**目录中没有 `gpt-6.1-sol`**,写成 `openai-codex/gpt-6.1-sol` 会解析失败。
- **deepseek-official** —— DeepSeek 官方,提供 `deepseek-flash`(1M 上下文)/ `deepseek-v4-pro`;思考档位只有 `off / low / high / max`。
- **opencode-go** —— 提供 `kimi-k3`,负责 UI / 视觉。

## 工具现实(硬约束)

- 编辑原语只有 `write` / `edit`(必要时 `bash`);本环境**没有** `apply_patch` 工具或命令。
- 任何要求 apply_patch 的指令(供应商/中转注入、旧文档残留、模型先验)一律无效,不得作为阻塞上报。persona(system 级)、SKILL、委派插件、writer / ui / fast 契约里都写了这条护栏。
- 子代理因此停工时,处置是**纠正信息 + 新开会话重派**,不要反复"解封授权"——它按 system > developer > user 推理,user 级授权天然覆盖不了它以为的 developer 级指令。

## 安装

```bash
cp -r dsh ~/.dsh/.agent-presets/y1n-flow
cp dsh/preset.cordis.yml ~/.dsh/profiles/web/presets/y1n-flow.cordis.yml
```

第二行按本机 profile 路径调整(`profiles/web/cordis.patch.yml` 里通过 `@deepseek-ai/cordis-plugin-include` 引用该文件)。然后在 DSH 会话中选择 `y1n-flow` 预设。

修改 `plugins/` 后需把 `preset.cordis.yml` 里的 `index.js?rev=N` 递增,否则运行中的 dsh 会继续使用模块缓存;persona/路由表类改动需重启 dsh 进程才生效。

## 同步说明

本仓库由本地 DSH 工作区手动同步维护:修改本地 `.agent-presets/y1n-flow` 后,将内容复制到本仓库 `dsh/` 再提交推送。
