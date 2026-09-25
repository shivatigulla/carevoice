# CareVoice Design System

**Feel:** professional navy blue and white, calm and clinical — *mission control for a hospital's AI workforce*. Staff glance at it between
patients, so it must be quiet until something needs attention, then unmistakable. It is not a
generic admin template: no rainbow charts, no loud gradients, no decorative noise.

Implemented in `frontend/src/index.css` (CSS variables + Tailwind v4 `@theme`) and shadcn/ui.

---

## Color

Colors are CSS variables on `:root` / `.dark`, exposed to Tailwind as utilities
(`bg-live`, `text-ai`, `ring-critical/20`, …).

| Token                | Light     | Dark      | Use                                          |
|----------------------|-----------|-----------|----------------------------------------------|
| `background`         | `#F4F6FA` | `#070E1C` | App canvas                                   |
| `card` / `surface`   | `#FFFFFF` | `#0E1A30` | Cards, panels, popovers                      |
| `foreground` / `ink` | `#0B1B33` | `#E6ECF5` | Primary text                                 |
| `muted-foreground`   | `#5B6B82` | `#93A3BD` | Secondary text                               |
| `border`             | `#E2E8F0` | `#1C2E4F` | 1px borders                                  |
| `primary`            | `#1E3A8A` | `#3B82F6` | Navy blue — brand, primary actions           |
| `sidebar`            | `#0B1F44` | `#081226` | Navy sidebar with white text                 |
| `live`               | `#10B981` | `#34D399` | Green — something is happening *now*         |
| `ai`                 | `#4F46E5` | `#818CF8` | Indigo — AI activity, agents, English        |
| `warning`            | `#F59E0B` | `#FBBF24` | Amber — needs attention, Hindi               |
| `critical`           | `#DC2626` | `#F87171` | Red — emergencies, failures                  |

The look is a professional **navy blue and white** dashboard: navy sidebar and primary actions, white
cards on a cool light-grey canvas.

Rules:
- **Mint means live.** Use it only for things happening right now (on a call, streaming). Never as a
  generic "success" color on static data.
- **Indigo means AI.** Agent avatars, AI-generated summaries, AI activity.
- Status colors appear as tinted fills with a matching inset ring (`bg-live/15 ring-live/30`), rarely
  as solid fills. Solid fill is reserved for the primary button.
- Dark mode uses the same accents, slightly brighter, on deep teal-black surfaces.

## Typography

| Role     | Font                                       | Notes                                |
|----------|--------------------------------------------|--------------------------------------|
| Headings | **Plus Jakarta Sans** (`font-heading`)     | 600–800, `tracking-tight`            |
| Body     | **Inter** (`font-sans`)                    | 400–600                              |
| Numeric  | **JetBrains Mono** (`font-mono`)           | Timers, IDs, phone numbers, clock    |
| Scripts  | **Noto Sans Telugu**, **Noto Sans Devanagari** | In the `font-sans`/`font-heading` fallback chain, so Telugu and Hindi transcripts render in a matching, legible face. `:lang(te)` / `:lang(hi)` get extra line height. |

Always mark transcript text with `lang="te" | "hi" | "en"`. Use `tabular` (tabular numerals) for
anything that ticks.

## Shape, depth, spacing

- **Radius 12px** (`--radius: 0.75rem`, `rounded-lg`). Small controls use `rounded-md`.
- **1px borders** on every card (`border`), plus **soft layered shadows**: `shadow-soft` at rest,
  `shadow-lift` on hover/raised.
- **Generous spacing:** page padding 32px on desktop, 24px gaps between panels, 16–20px card padding.

## Motion

framer-motion, **subtle only**: fades and 6px slide-ins (≤ 350ms, ease-out), staggered by ≤ 40ms in
grids. Continuous motion is reserved for live signals (waveform, pulsing ring). Everything respects
`prefers-reduced-motion`.

## Signature components (`src/components/signature`)

| Component       | Purpose                                                                  |
|-----------------|--------------------------------------------------------------------------|
| `AgentAvatar`   | Agent role icon in an indigo tile; pulsing mint ring when on a call      |
| `LiveWaveform`  | Animated mint bars for live audio; flat and muted when idle              |
| `LanguageChip`  | `TE` teal · `HI` amber · `EN` indigo; optional native-script name        |
| `StatusPill`    | Tinted pill with a status dot (`live`, `ok`, `ai`, `warning`, `critical`, `neutral`) |
| `KpiCard`       | Metric with count-up animation and a small trend vs. comparison period    |
| `TimelineItem`  | Icon + connector line for event feeds (escalations, call events)          |
| `EmptyState`    | Icon, title, guidance and optional action — every empty list uses it     |
| `ErrorState`    | EmptyState variant for failed loads, with retry                          |
| `SkeletonCard`  | Loading placeholder matching card/row layouts                            |
| `ToolCallCard`  | **Indigo**: an agent called a tool — name, arguments, policy result, latency (Agent Brain, Tool Playground) |
| `ActionCard`    | **Mint**: an action that changed hospital data (appointment booked, task created) |
| `ConfirmationCard` | Staff-console write awaiting **Approve / Cancel**; nothing executes without Approve |

In development, `/design` renders every signature component with sample props for visual QA. It is
not registered in production builds and never appears in navigation.

## Page anatomy

- **Sidebar** (collapsible, 248px ↔ 68px): grouped nav with lucide icons, live-calls badge.
- **Topbar**: hospital name, live IST clock, system status pill (backend `/health`), Cmd/Ctrl+K
  palette, **Ask CareVoice** (indigo, staff console), **Test Call**, theme toggle, user menu. Below
  1280px the action buttons collapse to icons with tooltips.
- **Page header**: icon tile, `text-2xl` title, one-line description, actions on the right.
- **Panels**: titled cards with a hairline header divider. Every list inside handles loading, empty
  and error.

## Required breakpoints

Every page must look right at **1440px** and **1024px**, in **light and dark**. At 1024px the sidebar
is still expanded (248px), the KPI row wraps 3 + 2, and topbar actions are icon-only. Below 1024px the
sidebar becomes a drawer.
