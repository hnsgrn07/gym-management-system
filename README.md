# Gym Management System

A gym management system for small gyms. It tracks memberships, walk-ins, and attendance (time in, time out, and date), along with member body stats and coach-built workouts. It runs on one computer at the gym, and everyone else uses it from their phones or other computers on the gym Wi-Fi. It needs no internet connection and no special hardware.

## Portals

| Who | What they can do |
|---|---|
| **Front desk (clerk)** | Search anyone and time them in or out from the keyboard. Register walk-ins and collect the day fee. Register members and sell or renew plans. See who's in the gym now, who's expiring, and the daily log of visits and payments. |
| **Member** | Time in and out from their phone. Log weight, height, body fat, and measurements, with BMI and age calculated automatically. Follow the coach's workouts and mark them done. View visit, membership, and payment history. |
| **Walk-in** | No account. Times in and out at the desk, or from their own phone on the "Walk-in? Time in here" page. |
| **Coach** | See members' stats, trends, and attendance. Build custom workouts that appear on the member's phone right away. Keep private coach notes. Take members on. |
| **Admin** | Reports for revenue, visits, busiest hours, and membership status, with CSV export. Manage plans and pricing, staff accounts, gym settings (name, currency, walk-in fee), and the activity log. Admins can also use the desk and coaching tools. |

## Quick start

You need [Node.js](https://nodejs.org) 22.18 or newer (24 LTS recommended).

```bash
npm install
npm run build      # build the web app
npm start          # start the server on http://localhost:4000
```

On first start the system creates **demo data**:

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Front desk | `clerk` | `clerk123` |
| Coach | `coach` | `coach123` |
| Member | `member` (or `M-0001`) | `member123` |

Before using it for real:
1. Sign in as admin and change the password (Account).
2. Go to **Gym settings**: set your gym name, currency, and walk-in fee, and switch off "Show demo accounts".
3. Go to **Plans & pricing** and set up your plans.

To start with an empty database instead, delete `server/data/gym.db` and start with `SEED_DEMO=0`. You then need to create the first admin yourself (see "Data & backups" below). To reload the demo data, run `npm run seed`.

## Using it on phones (same Wi-Fi)

When the server starts, it prints addresses such as `http://192.168.1.20:4000`. Open that address on any phone connected to the gym Wi-Fi. Tip: give the gym PC a fixed IP address in your router so the address never changes, and print it as a QR code at the front desk.

## Offline behavior

- The gym PC is the server, so the system works with **no internet at all**.
- If a phone loses the Wi-Fi connection, the app keeps showing the last data it loaded. Time in/out, body stats, walk-ins, and "workout done" are **saved on the device with the time they happened**, and sync automatically when the phone reconnects. A banner shows when you're offline and how many entries are waiting.
- On `localhost` (the gym PC itself) the app also works as an installable app that opens with no connection. Phones can only get the installable, fully offline app when the site is served over **HTTPS**, which is a browser rule. If you later host it online, or put it behind HTTPS on the local network, set `COOKIE_SECURE=1`.

## Development

```bash
npm run dev        # API on :4000 with auto-reload + web app on :5173 with hot reload
npm run typecheck
```

### Stack
- **server/**: Node + Express 5 + TypeScript, run directly by Node's built-in TypeScript support. It uses Node's built-in SQLite (`node:sqlite`), so there are no native modules to compile. Inputs are validated with zod. Sessions use HTTP-only cookies and passwords are hashed with scrypt.
- **client/**: React 19 + TypeScript + Vite, React Router, TanStack Query, and lucide icons, with hand-written CSS tokens (see `DESIGN.md`).

### Project layout
```
server/src/
  db.ts              schema + migrations (append new ones to the list)
  auth.ts            password hashing, sessions, role guards
  services/          attendance, membership, members, settings logic
  routes/            auth + walk-in, member, coach, desk (clerk), admin
  seed.ts            demo data
client/src/
  lib/api.ts         fetch wrapper, offline cache + sync queue
  components/        UI kit, app shell, charts, stats
  pages/             member/, coach/, desk/, admin/, Login, WalkIn, Account
```

### Rules the system enforces
- A member can only time in with an active membership. The desk can override this with "Time in anyway", and the override is recorded in the activity log.
- A renewal starts the day after the current plan ends, so no paid days are lost.
- Anyone left timed in overnight is closed out at 23:59 of that day and flagged as "Forgot to time out", so the "in the gym" list stays accurate.
- Every payment records who received it, and sensitive actions are written to the activity log.

## Data & backups

Everything is stored in one file: `server/data/gym.db`. **Back up that file regularly**, for example by copying it to a USB drive or cloud folder each week (stop the server first, or also copy `gym.db-wal`).

To create the first admin on an empty database, run:
```bash
node -e "import('./server/src/auth.ts').then(async a=>{const {run,migrate}=await import('./server/src/db.ts');migrate();run(\"INSERT INTO users (role,username,password_hash,full_name) VALUES ('admin','admin',?,'Administrator')\",a.hashPassword('change-me'))})"
```
