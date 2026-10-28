# Padel Indonesia — shared application visual system

The approved landing page is the visual reference for the web application.

## Shared tokens

`src/app/globals.css` owns the palette; the landing CSS module references these tokens.

| Role | Value |
| --- | --- |
| Canvas | `#f9faf7` |
| Brand / primary action | `#005baa` |
| Brand hover | `#004783` |
| Primary text | `#142e43` |
| Secondary text | `#546674` |
| Borders | `#dfe5e5` |
| Quiet surfaces | `#edf2ef` |
| Live / affirmative accent | `#dfff00` with dark text |

Use local Plus Jakarta Sans, tightly spaced headings, tabular score digits, subtle borders, restrained shadows, 6–12px corners, and a consistent outline icon family. Reserve lime for live status, score emphasis, and affirmative actions. Error and warning colors remain semantic.

## Shared components

- `AppBrand`: consistent brand mark and home link.
- `CourtScene`: the approved landing court illustration, reused on the dashboard and account pages.
- `AuthShell`: login, invitation activation, and spectator registration information.
- `PublicShell`: public tournament, match, social, and referee route layouts.
- Existing global `panel`, `btn-*`, `field`, `choice-*`, and `step-*` classes inherit the common design.

## Responsive and accessibility rules

Keep scoring controls large, preserve keyboard focus indicators, expose selected tab/filter state, honor reduced motion, and contain wide tables/brackets in their own scrolling regions. Mobile navigation hides off-screen links from keyboard access and supports Escape and focus return.

## Verification

- Build: `npm run build -- --webpack` (Turbopack cannot bind its CSS worker port in this environment).
- Core and unit tests: `npm test -- packages/core/tests tests/unit`.
- App browser coverage: `node --import tsx --env-file=.env tests/browser/app-theme.cjs` against `http://127.0.0.1:3100`.
- Landing regression: `BASE_URL=http://127.0.0.1:3100 node tests/browser/landing.cjs`.

The application browser check reads existing local fixtures, blocks real API writes, captures 19 route/state views at 375, 768, and 1440px, and exercises organizer navigation, forms, tournament steps, public tabs, and isolated v2 scoring fixtures. It requires local seeded data and a local admin. Credentials stay in memory; screenshots go to `/tmp/padel-app-theme`.
