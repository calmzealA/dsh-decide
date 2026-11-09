# Providers and dialects

`dsh-decide` keeps one canonical request/answer model and two dialect adapters. A provider is configuration; the dialect is the wire contract.

## Canonical model

```js
Question = {
  name: 'billing',              // result key
  type: 'yesno' | 'choice' | 'score' | 'box',
  instructions: '...',
  choices: [{ label, description? }],   // choice
  levels:  [{ label, description? }],   // score
  criteria: { true?, false? },          // yesno
}
```

`box` is rejected today: it needs image input, which this version does not send.

## System One (`systemone`)

Endpoint: `POST <baseURL><path>` (default `/v1/systemone`). Auth: `Authorization: Bearer <key>` when a key is configured.

```json
{
  "model": "jev-latest",
  "state": "text",
  "questions": {
    "team": { "type": "choice", "instructions": "...", "criteria": { "billing": "payments" } },
    "urgent": { "type": "noul", "instructions": "..." },
    "urgency": { "type": "score", "instructions": "...", "criteria": ["low", "high"] }
  }
}
```

Answers are an object keyed by question name: `noul` (0–1), `choice` + `probabilities` + `confidence`, `score` + `legend` + `probabilities` + `confidence`, `box` + `confidence` (may be `null`). `usage` uses `input_tokens` / `output_tokens`.

Used by:

- **TypeSafe Jev** — `https://api.typesafe.ai/v1/systemone`, `TYPESAFE_API_KEY`. Limits: 64k tokens/request and 32k per question (262k with `TypeSafe-Danger-Zone-Long-Context: true`), choice 1–255, score 1–10. Errors use `{"detail": ...}`; 401/403 auth, 422 validation, 429 rate limit, 451 region lock, 529 overloaded. Price $0.042 per million input tokens, output free.
- **TokenRhythm** — `https://tokenrhythm.studio/v1/systemone`, `TOKENRHYTHM_API_KEY`. Model `NeoHorse-Jev-4B`. Limits: 1–16 questions, score 2–10, body ≤1 MiB; images use a top-level `image` field and one question. Decision access is gated by an account allow-list (403). The native `/v1/decision` endpoint is documented as preferred; this plugin uses the compatible `/v1/systemone` so the same adapter applies.
- **Local** — any server exposing the same schema. Unsloth's Decision API serves Laya/Clef at `http://localhost:8888/v1/systemone`, model `laya` (or `laya-multilingual` / `laya-english` / `laya-typed-decisions`), key optional or `sk-unsloth-...`. Laya reads about 1024 tokens, so keep `state` short; the first request loads the model (10–20s). Raw Laya `/predict` is a different schema and is not adapted.

## OpenAI Decisions (`openai-decisions`)

Endpoint: `POST <baseURL><path>` (default `https://api.openai.com/v1/decisions`). Auth: Bearer `OPENAI_API_KEY`.

```json
{
  "model": "gpt-6-luna",
  "input": "text",
  "questions": [
    { "name": "urgent", "type": "predicate", "instructions": "..." },
    { "name": "team", "type": "choice", "instructions": "...", "choices": { "infra": "..." } },
    { "name": "severity", "type": "score", "instructions": "...", "levels": ["Cosmetic", { "label": "Outage", "description": "..." }] }
  ]
}
```

Differences from System One:

- `input` instead of `state` (strings, JSON, or messages).
- `questions` is an **array**; each element carries `name`.
- `predicate` instead of `noul`; no `box`.
- Answers are an **array**; a question may be answered with `type: "refusal"` (mapped to `refused: true` and treated as uncertain).
- `usage` includes `input_tokens`, `output_tokens`, `total_tokens`, and details objects.
- Errors use `{"error": {"message", "type", "code"}}`.

OpenAI Decisions is beta: model names, fields, and the exact native path may change. If it does, override `baseURL`/`path` in the provider card; the dialect remains the same.

## Custom providers

`POST /dsh-decide/api/providers` from the settings page, or add to `providers` in configuration:

```yaml
providers:
  my-gateway:
    enabled: true
    dialect: systemone           # or openai-decisions
    displayName: My Gateway
    baseURL: https://gateway.example
    path: /v1/systemone
    apiKeyEnv: MY_GATEWAY_KEY
    model: my-decision-model
    limits:
      maxQuestions: 16
      maxStateChars: 60000
```

`apiKeyEnv` is a credential reference. Leave it empty for a keyless local server. Limits merge over the preset (or the common defaults for a custom id). Set `homepage` to override the website link; every homepage link gets the `aichen` referral query appended, and a custom provider without `homepage` falls back to its base URL origin.

## Thresholds

Defaults: `choice: 0.7` (top probability), `score: 0.7` (confidence), `yesnoLow: 0.35` / `yesnoHigh: 0.65` (the band between them is uncertain). Per-provider overrides live under `providers.<id>.thresholds`.

Do not carry a threshold from one provider to another: confidence is a normalised transform of the top probability in System One, and Laya/OpenAI compute it differently. When in doubt, threshold on `probabilities[choice]` or the `yesno` probability, which the answers expose.

## Errors

Stable codes: `NO_PROVIDER`, `PROVIDER_NOT_FOUND`, `PROVIDER_DISABLED`, `PROVIDER_INVALID`, `MISSING_CREDENTIAL`, `AUTH`, `FORBIDDEN`, `REGION_BLOCKED`, `LIMIT`, `INVALID_REQUEST`, `RATE_LIMIT`, `SERVER`, `TIMEOUT`, `NETWORK`, `RESPONSE`, `UNSUPPORTED`, `UNEXPECTED`.

Only `RATE_LIMIT` and retryable `SERVER` responses are retried. A timeout is not retried, to avoid duplicate billing without an idempotency key.
