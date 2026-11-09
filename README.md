# dsh-decide

English | [简体中文](README.zh.md)

Multi-provider **decision models** for DeepSeek Harness (DSH): one pair of agent tools over TypeSafe Jev, TokenRhythm NeoHorse-Jev, OpenAI Decisions, and local System One servers.

> **Decision models are not chat models.** They take a body of text (`state`) plus named typed questions and return probabilities / labels / scores — no prose, no streaming, no messages. That is why `dsh-decide` adds tools and a settings page instead of a model in the model picker.

## Providers

| id | Service | Dialect | Default model | Key |
|---|---|---|---|---|
| `typesafe` | [TypeSafe Jev](https://docs.typesafe.ai/api/system-one.md) | System One | `jev-latest` | `TYPESAFE_API_KEY` |
| `tokenrhythm` | [基元律动 NeoHorse-Jev](https://tokenrhythm.studio/docs/api-integration) | System One | `NeoHorse-Jev-4B` | `TOKENRHYTHM_API_KEY` |
| `openai` | [OpenAI Decisions](https://developers.openai.com/api/docs/guides/decisions) (beta) | OpenAI Decisions | `gpt-6-luna` | `OPENAI_API_KEY` |
| `local` | Local System One server (Laya via [Unsloth](https://unsloth.ai/docs/models/decision-laya), self-hosted models) | System One | `laya` | optional / keyless |

Any other endpoint can be added as a custom provider with either dialect. The first enabled provider whose key resolves is used by default; set `defaultProvider` to pin one. Each provider card links to its website with the `aichen` referral tag appended.

## Install

Development (this checkout; replace the path with your clone):

```bash
dsh plugin --profile desktop add link:F:\path\to\dsh-decide
```

Then restart DSH (host plugins are not hot-reloaded). In this repository the link is already installed; `dsh plugin` adds both the dependency and the bundle entry.

Published install is `dsh plugin --profile desktop add dsh-decide` once the package is on npm.

## Settings

**Settings → Decisions** has four tabs:

- **Providers** — per-provider enable/disable, model, base URL, path, key status, save, test, list models, set default, and a form for custom providers.
- **Examples** — copyable prompts and the exact tool request, so users can start without reading docs.
- **Behavior** — confidence thresholds, request limits, cache, audit, and the optional execution guard.
- **Usage** — request/token/cost totals per provider for today and the last 7 days, plus recent decisions.

The page follows the DSH language setting. English and Chinese are complete; the other shipped DSH languages (Japanese, Spanish, French, German, Russian, Portuguese) translate the main interface and fall back to English for long help text. Contributions for the remaining strings are welcome.

Keys are written through the DSH credentials service; the page only ever reports whether a key is set and where it comes from. The `state` you judge is sent to the selected provider — do not put secrets in it.

## Tools

### `decide`

```json
{
  "state": "I was charged twice for my March subscription.",
  "questions": [
    { "name": "billing", "type": "yesno", "instructions": "Is this about billing?" },
    {
      "name": "team",
      "type": "choice",
      "instructions": "Which team should handle this?",
      "choices": [{ "label": "billing" }, { "label": "technical" }]
    },
    {
      "name": "urgency",
      "type": "score",
      "instructions": "How urgent is this?",
      "levels": [{ "label": "not urgent" }, { "label": "this week" }, { "label": "today" }]
    }
  ]
}
```

Returns one answer per question with `probability` / `choice` / `score`, `confidence` where the provider supplies it, and `uncertain` from the configured thresholds. Set `includeProbabilities: true` to get the full distribution. `provider` overrides the default; `state` must be a string (serialize JSON first).

### `decide_gate`

Asks one yes/no question — by default “could this action irreversibly delete, overwrite, or expose real data?” — and maps the probability to `allow`, `review`, or `deny`. Use it before destructive actions. The action text is sent to the provider; failures are reported as errors, never as approval.

### `decide_rerank` (beta)

Scores a list of passages against a query and returns them sorted. Useful before stuffing retrieved context, when keyword search returned too much:

```json
{
  "query": "How do I rotate the API key?",
  "documents": [
    { "id": "doc-1", "text": "..." },
    { "id": "doc-2", "text": "..." }
  ]
}
```

### `decide_judge` (beta)

Judges a candidate answer or tool result against explicit yes/no checks and returns `PASS` / `FAIL` with one probability per check. Useful as a review gate or LLM-as-a-judge:

```json
{
  "task": "Answer the user's question about refunds",
  "output": "...",
  "checks": ["cites a source", "answers the question", "contains no invented policy"]
}
```

### Experimental: loop triage

When enabled in **Behavior → Experimental**, the plugin listens on `agent/pre-step`, asks the decision model whether the new message is `quick`, `deep`, or `tool`, and appends a short hint to the turn. It is off by default, costs one decision call per turn, and its behavior may change between releases.

## How to use in DSH

1. Open **Settings → Decisions → Providers**, pick a provider, press **Test**, then **Use as default**.
2. In chat, describe the decision and the options: “Use `decide` to route this ticket to billing / technical / sales and score its urgency.” No skill is installed; the agent picks tools from their descriptions, and naming `decide` just makes the choice deterministic.
3. Before a risky shell command, say “call `decide_gate` first and continue only if it says allow.”
4. For RAG or review flows, ask for `decide_rerank` / `decide_judge`.
5. Optionally enable the execution guard or experimental loop triage in **Behavior** (both off by default; do not combine the guard with `dsh-jev-guard`).

The full walkthrough, example prompts, and troubleshooting table: [docs/usage.md](docs/usage.md). 中文说明：[docs/usage.zh.md](docs/usage.zh.md).

## Configure without the page

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

Precedence: profile config > `~/.dsh/decide/settings.json` (written by the page) > defaults. Keys are **never** stored here.

## Limits, confidence, cost

- Each provider declares its own limits (question count, choice/score counts, state size, body size). They are enforced locally before a request, with an actionable error.
- **Do not reuse thresholds across providers.** Jev, Laya and OpenAI compute confidence differently; the defaults threshold on the top probability for `choice` and on `noul`/`predicate` probability for `yesno`. Per-provider threshold overrides are supported.
- Cost is estimated from `usage.input_tokens` and a per-provider price (TypeSafe: $0.042/M input, output free). TokenRhythm and OpenAI prices are left unknown until configured.
- Timeouts and network failures are not retried; only 429/5xx/529 responses are (the API has no documented idempotency key).

## Privacy

- `state` is sent to the selected provider. Local providers keep it on the machine.
- Audit records (`~/.dsh/decide/decisions.jsonl`) store a hash and character count by default; `storeState: full` is opt-in.
- API keys live in the DSH credential store or the environment, never in settings or logs.

## Development

```bash
npm test
```

The suite is offline: adapters, dialect normalization, limits, thresholds, retries, audit, routes, and a fake Cordis host. Node 20+; no runtime dependencies.

## Known gaps

- The `tools/pre-execute` **guard** is implemented but off by default (`guard.enabled`), and only checks `bash`/`pwsh`. Do not enable it together with `dsh-jev-guard`.
- `decide_rerank` and `decide_judge` are beta; loop triage (`experimental.triage`) is experimental and may change between releases.
- Images / `box` questions are not sent yet.
- Native Laya `/predict` (not System One) is not adapted; use the Unsloth System One endpoint or a proxy.
- OpenAI Decisions is beta; the native path is configurable (`baseURL` + `path`) if it moves.

## About

Maintained by [老陈聊AI (Xiaohongshu)](https://www.xiaohongshu.com/search_result?keyword=%E8%80%81%E9%99%88%E8%81%8AAI). Provider website links carry the `aichen` referral tag so the author can track partnerships; the tag is a single constant in `lib/providers.js`.

## License

MIT
