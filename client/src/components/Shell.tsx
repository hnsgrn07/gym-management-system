import {
  BarChart3, CalendarDays, ClipboardList, CloudOff, Dumbbell, Ellipsis, History, House, LogOut,
  MonitorCheck, RefreshCw, ScrollText, Settings, Tags, TrendingUp, UserCog, UserRound, Users, type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { flushOutbox, onSynced } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useNet } from '../lib/hooks';
import type { Role } from '../lib/types';
import { useSignOut } from './confirm';
import { useToast } from './toast';
import { Avatar } from './ui';

interface NavItem { to: string; label: string; short?: string; icon: LucideIcon; end?: boolean; section?: string }

const NAV: Record<Role, NavItem[]> = {
  member: [
    { to: '/member', label: 'Today', icon: House, end: true },
    { to: '/member/workouts', label: 'Workouts', icon: Dumbbell },
    { to: '/member/progress', label: 'Progress', icon: TrendingUp },
    { to: '/member/history', label: 'History', icon: History },
    { to: '/account', label: 'Account', icon: UserRound },
  ],
  coach: [
    { to: '/coach', label: 'Members', icon: Users, end: true },
    { to: '/account', label: 'Account', icon: UserRound },
  ],
  clerk: [
    { to: '/desk', label: 'Front desk', short: 'Desk', icon: MonitorCheck, end: true },
    { to: '/desk/members', label: 'Members', icon: Users },
    { to: '/desk/log', label: 'Daily log', short: 'Log', icon: CalendarDays },
    { to: '/account', label: 'Account', icon: UserRound },
  ],
  admin: [
    { to: '/admin', label: 'Overview', icon: BarChart3, end: true },
    { to: '/desk', label: 'Front desk', short: 'Desk', icon: MonitorCheck, end: true, section: 'Daily work' },
    { to: '/desk/members', label: 'Members', icon: Users },
    { to: '/desk/log', label: 'Daily log', short: 'Log', icon: CalendarDays },
    { to: '/coach', label: 'Coaching', icon: ClipboardList },
    { to: '/admin/plans', label: 'Plans & pricing', short: 'Plans', icon: Tags, section: 'Manage' },
    { to: '/admin/staff', label: 'Staff accounts', short: 'Staff', icon: UserCog },
    { to: '/admin/settings', label: 'Gym settings', short: 'Settings', icon: Settings },
    { to: '/admin/activity', label: 'Activity log', short: 'Activity', icon: ScrollText },
    { to: '/account', label: 'Account', icon: UserRound },
  ],
};

const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', clerk: 'Front desk', coach: 'Coach', member: 'Member' };

export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <span className="brand-mark" aria-hidden>
      <Dumbbell size={size} strokeWidth={2.2} />
    </span>
  );
}

function NetBar() {
  const net = useNet();
  const toast = useToast();
  useEffect(
    () =>
      onSynced((r) => {
        if (r.synced.length) toast({ tone: 'ok', title: `Synced ${r.synced.length} saved ${r.synced.length === 1 ? 'entry' : 'entries'}`, text: r.synced.join(' · ') });
        for (const f of r.failed) toast({ tone: 'bad', title: `Couldn’t sync: ${f.label}`, text: f.error });
      }),
    [toast],
  );
  if (net.online && !net.pending) return null;
  if (net.online && net.pending) {
    return (
      <div className="netbar syncing" role="status">
        <RefreshCw size={16} className={net.syncing ? 'spin' : ''} aria-hidden />
        {net.pending} saved {net.pending === 1 ? 'entry is' : 'entries are'} waiting to sync.
        <button className="btn btn-sm btn-ghost" onClick={() => void flushOutbox()}>Sync now</button>
      </div>
    );
  }
  return (
    <div className="netbar" role="status">
      <CloudOff size={16} aria-hidden />
      Offline. You’re seeing the last saved data.
      {net.pending > 0 && ` ${net.pending} ${net.pending === 1 ? 'entry' : 'entries'} will sync when you reconnect.`}
    </div>
  );
}

export function Shell() {
  const { user, settings } = useAuth();
  const signOut = useSignOut();
  const [more, setMore] = useState(false);
  const location = useLocation();
  useEffect(() => setMore(false), [location.pathname]);
  if (!user) return null;
  const items = NAV[user.role];
  const tabs = items.length > 5 ? items.slice(0, 4) : items;
  const overflow = items.length > 5 ? items.slice(4) : [];

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <BrandMark />
          <div>
            <div className="brand-name">{settings.gym_name}</div>
            <div className="brand-role">{ROLE_LABEL[user.role]}</div>
          </div>
        </div>
        <nav className="nav">
          {items.filter((i) => i.to !== '/account').map((i) => (
            <div key={i.to + i.label} style={{ display: 'contents' }}>
              {i.section && <div className="nav-section">{i.section}</div>}
              <NavLink to={i.to} end={i.end}>
                <i.icon size={19} aria-hidden /> {i.label}
              </NavLink>
            </div>
          ))}
        </nav>
        <div className="sidebar-foot nav">
          <div className="sidebar-user">
            <Avatar name={user.full_name} />
            <div style={{ minWidth: 0 }}>
              <div className="sidebar-user-name">{user.full_name}</div>
              <div className="brand-role">@{user.username}</div>
            </div>
          </div>
          <NavLink to="/account"><UserRound size={19} aria-hidden /> Account</NavLink>
          <a href="#" onClick={(e) => { e.preventDefault(); void signOut(); }}><LogOut size={19} aria-hidden /> Sign out</a>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <BrandMark size={18} />
          <span className="topbar-title">{settings.gym_name}</span>
          <span className="brand-role" style={{ color: 'var(--shell-text)' }}>{ROLE_LABEL[user.role]}</span>
        </header>
        <NetBar />
        <Outlet />
      </div>

      <nav className="tabbar" aria-label="Main navigation">
        {tabs.map((i) => (
          <NavLink key={i.to + i.label} to={i.to} end={i.end}>
            <i.icon size={22} aria-hidden />
            {i.short ?? i.label}
          </NavLink>
        ))}
        {overflow.length > 0 && (
          <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog" aria-expanded={more}>
            <Ellipsis size={22} aria-hidden />
            More
          </button>
        )}
      </nav>

      {more && (
        <>
          <div className="sheet-backdrop" onClick={() => setMore(false)} />
          <div className="sheet" role="dialog" aria-label="More pages">
            <div className="sheet-handle" />
            {overflow.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.end}><i.icon size={20} aria-hidden /> {i.label}</NavLink>
            ))}
            <button type="button" onClick={() => { setMore(false); void signOut(); }}><LogOut size={20} aria-hidden /> Sign out</button>
          </div>
        </>
      )}
    </div>
  );
}
