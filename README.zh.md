# dsh-decide

[English](README.md) | 简体中文

为 DeepSeek Harness（DSH）接入**决策模型**：用同一组工具调用 TypeSafe Jev、基元律动 NeoHorse-Jev、OpenAI Decisions 以及本地 System One 服务。

> **决策模型不是聊天模型。** 它接收一段 `state` 和若干命名问题，返回概率 / 选项 / 分数，不生成文本、不流式、没有 messages。所以本插件增加的是工具和设置页，而不是模型选择器里的一个模型。

## 提供商

| id | 服务 | 协议 | 默认模型 | Key |
|---|---|---|---|---|
| `typesafe` | [TypeSafe Jev](https://docs.typesafe.ai/api/system-one.md) | System One | `jev-latest` | `TYPESAFE_API_KEY` |
| `tokenrhythm` | [基元律动 NeoHorse-Jev](https://tokenrhythm.studio/docs/api-integration) | System One | `NeoHorse-Jev-4B` | `TOKENRHYTHM_API_KEY` |
| `openai` | [OpenAI Decisions](https://developers.openai.com/api/docs/guides/decisions)（beta） | OpenAI Decisions | `gpt-6-luna` | `OPENAI_API_KEY` |
| `local` | 本地 System One（Unsloth 上的 Laya、自建模型） | System One | `laya` | 可空 / 免 key |

也可以自定义任意端点，选择两种协议之一。默认使用“第一个已启用且 key 可解析”的提供商；设置 `defaultProvider` 可固定。每张提供商卡片都有一个官网链接，链接会自动带上 `aichen` 推广参数。

## 安装

本地开发（把路径换成你的 clone 目录）：

```bash
dsh plugin --profile desktop add link:F:\path\to\dsh-decide
```

然后重启 DSH（Host 插件不热重载）。发布到 npm 后可用 `dsh plugin --profile desktop add dsh-decide`。

## 设置页

**设置 → 决策模型** 有四个标签页：

- **提供商**：逐个启用/停用、改模型、接口地址、路径、Key 状态、保存、测试、获取模型、设为默认；可添加自定义提供商。
- **示例**：可直接复制的提示词和工具请求示例，不读文档也能上手。
- **行为**：置信度阈值、请求限制、缓存、审计，以及可选的执行守门。
- **用量**：今天/最近 7 天按提供商统计请求、tokens、估算成本，以及最近判定记录。

页面跟随 DSH 的语言设置。中英文为完整翻译；DSH 其他内置语言（日语、西班牙语、法语、德语、俄语、葡萄牙语）覆盖主要界面，较长的帮助文案回退英文。欢迎补全剩余翻译。

Key 通过 DSH 凭据服务写入；页面只显示是否已配置、来自哪里。`state` 会发送给所选提供商，不要放密钥。

## 工具

### `decide`

```json
{
  "state": "我三月被重复扣费了。",
  "questions": [
    { "name": "billing", "type": "yesno", "instructions": "这是账单问题吗？" },
    {
      "name": "team",
      "type": "choice",
      "instructions": "应该由哪个团队处理？",
      "choices": [{ "label": "billing" }, { "label": "technical" }]
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

每个问题返回 `probability` / `choice` / `score`，提供商提供时带 `confidence`，并按阈值给出 `uncertain`。`includeProbabilities: true` 返回完整分布；`provider` 可覆盖默认；`state` 必须是字符串（JSON 请先序列化）。

### `decide_gate`

只问一个是非问题（默认“这个操作是否可能不可逆地删除、覆盖或泄露真实数据？”），把概率映射为 `allow` / `review` / `deny`。适合在破坏性操作前自检。失败会报错，绝不当作允许。

### `decide_rerank`（beta）

给一组候选段落按与查询的相关性打分并排序，适合 RAG 把检索结果压到前几段：

```json
{
  "query": "怎么轮换 API Key？",
  "documents": [
    { "id": "doc-1", "text": "..." },
    { "id": "doc-2", "text": "..." }
  ]
}
```

### `decide_judge`（beta）

用一组是/否检查验收一个回答或工具结果，返回 `PASS` / `FAIL` 和每条检查的概率。适合验收门、LLM-as-a-judge：

```json
{
  "task": "回答用户关于退款的问题",
  "output": "...",
  "checks": ["引用了来源", "回答了问题", "没有编造政策"]
}
```

### 实验性：Loop 分诊

在 **行为 → 实验性功能** 打开后，插件监听 `agent/pre-step`，让决策模型判断新消息属于 `quick` / `deep` / `tool`，并向本轮追加一句提示。默认关闭，每轮多一次判定调用，行为可能随版本变化。

## 在 DSH 里怎么用

1. 打开 **设置 → 决策模型 → 提供商**，选一个提供商，点 **测试**，再点 **设为默认**。
2. 在对话里直接描述判定和选项：“用 `decide` 判断这条工单该给账单 / 技术 / 销售，并给紧急度。”没有安装任何 skill；agent 依据工具描述自己选择，点名 `decide` 只是让选择更确定。
3. 执行危险命令前说：“先调 `decide_gate`，只有 allow 才继续。”
4. 需要 RAG 或验收时，让它调 `decide_rerank` / `decide_judge`。
5. 需要自动守门或实验性的 Loop 分诊时，在 **行为** 里打开（默认关闭；守门不要和 `dsh-jev-guard` 同时开）。

完整说明、示例提示和排障表：[docs/usage.zh.md](docs/usage.zh.md)。English: [docs/usage.md](docs/usage.md)。

## 不用设置页的配置

```yaml
- id: decide
  name: dsh-decide
  config:
    defaultProvider: tokenrhythm
    maxQuestions: 8
    timeoutMs: 20000
    maxRetries: 2
    thresholds:
      choice: 0.7
      score: 0.7
      yesnoLow: 0.35
      yesnoHigh: 0.65
    providers:
      tokenrhythm:
        enabled: true
        dialect: systemone
        baseURL: https://tokenrhythm.studio/v1
        path: /systemone
        apiKeyEnv: TOKENRHYTHM_API_KEY
        model: NeoHorse-Jev-4B
```

优先级：profile 配置 > `~/.dsh/decide/settings.json`（页面写入）> 默认值。这里永远不放明文 Key。

## 限制、置信度与成本

- 每个提供商自带限制（问题数、选项数、评分档数、state 大小、请求体大小），发请求前本地拦截并给出可操作错误。
- **不要跨提供商复用阈值**：Jev、Laya、OpenAI 的 confidence 公式不同。默认对 `choice` 用最高概率、对 `yesno` 用 noul/predicate 概率；支持按提供商覆盖。
- 成本按 `usage.input_tokens` × 单价估算（TypeSafe：输入 $0.042/百万 token，输出免费）。TokenRhythm / OpenAI 的价格未填时显示未知。
- 超时和网络失败不重试；只对 429/5xx/529 重试（官方未文档化幂等键，避免重复计费）。

## 隐私

- `state` 会发送给所选提供商；本地提供商则留在本机。
- 审计记录（`~/.dsh/decide/decisions.jsonl`）默认只存哈希和长度；可选 `storeState: full`。
- Key 存在 DSH 凭据库或环境变量，不写入设置和日志。

## 开发

```bash
npm test
```

离线测试：适配器、方言归一化、限制、阈值、重试、审计、路由、假 Cordis 宿主。Node 20+，无运行时依赖。

## 已知缺口

- `tools/pre-execute` **守门**已实现，但默认关闭（`guard.enabled`），只检查 `bash`/`pwsh`；不要与 `dsh-jev-guard` 同时启用。
- `decide_rerank` / `decide_judge` 是 beta；Loop 分诊（`experimental.triage`）是实验性功能，可能随版本变化。
- 图片 / `box` 题暂不发送。
- 原生 Laya `/predict`（非 System One）未适配；请用 Unsloth 的 System One 端点或代理。
- OpenAI Decisions 仍是 beta；若路径变化，可通过 `baseURL` + `path` 调整。

## 关于

由 [老陈聊AI（小红书）](https://www.xiaohongshu.com/search_result?keyword=%E8%80%81%E9%99%88%E8%81%8AAI) 维护。提供商官网链接会带上 `aichen` 推广参数，方便后续与厂商合作；参数是 `lib/providers.js` 里的一个常量。

## License

MIT
