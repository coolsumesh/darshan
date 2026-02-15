# Provider & Model Routing Policy

This document defines **how Darshan chooses an LLM provider/model** for a given run.

Goals:
- Keep the default path **cheap and fast**.
- Escalate to **reasoning-capable** models only when needed.
- Be deterministic, auditable, and safe (guardrails + fallbacks).

Non-goals:
- Perfect cost optimization.
- Automatic vendor benchmarking.

---

## 1) Terminology

- **Provider**: an API vendor (OpenAI, Anthropic, Google, etc.).
- **Model**: a concrete model id under a provider.
- **Route**: a named decision rule that picks a provider/model + parameters.
- **Cheap path**: the default route optimized for latency/cost.
- **Reasoning path**: higher-quality route used for complex tasks.

---

## 2) Default routing: cheap vs reasoning

Darshan should implement a two-tier routing strategy:

### 2.1 Cheap (default)
Use for:
- Short Q&A
- Summaries
- UI copy, small edits
- Simple classification/extraction
- Most chatty interactions

Characteristics:
- Low latency
- Lower context window acceptable
- Lower temperature (more consistent)

### 2.2 Reasoning (escalation)
Use for:
- Multi-step planning
- Non-trivial debugging
- Architecture/design decisions
- Code generation that must compile / follow constraints
- Long-context synthesis across many messages

Characteristics:
- More deliberate model
- Lower temperature, but higher “thinking”/effort if supported
- Stronger instruction-following and correctness

---

## 3) Provider order (preference list)

Provider order is expressed as **ordered candidate lists** for each route. The orchestrator attempts candidates in order until a success condition is met.

### 3.1 Cheap route candidate order
1. **Google**: `gemini-2.5-flash` (fast/cheap general)
2. **OpenAI**: `gpt-4o-mini` (fast general fallback)
3. **Anthropic**: `claude-3.5-haiku` (fallback)

### 3.2 Reasoning route candidate order
1. **OpenAI**: `o3-mini` (reasoning)
2. **Anthropic**: `claude-3.7-sonnet` (reasoning fallback)
3. **Google**: `gemini-2.5-pro` (reasoning fallback)

Notes:
- The exact model ids can be configured; the policy defines the *shape*.
- If you only have keys for a subset of providers, remove the others from the list.

---

## 4) Escalation policy (when to switch to reasoning)

Escalation can be triggered **explicitly** or **automatically**.

### 4.1 Explicit escalation
Escalate when:
- User selects “High quality / Reasoning” in UI.
- An agent requests escalation via metadata: `run.mode = "reasoning"`.

### 4.2 Automatic escalation triggers
If the run starts on the cheap path, escalate to reasoning when **any** of the following is true:

**Complexity / task signals**
- The prompt contains planning/debug signals (e.g. “step-by-step”, “design”, “tradeoffs”, “root cause”, “prove”, “counterexample”).
- The user asks for changes across multiple files/modules.
- Output must satisfy strict constraints (schema, compilation, tests).

**Confidence / self-reporting**
- Cheap model responds with uncertainty markers: “not sure”, “I can’t determine”, “might be wrong”, etc.
- Cheap model requests more context that already exists in thread context.

**Validation failures (recommended)**
- JSON/schema output fails to parse/validate.
- Generated code fails formatting/linting.
- Post-run checks fail (tests, typecheck) *and* error is non-trivial.

**Long-context needs**
- Context window usage is above a threshold (e.g. >70% of max tokens).

Implementation hint:
- Record the reason in the run audit trail: `escalation_reason`.

---

## 5) Fallback triggers (when to switch provider/model)

A **fallback** is a retry against the next candidate in the route’s provider order.

Trigger fallback on:

### 5.1 Transport / provider errors
- Network errors / timeouts
- 429 rate limits (after bounded backoff)
- 5xx provider errors

### 5.2 Hard capability mismatches
- Model does not support required modality (vision/audio)
- Model does not support tool calling when required
- Context length exceeded

### 5.3 Safety blocks / refusals
- If refusal is unexpected for the task, try the next provider once.
- If refusal is expected (policy violation), **do not fallback**; return refusal.

### 5.4 Output quality / format failures
- Repeated invalid JSON or schema violations (after one “repair” attempt)
- Truncated output (hit max tokens) when completeness is required

Boundaries:
- Max **N attempts** per run (recommended: 3 total attempts across providers)
- Max wall-clock time per run (recommended: 60–120s interactive; longer for batch)

---

## 6) Guardrails (cost, safety, and reliability)

### 6.1 Cost / token controls
- Per-run max tokens (input + output)
- Per-run max retries
- Optional per-thread budget (soft limit) and per-day global budget (hard limit)

### 6.2 Timeouts
- Provider request timeout (e.g. 30s)
- Overall run timeout (e.g. 120s)

### 6.3 Tooling restrictions
If tool calling is enabled:
- Allowlist tools per agent capability
- Enforce max tool calls per run
- Validate tool arguments against schema

### 6.4 Prompt + output hygiene
- Strip secrets from logs
- Store only necessary request/response payloads
- Add a system message requiring:
  - no credential exfiltration
  - no destructive commands without confirmation
  - cite uncertainty when present

### 6.5 Loop + escalation protection
- Cap escalation depth (cheap→reasoning only once per run by default)
- If reasoning model also fails, stop and ask for human input instead of infinite retries

---

## 7) Configuration example

Below is an example config shape (YAML). Adjust to your actual config system.

```yaml
llmRouting:
  defaults:
    temperature: 0.2
    maxOutputTokens: 1200
    requestTimeoutMs: 30000
    runTimeoutMs: 120000
    maxAttempts: 3

  routes:
    cheap:
      candidates:
        - provider: google
          model: gemini-2.5-flash
        - provider: openai
          model: gpt-4o-mini
        - provider: anthropic
          model: claude-3.5-haiku

      temperature: 0.3
      maxOutputTokens: 900

    reasoning:
      candidates:
        - provider: openai
          model: o3-mini
        - provider: anthropic
          model: claude-3.7-sonnet
        - provider: google
          model: gemini-2.5-pro

      temperature: 0.2
      maxOutputTokens: 1600

  escalation:
    enabled: true
    maxEscalationsPerRun: 1
    triggers:
      - type: schema_validation_failed
      - type: test_failed
      - type: context_pressure
        threshold: 0.7
      - type: uncertainty_markers
        patterns: ["not sure", "might be wrong", "can’t determine"]

  budgets:
    perRunMaxUsd: 0.15
    perThreadSoftMaxUsd: 2.00
    perDayHardMaxUsd: 20.00

  logging:
    redact:
      - OPENAI_API_KEY
      - ANTHROPIC_API_KEY
      - GOOGLE_API_KEY
```

---

## 8) Auditing requirements

For every run, persist:
- Selected route: `cheap` or `reasoning`
- Selected provider + model
- Attempt count and fallbacks taken
- Escalation reason (if escalated)
- Token usage / estimated cost (if available)
- Terminal status (`succeeded|failed|timeout|canceled`) + error codes

This ensures we can answer:
- “Why did we pick this model?”
- “What did it cost?”
- “Did we retry? Why?”
