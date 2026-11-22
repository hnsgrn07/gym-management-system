import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { Shell } from './components/Shell';
import { LoadingRows } from './components/ui';
import { useAuth } from './lib/auth';
import type { Role } from './lib/types';
import { Login } from './pages/Login';
import { WalkIn } from './pages/WalkIn';

const Account = lazy(() => import('./pages/Account'));
const MemberToday = lazy(() => import('./pages/member/MemberToday'));
const MemberWorkouts = lazy(() => import('./pages/member/MemberWorkouts'));
const MemberProgress = lazy(() => import('./pages/member/MemberProgress'));
const MemberHistory = lazy(() => import('./pages/member/MemberHistory'));
const MemberRanks = lazy(() => import('./pages/member/MemberRanks'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const CoachMembers = lazy(() => import('./pages/coach/CoachMembers'));
const CoachMember = lazy(() => import('./pages/coach/CoachMember'));
const WorkoutEditor = lazy(() => import('./pages/coach/WorkoutEditor'));
const DeskHome = lazy(() => import('./pages/desk/DeskHome'));
const DeskMembers = lazy(() => import('./pages/desk/DeskMembers'));
const DeskMember = lazy(() => import('./pages/desk/DeskMember'));
const NewMember = lazy(() => import('./pages/desk/NewMember'));
const DeskLog = lazy(() => import('./pages/desk/DeskLog'));
const AdminOverview = lazy(() => import('./pages/admin/AdminOverview'));
const AdminPlans = lazy(() => import('./pages/admin/AdminPlans'));
const AdminStaff = lazy(() => import('./pages/admin/AdminStaff'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminActivity = lazy(() => import('./pages/admin/AdminActivity'));

export const HOME: Record<Role, string> = { admin: '/admin', clerk: '/desk', coach: '/coach', member: '/member' };

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={HOME[user.role]} replace />;
  return <>{children}</>;
}

const page = (node: ReactNode) => <Suspense fallback={<main className="content"><LoadingRows /></main>}>{node}</Suspense>;

export function App() {
  const { user, loading } = useAuth();
  if (loading) return <main className="auth-page"><LoadingRows rows={2} /></main>;

  const staff: Role[] = ['clerk', 'admin'];
  const coaches: Role[] = ['coach', 'admin'];
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={HOME[user.role]} replace /> : <Login />} />
      <Route path="/walk-in" element={<WalkIn />} />
      <Route element={user ? <Shell /> : <Navigate to="/login" replace />}>
        <Route path="/account" element={page(<Account />)} />

        <Route path="/member" element={<RequireRole roles={['member']}>{page(<MemberToday />)}</RequireRole>} />
        <Route path="/member/workouts" element={<RequireRole roles={['member']}>{page(<MemberWorkouts />)}</RequireRole>} />
        <Route path="/member/progress" element={<RequireRole roles={['member']}>{page(<MemberProgress />)}</RequireRole>} />
        <Route path="/member/ranks" element={<RequireRole roles={['member']}>{page(<MemberRanks />)}</RequireRole>} />
        <Route path="/leaderboard" element={<RequireRole roles={['member', 'coach', 'admin']}>{page(<Leaderboard />)}</RequireRole>} />
        <Route path="/member/history" element={<RequireRole roles={['member']}>{page(<MemberHistory />)}</RequireRole>} />

        <Route path="/coach" element={<RequireRole roles={coaches}>{page(<CoachMembers />)}</RequireRole>} />
        <Route path="/coach/members/:id" element={<RequireRole roles={coaches}>{page(<CoachMember />)}</RequireRole>} />
        <Route path="/coach/members/:id/workouts/new" element={<RequireRole roles={coaches}>{page(<WorkoutEditor />)}</RequireRole>} />
        <Route path="/coach/workouts/:workoutId" element={<RequireRole roles={coaches}>{page(<WorkoutEditor />)}</RequireRole>} />

        <Route path="/desk" element={<RequireRole roles={staff}>{page(<DeskHome />)}</RequireRole>} />
        <Route path="/desk/members" element={<RequireRole roles={staff}>{page(<DeskMembers />)}</RequireRole>} />
        <Route path="/desk/members/new" element={<RequireRole roles={staff}>{page(<NewMember />)}</RequireRole>} />
        <Route path="/desk/members/:id" element={<RequireRole roles={staff}>{page(<DeskMember />)}</RequireRole>} />
        <Route path="/desk/log" element={<RequireRole roles={staff}>{page(<DeskLog />)}</RequireRole>} />

        <Route path="/admin" element={<RequireRole roles={['admin']}>{page(<AdminOverview />)}</RequireRole>} />
        <Route path="/admin/plans" element={<RequireRole roles={['admin']}>{page(<AdminPlans />)}</RequireRole>} />
        <Route path="/admin/staff" element={<RequireRole roles={['admin']}>{page(<AdminStaff />)}</RequireRole>} />
        <Route path="/admin/settings" element={<RequireRole roles={['admin']}>{page(<AdminSettings />)}</RequireRole>} />
        <Route path="/admin/activity" element={<RequireRole roles={['admin']}>{page(<AdminActivity />)}</RequireRole>} />
      </Route>
      <Route path="*" element={<Navigate to={user ? HOME[user.role] : '/login'} replace />} />
    </Routes>
  );
}
