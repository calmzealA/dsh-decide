# Jev (TypeSafe AI) — API Contract Reference

Research date: **2026-11-09**. Authoritative source: `docs.typesafe.ai` (official Mintlify docs + OpenAPI 3.1 spec).
Third-party guides are marked as such and are *not* treated as fact where they disagree.

---

## 0. Bottom line for the harness

1. **Jev is not a chat LLM.** It is a **typed-decision classifier**: one `state` in, N typed answers out
   (`choice` / `score` / `noul` / `box`). No text generation, no streaming, no messages array, no tools,
   no `max_tokens`, no sampling parameters. Official docs state this explicitly
   ([coding-agents.md](https://docs.typesafe.ai/introduction/coding-agents.md)).
2. **There is no OpenAI-compatible surface** on the hosted API. The only endpoints are
   `POST /v1/systemone`, `GET /v1/models` (and `POST /mcp` on the *reseller*, see §6).
3. **Use it as a sub-call inside the harness** (routing, guardrail before a tool call, output judging,
   memory relevance, escalation), never as the driving model.
4. **Two different vendors serve "Jev"**: TypeSafe (`api.typesafe.ai`, official) and jevmodel.org
   (`jevmodel.org`, an independent paid proxy/reseller). Their contracts **differ materially** — see §7.
   Do not mix docs or keys.
5. Self-hosting is possible only via **independent Apache-2.0 distillation** `autotrust/JEV-27B`, not
   TypeSafe's weights (§5).

---

## 1. Provenance: what to trust

| Source | Status | Notes |
|---|---|---|
| [docs.typesafe.ai](https://docs.typesafe.ai/llms.txt) + [openapi.json](https://api.typesafe.ai/openapi.json) | **Official / authoritative** | Versioned, OpenAPI 3.1, links to `console.typesafe.ai`. Use this for the contract. |
| [api.typesafe.ai](https://api.typesafe.ai) | **Official endpoint** | Live; observed directly. |
| [typesafe.ai](https://typesafe.ai/) | Official marketing | JS-rendered; `/pricing` redirects into docs. No public pricing page beyond the models table. |
| [jevmodel.org](https://jevmodel.org/) | **Independent reseller/proxy** | Self-disclosed "not affiliated with, endorsed by, or operated by TypeSafe AI" in every footer. Sells its own token packs, runs its own limits/aliases/MCP. |
| [typesafe-jev.com](https://typesafe-jev.com/en/getting-started/) | Independent community guide | Also discloses no affiliation. Some pages stale vs official docs. |
| [jev.pro](https://jev.pro/) | Independent guide | Useful, but publishes rate-limit numbers that are **not** on the current official models page. |
| [HF autotrust/JEV-27B](https://huggingface.co/autotrust/JEV-27B) | Independent open weights | Apache-2.0 **student/distill**, explicitly "not affiliated with... TypeSafe AI, shares no weights or code with it". |

The console (keys, balance, rate limits, billing) is **behind auth** — `console.typesafe.ai/keys`,
`console.typesafe.ai/rate-limits`, `console.typesafe.ai/playground`. I could not read those pages;
anything about account-level quotas or free credit is flagged as unverified below.

---

## 2. Base URL, auth, keys, tiers

**Base URL:** `https://api.typesafe.ai`
**Endpoint:** `POST /v1/systemone`  (plus `GET /v1/models`)

```
POST /v1/systemone HTTP/1.1
Host: api.typesafe.ai
Authorization: Bearer $TYPESAFE_API_KEY
Content-Type: application/json
TypeSafe-Danger-Zone-Images: true        # only if assets/box used
TypeSafe-Danger-Zone-Long-Context: true  # only to raise context to 262k
```

- Auth: `Authorization: Bearer <key>` (OpenAPI `securitySchemes: HTTPBearer`).
- Keys are created in the **TypeSafe console** — <https://console.typesafe.ai/keys>. The env var the
  official docs/SDKs read is **`TYPESAFE_API_KEY`** (SDK default).
- Key format is **not documented**. A community guide shows `tsf_...` but explicitly labels it
  "format shown for illustration only". Don't validate on prefix.
- Open CORS is *not* claimed for the official API (the reseller claims `access-control-allow-origin: *`).
  Assume server-side only.

### Free tier / sandbox — **not documented officially**

- No official page lists a free tier, trial credit, or sandbox. `docs.typesafe.ai/llms.txt` has no
  pricing or free-tier page; the only price statement is the models table (§4).
- `jev.pro` (independent, 2026-09-21) reached the same conclusion: "does not describe a self-serve free
  tier, trial credits, or starter quota. We will not invent one."
- All "free" offers I found belong to **resellers/gateways**:
  - jevmodel.org: 10,000 input tokens for guests, **100,000 on first sign-in**, packs from $9.90.
  - Vercel AI Gateway lists `typesafe-ai/jev` as Free/Free (promo, per `jev.pro`).
  - OpenRouter / Cloudflare Workers AI also resell it.
- **Action:** assume you need a paid TypeSafe account, or start on the jevmodel.org free 100k if you
  only need to smoke-test. Confirm the actual balance in the console.

---

## 3. Request schema (exact, from the OpenAPI spec)

```jsonc
{
  "model":    "jev-latest",        // required by schema; aliases or versioned ID
  "state":    "text",              // required: string | object | array
  "questions": {                    // required: map<string, Question>, minProperties 1
    "<name>": { "type": "...", "instructions": ..., "criteria": ... }
  },
  "assets": {                       // optional, minProperties 1; images only
    "<opaque-ref>": { "type": "image", "format": "png|jpg|jpeg", "data_base64": "...", "part": "..." }
  }
}
```

### 3.1 Field detail

| Field | Type | Required | Notes |
|---|---|---|---|
| `model` | string | **yes** | Alias or version ID. Docs examples use `jev-latest`; `GET /v1/models` lists what your account can use. |
| `state` | string \| object \| array | **yes** | The content all questions are evaluated against. JSON objects/arrays allowed, arbitrarily nested (≤64 levels). Numbers must be finite. |
| `questions` | object | **yes** | 1..N question definitions keyed by a **name you choose**; names are echoed back in `answers`. |
| `assets` | object | no | Image assets keyed by an opaque reference string. Requires the `TypeSafe-Danger-Zone-Images: true` header. |

**There is no `temperature`, `top_p`, `seed`, `max_tokens`, `stream`, `system`, `messages`, `tools`,
`thinking`, or `reasoning_effort` field.** The OpenAPI `SystemOneRequest` has exactly the four
properties above (`additionalProperties` is not opened). Determinism is not configurable; the model is
inherently stochastic (an independent study measured 4.3% answer change on repeated identical
64-option calls — HF card, citing a third-party benchmark).

`instructions` is **not** a plain string-only field: it accepts `string | object | array | null`
(structured JSON instructions are a documented feature — [primitives/advanced.md](https://docs.typesafe.ai/primitives/advanced.md)).
Only `type` is strictly required per question; `instructions` and `criteria` requirements vary by type.

### 3.2 Question types

`Question` is a `oneOf` discriminated on `type`: `noul` | `choice` | `score` | `box`.

#### `noul` — yes/no probability
```json
{ "type": "noul", "instructions": "Is this message about billing?" }
```
- `criteria` **optional**: `{ "true": <desc>, "false": <desc> }` (each string|object|array|null).
- Answer: `{ "type": "noul", "noul": 0.98 }` — **P(yes) ∈ [0,1]. There is no `confidence` field.**
  The probability *is* the certainty measure. Suggested bands: >0.7 yes, <0.3 no, 0.3–0.7 → own branch.

#### `choice` — pick one of N labelled options
```json
{
  "type": "choice",
  "instructions": "What is the tone of this message?",
  "criteria": { "angry": "An upset or hostile message", "calm": "A neutral or polite message" }
}
```
- `criteria` **required**, object of `optionName -> description` (description may be string|object|array|null;
  a `null`/absent description means the name alone is interpreted).
- Limits: `minProperties: 1`, **`maxProperties: 255`**. (Not 2–20 as the reseller guide says.)
- Option **names are not model-visible as images** — object keys are never substituted; to attach a
  picture to an option, put the asset reference in its *description*.
- Answer: `{ type, choice, confidence, probabilities }`, all four required.

#### `score` — ordered rubric
```json
{
  "type": "score",
  "instructions": "How urgent is this message?",
  "criteria": ["Can wait", "Needs attention this week", "Needs attention today"]
}
```
- `criteria` **required**, **ordered array**, index = score. `minItems: 1`, **`maxItems: 10`**.
  Each element string|object|array.
- Answer: `{ type, score, confidence, legend, probabilities }`.
  - `score` is the **probability-weighted expected level**, 0-based, **fractional** (e.g. `1.7`).
  - `legend`: `{ "0": "<level text>", "1": ..., ... }` — string keys.
  - `probabilities`: same string keys, sums to ≈1.

#### `box` — image localization (Jev 1.14 only)
```json
{ "type": "box", "instructions": "Locate the damaged area in img-1" }
```
- **No `criteria`.** `instructions` only (`instructions` is effectively required in practice).
- Requires `TypeSafe-Danger-Zone-Images: true` **and** a 1.14 model (`jev-latest` currently = 1.14.0).
- Answer: `{ "type": "box", "box": {top,bottom,left,right}, "confidence": <number|null> }` —
  normalized 0–1 fractions of height/width, measured from top-left. `confidence` **may be `null`**.
- Boxes are always returned; there is no "not present". Pair with a `noul` when the target may be absent.

### 3.3 Sizes & limits (official)

| Limit | Value |
|---|---|
| Body size | **32 MiB** (headers excluded); applies after decompression too |
| Encoding | UTF-8 JSON, no BOM |
| Nesting | ≤**64** levels in each of `state`, `instructions`, `criteria` |
| Numbers | finite only; `NaN`/`Infinity`/`1e400` rejected |
| Questions per request | **No documented cap** — bounded only by context |
| Per-request context | **64k tokens** (`state` + all questions) |
| Per-question context | **32k tokens** (`state` + any one question) |
| Long context | **262k tokens both**, via `TypeSafe-Danger-Zone-Long-Context: true` (slower, less accurate, same price) |
| Instructions length | no documented character cap (reseller imposes 1,800) |
| Question-name charset/length | **not documented** (reseller imposes `[A-Za-z0-9_]`, ≤64) |
| Compression | `Content-Encoding: gzip` / `x-gzip` / `zstd`, one layer, zstd window ≤8 MiB |

> The "1,000,000 characters of state" and "1–8 questions" from the starting brief are **reseller
> proxy limits**, not TypeSafe's. On the official API, state size is a *token* budget.

### 3.4 Images

- Header **`TypeSafe-Danger-Zone-Images: true` is mandatory** for any request with `assets` or a `box`
  question; otherwise `400`. Officially labeled **"Dreamer-ready"** — prototypes only, format and limits
  may change between releases.
- Two transports:
  - **Multipart (recommended)**: first part named `request` = JSON body; each image its own part; asset
    uses `"part": "<part-name>"`.
  - **Base64 in JSON**: `{"type":"image","format":"png|jpg|jpeg","data_base64":"..."}` (standard
    alphabet, `=` padding, no whitespace, **no `data:` prefix**). If both `part` and `data_base64` are
    present, `part` wins.
- Reference rules: the asset key is a literal string; write it anywhere in `state`, `instructions`, or
  `criteria` (whole value or mid-sentence). **Every asset must be referenced** or `400`. Object keys are
  never replaced. Each *use* adds another copy of the image (and its tokens).
  ≤**1,024 bytes** per reference, ≤**65,536 bytes** total.
- Limits:

| Limit | Value |
|---|---|
| Format | PNG or JPEG only; still images; **animated PNG rejected** |
| File size | **16 MiB** per image (post-decode for base64) |
| Dimensions | **280–1568 px** each side (outside → rejected, never resized) |
| Total pixels | 78,400 – 2,458,624 |
| All images in request | 32 MiB after processing |
| Expanded request | 32 MiB after every reference is replaced |
| Audio/video | Not supported |

- Metadata (EXIF/ICC) is stripped and **EXIF orientation is not applied** — rotate pixels before sending.
- Images bill as input tokens and count against context.

---

## 4. Response schema

Top level (`SystemOneResponse`, all three required):

```json
{
  "model": "jev-1.13.0",
  "answers": { "<question-name>": { ... } },
  "usage": { "input_tokens": 428, "output_tokens": 73 }
}
```

- `model` = **the resolved versioned ID**, which may differ from the alias you sent. Log it.
- `answers` keys mirror your `questions` keys exactly; each answer's `type` matches its question.
- `usage.output_tokens` exists and is returned, but **output is free** — bill on `input_tokens` only.

### 4.1 Real documented example (official quickstart, Raw Response)

> Source: <https://docs.typesafe.ai/introduction/quickstart.md>. The docs label values as example output
> ("values can change between Jev releases"), but the **shape** is authoritative.

```json
{
  "model": "jev-1.13.0",
  "answers": {
    "department": {
      "type": "choice",
      "choice": "technical",
      "confidence": 1.0,
      "probabilities": { "technical": 1.0, "billing": 0.0, "sales": 0.0 }
    },
    "frustration": {
      "type": "score",
      "score": 0.67,
      "confidence": 0.5,
      "legend": {
        "0": "Calm, just stating facts",
        "1": "Frustrated but civil",
        "2": "Very angry, strong language"
      },
      "probabilities": { "0": 0.33, "1": 0.67, "2": 0.0 }
    },
    "is_urgent": { "type": "noul", "noul": 0.99 }
  },
  "usage": { "input_tokens": 428, "output_tokens": 73 }
}
```

Box example (from the OpenAPI spec, `jev-preview`):

```json
{
  "model": "jev-preview",
  "answers": {
    "red_rectangle": {
      "type": "box",
      "box": { "top": 0.2, "bottom": 0.66, "left": 0.19, "right": 0.68 },
      "confidence": null
    }
  },
  "usage": { "input_tokens": 285, "output_tokens": 20 }
}
```

### 4.2 `confidence` semantics (important — it is NOT P(correct))

Per [confidence.md](https://docs.typesafe.ai/confidence.md), `confidence` is a deterministic transform of
the returned `probabilities`, on a 0–1 scale where 1 = all mass on one outcome:

- **Choice:** `confidence = (p_max − 1/n) / (1 − 1/n)`. It is a monotone function of `p_max` alone, so
  for a fixed option count it adds **zero** information beyond `probabilities`. Do **not** threshold on
  both.
- **Score:** `confidence = max(0, 1 − Σ p_i·|i − m| / MAD_unif)` — distance-weighted, so a split between
  adjacent levels barely lowers it, a split across ends zeroes it.
- **Noul:** no confidence; use `|2p − 1|` if you need a comparable number.
- **Better threshold for a Choice: `probabilities[choice]`** — that is literally P(chosen option is
  correct), and readable as risk ("act when chance of wrong option < 10%").

### 4.3 Error shapes & status codes (official)

Two different envelopes exist:

**`422` validation** (FastAPI-style, `HTTPValidationError`):
```json
{ "detail": [ { "loc": ["body","state"], "msg": "Field required", "type": "missing",
                "input": "...", "ctx": {"min_length": 1} } ] }
```

**`400` application validation** (`HTTPBadRequestError`):
```json
{ "detail": "string or object explanation" }
```

**Observed live** — `GET https://api.typesafe.ai/v1/models` with no key returned **HTTP 403**:
```json
{"detail":{"error_type":"authentication_error","message":"Must supply an API key! Check your request and try again."}}
```
So the auth envelope is `{"detail":{"error_type",...,"message"}}` and a missing key is **403, not 401**
as the docs table says. Handle both 401 and 403 as auth errors.

| Status | Meaning (official docs) | Billed? |
|---|---|---|
| `400` | Broke a request rule (invalid UTF-8, >64 nesting, non-finite number, bad compression); or `max_tokens_exceeded` (context overflow); or image/asset problems | no |
| `401` | Missing/invalid key (**observed as 403 for missing key**) | no |
| `403` | *(observed)* authentication_error for absent key | no |
| `413` | Body >32 MiB, or an image/size limit exceeded | no |
| `415` | Unsupported `Content-Encoding` or >1 compression layer | no |
| `422` | Body failed schema validation (missing field, malformed question) | no |
| `429` | Rate limit exceeded | no |
| `529` | TypeSafe overloaded | no |

**Notably absent from official docs:** any `402 insufficient_*` / balance error, any `502 upstream_error`,
and any billing/refund page at all. Those appear only in the reseller's docs (§7). Assume the official
API simply 429s/4xx's when quota is exhausted, but **verify against the console before relying on it.**

---

## 5. Models, aliases, deprecation, pricing, rate limits

### 5.1 Current models ([models.md](https://docs.typesafe.ai/models.md), verified 2026-11-09)

| | Jev 1.14 | Jev 1.13 |
|---|---|---|
| Model ID | `jev-1.14.0` | `jev-1.13.0` |
| Price | $42 / Btok = **$0.042 / Mtok** input | same |
| Context | 64k per-request / 32k per-question | same |
| Input | text, images | text, images |
| Question types | choice, score, noul, **box** | choice, score, noul |

Jev 1.14 shipped **2026-10-14** (per [changelog.md](https://docs.typesafe.ai/changelog.md)): better
multilingual, new `box`, images anywhere in `state`/`instructions`/`criteria`, long context — the latter
two also work on 1.13.

### 5.2 Aliases

| Alias | Resolves to | Notes |
|---|---|---|
| `jev-latest` | `jev-1.14.0` | "most recent stable official release"; default in SDKs |
| `jev-preview` | `jev-1.14.0` | **Explicit warning: currently identical to `jev-latest`; no preview build exists right now.** |

- Aliases **move**; a versioned ID pins behavior. If you tune thresholds, pin `jev-1.13.0` or `jev-1.14.0`.
- Any response's `model` field gives the versioned ID that actually answered → log it per call.
- `GET /v1/models` returns `{ models: [ { name, description, release_date } ] }`, currently **the aliases**;
  versioned IDs are accepted even when not listed.
- **No deprecation policy, sunset window, or deprecation header is published.** The changelog has only
  the 1.14 entry. Treat versioned IDs as the only stability guarantee.

### 5.3 Pricing

- **$0.042 per million input tokens** (= $42 per billion). **Output tokens free.** Images bill as input
  tokens at the same rate; no separate image charge.
- A $1 buys ~24M input tokens; a typical short triage request is a few hundred tokens.
- No batch discount, no committed-use pricing, no published per-account minimum. Enterprise/custom via sales.
- Token-count observable per call in `usage.input_tokens`.

### 5.4 Rate limits

- **Set per organization**, measured in **tokens per second AND requests per second**; exceeding either
  → `429`. Current values live in the console: <https://console.typesafe.ai/rate-limits> (auth required).
- SDKs retry automatically with backoff and **honor `retry-after`** when present.
- The official models page as fetched does **not** print numeric limits.
- `jev.pro` (independent, 2026-09-21) claims **250,000 tok/s and 1,200 RPM** — plausible but **not
  confirmed** on the current official page. Treat as unverified.
- **No documented per-key rate limit** on the official API (limits are per org). The reseller's
  "120 req/min per key" is its own.

### 5.5 Retry / refund semantics

- **Official:** only "output tokens are currently free". **Nothing documented** about refunds for failed
  calls, idempotency, or duplicate-charge protection. There is **no documented `Idempotency-Key` header**
  (the OpenAPI lists only the two `TypeSafe-Danger-Zone-*` headers).
- Retry guidance is explicit and safe to implement: **429 and 529 → exponential backoff**, honor
  `retry-after`; 4xx (except 429) → do not retry, fix the request.
- Because idempotency is undocumented, a retried 529 could in principle double-bill. Keep retries few,
  log `usage.input_tokens` per attempt, and reconcile against the console.
- **Reseller (jevmodel.org)** *does* document `Idempotency-Key` (≤100 chars, reuses the original billing
  record) and automatic refunds for upstream failures/timeouts — see §7.

---

## 6. OpenAI compatibility, SDKs, self-hosting

### 6.1 OpenAI-compatible surface: **No**

- Official docs enumerate exactly two endpoints (`POST /v1/systemone`, `GET /v1/models`). No
  `/v1/chat/completions`, `/v1/completions`, `/v1/embeddings`, `/v1/responses`, no SSE streaming.
- [coding-agents.md](https://docs.typesafe.ai/introduction/coding-agents.md) is unambiguous:
  "Jev is **not** a drop-in replacement for the LLM behind Claude Code, Cursor, opencode, Copilot...",
  "It does not generate text, write code, or hold a conversation", "There is no `model: "jev-latest"`
  setting that turns your coding agent into a Jev-powered agent."
- The wire format is not OpenAI-shaped at all: request is `{model,state,questions,assets}`; response is
  `{model,answers,usage}`. No `choices[]`, no `message`, no `finish_reason`, no `delta`.
- Gateways (Vercel AI Gateway `typesafe-ai/jev`, OpenRouter, TrueFoundry, Cloudflare Workers AI) resell
  Jev, but they expose **Jev's native typed API**, not an OpenAI chat facade. (Vercel's changelog page
  body is JS-rendered and I could not extract the exact HTTP shape — treat "same typed API behind a
  gateway" as inference.)

**Consequence for the harness:** Jev cannot be dropped in as a provider behind an OpenAI-shaped
interface. It needs a dedicated adapter with its own request/response types.

### 6.2 Official SDKs

| Language | Package | Requirements | Notes |
|---|---|---|---|
| Python | `typesafe-sdk` (PyPI), import `typesafe_sdk` | Python ≥3.10 | `TypeSafeClient` (sync) / `AsyncTypeSafeClient`; reads `TYPESAFE_API_KEY`; typed `Choice`/`Score`/`Noul`/`Box` classes; `Image` for assets |
| JS/TS | `@typesafe-ai/sdk` (npm) | Node ≥20 (≥22.18 to run TS directly) | `TypeSafeClient`, helpers `choice()`, `score()`, `noul()`, `box()`, `image()`, `withAssets()`; **infers answer types** so `response.answers.department.choice` is typed as the union of your option names |

- Both: `system_one()` / `systemOne()` methods, `models.list()`, and a configurable **`RetryPolicy`**
  (attempt count, retryable statuses, backoff, retry-header handling) — retries on by default.
- Error classes (JS): `AuthenticationError`, `RateLimitError`, `BadRequestError`, `UnprocessableEntityError`,
  `InternalServerError`, `APIConnectionError`, `APITimeoutError`, `APIUserAbortError`, `NotFoundError`,
  `PermissionDeniedError`.
- Both SDKs **auto-create asset references and upload images** for you.
- SDKs are open client libraries around a closed hosted model.

### 6.3 Self-hosting the open-weight model — `autotrust/JEV-27B`

**This is NOT TypeSafe's model.** Verify before planning around it:

- License: **Apache-2.0** weights; base = `Qwen/Qwen3.8-27B` (Apache-2.0); corpus
  `SargeDev/jev-distill-corpus-v3`.
- It is an **independent distillation/student of TypeSafe Jev 1.13** (teacher outputs collected via
  OpenRouter). Card: "not affiliated with, endorsed by, or a product of TypeSafe AI, and shares no weights
  or code with it."
- Composition: frozen Qwen3.8-27B text backbone (53.8 GB bf16) + **LoRA r=16 adapter** (108.9M params,
  416 MB, shipped unmerged) + a **24-slot fp32 decision head** (`head.safetensors`) + per-kind
  temperatures (`calibration.json`).
- Quality vs teacher: mean **KL ≈ 0.017** on 25,376 Jev-labelled held-out rows; choice top-1 agreement
  90.5%; noul AUROC 0.995; score MAE 0.098; ECE 0.0009. i.e. a close behavioral clone, not identical.
- `autotrust/JEV-27B-VL` = same + vision (Qwen3.8-27B vision tower, unchanged; System 1 adapter still
  text-trained, so image decisions are zero-shot). Apache-2.0, gated on nothing special.

**Serving — it IS OpenAI-compatible, in two distinct modes** (`serve_decide.py` = stock vLLM server +
one extra route):

1. **System 1 (the Jev-like part): `POST /v1/decide`** — a *custom* route, not OpenAI chat.
   ```json
   { "kind": "choice", "state": "...", "question": "...", "options": ["billing","tech"] }
   ```
   → `{"kind","effective_kind","options","probabilities":[...],"choice_index","choice",
      "adaptation":"native|wide-labels","protocol":"jev27-bare-v1","model","usage":{...},
      "num_model_requests","elapsed_seconds"}`
   - `kind`: `noul` (options fixed `["false","true"]`), `score` (fixed `"0".."5"`), `choice` (**2–256** options).
   - Text or images (`state` as a list of text strings and `{"image": "data:..."}` / `https://` URLs).
   - `GET /v1/decide/info` reports option limits and temperatures.
2. **System 2 (general chat): `POST /v1/chat/completions`** — plain OpenAI chat, `model:
   "autotrust/JEV-27B"`, `messages`, `max_tokens`, `chat_template_kwargs: {"enable_thinking": true}`.
   **But this path is just the untouched Qwen3.8-27B** (HumanEval 78.0%, byte-identical to base). It is
   a general LLM, but it is *not* "Jev" — no typed decisions, no calibration guarantees.

Ops caveats (27B card): needs a vLLM dev build with `qwen3_5` support, LoRA on `lm_head`,
`--logprobs-mode processed_logprobs`, `allowed_token_ids`; startup 3–8 min (LoRA CUDA-graph capture);
`--max-num-seqs 8` is **required** for correct multimodal probabilities; for `/v1/completions` or
`/v1/chat/completions` used as System 1, force `top_k: 0, top_p: 1.0` or probabilities get truncated
(the generation config defaults to top_k=20/top_p=0.95). 256K context needs `--max-model-len 262144`
(≈17 GB extra KV cache; 131072 on an 80 GB GPU). Latency ~137 ms/decision on one B200.

**Verdict:** self-hosting gives you (a) a typed-decision endpoint you can put behind your own gateway and
(b) an ordinary chat LLM on the same port. Neither is TypeSafe's Jev; (b) is especially not.

---

## 7. Batch and agent tools

### 7.1 Batch

- **Official TypeSafe: there is no batch API.** No `/batch` endpoint, no async job objects, no file
  upload, no batch discount, no webhook. `llms.txt` lists nothing batch-related. Batching = send more
  questions in one `POST /v1/systemone` (state cost is shared; only one round-trip).
- **jevmodel.org `/batch` is a browser UI, not an endpoint.** It runs client-side in the tab:
  CSV/TXT/JSONL upload (**≤1,000 rows, ≤2 MB, ≤8,000 chars/row**), a "judge" = one fixed question set,
  chunked execution with pause/resume/retry, CSV/JSONL export. Each row is sent to `/v1/systemone`;
  billed per row's actual input tokens, **no batch surcharge**, failures not charged. Files are parsed
  locally and never uploaded as a file.
- **Relevance to the harness: low.** If you need throughput, batch questions per request and parallelize
  requests yourself under the 429 budget. Don't build against `/batch`.

### 7.2 Agent tools / MCP

- **Official TypeSafe: no MCP server.** Instead they ship an **agent skill** (documentation/playbook for
  coding agents, not a runtime tool):
  - Claude Code: `claude plugin marketplace add typesafe-ai/skills` then
    `claude plugin install typesafe@typesafe-ai`
  - Others: `npx skills add typesafe-ai/skills --skill typesafe-ai`
  - Raw skill: <https://github.com/typesafe-ai/skills/blob/main/skills/typesafe-ai/SKILL.md>
  - This is *context for an agent writing TypeSafe code*. It gives the agent no callable Jev tool.
- **jevmodel.org runs a real remote MCP server**: `https://jevmodel.org/mcp`, **Streamable HTTP**,
  protocol `2025-06-18`. Verified live via `GET /mcp` (returns the discovery card):

  ```json
  {"name":"jevmodel","title":"Jev decisions via jevmodel.org","version":"1.0.0",
   "transport":"streamable-http","endpoint":"https://jevmodel.org/mcp",
   "authentication":"Authorization: Bearer sk-...",
   "protocolVersion":"2025-06-18",
   "tools":[{"name":"jev_decide"},{"name":"jev_noul"},{"name":"jev_choice"},{"name":"jev_score"}],
   "billing":"Input tokens only; output free.",
   "skill":"https://jevmodel.org/skills/jev/SKILL.md"}
  ```
  - `jev_decide` = full state + up to 8 typed questions; the other three are single-question convenience
    wrappers.
  - `initialize`, `ping`, `tools/list` are **unauthenticated**; only `tools/call` uses the Bearer key and
    bills tokens.
  - `claude mcp add --transport http jev https://jevmodel.org/mcp --header "Authorization: Bearer $KEY"`
  - There is also a reseller `SKILL.md` at `https://jevmodel.org/skills/jev/SKILL.md`.
- **Relevance: medium-high.** If the harness already speaks MCP, `jev_decide` is a shortcut to a working
  integration — but it ties you to the reseller's limits/aliases/billing, and the official API is a
  ~40-line HTTP adapter. For a production harness I'd call the official API directly and expose one
  internal tool (`jev_decide`) rather than depend on a third-party MCP server.

---

## 8. Official vs reseller vs community guide — discrepancies

This matters because the starting brief mixed sources. All rows verified against the official OpenAPI/docs.

| Topic | **Official (api.typesafe.ai)** | **jevmodel.org (reseller)** | typesafe-jev.com (guide) |
|---|---|---|---|
| Base URL | `https://api.typesafe.ai/v1/systemone` | `https://jevmodel.org/v1/systemone` (proxy) | `api.typesafe.ai` |
| Key env var | `TYPESAFE_API_KEY` | `JEVMODEL_API_KEY`, keys `sk-...` | `TYPESAFE_API_KEY` |
| `jev-latest` → | **`jev-1.14.0`** | **`jev-1.13.0`** | unstated; recommends pinning `jev-1.13.0` |
| `jev-preview` → | `jev-1.14.0` (no preview build) | `jev-1.14.0` | not mentioned |
| Questions/request | **no cap** (context-bound) | 1–8 | not stated |
| State limit | 64k tok (262k w/ header) | 1,000,000 chars | not stated |
| Choice options | **1–255** | 2–20 | not stated |
| Score levels | **1–10** | 2–10 | not stated |
| Instructions | string\|object\|array, no char cap | ≤1,800 chars | not stated |
| Question names | undocumented | `[A-Za-z0-9_]`, ≤64 chars | not stated |
| Rate limit | per **org**, tok/s + req/s, in console | **120 req/min per key** | not stated |
| Idempotency | **not documented** | `Idempotency-Key` header | not mentioned |
| Images header | **required** `TypeSafe-Danger-Zone-Images: true` | applied automatically by proxy | not mentioned |
| Image limits | 16 MiB, 280–1568 px, ≤32 MiB total | ~4 MB each, 256–1568 px, max 4 | not mentioned |
| Error envelope | `{"detail": ...}` (observed) | `{"error":{"type","message"}}` | not stated |
| Error codes | 400/401(403 obs.)/413/415/422/429/529 | 401/402/422/429/502 | 401/422/429/529 |
| Refunds | undocumented | failed/timeout auto-refunded | not stated |
| MCP | none (agent *skill* only) | **yes**, `/mcp`, 4 tools | not mentioned |
| Free tier | undocumented | 10k guest / 100k sign-in | not stated |

**Implication:** the reseller's stricter validator will reject requests the official API accepts
(>8 questions, >20 choice options, long instructions), and its `jev-latest` points at a *different model
version* than the official alias. Pick one vendor and pin versioned model IDs.

---

## 9. Verified vs inferred

**Verified (fetched this session):**
- Full OpenAPI 3.1 schema for `POST /v1/systemone` and `GET /v1/models`, incl. every question/answer
  discriminator, required fields, `maxProperties: 255` (choice), `maxItems: 10` (score), asset shape.
- Base URL, Bearer auth, console key creation, `TYPESAFE_API_KEY`.
- Context limits 64k/32k, long-context header → 262k; long context works on 1.13 and 1.14.
- Aliases `jev-latest`/`jev-preview` → `jev-1.14.0` + explicit "no preview build" warning; 1.14 released
  2026-10-14 with Box + multilingual + images + long context.
- Price $42/Btok = $0.042/Mtok input, output free.
- Request rules (32 MiB, 64 nesting levels, finite numbers, gzip/zstd) and the official status table
  (400/401/413/415/422/429/529).
- Live unauthenticated error: **403** `{"detail":{"error_type":"authentication_error",...}}`.
- Image limits (16 MiB, 280–1568 px, 32 MiB total, PNG/JPEG still only) + mandatory images header +
  multipart format + reference rules.
- Confidence formulas for choice/score/noul.
- Python `typesafe-sdk` / JS `@typesafe-ai/sdk`, method names, retry policy, typed answers.
- No OpenAI-compatible endpoint; docs explicitly say Jev is not a chat/coding model.
- No batch API and no MCP server officially; agent *skill* exists (plugin/`npx skills`).
- Reseller: 100k free on sign-in, 10k guest, packs from $9.90, 120 req/min/key, 1–8 questions,
  1M-char state, `Idempotency-Key`, automatic refunds, `402` insufficient_credits, `502` upstream_error,
  MCP server verified live (4 tools, protocol 2025-06-18, unauth initialize/list).
- HF: Apache-2.0, Qwen3.8-27B base + LoRA + 24-slot head, KL 0.017 to Jev 1.13, `serve_decide.py` adds
  `POST /v1/decide`, System 2 = stock Qwen via `/v1/chat/completions`, `--max-num-seqs 8` requirement,
  VL variant = same + unchanged vision tower.

**Inferred / unverified (flagged):**
- That jevmodel.org is an HTTP *proxy* in front of TypeSafe rather than a separate deployment — strongly
  implied by "swap the base URL", "the proxy applies the upstream opt-in header", and "if you already run
  Jev in production on a TypeSafe, OpenRouter, or Vercel account, their per-token list price is lower",
  but not confirmed by either party.
- Official numeric rate limits (jev.pro's 250k tok/s / 1,200 RPM is third-party and not on the page I fetched).
- Whether TypeSafe grants signup credit (console is behind auth).
- Whether a `402`/quota-exhausted state exists on the official API (undocumented).
- Exact behavior of Vercel/OpenRouter/TrueFoundry facades (Vercel page is JS-rendered; TrueFoundry page
  content did not render past nav).
- Determinism/rounding: HF card says the hosted API "rounds probabilities" to two decimals — consistent
  with `0.33/0.67/0.0` examples, but not stated in official docs.

---

## 10. Minimal adapter sketch for the harness

```ts
// One call = one typed decision. No streaming, no retries beyond 429/529, log resolved model + tokens.
type Question =
  | { type: "noul"; instructions: string; criteria?: { true?: string; false?: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }   // ≤255 options
  | { type: "score"; instructions: string; criteria: string[] }                  // ≤10 levels
  | { type: "box"; instructions: string };                                       // needs 1.14 + images header

async function jev<T extends Record<string, Question>>(
  state: unknown, questions: T,
  opts: { model?: string; assets?: Record<string, Asset>; idempotencyKey?: string } = {}
) {
  const headers: Record<string,string> = {
    Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`,
    "Content-Type": "application/json",
  };
  if (opts.assets) headers["TypeSafe-Danger-Zone-Images"] = "true";
  // NOTE: Idempotency-Key is only supported by the jevmodel.org reseller, not documented upstream.
  const res = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST", headers,
    body: JSON.stringify({ model: opts.model ?? "jev-1.14.0", state, questions, assets: opts.assets }),
  });
  if (!res.ok) throw new Error(`jev ${res.status}: ${await res.text()}`); // 400/403/413/415/422/429/529
  return res.json() as Promise<{
    model: string;
    answers: Record<keyof T, any>;      // narrow per question type in real code
    usage: { input_tokens: number; output_tokens: number };
  }>;
}
```

**Harness wiring suggestions**

- Pin `jev-1.14.0` (or `jev-1.13.0`) in config; never ship `jev-latest` in a threshold-sensitive path.
- Threshold on `probabilities[choice]` or `noul` directly; keep `confidence` for logging/telemetry.
- Put the model version from every response into your trace; Jev answers can change when an alias moves.
- Treat all answer values as **advisory**: wrap any destructive/irreversible action with a probability
  gate plus a human confirm path.
- Budget: input-only, ~$0.042/Mtok. A 1k-token state × 5 questions ≈ 5k tokens ≈ $0.0002. Fan-out is
  cheap; latency is roughly flat in question count, so **batch questions per call**.
