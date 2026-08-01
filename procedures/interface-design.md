# Interface design procedure

Design the interface around the accepted user journey, not a generic component gallery.

- Write the information hierarchy, primary action, navigation model, and state model before styling.
- Cover loading, empty, partial, success, validation, permission, offline/timeout, and recovery states with plain-language copy.
- Make forms forgiving: visible labels, useful defaults, inline guidance, preserved input, specific errors, and safe confirmation for consequential actions.
- Define responsive behavior for narrow and wide viewports without hiding essential actions.
- Meet keyboard, focus, semantic structure, contrast, target-size, reduced-motion, and screen-reader needs appropriate to WCAG 2.2 AA.
- Use reusable tokens/components only where repetition exists. Preserve visual hierarchy, alignment, readable typography, and consistent spacing.
- Prototype the highest-risk interaction early and test it with representative content, long text, missing data, slow endpoints, and errors.
- Connect each screen and interaction to an acceptance criterion and endpoint contract.

A polished static screen is not acceptance. Demonstrate the integrated journey and failure recovery with real state transitions.
