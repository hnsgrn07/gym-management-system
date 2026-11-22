---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: []
---

# Surface: Gym management app shell (all role portals)

Scope: the whole authenticated app: clerk desk, member, coach, admin, and walk-in self check-in. Mode: Operate.

Audience/job: see PRODUCT.md. The clerk front desk is the critical path: search, then check in or out, then done.

## Direction contract

THESIS: A standard dashboard (canon, chosen by the user) played straight at Stripe/Linear craft. It refuses gym-app costume (neon on black, flex imagery). The task leads; status is never ambiguous.

OWN-WORLD: Restrained palette. Cool neutral ground, white work surfaces, and a deep-teal primary used only for primary actions and the current selection. The semantic state set is fixed everywhere: green = active/inside, amber = expiring, red = expired/overdue, slate = walk-in. Sans-serif system stack with tabular numerals. 12px card radius, 1px borders, and no shadows except on overlays. Dark theme follows the OS setting.

STORY: The clerk sees who's inside and today's numbers, types a name, and checks the person in. The member sees their membership status, a big Time in/out button, today's workout, and their progress. The coach picks a member and builds a workout. The admin manages plans, staff, settings, and reports.

FIRST VIEWPORT: A left sidebar (a bottom tab bar on phones) with role navigation. The clerk desk shows the search field at top with focus, the result row's status pill, and the check-in action at the right. Below that is the "Inside now" table with live durations.

FORM: canon (standing exit, chosen by the user); seed:2649b88ef9b5434e.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
