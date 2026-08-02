# AI Company dashboard

The AI Company dashboard is a read-only, localhost observability surface for a Firstmate fleet. It opens in **Flowline** for daily planning, with **Operations Constellation** for live topology and **Event Ledger** for chronology and debugging. Whole-company scope is the default.

## Install and open

After this package is merged, install it as a Pi package from GitHub:

```sh
pi install git:github.com/ChiiKang/ai-company-os
```

Set the Firstmate operational home before starting Pi when it cannot be found from the current directory:

```sh
export FM_HOME=/path/to/firstmate-operational-home
# Only needed when the tracked Firstmate code root is somewhere else:
export FM_ROOT_OVERRIDE=/path/to/firstmate-code
pi
```

Run `/aidashboard` in Pi. The command starts one server on `http://127.0.0.1:4111/`, reports that exact URL, and asks the default browser to open it. A second invocation in the same session reuses the server. A dashboard already listening on that port is reused only when its product, protocol, and hashed Firstmate home identity match. Any unrelated listener produces a port-conflict error instead of being trusted.

Choose another loopback port when necessary:

```sh
export AI_DASHBOARD_PORT=4211
```

Set `AI_DASHBOARD_NO_OPEN=1` to report the URL without launching a browser. Pi closes dashboard resources owned by that session on `session_shutdown`.

## Firstmate resolution and current truth

Resolution is deterministic and local:

1. `FM_HOME` selects the operational home containing `state/` and `data/`.
2. `FM_ROOT_OVERRIDE` selects the tracked code root containing `bin/fm-crew-state.sh` when it differs from `FM_HOME`.
3. Without explicit variables, the adapter searches at most 12 ancestors of Pi's working directory for a Firstmate home/code root. An executable `fm-crew-state.sh` on `PATH` may supply the reader.
4. `FM_STATE_OVERRIDE` and `FM_DATA_OVERRIDE` can select split operational directories for an established Firstmate installation. Every selected path is canonicalized and must already be a readable directory or executable regular file.
5. If the safe boundary cannot be resolved, the dashboard still opens in an unavailable state with recovery instructions. It does not guess private machine paths.

`*.status` lines are append-only **event history**. They populate the ledger but never determine the current badge. Whenever current state matters, the adapter runs the authoritative `bin/fm-crew-state.sh <id>` reader without a shell, with bounded output, timeout, concurrency, and an allowlisted environment. The interface labels the current-truth source in the inspector.

The bridge watches only the selected `state/` directory and `data/backlog.md`. File signals share one 140 ms debounce path. A full bounded reconciliation every 30 seconds recovers create/remove/rename races and watcher loss. A task record created after bridge startup emits a joining event and appears immediately; its restrained joining signal lasts four seconds, while the inspector still shows authoritative current truth. The `NEW` marker remains until acknowledged in that browser.

## Read-only privacy boundary

The HTTP surface has no mutation route or control-plane action. It exposes only:

- sanitized task IDs, assignment titles, workstream/project labels, and role kinds;
- current state returned by the authoritative reader;
- sanitized, length-bounded status summaries labeled as history;
- bounded health, runtime, and retention metadata.

The adapter allowlists `project` and `kind` from task metadata. It never reads or serves report bodies, task prompt files, artifact contents, environment files, credential values, or raw local paths. Projection text is length-bounded and redacts common credential and absolute-path patterns. This is defense in depth, not permission to put secrets in task names or statuses.

The server binds only to IPv4 loopback and validates `Host` and browser `Origin`. It serves an exact route map, rejects encoded traversal, accepts only `GET` and `HEAD` (`/events` is `GET` only), disables caching, and sends a restrictive Content Security Policy, frame denial, no-referrer policy, same-origin isolation headers, and a restrictive permissions policy. There is no CORS opt-in.

## Interface and access

- **Flowline** groups queued intent, joining/working tasks, external waits or attention, and verified completion.
- **Operations Constellation** maps actual agents to project/workstream hubs. It does not render sample nodes.
- **Event Ledger** shows newest-first live observations and imported event history, with evidence labels.
- Search and state filters update all views. Selection remains in a stable inspector on wide layouts and follows the content on narrow layouts.
- All lifecycle states use written labels plus marker shape/fill; color is never the only signal.
- The three mode tabs support Left/Right Arrow, Home, and End. Controls have visible keyboard focus and coarse-pointer target sizing.
- Browser `prefers-reduced-motion`, page visibility, and the persistent **STATIC** mode stop continuous radar movement. Static mode is stored only in browser local storage.

The client opens one `EventSource`. It does not poll individual panels. Native EventSource reconnects automatically; the connection readout distinguishes connecting, live, reconnecting, and bridge error states, and it returns to the live label once a later reconciliation succeeds.
Every valid reconnect receives a current bounded snapshot before retained newer events, so an equal cursor cannot preserve stale state across a server restart. A cursor outside retained bounds receives an explicit reset snapshot rather than an unbounded replay.

A frame larger than the socket write buffer is normal backpressure, not a failure: the server keeps the stream open and waits for the socket to drain, and only evicts a client whose unflushed bytes pass the per-client buffer ceiling or that stays stalled past the backpressure timeout.
A request that arrives when every SSE slot is taken is refused with `503` and a plain-text body before any snapshot is serialized, so a refused tab reports an error instead of retrying on the native EventSource interval.

## Resource ceilings

| Resource | Ceiling |
| --- | ---: |
| task records per reconciliation | 128 |
| backlog records | 256 |
| status history lines per task | 100 |
| status/meta file read | 64 KiB each |
| backlog read | 256 KiB |
| authoritative readers | 4 concurrent, 15 s each, 8 KiB output |
| default-browser opener | 5 s before forced cleanup |
| server broker retention | 256 events |
| server ledger retention | 200 events |
| browser event history | 200 events |
| simultaneous SSE clients | 32, then `503` |
| unflushed bytes per SSE client | 1 MiB, or 10 s stalled |
| static asset or snapshot response | 512 KiB |
| topology nodes | 32 visible, with an omitted count |
| topology workstream hubs | 8 direct plus one bounded overflow hub |
| radar updates | at most 12 per second |

The server owns one heartbeat timer, one periodic reconciliation timer, at most one debounce timer, at most one joining-transition timer, and two directory watchers. Shutdown closes streams, watchers, timers, and active reader process groups. See [performance evidence](ai-dashboard-performance.md) for measured results and thresholds.

## Development and troubleshooting

Run the complete repository gate:

```sh
./scripts/test.sh
```

For a direct development smoke run without Pi:

```sh
FM_HOME=/path/to/firstmate-operational-home \
FM_ROOT_OVERRIDE=/path/to/firstmate-code \
node scripts/run-dashboard.mjs --port 4111
```

Common failures:

- **Unavailable integration:** set `FM_HOME`; set `FM_ROOT_OVERRIDE` too if the code root is split.
- **Port already in use:** stop the unrelated local service or select `AI_DASHBOARD_PORT`. The dashboard will not silently reuse it.
- **Reconnecting:** verify the Pi session is still running. EventSource reconnects without a panel polling loop.
- **No records:** verify the selected operational home contains `state/` and `data/backlog.md`; an empty fleet is a valid state.
