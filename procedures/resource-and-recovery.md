# Composite resources and recovery

## Accounting

Every phase records incremental wall-clock minutes, model tokens, monetary cost, tool calls, and download bytes. The run stops at the first approved ceiling. Unknown usage is recorded as `unknown` and stops the run; it is never converted to zero. Paid usage has a zero default and needs both a positive approved monetary ceiling and approval for the paid operation.

Accepted default role wall-clock ceilings are Research 120 minutes, Project Validation 240 minutes, and Idea Validation 120 minutes. Builder wall time comes from its approved plan. Workflow wall time is the sum of explicitly selected role ceilings.

## Atomic checkpoints

Each recorded phase is atomically persisted with a sequence and SHA-256 state identity. `run inspect` verifies the checkpoint and assignment identity without loading report bodies. Do not edit a run record.

## Resume

After interruption, inspect the run and independently re-check:

1. supplied source fingerprint/identity;
2. isolated environment fingerprint;
3. captain approval identifiers still in scope;
4. immutable artifact references accumulated by the run;
5. current checkpoint hash.

Put those exact values in a private v1 resume attestation and call `run resume`. Resume refuses any mismatch, terminal run, or handoff boundary. A resource-exhausted run needs a new/updated captain-approved assignment rather than a resume that enlarges budgets.
