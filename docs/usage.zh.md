# 在 DeepSeek Harness 里使用 dsh-decide

## 1. 配置提供商

打开 **设置 → 决策模型**。**示例** 标签页有可直接复制的提示词和工具请求；**提供商** 标签页用来配置 Key。

| 提供商 | 填什么 |
|---|---|
| **基元律动 NeoHorse-Jev**（国内推荐） | 如果 profile 里已经有 TokenRhythm 的聊天路由，会直接复用 `TOKENRHYTHM_API_KEY`。模型 `NeoHorse-Jev-4B`，地址 `https://tokenrhythm.studio/v1`，路径 `/systemone`。 |
| **TypeSafe Jev** | TypeSafe 控制台的 `TYPESAFE_API_KEY`。模型 `jev-latest`，或固定 `jev-1.13.0` / `jev-1.14.0`。 |
| **OpenAI Decisions** | `OPENAI_API_KEY`，模型 `gpt-6-luna`（beta）。如果原生路径变化，在卡片里改 `path`。 |
| **本地 System One** | 启动兼容服务（例如 Unsloth Decision API：`http://localhost:8888`，模型 `laya`），把地址填进 `baseURL`。localhost 可以不填 Key。 |

点 **测试** 会真的发一次判定请求。点 **设为默认** 决定工具默认用哪个；不设则用“第一个已启用且 Key 可解析”的提供商。

Key 通过 DSH 凭据服务保存；页面只显示是否已配置、来自哪里。

## 2. 在对话里使用

工具是给模型调用的，所以直接用自然语言描述判定即可。好的提示会说明“要判什么”和“有哪些选项”：

```text
用 decide 判断这条客服消息应该给哪个团队（账单 / 技术 / 销售），并给一个 0-2 的紧急度。
```

```text
用决策模型分类这张工单：主题（billing / technical / other）、是否紧急（是/否）、紧急度（不急 / 本周 / 今天）。
```

```text
在执行那条命令之前，先用 decide_gate 判定一下，只有 allow 才继续。
```

模型会这样调用 `decide`：

```json
{
  "state": "我三月被重复扣费了。",
  "questions": [
    { "name": "billing", "type": "yesno", "instructions": "这是账单问题吗？" },
    {
      "name": "team",
      "type": "choice",
      "instructions": "应该由哪个团队处理？",
      "choices": [{ "label": "billing" }, { "label": "technical" }, { "label": "sales" }]
    },
    {
      "name": "urgency",
      "type": "score",
      "instructions": "有多紧急？",
      "levels": [{ "label": "不急" }, { "label": "本周" }, { "label": "今天" }]
    }
  ]
}
```

返回大致是：

```text
Decision via TokenRhythm NeoHorse-Jev (systemone)
model: NeoHorse-Jev-4B
- team: billing (p=0.992)
- billing: probability 0.987
- urgency: 1.93 [不急 | 本周 | 今天]
usage: input 85 · output 305 · 379 ms
```

把它当作校准过的信号，不是保证。低于阈值的答案会标 `uncertain`；这时应该升级给人或补充上下文。

## 3. 更多用法（beta / 实验性）

**RAG 重排（beta）**：检索结果太多时，直接说：

```text
回答之前，先用 decide_rerank 把这几段按与问题的相关性排序，只保留前 3 段再作答。
```

每段会变成一个 `score` 问题，结果按相关性排序；给每段加 `id` 可以保留你自己的标识。

**验收结果（beta）**：把决策模型当成验收门：

```text
用 decide_judge 检查这个回答是否满足：引用了来源、回答了问题、没有编造事实。
```

返回 `PASS` / `FAIL` 和每条检查的概率。

**Loop 分诊（实验性）**：在 **行为 → 实验性功能** 打开。每轮第一步，插件会把新消息分类为 `quick` / `deep` / `tool`，并向本轮追加一句提示。默认关闭，每轮多一次调用，行为可能变化。

## 4. 可选：执行前守门

**设置 → 决策模型 → 行为 → 执行守门**：

- 打开开关；
- 选择提供商（默认跟随 default provider）；
- 默认 `低于 0.35 放行 / 达到 0.65 拒绝`，没有重新校准就别改；
- 选择提供商失败时的行为（`allow` 继续，`deny` 失败关闭）。

之后每次 `bash` / `pwsh` 调用都会先判定再执行。不要和 `dsh-jev-guard` 同时开，二选一。

## 5. 排障

| 现象 | 含义 |
|---|---|
| `MISSING_CREDENTIAL` | 没有解析到 Key。在卡片里粘贴，或在启动 DSH 前导出环境变量。 |
| TokenRhythm `FORBIDDEN` | Key 没有决策模型的灰度权限。 |
| `REGION_BLOCKED`（451） | TypeSafe 拒绝当前出口；把 DSH 宿主进程走允许区域的代理。 |
| `INVALID_REQUEST`（422） | 问题字段不合法，错误会指出字段。 |
| `LIMIT` | state 或问题数超过该提供商限制；缩短或换提供商。 |
| `pwsh` 调用没有变化 | 守门没开，或提供商失败且 `onError: allow`。 |

## 6. 隐私

`state` 会发送给所选提供商；敏感文本优先用本地提供商。审计文件在 `~/.dsh/decide/decisions.jsonl`，默认只存哈希和长度，不存正文。Key 不会进入配置、设置或日志。
