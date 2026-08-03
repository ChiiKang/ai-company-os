---
name: "AI Company Operations"
description: "A precise localhost planning and fleet-observability surface"
colors:
  command-charcoal: "oklch(0.115 0.009 24)"
  raised-charcoal: "oklch(0.155 0.010 24)"
  panel-charcoal: "oklch(0.195 0.011 24)"
  technical-line: "oklch(0.35 0.014 24)"
  tinted-white: "oklch(0.91 0.009 45)"
  secondary-text: "oklch(0.73 0.010 45)"
  quiet-text: "oklch(0.66 0.010 45)"
  signal-crimson: "oklch(0.62 0.205 26)"
  readable-crimson: "oklch(0.72 0.17 26)"
  signal-sage: "oklch(0.74 0.075 148)"
  signal-amber: "oklch(0.78 0.115 76)"
  signal-steel: "oklch(0.72 0.045 235)"
typography:
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 680
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 450
    lineHeight: 1.55
    letterSpacing: "0.01em"
  label:
    fontFamily: "SFMono-Regular, Cascadia Code, Roboto Mono, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "0.09em"
rounded:
  none: "0px"
  signal: "2px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  tab-active:
    backgroundColor: "{colors.panel-charcoal}"
    textColor: "{colors.tinted-white}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "12px 16px"
  status-working:
    backgroundColor: "{colors.raised-charcoal}"
    textColor: "{colors.signal-sage}"
    typography: "{typography.label}"
    rounded: "{rounded.signal}"
    padding: "4px 8px"
  status-attention:
    backgroundColor: "{colors.raised-charcoal}"
    textColor: "{colors.signal-amber}"
    typography: "{typography.label}"
    rounded: "{rounded.signal}"
    padding: "4px 8px"
---

# Design System: AI Company Operations

## 1. Overview

**Creative North Star: "The Local Operations Plotter"**

A captain reads this interface like a well-made technical plotting desk: a dark physical field, fine registration lines, compact labels, restrained signal color, and one meaningful spatial model. It is dense because the work is dense, not because every fact received a card. The scene is a focused operator at a desktop in a dim room, planning the day before shifting into live fleet review.

The approved composition carries these visible ingredients into production: a charcoal application shell; a compact system spine; a fine scan-line and grid texture; a planning-first Flowline; a radial whole-company topology with routes bound to actual workstreams and agents; a stable selection inspector; a bounded chronology; explicit lifecycle labels; and rare crimson signals for selection, joining, and connection changes. Operations Constellation remains the live view, while Event Ledger expands chronology for investigation.

**Key Characteristics:**
- Dense, square-edged, broadcast-technical composition with varied spacing rhythm.
- Flowline is the default silhouette; topology becomes the dominant live-operations silhouette.
- Semantic HTML, CSS, and inline SVG implement the approved ingredients. No rasterized UI or decorative 3D substitute.
- Motion is limited to state transitions, a restrained joining signal, and capped radar liveness.
- At narrow widths, modes become deliberate vertical compositions rather than a shrunk desktop grid.

## 2. Colors

Charcoal neutrals lean toward the crimson hue; tinted whites maintain hierarchy without pure white. The palette is restrained, with semantic sage, amber, and steel used only where status needs them.

### Primary
- **Signal Crimson:** Selection, a newly joined agent, focus, and critical connection change only. Its rarity gives it authority.

### Secondary
- **Signal Sage:** Working and completed-success text, always paired with a written state.
- **Signal Amber:** Blocked and attention-needed text, always paired with a written state.
- **Signal Steel:** Waiting or external-delay text, always paired with a written state.

### Neutral
- **Command Charcoal:** The page field and topology background.
- **Raised Charcoal:** Toolbars, selected rows, and the first elevation step.
- **Panel Charcoal:** Inspector and mode surfaces that need structural separation.
- **Technical Line:** Fine boundaries, axes, and registration geometry.
- **Tinted White:** Primary text and selected values.
- **Secondary Text:** Supporting copy.
- **Quiet Text:** Micro-labels that still meet their contrast requirement.

**The Rare Crimson Rule.** Crimson marks a state transition, active selection, or focus. It never fills inactive surfaces and never becomes ambient decoration.

**The Written State Rule.** Color never carries lifecycle meaning alone. Every signal has a direct text label and an additional cue such as shape, icon, or pattern.

## 3. Typography

- **Display Font:** System UI sans with platform-native fallbacks
- **Body Font:** System UI sans with platform-native fallbacks
- **Label/Mono Font:** SF Mono, Cascadia Code, Roboto Mono, Consolas, monospace

**Character:** Native task text stays highly legible while mono labels provide telemetry precision. No remote fonts are loaded, so the shell appears immediately and does not shift.

### Hierarchy
- **Title** (680, 1.25rem, 1.15): Mode and inspector headings only.
- **Body** (450, 0.875rem, 1.55): Task names, explanations, and recovery copy, capped near 70ch for prose.
- **Label** (650, 0.75rem, 0.09em, uppercase): States, filters, timestamps, and short telemetry labels.

**The Fixed Instrument Scale Rule.** Dashboard type uses a fixed rem scale. Hierarchy comes from weight, position, space, and contrast rather than fluid display type.

**The Dark Field Compensation Rule.** Body copy on charcoal uses a slightly open line height and subtle tracking to preserve perceived weight.

## 4. Elevation

Depth comes from three explicit charcoal lightness steps and fine boundaries, not decorative glass or stacked shadows. A restrained outer shell shadow may separate the local application from the browser field on wide screens; inner regions stay flat and structural.

**The Tonal Elevation Rule.** Higher operational surfaces are lighter, not blurrier. If an inner surface needs a visible drop shadow to read, the hierarchy is wrong.

## 5. Components

### Buttons
- **Shape:** Square technical controls with a minimal 2px signal radius where needed.
- **Primary:** Tinted-white text on signal crimson is reserved for acknowledgement or recovery actions, never routine navigation.
- **Hover / Focus:** Pointer hover changes surface tone only when hover exists. Keyboard focus uses a 2px crimson outline with offset.
- **Secondary / Ghost:** Toolbar and filter controls use explicit borders, 44px coarse-pointer targets, and a pressed state.

### Chips
- **Style:** Compact bordered status labels with a text state, a small geometric marker, and no translucent glass fill.
- **State:** Selected filters use stronger text and line contrast; inactive filters never use saturated color.

### Cards / Containers
- **Corner Style:** Square by default.
- **Background:** Task boundaries use alignment, spacing, and fine dividers. A bordered container appears only when the item is independently selectable.
- **Shadow Strategy:** Flat, following the tonal elevation rule.
- **Border:** One-pixel technical line.
- **Internal Padding:** 12px compact, 16px standard, 24px for empty and error states.

### Inputs / Fields
- **Style:** Dark native controls with visible labels, one-pixel borders, and no placeholder-only instruction.
- **Focus:** Two-pixel crimson outline with offset.
- **Error / Disabled:** Plain-language recovery text, not color alone. Disabled controls remain legible.

### Navigation
- Mode navigation uses a semantic tab set for Flowline, Operations Constellation, and Event Ledger. Arrow keys move between tabs, the active tab has text and border cues, and narrow layouts retain full labels rather than unexplained icons.

### Workstream Topology
- Inline SVG supplies rings, axes, hubs, and routes. HTML buttons supply keyboard-accessible agents.
- Every hub is computed from current project or workstream data. Empty decoration is forbidden.
- New-agent nodes receive one restrained pulse until acknowledged. Static and reduced-motion modes preserve the badge and remove movement.

### Event Ledger
- The ledger is newest first, capped at 200 browser records, and labels imported history separately from live observations.
- Narrow layouts present event records as labeled rows instead of forcing an unreadable desktop table.

## 6. Do's and Don'ts

### Do:
- **Do** open on Flowline and keep whole-company scope selected by default.
- **Do** preserve the charcoal shell, compact system spine, meaningful radial topology, stable inspector, and bounded ledger from the approved north star.
- **Do** use semantic HTML and inline SVG with explicit loading, empty, reconnecting, error, and unavailable states.
- **Do** keep new-agent visibility until that browser acknowledges it.
- **Do** cap continuous radar liveness at 12 FPS, pause it while hidden, and persist static mode.
- **Do** expose only a sanitized, read-only projection of local fleet records.

### Don't:
- **Don't** build a generic SaaS admin dashboard from oversized metric cards and repeated identical card grids.
- **Don't** use decorative sci-fi radar, empty globe imagery, neon cyberpunk glow, or defense targeting and weapons language.
- **Don't** use glassmorphism, gradient text, decorative gradients, pure black, pure white, or remote fonts.
- **Don't** add hidden role handoffs, speculative control planes, or intervention controls.
- **Don't** treat append-only status entries as current truth.
- **Don't** expose private report bodies, prompt files, raw local paths, secrets, or credential values.
- **Don't** animate layout properties, run uncapped animation, or rely on motion to communicate state.
