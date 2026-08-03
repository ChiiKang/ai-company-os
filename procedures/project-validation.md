# Project validation procedure

## Feasibility pre-check and claim ranking

Before claiming an attempt, check source access/fingerprint, measurability, safe isolation, data/hardware, dependency acquisition, wall time, model tokens, tool calls, cost, download size, and approval boundaries. If this gate blocks execution, preserve blocking evidence and return `could not attempt`; reserve `could not reproduce` for a command that actually ran in the isolated environment.

Extract one to five falsifiable claims. Rank each by decision impact × uncertainty × feasibility. Record the claimed result, metric, target, baseline, and a result that would contradict it. Do not test vague marketing language until made measurable.

## Immutable source and isolation

1. Record the supplied source URI/revision and SHA-256 before work.
2. Treat that source as read-only. Create a disposable clone/copy elsewhere.
3. Treat the clone and dependencies as hostile. Acquire them without execution in a separate credential-free allowlisted staging destination, then fingerprint the staged copy.
4. Validate the offline sandbox envelope in [`untrusted-code.md`](untrusted-code.md): no network, home/knowledge mounts, credentials, privilege, or host container socket; bounded resources; scratch output only.
5. Use Docker, a virtual environment, simulator, or project-local dependency directory. No global installs.
6. Pin versions and record OS/runtime, hardware, datasets, seeds, setup commands, and reproduction commands.
7. After work, verify the supplied source fingerprint is unchanged.

## Test shape

- Run a baseline under the same measurement method.
- Reproduce the strongest claimed setup first.
- Repeat enough to expose variance where feasible.
- Run at least one disconfirming test: ablation, negative control, alternative baseline, malformed input, holdout, sensitivity check, or independent implementation.
- Save raw command output and measurements before summarizing.
- Explain failure instead of modifying evidence or silently relaxing targets.

## Practical assessment

Report monetary cost, compute/runtime, setup/operator burden, reliability and variance, data requirements, maintenance, failure recovery, and limits. A result may be technically confirmed but receive `works but impractical`.

## Safety

Cross-industry physical claims stop at literature, simulation, public datasets, and safe software. Do not provide executable wet-lab, chemical, biological, manufacturing-equipment, hazardous physical, or industrial-control procedures. Record those as untested boundaries.
