---
name: Gym management, Hi-Vis Training
mode: operate
---

# Design system: Hi-Vis Training

A modern performance gym: a concrete-gray floor, a black shell, and one loud volt accent. Layout and controls stay standard; the personality lives in type, color, and a few signature details. Tokens live in `client/src/styles.css` (`:root`).

## Scene
- The clerk uses a front-desk PC, and members and coaches use phones on a bright gym floor.
- So the default theme is light. Dark follows the OS, and there volt becomes the text and selection accent.

## Color
| Role | Light | Use |
|---|---|---|
| `--volt` | #d4ff00 | primary buttons (black text), the "live / in the gym" dot, page-title tape, the active nav bar. Never text on light. |
| `--bg` | #e8e7e3 | concrete page ground |
| `--surface` | #ffffff | panels |
| `--shell` | #111110 | sidebar, mobile top bar, and the sign-in "lobby" |
| `--sel-bg` / `--sel-fg` | #121211 / volt | selected segment, active tab, selected row bar (inverted in dark) |
| `--ok` `--warn` `--bad` | green / amber / red | active, expiring, expired/unpaid; the same meaning everywhere |
| `--walkin` | #5a3ea6 | walk-in identity, including former walk-in visits |
| charts | black / orange / violet | volt is too light to chart on white |

## Type
- **Big Shoulders Display** (variable, bundled): all-caps h1/h2, scoreboard numbers (facts, timers), the brand, and large buttons.
- **Barlow** 400–700 (bundled): all body text, labels, and controls.
- Small labels (table headers, fact labels, nav sections) are uppercase with 0.07em tracking.
- Fonts come from `@fontsource`, so they work offline.

## Signature details
- A skewed strip of volt "floor tape" before every page title (hidden when the title has an avatar).
- Scoreboard numerals for counts, money, and the member's session timer.
- The Time in button is volt with a black base shadow and physically presses down.
- The active nav item gets an inset volt bar. The phone tab bar gets a skewed indicator.
- Avatars: black with volt initials for members, violet for walk-ins.

## Shape and space
- Spacing scale 4–48px.
- Panels: 10px radius, 1px border, no shadow. Shadows are only for overlays.
- Controls are 44px tall (56px for large ones).

## Components
`Button`, `TextField`, `SelectField`, `Checkbox`, `Segmented`, `Tabs`, `Panel` (never nested), `Facts`, `StatusPill`, `Notice`, `Empty`, `Dialog`, `ConfirmProvider` / `useConfirm()` (for consequential actions: sign out, stop or take over coaching, archive, deactivate, collecting a plan payment), toasts, `LineChart` / `BarChart`.

## Leagues and leaderboards
- League colors are the only exception to the restrained palette, and they appear only on league crests, league names and progress fills: Iron #5d6168, Bronze #a5622f, Silver #8f99a3, Gold #d19a0b, Platinum #2f9e96, Diamond #4a78e0, Elite black with volt.
- `LeagueBadge` is a vector shield showing the division numeral (Elite shows a crown).
- The podium uses black for 1st with a volt numeral, then graphite for 2nd and 3rd.
- The streak week dots fill with volt on visited days, and today's dot is outlined.
- The viewer's own leaderboard row gets the selection tint plus an inset bar.

## Motion
- 150–250ms state transitions, and a 220ms rise on overlays.
- A volt pulse on live dots. Reduced motion is respected.
