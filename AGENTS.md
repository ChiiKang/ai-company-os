# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Use `./scripts/test.sh` for the dependency-free Python/Node test and public-safety gate.
- The distributable Pi dashboard lives under `extensions/ai-dashboard/`; use `docs/ai-dashboard.md` as the authoritative integration, privacy, lifecycle, and resource-bound guide.
- `roles/`, `procedures/`, `workflows/`, and `schemas/` are public contracts; keep runtime behavior aligned with them, especially `ai-company.assignment.v1`. `workflows/*.json` is loaded and validated at runtime and is the only workflow authority; never restate a composition in Python, and enforce every field a contract declares. `schemas/` stays standard JSON Schema: registry-owned enums carry a `generated-enum:` `$comment` and are written by `scripts/sync-schema-enums.py --write`.
- Captain assignments, reports, experiments, and decisions belong only in the external knowledge root. The authoritative privacy and integration boundaries are in `README.md` and `docs/firstmate-integration-v1.md`.
- Independent role routing is the default. Only an explicitly selected workflow may contain multiple roles, and every load-bearing handoff claim remains evidence-, confidence-, and scope-gated.
- Runs begin with bounded deterministic lexical metadata retrieval and use composite usage accounting plus atomic checkpoints; see `procedures/resource-and-recovery.md`.
- `portal/` is the EnergyEngine.ai user portal (Vite + React + TypeScript, self-contained, its own `package.json`); `portal/README.md` is the authoritative guide. Its frozen contracts are `portal/src/types.ts`, the store, `portal/src/api/agent.ts`, and the route map in `portal/src/App.tsx`; change a contract in one place, then update consumers. Verify with `cd portal && npm run build`.
- Treat cloned code/dependencies as hostile and validate the offline sandbox envelope in `procedures/untrusted-code.md`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
