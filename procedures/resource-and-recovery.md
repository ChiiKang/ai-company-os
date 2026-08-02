# Composite resources and recovery

## Accounting

Every phase records incremental wall-clock minutes, model tokens, monetary cost, tool calls, and download bytes. The run stops at the first approved ceiling. Unknown usage is recorded as `unknown` and stops the run; it is never converted to zero. Paid usage has a zero default and needs both a positive approved monetary ceiling and approval for the paid operation.

Accepted default role wall-clock ceilings are Research 120 minutes, Project Validation 240 minutes, and Idea Validation 120 minutes. Builder wall time comes from its approved plan. Workflow wall time is the sum of explicitly selected role ceilings.

## Atomic checkpoints

Each recorded phase is atomically persisted with a sequence and SHA-256 state identity. `run inspect` verifies the checkpoint and assignment identity without loading report bodies, and reports the stored and current workflow contract identity with an explicit drift warning when they differ. It answers from stored checkpoint data alone and never re-validates the assignment against live contracts, so it keeps working when the selected contract is missing or unloadable. Inspection stays read-only: it never migrates a run and never accepts changed rules. Do not edit a run record.

## Resume

After interruption, inspect the run and independently re-check:

1. supplied source fingerprint/identity;
2. isolated environment fingerprint;
3. captain approval identifiers still in scope;
4. immutable artifact references accumulated by the run;
5. current checkpoint hash.

Put those exact values in a private v1 resume attestation and call `run resume`. Resume refuses any mismatch, terminal run, or handoff boundary. A resource-exhausted run needs a new/updated captain-approved assignment rather than a resume that enlarges budgets.

## Changed workflow contract

A workflow run also stores the selected contract's `schema_version` and digest. If that contract changes mid-run, `run event` and `run handoff` stop immediately, while `run inspect` still succeeds and returns `workflow_contract.stored`, `workflow_contract.current`, `workflow_contract.current_status`, and a drift warning.

`current_status` is `current`, `changed`, `missing`, `unloadable`, or `not-applicable`. `drift_detail` explains that status: the identity fields that differ for a `changed` contract, and the loader's own message for a `missing` or `unloadable` one. A `missing` or `unloadable` contract keeps every mutating command blocked and cannot be migrated: restore a valid published contract first, then resume.

Resuming a `changed` contract requires an additional `workflow_contract_migration` object in the attestation naming `approval_id`, `stored_schema_version`, `stored_sha256`, `current_schema_version`, and `current_sha256`. Both identities must match exactly what `run inspect` reported, the workflow name and declared route must be unchanged, and no declared confidence floor may be lowered. Anything else needs a new captain-approved assignment.
