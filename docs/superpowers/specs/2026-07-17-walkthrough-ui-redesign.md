# Walkthrough UI Redesign

## Goal

Make the landing-page walkthrough the recommended first path while keeping the experience calm, credible, and consistent with Jejak's lavender, navy, and light-weight visual system.

## Experience

- Show the welcome gate on every fresh entry to the landing page.
- Keep the page blocked until the visitor starts the walkthrough or explicitly continues without it.
- Use two stages: a concise recommendation gate, followed by scenario selection.
- Present the guided walkthrough as the dominant action without hiding the secondary path.
- Keep the existing deterministic mock scenarios and strict action gates unchanged.

## Interface

- Use Plus Jakarta Sans, the committed Jejak color tokens, restrained shadows, pill actions, and generous spacing.
- Replace generic blue styling with lavender, periwinkle, navy, ink, paper, and white.
- Remove emoji, play symbols, shouty uppercase labels, and copy that reads like prototype commentary.
- Give scenario choices clear outcomes and concise summaries.
- Show tour progress as a semantic progress bar and keep instructions adjacent to the current step.
- Preserve responsive behavior at 375 px, 768 px, and desktop widths.

## Accessibility and Motion

- Use real buttons with visible focus states and at least 40 px touch targets.
- Trap focus inside blocking dialogs and restore meaningful focus when the dialog changes.
- Keep the welcome gate non-dismissible through the backdrop or Escape because an explicit choice is required.
- Allow Escape to leave scenario selection and the running walkthrough.
- Use only short opacity/transform transitions and disable them under `prefers-reduced-motion`.

## Verification

- Confirm the welcome gate returns after a new landing-page entry and does not overlap an active tour.
- Confirm both scenarios can start and existing action gates still advance.
- Run web lint, tests, and production build.
- Review related copy for emoji and prototype-like phrasing.
