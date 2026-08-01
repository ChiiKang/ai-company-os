# Endpoint and integration procedure

1. Define consumer/provider ownership and a versioned contract: method/event, path/topic, request, response, errors, authentication, authorization, validation, limits, and compatibility.
2. Model trust boundaries and data classification. Send only necessary fields; never place raw secrets in code, logs, reports, model context, fixtures, or artifacts.
3. Set explicit timeouts and bounded retries. Use idempotency for repeatable writes where duplicate effects matter. Handle partial failure and cancellation.
4. Keep adapters thin and domain behavior testable without the external service. Use contract tests and deterministic fakes, then one approved end-to-end test.
5. Emit safe structured operational signals: request/correlation ID, outcome, latency, retry count, and redacted error class. Never log authorization material or payloads by default.
6. Trace frontend states to backend errors. A user must know what happened, what was preserved, and how to recover.
7. Record service cost, rate limits, data retention, availability assumptions, and fallback behavior.

Protected credentials enter only through the approved Automic Vault named-key command boundary. Paid APIs, cloud resources, security-sensitive access, and production endpoints require captain approval even when the integration is in the plan.
