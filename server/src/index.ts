import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadUser, me, requireRole } from './auth.ts';
import { all, get, migrate } from './db.ts';
import { adminRouter } from './routes/admin.ts';
import { authRouter } from './routes/auth.ts';
import { coachRouter } from './routes/coach.ts';
import { deskRouter } from './routes/desk.ts';
import { memberRouter } from './routes/member.ts';
import { coachLeaderboard, leaderboard } from './services/ranking.ts';
import { getSettings } from './services/settings.ts';
import { seedDemo, seedDemoCoachLifts, seedDemoLifts } from './seed.ts';
import { z } from 'zod';
import { HttpError, parse } from './util.ts';

migrate();
if (!get('SELECT 1 FROM users LIMIT 1') && process.env.SEED_DEMO !== '0') {
  seedDemo();
  console.log('First run: demo data created (see README for the demo sign-ins).');
} else if (getSettings().demo_mode && !get('SELECT 1 FROM lift_logs LIMIT 1')) {
  seedDemoLifts(); // demo databases created before leagues existed
}
if (getSettings().demo_mode && !get("SELECT 1 FROM lift_logs l JOIN users u ON u.id = l.member_id WHERE u.role = 'coach' LIMIT 1")) {
  seedDemoCoachLifts(); // demo databases created before coach rankings existed
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '200kb' }));
app.use(loadUser);

const api = express.Router();
api.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
api.get('/health', (_req, res) => res.json({ ok: true }));
api.use(authRouter);
api.get('/plans', requireRole('admin', 'clerk', 'coach', 'member'), (_req, res) => {
  res.json(all('SELECT id, name, duration_days, price, description FROM plans WHERE active = 1 ORDER BY duration_days'));
});
api.get('/leaderboard', requireRole('admin', 'clerk', 'coach', 'member'), (req, res) => {
  const q = parse(z.object({
    group: z.enum(['members', 'coaches']).default('members'),
    board: z.enum(['points', 'strength', 'streak', 'coaching']).default('points'),
    period: z.enum(['month', 'all']).default('month'),
  }), req.query);
  const user = me(req);
  // The coaches' board is visible to everyone.
  if (q.group === 'coaches') {
    res.json(coachLeaderboard(q.board === 'strength' ? 'strength' : 'coaching', q.period, user.role === 'coach' ? user.id : null));
    return;
  }
  if (q.board === 'coaching') throw new HttpError(400, 'Unknown board.');
  // Staff see everyone (hidden members are flagged); members only see people who opted in, plus themselves.
  res.json(leaderboard(q.board, q.period, user.role === 'member' ? user.id : null, { includeHidden: user.role !== 'member' }));
});
api.use('/member', memberRouter);
api.use('/coach', coachRouter);
api.use('/desk', deskRouter);
api.use('/admin', adminRouter);
api.use((_req, _res) => {
  throw new HttpError(404, 'Not found.');
});
app.use('/api', api);

// Serve the built client (npm run build) with SPA fallback.
const dist = path.resolve(import.meta.dirname, '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, {
    setHeaders: (res, file) => {
      if (file.endsWith('sw.js') || file.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'The request was not valid JSON.' });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('UNIQUE constraint failed')) {
    res.status(409).json({ error: 'That record already exists.' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server. Try again.' });
});

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';
app.listen(port, host, () => {
  console.log(`\nGym system API running on http://localhost:${port}`);
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i!.address);
  if (fs.existsSync(dist) && lan.length) {
    console.log('Phones on the same Wi-Fi can open:');
    for (const ip of lan) console.log(`  http://${ip}:${port}`);
  }
});
