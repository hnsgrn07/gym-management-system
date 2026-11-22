# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated ("do what you recommend for long term"). Chosen: npm workspaces monorepo.
- `server/`: Node 24 + Express + TypeScript (run via Node's native type stripping), zod validation, SQLite through Node's built-in `node:sqlite` (no native build step). All SQL is kept behind a small data layer so it can move to Postgres later.
- `client/`: React + TypeScript + Vite + React Router, hand-written CSS with design tokens.

## Users

- **Clerk**: works the front desk PC (keyboard + mouse). Greets people, looks members up by name/code/phone, times people in and out, registers walk-ins, sells and renews memberships, and takes payments. Speed and zero ambiguity matter most here because there may be a line at the counter.
- **Member**: uses their own phone. Times in and out, logs body stats (weight, height, BMI, age, body fat, etc.), follows the workouts their coach assigned, and checks their membership status.
- **Walk-in customer**: has no account. Can only time in and out (day pass). Usually handled by the clerk, but can also use a public walk-in page on their own phone (name and phone number). The admin can turn this page off.
- **Coach**: uses a tablet or phone on the gym floor. Looks up members' data and progress, then creates custom workouts that appear on the member's page.
- **Admin**: manages staff accounts, membership plans, pricing, gym settings, and reports.

## Product Purpose

Run the daily operations of a single gym: who is inside right now, who is paid up, what was earned today, and how each member is progressing. Success means the clerk can check someone in within seconds, members always know their status and their next workout, and the admin can trust the numbers.

## Operating Context

- Attendance is recorded as time in, time out, and date for both members and walk-ins.
- Memberships have a plan, a start date, and an end date. Members whose membership has expired are flagged at check-in.
- Walk-ins pay a day fee, which the admin can configure.
- Currency symbol and gym name are configurable by the admin (no default brand).

## Capabilities and Constraints

- Role-based portals: walk-in (self check-in), member, coach, clerk, admin.
- Age is derived from birthdate, and BMI is computed from height and weight.
- For small, single-location gyms with minimal equipment. No kiosk, RFID, card scanner, or other special hardware: only the phones and computers the gym already has.
- Must work online or offline. The server runs on one gym PC with no internet required, and phones connect over the gym Wi-Fi. The app caches the last data it loaded, and queues time in/out, stats entries, and walk-ins while disconnected, then syncs them later.
- Multi-branch support is not decided.
- Payment processing is cash or manual entry only; there is no payment gateway.

## Brand Commitments

None yet. The gym name and currency are set in admin settings.

## Evidence on Hand

No real member data, photos, or logos. Seed data is demo-only and must be labeled as such.

## Product Principles

1. The front desk is never the bottleneck: one search box, one action, instant feedback.
2. Status at a glance: active, expiring, expired, and inside-now are always visible and unambiguous.
3. Each role sees only its own job; no role has to wade through another role's tools.
4. Numbers are trustworthy: every payment and every attendance entry records who did it and when.

## Accessibility & Inclusion

Must work on phones (members, coaches) and desktop (clerk, admin). Large touch targets and high contrast, since the gym floor has bright lights or glare and people use it mid-workout with sweaty hands. Target WCAG 2.1 AA.
