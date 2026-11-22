import { all, run, tx } from '../db.ts';

export interface Settings {
  gym_name: string;
  currency: string; // ISO 4217 code, formatted with Intl on the client
  walkin_fee: number;
  expiring_days: number; // memberships ending within this many days show as "Expiring"
  walkin_self_service: boolean; // walk-ins may time themselves in/out from their own phone
  open_hours: string;
  demo_mode: boolean;
}

const DEFAULTS: Settings = {
  gym_name: 'My Gym',
  currency: 'USD',
  walkin_fee: 5,
  expiring_days: 7,
  walkin_self_service: true,
  open_hours: '',
  demo_mode: false,
};

export function getSettings(): Settings {
  const rows = all<{ key: string; value: string }>('SELECT key, value FROM settings');
  const out: Settings = { ...DEFAULTS };
  for (const { key, value } of rows) {
    if (!(key in DEFAULTS)) continue;
    const def = DEFAULTS[key as keyof Settings];
    (out as unknown as Record<string, unknown>)[key] =
      typeof def === 'number' ? Number(value) : typeof def === 'boolean' ? value === '1' : value;
  }
  return out;
}

export function saveSettings(patch: Partial<Settings>) {
  tx(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in DEFAULTS) || value === undefined) continue;
      const stored = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
      run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, stored);
    }
  });
}
