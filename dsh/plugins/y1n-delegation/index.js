// y1n-flow:通用委派工具 + 思考档位注入(替代按模型分行的委派行)。
//
// 一个 `subagent` 工具承接全部子代理委派:provider/model/effort 都是
// 运行时参数,主模型每次调用时自由决定;不传 effort 时按下方静态路由表
// 注入默认档位,传了 effort 则按 childId → effort 临时表在子代理首个
// 请求上注入(命中即删,之后回落静态表)。
//
// 全部走 DSH 内置管道,零 hack:
//   - 派发:`ctx.subagents.startContinuable()` / `start()`(内置注册表)
//   - 注入:`agent/request` 瀑布(内置事件,payload 自带 agent)
//   - 校验:`ctx.llm.resolveModelInfo()`(内置路由服务,按模型裁剪档位)
export const name = 'y1n-delegation'

// 静态兜底表:未显式传 effort 的委派子代理按 provider/model 注入。
const EFFORT_BY_ROUTE = {
  'openai-codex/gpt-5.6-sol': 'max',
  'opencode-go/kimi-k3': 'max',
  'deepseek-official/deepseek-v4-pro': 'max',
  'openai-codex/gpt-5.4': 'medium',
}

// DSH/pi-ai 通用思考档位刻度(不含 off,避免误发不可用的 wire 值)。
const EFFORT_ENUM = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']

const EFFORT_HINT = [
  '省略时按内置路由表自动注入:',
  'openai-codex/gpt-5.6-sol → max, openai-codex/gpt-5.4 → medium,',
  'opencode-go/kimi-k3 → max, deepseek-official/deepseek-v4-pro → max。',
  '显式指定时按目标模型的支持范围校验,不支持会报错并列出可选档位。',
].join(' ')

/** 与官方 dsh-tool-subagent 一致的 canonical 输出契约,保证 send_message/list_agents 兼容。 */
const OUTPUT_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { type: 'string', const: 'continuable' },
        subagentId: { type: 'string' },
      },
      required: ['kind', 'subagentId'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { type: 'string', const: 'foreground' },
        runId: { type: 'string' },
        output: { type: 'array', items: { type: 'object' } },
      },
      required: ['kind', 'runId', 'output'],
    },
  ],
}

function renderOutput(_args, value) {
  if (value == null || typeof value !== 'object') return [{ type: 'text', text: String(value) }]
  if (value.kind === 'continuable') return [{ type: 'text', text: `started subagent ${value.subagentId}` }]
  const text = Array.isArray(value.output)
    ? value.output
        .filter((block) => block != null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('')
    : ''
  return [{ type: 'text', text: text }]
}

/** 非 completed 的结束原因翻译成对父模型有用的错误。 */
function stopReasonError(result) {
  const reason = result == null ? undefined : result.stopReason
  switch (reason) {
    case undefined:
    case 'completed': return undefined
    case 'aborted': return 'subagent run was cancelled'
    case 'error': return 'subagent run failed'
    case 'max-tokens': return 'subagent run hit its token limit before finishing'
    case 'refusal': return 'subagent declined the task'
    default: return `subagent run ended abnormally (${String(reason)})`
  }
}

function errorText(error) {
  return error && error.message ? error.message : String(error)
}

export function apply(ctx) {
  const tools = ctx.get('tools')
  const subagents = ctx.get('subagents')
  const llm = ctx.get('llm')
  const systemPrompt = ctx.get('systemPrompt')
  if (tools === undefined || subagents === undefined) return

  // 本次显式档位:子会话 id → effort。仅在 startContinuable 返回 childId
  // 之后、子代理首个请求之前写入,注入命中即删,无长驻状态。
  const pendingEffort = new Map()

  // 1) 注入监听:对 y1n-flow 下所有委派子代理生效(delegationDepth >= 1)。
  ctx.on('agent/request', async (payload, next) => {
    const resolved = await next()
    const header = payload.agent?.session?.header
    if (typeof header?.delegationDepth !== 'number' || header.delegationDepth < 1) return resolved
    const sid = header.id === undefined ? undefined : String(header.id)
    const explicit = sid === undefined ? undefined : pendingEffort.get(sid)
    if (explicit !== undefined) {
      pendingEffort.delete(sid)
      if (resolved.reasoningEffort === explicit) return resolved
      return { ...resolved, reasoningEffort: explicit }
    }
    const effort = EFFORT_BY_ROUTE[`${resolved.provider}/${resolved.model}`]
    if (effort === undefined || resolved.reasoningEffort === effort) return resolved
    return { ...resolved, reasoningEffort: effort }
  })

  // 2) 残留清理:子代理回到 idle(结束/挂起)时清掉没来得及命中的表项。
  ctx.on('agent/status', (payload) => {
    if (payload == null || payload.status === 'running') return
    const id = payload.agent?.session?.header?.id
    if (id !== undefined) pendingEffort.delete(String(id))
  })

  // 3) 注册通用委派工具(手工 JSON Schema,预设插件目录无法解析 node_modules)。
  const disposeTool = tools.register({
    name: 'subagent',
    description: [
      '委派一个子代理完成独立任务(唯一的委派工具)。',
      'prompt 与 description 必填。',
      'provider 与 model 同时给出时,子代理使用该模型路由;都省略时继承主代理当前模型。',
      `effort 可选(${EFFORT_ENUM.join('/')});${EFFORT_HINT}`,
      '指定 effort 时必须同时给出 provider 与 model,以便按该模型的支持范围校验。',
      'mode 为 fresh(默认,全新上下文)或 fork(继承本会话已完成的历史)。',
      'run_in_background 默认 true:立即返回可续接的子代理 id,结束后你会收到结果通知,',
      '可用 send_message 继续同一子代理;设为 false 时等待其完成并直接返回结果。',
    ].join(' '),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        description: {
          type: 'string',
          description: '委派任务的 3-5 词短描述,用于展示标签。',
        },
        prompt: {
          type: 'string',
          description: '完整、自包含的任务内容;子代理看不到本会话,需包含全部背景。',
        },
        provider: {
          type: 'string',
          description: '模型供应商路由(如 openai-codex、opencode-go、deepseek-official)。与 model 同时提供或同时省略。',
        },
        model: {
          type: 'string',
          description: '模型 id(如 gpt-5.6-sol、gpt-5.4、kimi-k3、deepseek-v4-pro)。与 provider 同时提供或同时省略。',
        },
        effort: {
          type: 'string',
          enum: EFFORT_ENUM,
          description: `思考档位。${EFFORT_HINT}`,
        },
        mode: {
          type: 'string',
          enum: ['fresh', 'fork'],
          description: 'fresh=全新上下文(默认);fork=继承本会话已完成的历史。',
        },
        run_in_background: {
          type: 'boolean',
          description: '默认 true:后台运行并立即返回可续接 id;false 时等待结果。',
        },
      },
      required: ['description', 'prompt'],
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: renderOutput,
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const parent = exec.agent
      if (parent === undefined) throw new Error('subagent 工具需要调用方 agent(exec.agent 不存在)')
      if (typeof args.description !== 'string' || args.description.length === 0) throw new Error('description 必填(3-5 词短描述)')
      if (typeof args.prompt !== 'string' || args.prompt.length === 0) throw new Error('prompt 必填')
      const registryProvider = args.mode === 'fork' ? 'fork' : 'spawn'

      let agentOptions
      let explicitEffort
      const hasProvider = args.provider !== undefined && args.provider !== null
      const hasModel = args.model !== undefined && args.model !== null
      if (hasProvider || hasModel) {
        if (typeof args.provider !== 'string' || args.provider.length === 0 || typeof args.model !== 'string' || args.model.length === 0) {
          throw new Error('provider 与 model 必须同时提供且为非空字符串;或同时省略以继承主代理当前模型')
        }
        agentOptions = { provider: args.provider, model: args.model }
        if (args.effort !== undefined) {
          if (llm === undefined) throw new Error('llm 服务不可用,无法校验思考档位')
          let info
          try {
            info = await llm.resolveModelInfo(args.provider, args.model, exec.signal)
          } catch (error) {
            throw new Error(`无法解析模型路由 ${args.provider}/${args.model}: ${errorText(error)}`)
          }
          const efforts = Array.isArray(info?.reasoning?.efforts)
            ? info.reasoning.efforts.map((eff) => (eff != null && typeof eff.id === 'string' ? eff.id : String(eff)))
            : []
          if (!efforts.includes(args.effort)) {
            throw new Error(
              efforts.length > 0
                ? `模型 ${args.provider}/${args.model} 不支持思考档位 "${args.effort}";可选: ${efforts.join(' / ')}`
                : `模型 ${args.provider}/${args.model} 不暴露可选档位,请省略 effort 走适配器默认`
            )
          }
          explicitEffort = args.effort
        }
      } else if (args.effort !== undefined) {
        throw new Error('指定 effort 时请同时给出 provider 与 model(便于按模型校验);或省略 effort 走内置路由表默认')
      }

      const request = {
        label: args.description,
        prompt: [{ type: 'text', text: args.prompt }],
        parent,
        ...(agentOptions !== undefined ? { agentOptions } : {}),
        maxDepth: 3,
      }

      if (args.run_in_background !== false) {
        let start
        try {
          start = await subagents.startContinuable({ provider: registryProvider, label: args.description, request, signal: exec.signal })
        } catch (error) {
          throw new Error(`无法启动子代理(provider "${registryProvider}"): ${errorText(error)}`)
        }
        if (explicitEffort !== undefined && start?.childId !== undefined) pendingEffort.set(String(start.childId), explicitEffort)
        return { kind: 'continuable', subagentId: String(start.childId) }
      }

      let run
      try {
        run = await subagents.start(registryProvider, { ...request, signal: exec.signal })
      } catch (error) {
        throw new Error(`无法启动子代理(provider "${registryProvider}"): ${errorText(error)}`)
      }
      try {
        const result = await run.result
        const failure = stopReasonError(result)
        if (failure !== undefined) {
          const partial = Array.isArray(result?.output)
            ? result.output
                .filter((block) => block != null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
                .map((block) => block.text)
                .join('')
            : ''
          throw new Error(partial.length === 0 ? failure : `${failure}\nPartial output before the run ended:\n${partial}`)
        }
        return { kind: 'foreground', runId: String(run.id), output: Array.isArray(result?.output) ? result.output : [] }
      } finally {
        try {
          await run.dispose()
        } catch {
          // 处置失败不掩盖既有结果/错误
        }
      }
    },
  })
  ctx.effect(() => disposeTool)

  if (systemPrompt !== undefined) {
    const disposeSection = systemPrompt.section({
      name: 'tool:subagent',
      order: 116.5,
      text: () => 'Use subagent in the background by default. Start independent delegations together in one assistant message and continue useful work while they run. Set `run_in_background: false` only when your next action depends on that subagent\u2019s result. When a background run settles, the runtime sends you a notice containing its outcome and any final assistant message.',
    })
    ctx.effect(() => disposeSection)
  }
}
