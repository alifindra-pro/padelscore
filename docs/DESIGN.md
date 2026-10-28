---
name: Court Kinetic
colors:
  surface: '#f7f9ff'
  surface-dim: '#c6dcf5'
  surface-bright: '#f7f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#edf4ff'
  surface-container: '#e3efff'
  surface-container-high: '#d8eaff'
  surface-container-highest: '#cfe5fe'
  on-surface: '#051d30'
  on-surface-variant: '#414751'
  inverse-surface: '#1d3245'
  inverse-on-surface: '#e8f2ff'
  outline: '#717782'
  outline-variant: '#c1c7d3'
  surface-tint: '#0060aa'
  primary: '#0060aa'
  on-primary: '#ffffff'
  primary-container: '#5599e8'
  on-primary-container: '#003059'
  inverse-primary: '#a2c9ff'
  secondary: '#576500'
  on-secondary: '#ffffff'
  secondary-container: '#d0ed00'
  on-secondary-container: '#5b6900'
  tertiary: '#5a5f63'
  on-tertiary: '#ffffff'
  tertiary-container: '#92979b'
  on-tertiary-container: '#2b2f33'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d3e4ff'
  primary-fixed-dim: '#a2c9ff'
  on-primary-fixed: '#001c38'
  on-primary-fixed-variant: '#004881'
  secondary-fixed: '#d2f000'
  secondary-fixed-dim: '#b8d300'
  on-secondary-fixed: '#191e00'
  on-secondary-fixed-variant: '#414c00'
  tertiary-fixed: '#dfe3e8'
  tertiary-fixed-dim: '#c3c7cc'
  on-tertiary-fixed: '#171c20'
  on-tertiary-fixed-variant: '#42474b'
  background: '#f7f9ff'
  on-background: '#051d30'
  surface-variant: '#cfe5fe'
typography:
  display-hero:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.03em
  display-hero-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '800'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '700'
    lineHeight: 24px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  score-display:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '800'
    lineHeight: 32px
    letterSpacing: -0.02em
  score-game:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 22px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-md: 1.5rem
  gutter-lg: 2rem
  margin: 1rem
  margin-md: 2rem
  margin-lg: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system defines an athletic-tech aesthetic tailored for competitive padel infrastructure, live tournament brackets, and real-time court scoring. It prioritizes precision, tournament adrenaline, and daylight legibility on outdoor courts and indoor arena scoreboards.

### Personality & Demographics
- **Tone:** High-performance, razor-sharp, energetic, and organized.
- **Audience:** Tournament directors, competitive club players, live stream spectators, and official referees who require split-second score clarity and effortless draw navigation.
- **Aesthetic Movement:** Modern Athletic-Tech. Merges crisp, clean structural grids with luminous high-contrast athletic accents, evoking the architectural geometry of glass padel enclosures, perforated carbon rackets, and high-velocity court lines.

### Visual Principles
- **Daylight-Engineered Clarity:** A pristine white-and-ice base eliminates visual sludge, guaranteeing maximum legibility under bright ambient club lights and sunny court conditions.
- **High-Velocity Accents:** Neon lime is reserved strictly for kinetic states—live points, tiebreaks, match points, active court feeds, and affirmative interactions. Electric blue handles deep navigational flow, match brackets, and technical structures.
- **Architectural Framing:** Subtle structural hairline borders, rounded modular cards, and pill badges mimic the industrial elegance of modern padel arenas without falling into heavy skeuomorphism.

## Colors

The palette operates on a high-contrast athletic logic. Pure whites and cool slate neutrals anchor data-dense tournament matrices, while electric blue establishes structure and luminous lime acts as an adrenaline flare for real-time match events.

### Color Tokens & Roles

- **Canvas & Base Surfaces:**
  - `surface-canvas`: `#F8FAFC` (app canvas and stadium view background)
  - `surface-card`: `#FFFFFF` (draw sheets, match cards, player rosters)
  - `surface-tint`: `#F6FAFF` (court schedules, upcoming round panels, secondary pill containers)
  - `surface-border`: `#E2E8F0` (subtle 1px architectural dividers, court grid borders)
  - `surface-border-subtle`: `#EDF2F7` (internal table cell divisions)

- **Typography & Structure (`#172D40` Base):**
  - `text-primary`: `#172D40` (dark navy; delivers high readability for set counts and team names)
  - `text-secondary`: `#4A6277` (court assignments, seed numbers, time stamps)
  - `text-muted`: `#889EB2` (metadata, archived games, court surface info)
  - `text-inverse`: `#FFFFFF` (used on dark pill badges or deep navy overlays)

- **Primary Athletic Blue (`#5599E8`):**
  - Structural brand presence: active bracket lines, navigation pills, primary interaction paths, data visualizations, and active court schedule cards.

- **Kinetic Lime (`#DFFF00`):**
  - High-intensity accelerator: live match indicators, pulsating "ON COURT" beacons, match-point notifications, tournament champion badges, and primary action triggers. Paired exclusively with `#172D40` for maximum contrast and WCAG AA compliance.

- **Status & Scoring States:**
  - `state-live`: `#DFFF00` with `#172D40` text
  - `state-finished`: `#94A3B8`
  - `state-warning`: `#F59E0B` (injury timeout, code violation)
  - `state-critical`: `#EF4444` (disqualification, retired match)

## Typography

The typography is built around Plus Jakarta Sans, chosen for its contemporary geometric balance, distinct athletic cut, and geometric clarity across varying scoreboard sizes.

### Tabular Numbers & Legibility
- All scoreboards, game outcomes, tiebreak tallies, and timer modules must enable OpenType tabular numbers (`tnum`) to eliminate layout jitter during live score ticks.
- Capitalization and tracking: Badges (`label-md`, `label-sm`), round milestones (e.g., `ROUND OF 16`, `FINAL`), and status labels use uppercase styling with positive letter spacing (`0.04em` to `0.05em`) to balance the energetic athletic tone.
- Headings deploy aggressive negative letter spacing to lock titles tightly, evoking precision sports branding.

## Layout & Spacing

The layout utilizes a structured 12-column responsive grid engineered to comfortably host tournament trees, court scheduling matrices, and live scoreboards.

### Layout Mechanics
- **Mobile (< 768px):** 4-column layout. Margin `1rem` (`16px`), gutter `1rem` (`16px`). Tournament brackets shift to single-match horizontal swipe carousels or stacked round views. Live match cards prioritize vertical player team rows.
- **Tablet (768px - 1199px):** 8-column layout. Margin `2rem` (`32px`), gutter `1.5rem` (`24px`). Brackets show 2 adjacent rounds side-by-side with pan-zoom capability.
- **Desktop (1200px+):** 12-column fluid grid. Margin `3rem` (`48px`), gutter `2rem` (`32px`). Bracket views feature infinite canvas pan-and-scan, side-by-side live scoring consoles, and schedule overviews.

### Rhythm
Component spacing follows an 8pt base grid (`space-xs` = 4px, `space-sm` = 8px, `space-md` = 16px, `space-lg` = 24px, `space-xl` = 40px). Match cards rely on compact internal padding (`space-md`) to maximize information density without cluttering live score data.

## Elevation & Depth

This design system uses a crisp, daylight-visible depth strategy. Instead of thick, muddy drop shadows, elevation relies on clean surface layering, micro-borders, and subtle ambient shadows tinted with court navy.

### Elevation Hierarchy
- **Level 0 (Court Ground):** `#F8FAFC`. Base canvas layer. Flat.
- **Level 1 (Structural Cards & Draw Nodes):** `#FFFFFF` surface with a crisp 1px stroke of `#E2E8F0`. Ambient shadow: `0 1px 3px rgba(23, 45, 64, 0.04), 0 4px 12px rgba(23, 45, 64, 0.03)`.
- **Level 2 (Active Match & Interactive Hovers):** `#FFFFFF` surface with `#5599E8` subtle stroke accent or 2px primary border on match focus. Elevated shadow: `0 6px 20px rgba(23, 45, 64, 0.08)`.
- **Level 3 (Modals, Match Overlays, Referee Score Slates):** `#FFFFFF` surface framed with `1px solid rgba(226, 232, 240, 0.8)`. Deep ambient shadow: `0 16px 36px rgba(23, 45, 64, 0.14)`.
- **Glass Accents:** Translucent frosted panels (`rgba(255, 255, 255, 0.85)` with `backdrop-filter: blur(12px)`) are applied solely to sticky score headers and tournament stage filter bars.

## Shapes

The design system incorporates geometric roundedness (`0.5rem` base, up to `1rem` for major cards and `9999px` for pill badges), reflecting the aerodynamic curvature of padel rackets and court markings.

### Shape Language Rules
- **Base Components (Inputs, Buttons, Dropdowns):** `0.5rem` (8px). Maintains structural, professional utility.
- **Cards, Tournament Nodes, Score Panels:** `1rem` (16px). Delivers a modern, approachable feel while framing complex game scores cleanly.
- **Pills & Status Indicators:** Fully rounded (`9999px`). Applied to live match pills, round tags, seed numbers, and set indicator chips.
- **Accent Details:** Subtle 45-degree angle accents or court-inspired geometric lines can be applied to section divider ribbons and tournament banner graphics.

## Components

### Buttons
- **Primary Kinetic Action:** Background `#DFFF00`, text `#172D40`, font weight 700. Hover: brightness(0.95), subtle lift. Used for "Start Match", "Submit Score", "Enter Tournament".
- **Primary Structural Action:** Background `#5599E8`, text `#FFFFFF`, font weight 600. Hover: `#4488D6`. Used for bracket actions, player registration, share links.
- **Secondary / Ghost:** Background `#F6FAFF`, text `#172D40`, border 1px solid transparent. Hover: border `#5599E8`.
- **Outline Action:** Transparent background, text `#172D40`, border 1px solid `#E2E8F0`. Hover: background `#F8FAFC`.

### Chips & Pill Badges
- **Live Match Pill:** Background `#DFFF00`, text `#172D40`, tracking uppercase, font size `11px`, bold. Accompanied by a 6px pulsing dot in `#172D40` or `#EF4444`.
- **Set Score Pill:** Background `#F6FAFF`, text `#5599E8`, font weight 700. For completed sets (e.g., `6-3`, `4-6`).
- **Seed Indicator:** Background `#F1F5F9`, text `#4A6277`, font weight 700, rounded 4px, size `11px`.

### Match & Tournament Cards
- **Structure:** Solid `#FFFFFF`, border 1px solid `#E2E8F0`, border-radius 16px, padding `16px`.
- **Team Row Layout:** Divided into two distinct horizontal player/team rows. Winning team highlighted with high-contrast text (`#172D40`), losing team dimmed to `#889EB2`.
- **Score Columns:** Fixed-width tabular numeric columns positioned flush right. Current set in progress highlighted with an `#F6FAFF` column fill or neon lime underline indicator.

### Input Fields & Selectors
- **Fields:** Height 44px, border 1px solid `#E2E8F0`, background `#FFFFFF`, border-radius 8px, text `#172D40`. Focus state: border `#5599E8`, box-shadow `0 0 0 3px rgba(85, 153, 232, 0.2)`.
- **Score Entry Inputs:** Centered numeric inputs with large display typography (`score-game`), designed for fast thumb entry during referee tablet operations.

### Selection Controls
- **Checkboxes & Radios:** Border 1.5px solid `#889EB2`, radius 4px (checkbox) or circular (radio). Checked state: fill `#5599E8` with crisp white mark.

### Specialized Athletic Components
- **Padel Court Visualizer Mini-Map:** Simplified glass-and-mesh outline displaying live court assignments (Court 1, Center Court, Court 3) with real-time occupancy pills.
- **Pulsing Beacon:** 8px luminous dot using `#DFFF00` with an animated outer CSS ring pinging outward to signify active point in progress.
- **Tiebreak Counter:** Compact inline micro-badge floating directly above set game scores in bold `label-sm` notation (e.g., `7-6⁷`).