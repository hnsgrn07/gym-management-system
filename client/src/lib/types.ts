export type Role = 'admin' | 'clerk' | 'coach' | 'member';
export type MembershipStatus = 'active' | 'expiring' | 'expired' | 'pending' | 'none';

export interface User {
  id: number;
  role: Role;
  username: string;
  full_name: string;
}

export interface PublicSettings {
  gym_name: string;
  currency: string;
  walkin_fee: number;
  walkin_self_service: boolean;
  open_hours: string;
  demo_mode: boolean;
  expiring_days: number;
}

export interface Member {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  active: number;
  created_at: string;
  member_code: string;
  birthdate: string | null;
  gender: string | null;
  emergency_contact: string | null;
  goal: string | null;
  coach_id: number | null;
  coach_name: string | null;
  coach_notes: string | null;
  paid_through: string | null;
  status: MembershipStatus;
  days_left: number | null;
  age: number | null;
  inside: boolean;
  last_visit: string | null;
}

export interface Stat {
  id: number;
  recorded_on: string;
  weight_kg: number | null;
  height_cm: number | null;
  body_fat_pct: number | null;
  muscle_pct: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  hips_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
  resting_hr: number | null;
  notes: string | null;
  bmi: number | null;
  recorded_by: number | null;
  recorded_by_name: string | null;
  recorded_by_role: Role | null;
}

export interface Exercise {
  id?: number;
  name: string;
  sets: number | null;
  reps: string | null;
  load: string | null;
  rest_sec: number | null;
  notes: string | null;
}

export interface Workout {
  id: number;
  member_id: number;
  coach_id: number | null;
  coach_name: string | null;
  title: string;
  day_label: string | null;
  focus: string | null;
  notes: string | null;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
  times_done: number;
  last_done: string | null;
  exercises: Exercise[];
}

export interface WorkoutLog {
  id: number;
  workout_id: number;
  title: string;
  completed_at: string;
  effort: number | null;
  notes: string | null;
}

export interface Attendance {
  id: number;
  date: string;
  time_in: string;
  time_out: string | null;
  auto_closed: number;
  source: string;
}

export interface Plan {
  id: number;
  name: string;
  duration_days: number;
  price: number;
  description: string | null;
  active?: number;
  times_sold?: number;
}

export interface Membership {
  id: number;
  plan_name: string;
  start_date: string;
  end_date: string;
  price_paid: number;
  sold_by: string | null;
  created_at: string;
}

export interface Payment {
  id: number;
  kind: 'membership' | 'walkin' | 'other';
  amount: number;
  method: string;
  note: string | null;
  created_at: string;
  payer?: string | null;
  received_by_name?: string | null;
}

export interface InsideRow {
  id: number;
  time_in: string;
  member_id: number | null;
  walkin_id: number | null;
  name: string;
  member_code: string | null;
  phone: string | null;
  paid: number;
  source: string;
}

export interface WalkinResult {
  id: number;
  full_name: string;
  phone: string | null;
  last_visit: string | null;
  visits: number;
  inside: number;
}
