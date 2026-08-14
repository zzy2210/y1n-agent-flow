// y1n-flow:为子代理请求按模型注入推理档位。
//
// DSH 的 AgentOptions(provider/model/maxTokens)没有推理档位字段,委派工具行
// 也无法声明档位;本插件在 `agent/request` 瀑布里为委派子代理补上档位:
//
//   - 思考类(设计/编码/评审/UI)用该模型的最大档:
//       openai/gpt-5.6-sol → max
//       opencode-go/kimi-k3 → max
//       deepseek-official/deepseek-v4-pro → max
//   - 探索类用中等档:
//       openai/gpt-5.4 → medium
//
// 规则:
//   - 仅对委派子代理生效(session header 的 delegationDepth >= 1);主代理自身
//     的档位由会话模型选择/用户 UI 决定,本插件不干预。
//   - 子代理没有自己的显式档位选择:请求里已存在的 reasoningEffort 是模型
//     路由的默认值(落盘时被标记为 adapterDefaults),同样按上表覆盖,保证
//     委派子代理真实吃到档位规则。
//   - 未列出的 provider/model 组合原样放行。
export const name = 'y1n-reasoning'

const EFFORT_BY_ROUTE = {
  'openai/gpt-5.6-sol': 'max',
  'opencode-go/kimi-k3': 'max',
  'deepseek-official/deepseek-v4-pro': 'max',
  'openai/gpt-5.4': 'medium',
}

export function apply(ctx) {
  ctx.on('agent/request', async (payload, next) => {
    const resolved = await next()
    const header = payload.agent?.session?.header
    if (typeof header?.delegationDepth !== 'number' || header.delegationDepth < 1) return resolved
    const effort = EFFORT_BY_ROUTE[`${resolved.provider}/${resolved.model}`]
    if (effort === undefined || resolved.reasoningEffort === effort) return resolved
    return { ...resolved, reasoningEffort: effort }
  })
}
