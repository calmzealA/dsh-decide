# Using dsh-decide in DeepSeek Harness

## 1. Configure a provider

Open **Settings → Decisions**. The **Examples** tab has copyable prompts and the exact tool request; the **Providers** tab is where you configure keys.

| Provider | What to fill |
|---|---|
| **TokenRhythm NeoHorse-Jev** (recommended in China) | Reuses `TOKENRHYTHM_API_KEY` if your profile already has the TokenRhythm chat route. Model `NeoHorse-Jev-4B`, base `https://tokenrhythm.studio/v1`, path `/systemone`. |
| **TypeSafe Jev** | `TYPESAFE_API_KEY` from the TypeSafe console. Model `jev-latest` or a pinned `jev-1.13.0` / `jev-1.14.0`. |
| **OpenAI Decisions** | `OPENAI_API_KEY`, model `gpt-6-luna` (beta). If the native path moves, change `path` on the card. |
| **Local System One** | Start a compatible server (e.g. Unsloth Decision API on `http://localhost:8888`, model `laya`) and put that URL in `baseURL`. A key is optional on localhost. |

Press **Test** to make a real decision request. Press **Use as default** on the provider the tools should use. If no default is set, the first enabled provider whose key resolves is used.

Keys are stored through the DSH credentials service; the page only reports whether a key is set and where it comes from.

## 2. Talk to the agent

The tools are model-facing, so you can simply describe the decision. Good prompts name the decision and the options:

```text
用 decide 判断这条客服消息应该给哪个团队（账单 / 技术 / 销售），并给一个 0-2 的紧急度。
```

```text
Classify this ticket with the decision model: topic (billing, technical, other), is it urgent (yes/no), and urgency (not urgent / this week / today).
```

```text
Before you run that command, call decide_gate on it and only continue if the verdict is allow.
```

The agent calls `decide` with a canonical request:

```json
{
  "state": "I was charged twice for my March subscription.",
  "questions": [
    { "name": "billing", "type": "yesno", "instructions": "Is this about billing?" },
    {
      "name": "team",
      "type": "choice",
      "instructions": "Which team should handle this?",
      "choices": [{ "label": "billing" }, { "label": "technical" }, { "label": "sales" }]
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

The result looks like:

```text
Decision via TokenRhythm NeoHorse-Jev (systemone)
model: NeoHorse-Jev-4B
- team: billing (p=0.992)
- billing: probability 0.987
- urgency: 1.93 [not urgent | this week | today]
usage: input 85 · output 305 · 379 ms
```

Treat it as a calibrated signal, not a guarantee. Answers below the configured threshold are marked `uncertain`; escalate or ask a human when that happens.

## 3. More patterns (beta / experimental)

**RAG rerank (beta).** When a search returns too many passages, ask:

```text
Before answering, call decide_rerank on these passages with my question, keep the top 3, then answer from them.
```

Each passage becomes a `score` question; the result is sorted by relevance. Pass `id` to keep your own identifiers.

**Judge a result (beta).** Treat the decision model as an acceptance check:

```text
Use decide_judge to check the answer against: cites a source, answers the question, and has no invented facts.
```

It returns `PASS` / `FAIL` and one probability per check.

**Loop triage (experimental).** Enable it in **Behavior → Experimental**. On the first step of each turn the plugin classifies the new message as `quick`, `deep`, or `tool` and appends a one-line hint to the turn. Off by default; costs one call per turn; behavior may change.

## 4. Optional: gate shell commands

Settings → Decisions → Behavior → **Execution guard**:

- enable it;
- choose the provider (defaults to the default provider);
- keep `allow below 0.35`, `deny at or above 0.65` unless you have calibrated something else;
- choose what happens when the provider fails (`allow` keeps working, `deny` is fail-closed).

Every `bash` / `pwsh` call is then judged before execution. Do not enable this together with `dsh-jev-guard`; pick one.

## 5. Troubleshooting

| Symptom | Meaning |
|---|---|
| `MISSING_CREDENTIAL` | No key resolved. Paste it in the provider card, or export the variable before starting DSH. |
| `FORBIDDEN` on TokenRhythm | The key has no decision-model allow-list permission. |
| `REGION_BLOCKED` (451) | TypeSafe refuses this egress; route the DSH host through an allowed region. |
| `INVALID_REQUEST` (422) | A question field is malformed; the message names the field. |
| `LIMIT` | State or question count exceeds that provider's limit; shorten it or switch provider. |
| Nothing happens on a `pwsh` call | Guard is off, or the provider failed and `onError` is `allow`. |

## 6. Privacy

`state` is sent to the selected provider. Prefer local providers for sensitive text. Audit records live in `~/.dsh/decide/decisions.jsonl`; by default they store a hash and length, not the text. Keys never enter configuration files, settings, or logs.
