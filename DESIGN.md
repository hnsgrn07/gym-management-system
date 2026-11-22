---
name: Gym management, standard dashboard
mode: operate
---

# Design system

A standard product dashboard, played straight: the task leads and status is never ambiguous. Tokens live in `client/src/styles.css` (`:root`). Change them there, not inline.

## Scene
- The clerk uses a front-desk PC under fluorescent light, with keyboard and mouse.
- Members and coaches use phones on a bright gym floor, often with sweaty hands.
- So the default theme is light, and dark mode follows the OS.

## Color (Restrained)
| Role | Light | Use |
|---|---|---|
| `--bg` | #f2f4f6 | page ground (cool neutral) |
| `--surface` | #ffffff | panels |
| `--shell` | #10232a | sidebar and mobile top bar |
| `--primary` | #0a6862 | primary actions and the current selection only |
| `--ok` / `--ok-bg` | #17744a / #e2f3e9 | active membership, in the gym, paid |
| `--warn` / `--warn-bg` | #8f5200 / #fcefd6 | expiring soon, offline, forgot to time out |
| `--bad` / `--bad-bg` | #b3261e / #fce7e5 | expired, unpaid, errors |
| `--walkin` / `--walkin-bg` | #5b3fa8 / #efeafb | walk-in identity |
| `--chart-1..3` | teal / amber / violet | data series |

These state colors mean the same thing on every screen. Never use them for decoration.

## Type
- System sans stack, one family. Sizes: base 15px (16px on phones, so iOS doesn't zoom on inputs), h1 1.6rem/700, h2 1.15rem/650.
- Tabular numerals in tables, timers, and money.
- No display faces, eyebrows, or gradient text.

## Shape and space
- Spacing scale: 4/8/12/16/24/32/48.
- Panels have a 12px radius, a 1px border, and no shadow. Shadows are only for overlays (dialog, toast, sheet).
- Controls are 44px tall (56px for primary actions on phones), with an 8px radius.
- Pills (999px radius) are only for status.

## Components
`Button` (primary, secondary, ghost, danger), `TextField`, `SelectField`, `Checkbox`, `Segmented`, `Tabs`, `Panel` (the only container; never nested), `Facts` (a one-row summary strip in place of hero-number cards), `StatusPill`, `Notice`, `Empty` (always explains the next step), `Dialog` (native `<dialog>`, only for confirmations), toasts, and SVG `LineChart` / `BarChart`.

## Layout
- 248px dark sidebar at 960px and wider.
- Below that: a dark top bar and a bottom tab bar, with a "More" sheet when a role has more than 5 destinations.
- Tables reflow into labelled rows under 720px (`.table.responsive`).

## Motion
- 150–250ms state transitions, and a 220ms rise on overlays.
- A pulse on "live" dots. Reduced motion is respected.
