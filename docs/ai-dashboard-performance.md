# AI dashboard performance and resource evidence

This document records bounded local measurements, not universal benchmark claims. Results vary by operating system, browser, Firstmate task count, and the cost of the authoritative reader.

## Release thresholds

| Measure | Release threshold | Reason |
| --- | ---: | --- |
| browser assets, uncompressed total | under 100 KiB | keeps the built-in UI auditable and fast to parse |
| each HTTP asset or JSON snapshot | at most 512 KiB | enforced server-side response bound |
| idle dashboard server RSS | under 75 MiB on the reference run | leaves room above the Node baseline without claiming zero overhead |
| observed idle server CPU | below 0.5% after warm-up | catches accidental busy loops at the available `ps` resolution |
| local task-create to SSE joining event | under 2,000 ms | enforced integration-test ceiling, including debounce and reconciliation |
| local DOM complete | under 250 ms on the reference run | a diagnostic threshold, not an internet benchmark |
| radar style updates | at most 12 per second | implementation cap; zero in static, reduced-motion, hidden, or non-topology modes |
| browser history / server ledger | 200 / 200 records | enforced by client and bridge |
| broker replay retention / SSE clients | 256 / 32 | enforced by the event broker |

The 2,000 ms update ceiling is deliberately looser than the observed local value. File notification and the authoritative shell reader can vary across filesystems and machines. No percentile is claimed from a single-machine fixture.

## Reference environment

Measurements were taken on macOS arm64, Apple M4 Pro with 48 GiB RAM, Node.js 22.21.1, and headless Chrome controlled through `chrome-devtools-axi` 0.1.28. The live check used a two-task Firstmate inventory. Browser viewport checks used 390 x 844, 1024 x 768, and 1512 x 982 CSS pixels.

## Evidence

### Size and process behavior

| Measurement | First browser implementation | Final critique pass | Shipped assets |
| --- | ---: | ---: | ---: |
| public HTML/CSS/JS, uncompressed | 66,224 bytes | 67,137 bytes | 74,120 bytes |
| dry npm package, compressed | 43,131 bytes | 48.4 KiB (rounded) | not re-measured |
| dry npm package, unpacked | 150,624 bytes | 165.0 KiB (rounded) | not re-measured |
| server RSS after warm-up | 58,192 KiB | 61,232 KiB | not re-measured |
| server CPU reported by `ps` | 0.0% | 0.0% | not re-measured |

The critique pass added 913 bytes for a meta description, readable-crimson token, empty-state spacing, and labeled narrow-screen ledger rows. The approved-fix pass added a further 6,983 bytes for the collision-free topology grid with cell-bounded hub graphics, the spanning Flowline recovery copy, the terminal stream-closed state, and window-independent history identity. The shipped total of 74,120 bytes (`index.html` 8,688 + `styles.css` 26,851 + `app.js` 29,478 + `app-core.js` 9,103, measured with `wc -c`) remains well below the 100 KiB budget. The rows marked *not re-measured* were not re-run in the approved-fix pass and are retained only as the earlier observations they were. No minifier, bundler, remote font, image, framework, or runtime package is used.

RSS includes the Node process, adapter, two filesystem watchers, broker, retained ledger, and authoritative-reader invocations. The values are observations from one process after warm-up, not an allocation guarantee. The implemented 75 MiB threshold is therefore checked and reported as a reference threshold rather than encoded as a flaky CI assertion.

### Render work before and after optimization

A `MutationObserver` covered `.workspace-shell` while a search filter changed in Flowline:

| Render observation | Before | After active-panel rendering |
| --- | ---: | ---: |
| mutation records | 28 | 2 |
| added nodes | 47 | 5 |

Originally every update rebuilt Flowline, Operations Constellation, and Event Ledger, including hidden panels. The optimized renderer updates shared metrics and the inspector, then renders only the active mode. Switching modes renders the newly active view immediately. This removed avoidable hidden SVG/table/list work without adding caching or listeners.

Navigation timing was 53 ms to `domComplete` before the optimization and 69 ms in the final post-Lighthouse run. The difference is normal run variance and does **not** show a navigation-speed improvement; both are below the 250 ms local diagnostic threshold. The measurable optimization evidence is the DOM mutation reduction above.

### Fleet update latency

The integration test creates a task record in a temporary Firstmate fixture, listens on the existing SSE stream, and waits for `task.spawned` with `displayState: joining`. Repeated final runs measured 56-63 ms from fixture write completion to the joining event. The automated assertion remains `< 2,000 ms`.

The first implementation enforced that same threshold but did not emit its exact sample, so there is no honest numeric pre-optimization latency point. The browser render optimization did not change the bridge, debounce, watcher, or reconciliation path. This omission is recorded rather than backfilling an estimate.

The same integration suite verifies authoritative waiting-state reconciliation, removal, retained replay, equal-cursor snapshot refresh, low stale cursors, and a cursor larger than the restarted server's event sequence. The restart cursor cases were added after a real reconnect test found stale browser state across server restart.

### Animation and static behavior

A `MutationObserver` on `#radar-sweep` measured 24 transform updates in 2,000 ms: exactly the 12 FPS cap. Persistent static mode produced 0 updates in 1,200 ms and stored `static` in local storage. A separate Chrome session launched with forced reduced motion reported `prefers-reduced-motion: reduce`, showed `static 0 FPS`, and produced 0 updates in 1,200 ms.

The animation loop exists only while Operations Constellation is active, the page is visible, reduced motion is not requested, and static mode is off. CSS joining/loading animation also pauses for static or hidden state and collapses under reduced motion. All animated properties are `transform`, `opacity`, color, border color, or background color; no layout property is animated.

### Visual, responsive, and accessibility checks

The first screenshot critique found:

- empty Flowline copy running together because adjacent text nodes lacked block spacing;
- low contrast on inactive tab indices, selected-filter crimson, and quiet selected-card labels;
- accessible-name mismatch on rich task buttons because a custom `aria-label` omitted visible workstream text;
- avoidable hidden-panel rebuilding on each filter or fleet event.

The fixes added explicit empty-state layout, a readable signal token and brighter quiet text, natural button accessible names, and active-panel rendering. Final screenshots at all three reference sizes showed no horizontal document overflow. Flowline used one, two, and four columns respectively. Operations topology and Event Ledger were also inspected at wide desktop size; the ledger was separately verified at 390 px as labeled rows with a 390 px table width and no document overflow.

Final Lighthouse results on the real localhost page were:

- Accessibility: 100
- Best Practices: 100
- SEO: 100
- Agentic Browsing: 100
- Failed audits: 0 of 52

A keyboard test focused the stable search input by selector, typed through Chrome's real keyboard path, and observed the roster and topology reduce from two agents to one while focus and input identity remained intact. ArrowRight moved focus and selection from Flowline to Operations. Killing and restarting the server changed the connection label to `Reconnecting`, returned it to `Live / SSE`, and refreshed both unavailable and ready snapshots without a page reload.

## Reproduce

Run automated bounds and latency checks:

```sh
npm run test:dashboard
```

Inspect source and package sizes:

```sh
find extensions/ai-dashboard/public -maxdepth 1 -type f -print0 | xargs -0 wc -c
npm pack --dry-run --json
```

With a development server running, sample the server process after warm-up:

```sh
ps -p "$DASHBOARD_PID" -o pid=,rss=,%cpu=,etime=,command=
```

Browser navigation, accessibility, screenshots, filter interaction, mutation counts, radar counts, reduced-motion emulation, and reconnect checks require a real Chrome session. They are intentionally kept outside the dependency-free runtime. The source-contract tests still gate one EventSource, no browser polling intervals, bounded history, semantic modes/states, responsive breakpoints, reduced-motion/forced-color support, and the absence of WebGL, remote assets, gradients, or layout-property transitions.
