# Prototype acceptance procedure

Acceptance is an evidence exercise, not a completion claim.

## Prepare

- Freeze the acceptance criteria and map each to validated requirement IDs.
- Provide reproducible project-local setup, fixture/seed data, test command, and demonstration command.
- Identify environment limits and any approved external dependency.

## Demonstrate

Run the smallest end-to-end user journey using integrated endpoints and realistic data. Also demonstrate the most important validation/error path, recovery, authorization boundary, narrow viewport/keyboard path for UI work, and one reliability failure such as timeout or unavailable dependency.

Capture commands, versions, test output, screenshots only when useful, and evidence identifiers. Do not include credentials or captain data in public fixtures.

## Decide

For every criterion record `met`, `unmet`, or `not tested` with evidence. Run automated unit, contract/integration, security-relevant, and end-to-end tests proportionate to prototype risk. State deferred production concerns separately from prototype failures.

Return `acceptance met` only when every required criterion is met. Otherwise return `unmet criteria`, list the exact gaps and consequences, and propose the smallest next step. Prototype acceptance never authorizes production deployment.
