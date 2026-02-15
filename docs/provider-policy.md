# Provider Policy (v1)

This document defines how Darshan routes LLM requests when the goal is **cheapest while still good at reasoning**, with deterministic fallbacks and guardrails.

## Default routing order (cheap + reasoning)
Use the first available provider in this order:

1. **Gemini 2.5 Flash**
2. **Claude Haiku**
3. **OpenAI 4o-mini**
4. **Grok-2-mini**

Rationale: prioritize lowest cost models that still perform reliably on general reasoning; keep multiple vendors to reduce correlated outages/rate limits.

## Escalation policy
Escalate *up* only when needed (keep default cheap path by default):

- **Hard tasks / higher reasoning depth:** escalate to **Claude Sonnet**
  - Triggers (examples): multi-step planning, ambiguous requirements, complex debugging, long-context synthesis, repeated low-quality outputs from cheaper tier.
- **Coding-focused tasks:** escalate to **OpenAI Codex**
  - Triggers (examples): non-trivial code generation/refactors, tool-using coding agents, patch generation, test-driven changes.

Implementation guidance: escalation should be explicit (a flag like `task.difficulty=hard` or `task.kind=coding`) and logged.

## Fallback triggers (within the same tier)
When calling a provider/model in the default routing order, automatically fall back to the next provider on:

- **HTTP 429** (rate limit / quota)
- **HTTP 5xx** (provider/server error)
- **Timeouts** (connect, read, or overall deadline exceeded)

Notes:
- Retries should be bounded (e.g., 1 retry with jitter) to avoid request storms.
- Preserve idempotency: avoid repeating side-effecting tool calls when retrying.

## Guardrails
Keep requests bounded to protect latency and spend.

- **Max output tokens:** set a per-request cap (recommended default: **2,048**; allow overrides for summarization/synthesis).
- **Max input tokens/context:** enforce a ceiling and trim/summarize when exceeded.
- **Max wall-clock time:** set an overall deadline (recommended default: **30s** cheap tier; **60–120s** for escalated models).
- **Fallback budget:** stop after exhausting the provider chain (return a clear error including last failure reason + request id).

## Operational note: Gemini quota exhaustion
We have observed **Gemini quota exhaustion** in real usage. Treat Gemini 429s as a normal condition:

- Immediately fall back to the next provider.
- Consider tracking quota/rate-limit headers and temporarily deprioritizing Gemini when exhausted.

## Example configuration (YAML)
This is an illustrative example of how to represent the policy in app config.

```yaml
llmRouting:
  strategy: cheapest_reasoning_v1

  defaultChain:
    - provider: gemini
      model: gemini-2.5-flash
    - provider: anthropic
      model: claude-3.5-haiku
    - provider: openai
      model: gpt-4o-mini
    - provider: xai
      model: grok-2-mini

  escalation:
    hardTasks:
      provider: anthropic
      model: claude-sonnet
    coding:
      provider: openai
      model: codex

  fallbackOn:
    httpStatus: [429]
    httpStatusPrefix: [5]   # any 5xx
    timeout: true

  guardrails:
    maxOutputTokens: 2048
    maxWallClockMs:
      cheapTier: 30000
      escalated: 120000
    maxRetriesPerProvider: 1
```
