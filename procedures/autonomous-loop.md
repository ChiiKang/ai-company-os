# Bounded autonomous loop

Before planning, the CLI performs bounded deterministic lexical retrieval and injects `What we already know` with stable local references and adverse-result warnings. Every role then uses one state machine: **plan → act → observe → evaluate**. The CLI atomically checkpoints the same order and rejects skipped phases, work after termination, resource overruns, unknown operations, and unapproved boundary operations.

## 1. Plan

Name the current hypothesis, the smallest action that could change the decision, expected evidence, disconfirming result, time slice, and stop condition. Prefer high-information, reversible work. Do not expand the original assignment.

## 2. Act

Perform only the planned safe action. Default cross-industry actions are literature review, simulation, public datasets, source inspection, and isolated safe software work. Record exact commands and versions for experiments.

Record known wall-clock, model-token, monetary, tool-call, and download usage. Unknown usage stays unknown and stops; it is never assumed free. Stop before any paid API, cloud resource, download over 5 GB, protected credential access, security-sensitive operation, destructive action, hazardous physical procedure, production deployment, or unrequested construction. A recorded handoff is not approval.

AI Company OS never autonomously executes wet-lab, chemical, biological, manufacturing-equipment, hazardous physical, or industrial-control work.

## 3. Observe

Capture raw evidence before interpreting it: source dates, retrieval time, URI, content hash, command, stdout/stderr, metrics, environment, and failure. Store private evidence by relative path and give it a stable evidence identifier. Never put a secret in evidence.

## 4. Evaluate

Compare evidence to the assignment's metric, target, baseline, and disconfirming condition. State confidence and uncertainty. Select exactly one outcome:

- `success` - target met with evidence references;
- `continue` - target not met and a useful untested hypothesis remains;
- `proven-blocker` - evidence establishes a blocker;
- `exhausted-useful-hypotheses` - remaining attempts would not materially improve the decision;
- `resource-boundary` - time, iteration, cost, or approved resource is exhausted;
- `approval-boundary` - the useful next act requires captain approval.

`continue` starts a new plan. The first composite ceiling reached - wall clock, model tokens, money, tool calls, or download bytes - stops work. Maximum iterations and budgets are hard limits, not targets to consume. Builder's budget must come from an approved plan. Use [`resource-and-recovery.md`](resource-and-recovery.md) for checkpoint inspection/resume and never relabel an incomplete loop as success.
