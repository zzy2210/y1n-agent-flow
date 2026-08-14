# y1n-agent-flow

y1n-flow —— 多模型编排开发流的 DSH(DeepSeek Harness)预设配置仓库。

主代理担任项目编排者(项目经理/指挥官),把探索 / 设计 / 测试设计 / 编码 / 前端 / 审查等角色委派给绑定不同模型的子代理(gpt-5.6-sol、gpt-5.4、kimi-k3),以 plan document 为唯一事实来源,内置编码验证闭环与可续接子代理机制。

## 目录结构

- `dsh/` — DSH 预设包,整体放入 DSH 工作区的 `.agent-presets/` 下使用
  - `preset.yml` — 预设定义
  - `agent.cordis.yml` — 代理编排配置:角色契约、模型路由、插件注册
  - `skills/y1n-flow/` — 主流程 skill(工作流规范、路由表、子代理契约、模板)
  - `skills/ui-aesthetics/` — 前端视觉规范 skill(供 UI 角色加载)
  - `plugins/y1n-reasoning/` — 子代理推理档位自动注入插件

## 安装

```bash
cp -r dsh ~/.dsh/.agent-presets/y1n-flow
```

然后在 DSH 会话中选择 `y1n-flow` 预设。

## 同步说明

本仓库由本地 DSH 工作区手动同步维护:修改本地 `.agent-presets/y1n-flow` 后,将内容复制到本仓库 `dsh/` 再提交推送。
