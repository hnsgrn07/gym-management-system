import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { get, run } from './db.ts';
import { HttpError, localDateTime } from './util.ts';

export type Role = 'admin' | 'clerk' | 'coach' | 'member';
export interface SessionUser {
  id: number;
  role: Role;
  username: string;
  full_name: string;
}

const SESSION_DAYS = 30;
export const COOKIE = 'gym_sid';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export function createSession(res: Response, userId: number) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', token, userId, localDateTime(expires));
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === '1',
    expires,
    path: '/',
  });
}

export function destroySession(req: Request, res: Response) {
  const token = readCookie(req, COOKIE);
  if (token) run('DELETE FROM sessions WHERE token = ?', token);
  res.clearCookie(COOKIE, { path: '/' });
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

/** Attaches req.user when a valid session cookie is present. Never rejects. */
export function loadUser(req: Request, _res: Response, next: NextFunction) {
  const token = readCookie(req, COOKIE);
  if (token) {
    const user = get<SessionUser>(
      `SELECT u.id, u.role, u.username, u.full_name
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND s.expires_at > ? AND u.active = 1`,
      token,
      localDateTime(),
    );
    if (user) req.user = user;
  }
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new HttpError(401, 'Please sign in to continue.', 'UNAUTHENTICATED');
    if (!roles.includes(req.user.role)) throw new HttpError(403, "Your account doesn't have access to this.", 'FORBIDDEN');
    next();
  };
}

/** Narrow req.user after requireRole. */
export function me(req: Request): SessionUser {
  if (!req.user) throw new HttpError(401, 'Please sign in to continue.', 'UNAUTHENTICATED');
  return req.user;
}

/** Tiny in-memory throttle for login attempts (per IP + username). */
const attempts = new Map<string, { count: number; until: number }>();
export function throttleLogin(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (entry && entry.until > now && entry.count >= 8) {
    throw new HttpError(429, 'Too many sign-in attempts. Wait a few minutes and try again.', 'THROTTLED');
  }
}
export function recordLoginFailure(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.until < now) attempts.set(key, { count: 1, until: now + 5 * 60_000 });
  else entry.count++;
}
export function clearLoginFailures(key: string) {
  attempts.delete(key);
}
