# EnergyEngine.ai portal v2 — Agent Command Center

The user portal for `portal.energyengine.ai`, rebuilt as an LLM-first product: the owner talks to an
Agent Command Center that runs the five sales workflows (Generate Leads, Set Appointments, Recover Cancels,
Generate Referrals, Recruit Talent). Everything else in the portal (Activity, Wallet, Settings, Support) exists to
feed and observe that agent.

Branding follows the EnergyEngine 2026 brand kit: the eight-bar pinwheel mark (two bars in Blue Ocean), Inter for
all text and Roboto Mono for labels, and the palette Terminal Black, Bright White, Deep Navy, Blue Ocean, and Teal
Shores. Dark mode is the black star wallpaper from the previous portal with a Deep Navy glow; light mode keeps the
warm cream Settings palette. Fonts are self-hosted from the `@fontsource` packages, so nothing loads from third-party
CDNs. Brand tokens live in `src/styles/tokens.css` (`--brand-*`) and the mark in `src/components/shell/Logo.tsx`.

## Run it

```sh
cd portal
npm install
npm run dev          # http://localhost:5173  (UI only, local agent brain)
```

To talk to Claude instead of the built-in local agent, run the API server in a second terminal with a key:

```sh
export ANTHROPIC_API_KEY=<your-key>   # never commit this
npm run api                   # http://localhost:8787, proxied by Vite under /api
```

Production build and serve (one process serves the static bundle and `/api`):

```sh
npm run build
npm start                     # PORT=8787 by default
```

`npm run build` type-checks the whole app first; a type error fails the build.

## What's inside

```
portal/
  index.html              theme bootstrap (no flash of wrong theme)
  server/index.mjs        Node API: /api/agent/health, /api/agent/chat (SSE), static dist/
  src/
    App.tsx               route map (frozen contract, documented inline)
    types.ts              every shared type: Lead, Workflow, Wallet, Settings, Chat…
    styles/tokens.css     design tokens for dark and light
    styles/base.css       reset, type scale, helpers
    theme/                ThemeProvider (data-theme attribute + localStorage)
    store/                PortalProvider: state + actions; storage.ts is the persistence boundary
    api/agent.ts          AgentAdapter contract, local brain, Claude streaming client, resolver
    data/                 demo leads/activity/stats, workflow definitions, regions & timezones
    components/ui/        dependency-free UI kit (Button, Card, Field, Toggle, Modal, Sparkline…)
    components/shell/     sidebar rail, flyout menu, starfield, logo
    components/chat/      composer, thread, markdown-lite renderer, useAgentChat hook
    pages/CommandCenter   Agent Command Center + performance dashboard + recent activity
    pages/Activity        Activity (all leads) and the lead activity feed
    pages/Wallet          Wallet modal, Advanced mode, USDC checkout
    pages/Settings        Settings hub, Business Profile, Notifications, Agent Profile
    pages/Support         Support chat, FAQ, tickets
```

Stack: Vite, React 18, TypeScript, react-router. No UI framework, no CSS-in-JS, no icon package: the kit and icon
set are inlined so the bundle stays small and the design stays under our control.

## Wiring the real backend

The app is built so the existing `portal-backend` can be attached without touching any page:

1. **Data** – `src/store/storage.ts` is the only place state is loaded and saved. Replace `load`/`save` with API
   calls (or hydrate `PortalProvider` from a fetch) and the pages keep working; every page reads through
   `usePortal()` and writes through `usePortalActions()`.
2. **Agent** – `src/api/agent.ts` defines `AgentAdapter`. `remoteAgent` already streams Server-Sent Events from
   `POST /api/agent/chat`; point that route at the agent orchestrator, or keep `server/index.mjs` and set
   `ANTHROPIC_API_KEY`. The reply contract is `{ content, cards?, effects? }`; effects such as
   `start_workflow` are applied by the UI through store actions.
3. **Auth** – `PortalState.user` is the signed-in account. Sign-out clears local state and reloads.
4. **Payments** – Wallet actions (`addCredits`, `updateWallet`) are the hooks for Stripe/USDC settlement.

## Interface freeze (how the build was parallelised)

Wave 0 froze `types.ts`, the store, the agent adapter, the UI kit, tokens and the route map. Five lanes then built
their pages against those contracts with exclusive file ownership (CommandCenter+chat, Activity, Wallet, Settings,
Support), and Wave 2 integrated, built and screenshot-verified every route in both themes. Keep that discipline when
extending: change a contract in one place, then update its consumers.
