# Firstmate integration contract v1

AI Company OS is a standalone subprocess and file boundary. Firstmate can operate it without importing its Python package or changing Firstmate core; a shell/tool adapter is sufficient. The same CLI remains usable directly by a person or another supervisor.

## Responsibilities

**Firstmate**:

1. Interprets the captain's natural-language requested outcome.
2. Selects exactly one `--role` by default. It selects `--workflow` only when the original request explicitly asks for that composition; a conceptual sequence is not permission.
3. Supplies the measurable goal, success criteria, constraints, composite ceilings, prior-knowledge query/references, narrow approval pre-grants, and recovery identities to `assignment create`; accepts the CLI-generated assignment-specific output path.
4. Invokes/supervises the model or worker at the `run start` adapter boundary using the returned bounded `what_we_already_know` block, `current_role`, `role_definition_path`, and linked public procedures.
5. Stops for approval boundaries, obtains the captain's decision, and records only an approval identifier. A workflow handoff never substitutes for approval.
6. Stores generated metadata and report files through this CLI, then returns `local_report_path` to the captain. It does not copy a report body into the public repository or routine logs.

**AI Company OS**:

- validates and privately stores assignments/runs/artifacts;
- routes only the explicit selection;
- runs deterministic pre-run lexical metadata retrieval and warns on related failed/rejected work;
- enforces loop order, composite ceilings, atomic checkpoints/recovery, operation boundaries, and observable handoff confidence/scope;
- returns machine-readable identifiers, status, and local paths without running a model or reading a secret.

## Stable CLI boundary

Invoke `bin/ai-company-os` from a clone. It always writes one JSON value to stdout on success. Errors are concise on stderr and never include document/report bodies.

- exit `0`: command succeeded (or policy operation is allowed);
- exit `2`: invalid input, contract, privacy, resource, or storage operation;
- exit `3`: `policy check` found an approval-required or prohibited operation.

Stable commands for v1:

```text
init
assignment create (--role NAME | --workflow NAME) ...
run start --assignment ID
run event --run ID --phase {plan,act,observe,evaluate} ...
run inspect --run ID
run resume --run ID --attestation PRIVATE_RECOVERY_JSON
run handoff --run ID --file PRIVATE_HANDOFF_JSON
artifact marker
artifact validate --type TYPE --file JSON
artifact store --type TYPE --file PRIVATE_JSON [--report PRIVATE_MARKDOWN]
artifact search [--assignment ID] [--type TYPE]
policy check --operation NAME [--download-gb NUMBER]
sandbox validate --file JSON --allowed-staging-root PATH
vault locate [--av-path PATH]
```

`--root` is a global option and may precede any command. `AI_COMPANY_OS_KNOWLEDGE_ROOT` is the environment alternative. Both must resolve outside the public clone.

## Stable file boundary

- Every file in `schemas/` is standard JSON Schema draft 2020-12 and can be checked by any conforming validator. Members owned by a runtime registry (role names, workflow names, approval categories) are written into the files as literal enums by `scripts/sync-schema-enums.py`, carry a `generated-enum:` `$comment`, and are held current by the test suite.
- Assignment records validate as `ai-company.assignment.v1` in `schemas/assignment.schema.json`. The contract has one initial role, optional explicit workflow, measurable success criteria, constraints, composite ceilings, prior-knowledge query/references, narrow pre-grants, a private-root-relative output path, and recovery guards. Project Validation routes require explicit supplied-source and isolated-environment identities before execution.
- `run start` performs bounded deterministic lexical retrieval over local metadata and returns `what_we_already_know` with stable `local://` refs, warnings, the one current role, and repository-relative `role_definition_path`; that is the independently callable worker boundary.
- Every `run event` supplies incremental wall clock plus model token, monetary, tool-call, and download usage. Omitted usage becomes `unknown` and stops rather than becoming free.
- `run inspect` verifies the atomic phase checkpoint. `run resume` accepts an exact private attestation and revalidates checkpoint, source, environment, approval, and immutable artifact identities.
- A workflow run also binds the selected contract's `schema_version`, digest, declared route, and confidence floors into its checkpoint identity. If the contract file changes mid-run, every command stops until `run resume` supplies the optional `workflow_contract_migration_approval_id`; a migration is accepted only when the workflow identity and route are unchanged and no confidence floor is lowered.
- Worker metadata files conform to the artifact schemas. They must already be outside the public repository before `artifact store` or `run handoff` accepts them.
- Decision report bodies are external UTF-8 Markdown with the marker returned by `artifact marker` in the first five lines, a heading, and a Mermaid fence. Research bodies also require the two explicit missing-evidence/conclusion-change sections. `artifact store --type decision-report` copies the body to private storage and returns its absolute `local_report_path`; stdout never contains the body.
- Handoffs carry evidence references, hashes/provenance, uncertainty, observable confidence basis, and individually scored load-bearing claims. `run handoff` advances only the next role declared by the original workflow, after current-role measurable success and medium-or-higher confidence for every load-bearing claim. Each field the contract lists under `automatic_handoff.preserve` must be present and is carried forward: preserved evidence and provenance join the run's immutable artifact identity, and preserved uncertainty is returned as `carried_uncertainty` for the downstream role.
- `approval_boundaries_triggered` uses the shared approval vocabulary (`spending`, `sensitive access`, `large download`, `destructive behavior`, `production deployment`, `unrequested product construction`), the same terms a contract lists in `handoff_never_approves`. A triggered boundary always blocks the handoff, and after an automatic handoff an assignment pre-grant in a never-approved category is no longer applied implicitly: the downstream role's event must carry the captain's approval identifier itself.

IDs and approval IDs are opaque references, not credentials. Structured documents and Markdown must not contain raw credential values.

## Approval and secrets supervision

Firstmate asks the captain before paid APIs, cloud resources, downloads over 5 GB, protected credential access, security-sensitive operations, destructive actions, hazardous physical procedures, production deployment, unrequested construction, or networked hostile-code execution. Only an approval identifier crosses this boundary. Paid usage remains capped at zero until the assignment also records a positive approved monetary ceiling.

For repository/dependency tests, Firstmate performs a separate credential-free acquisition into an allowlisted staging destination, validates the hostile-code envelope, and runs offline without home/knowledge mounts, credentials, privilege, the host container socket, or unbounded resources. A measured behavior needs separate network approval.

Protected values are supplied to one approved child process through the separately installed Automic Vault `av inject KEY -- COMMAND` boundary. AI Company OS accepts only named keys, discovers `av` from `AUTOMIC_VAULT_CLI`/PATH/common app locations, suppresses output from its credential-bearing execution helper, and never gets or logs the value.

## Direct independent operation

Nothing in this contract depends on Firstmate. A direct operator can run the same commands, invoke the selected role with any model/tool adapter, record loop events, and store the resulting private artifacts. This preserves a narrow integration surface rather than creating a Firstmate-specific control plane.
