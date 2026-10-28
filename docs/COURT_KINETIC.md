# Court Kinetic implementation

The visual reference is [DESIGN.md](./DESIGN.md). Its component-role palette takes precedence over the differing YAML palette: ice canvas, white cards, navy text, blue structure, and lime live/affirmative states.

- Shared Tailwind tokens and control defaults: `src/app/globals.css`.
- Locally hosted variable Plus Jakarta Sans (200–800): `public/fonts/`, loaded in the root layout. License included.
- Small blue button labels use the reference's darker `#0060aa` with white for contrast; `#5599e8` remains the focus and hover-border accent. Metadata uses a darker slate for legibility on white.
- Lime uses navy text, with live badges and reduced-motion-aware beacons. Score and timer numbers use tabular figures.
- Cards use 16px corners, controls 8px, fields at least 44px high, light borders and navy ambient shadows. Modal scrims stay dark to separate the dialog from its page.
- Public page gutters are 16/32/48px. Bracket rounds scroll horizontally with snap positions on narrow screens. Existing tournament and scoring workflows remain in place.

This applies the design to existing screens; it does not add new tournament modes, court visualizers, or an infinite pan/zoom engine.

## Theme audit — 13 October 2026

Found legacy dark Tailwind colors overriding the shared theme in `src/app/admin/players/page.tsx` and `src/app/tournament/[slug]/page.tsx`. Replaced them with semantic Court Kinetic tokens across player directory, leaderboard, add-player dialog, career statistics, and all five public tournament tabs, including loading states. Updated low-contrast labels, navigation accents, live badges, card shadows, and mobile table scrolling.

Verification: TypeScript passed. A local Chrome audit with mocked API responses checked nine views at 390, 768, and 1440px (27 combinations), with no page overflow, large dark content panels, or browser runtime errors. Screenshots were captured under `/tmp/padel-theme-audit/`; public mobile live view and desktop statistics dialog were visually inspected. These checks verify presentation, not live database or SSE integration. Source scan found no remaining legacy dark background utilities in `src/app` or `src/components`. Modal scrims retain the documented translucent navy treatment.

## Button clarity — 13 October 2026

Shared action buttons now have a consistent 46px target, visible secondary borders, keyboard focus rings, and distinct disabled styling. Mode selectors use a separate outlined selected state with a checkmark and `aria-pressed`. Tournament flow labels name the destination or result, with nearby prerequisites for unavailable participant/draw/schedule actions and an explanation that scheduling covers all categories. Step navigation actions are visually separated from form submission. Browser tournament flow (including offline scoring), TypeScript, lint of tournament pages, and 21 responsive page checks passed. The development CSS cache was refreshed and the player selector visually inspected.

## Functional UI refinement — 13 October 2026

Dashboard now leads with organization counts and tournament management instead of promotional copy, a decorative court, and a hero panel. A shared `TournamentList` presents event name, venue, date, status, and management action in aligned rows on the dashboard and tournament directory. Empty states avoid repeating the primary create button. Player rankings/statistics use plain labels and numeric ranks rather than emoji decorations. Tournament execution uses a neutral panel and direct instructions. The established light Court Kinetic palette, visible action hierarchy, and workflow remain.

Verified TypeScript, lint for dashboard/directory/shared list, the browser tournament/offline-scoring flow, and 21 responsive page checks. Visually inspected desktop and mobile dashboard screenshots. This refinement covers the main admin workflow; it does not redesign the public landing page or draw-ceremony animation.
