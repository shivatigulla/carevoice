# CareVoice Design System

**Feel:** calm, clinical, premium — *mission control for a hospital's AI workforce*. Staff glance at it between
patients, so it must be quiet until something needs attention, then unmistakable. It is not a
generic admin template: no rainbow charts, no loud gradients, no decorative noise.

Implemented in `frontend/src/index.css` (CSS variables + Tailwind v4 `@theme`) and shadcn/ui.

---

## Color

Colors are CSS variables on `:root` / `.dark`, exposed to Tailwind as utilities
(`bg-live`, `text-ai`, `ring-critical/20`, …).

| Token                | Light     | Dark      | Use                                          |
|----------------------|-----------|-----------|----------------------------------------------|
| `background`         | `#F7F8F6` | `#0B1413` | App canvas                                   |
| `card` / `surface`   | `#FFFFFF` | `#111C1B` | Cards, panels, popovers                      |
| `foreground` / `ink` | `#0F1B1A` | `#E6EFED` | Primary text                                 |
| `muted-foreground`   | `#5C6B69` | `#8EA19E` | Secondary text                               |
| `border`             | `#E4E9E7` | `#1F2F2D` | 1px borders                                  |
| `primary`            | `#0E7C7B` | `#19A3A1` | Deep teal — brand, primary actions, Telugu   |
| `live`               | `#3DDC97` | `#52EAA8` | Mint — something is happening *now*          |
| `ai`                 | `#5B6CFF` | `#7483FF` | Indigo — AI activity, agents, English        |
| `warning`            | `#F2A93B` | `#F6BA58` | Amber — needs attention, Hindi               |
| `critical`           | `#E5484D` | `#F0676B` | Coral — emergencies, failures                |

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
