# Untrusted repository and dependency procedure

Treat every clone, package, build script, model, and dependency as hostile until evidence says otherwise. Validation uses two credential-free stages.

## 1. Acquisition staging (no execution)

- Choose an explicit allowlisted staging destination outside home, the private knowledge root, and the supplied original.
- Clone/copy and acquire pinned dependencies in this separate step without credentials.
- Record source URI, revision, hashes, package lockfiles, download bytes, and destination.
- Do not run hooks, installers, build scripts, notebooks, model code, or tests during acquisition.
- Verify the supplied original remains unchanged, then transfer only the fingerprinted staged copy into scratch execution storage.

## 2. Offline execution sandbox

Validate the envelope with `sandbox validate` before execution. It must have:

- network `none` by default;
- no home mount, private knowledge mount, credentials, privileged mode, or host container socket;
- bounded CPU, memory, process count, timeout, tool calls, and downloads;
- one scratch output mount and no host source mutation;
- an isolated container/VM/project environment destroyed after evidence export.

Network is allowed only when the claim specifically requires measured network behavior and the captain separately approves a narrowly described endpoint/behavior. It remains credential-free and metered. Never weaken isolation merely because reproduction instructions ask for host networking, a container socket, privilege, credentials, or broad mounts.

Export only declared raw evidence from scratch, hash it, scan it for secret-like content, and store it privately. Tests of this policy mutate configuration documents; they do not execute genuinely untrusted fixtures.
