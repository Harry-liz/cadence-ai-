// All business logic has been moved to the Python FastAPI backend.
// This file is now a thin API client — no prompts, no data, no API keys.

export interface Deal {
  name: string;
  price: string;
}

export interface Restaurant {
  name: string;
  image: string;
  category: 'meal' | 'light';
  dishes: string[];
  budget: string;
  reason: string;
  rating: string;
  deals: Deal[];
}

// ── 停车助手功能已停用 ─────────────────────────────────────────────────────────
// export interface ParkingLevel {
//   id: string;
//   name: string;
//   total: number;
//   available: number;
//   tag: string;
//   fee: string;
// }
//
// export interface ParkingReservation {
//   level: string;
//   spot: string;
//   validUntil: Date;
//   plateHint?: string;
// }
// ──────────────────────────────────────────────────────────────────────────────

export interface StructuredChatResponse {
  text: string;
  suggestions: string[];
  imageUrl?: string;
  action?: 'dining' | 'events' | 'parking';
  actionLabel?: string;
  route?: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? JSON.stringify(err));
  }
  return res.json();
}

// ── API calls ──────────────────────────────────────────────────────────────────

export async function getDiningRecommendation(
  budget: string,
  people: number,
  taste: string
): Promise<Restaurant[]> {
  const data = await apiFetch<{ results: Restaurant[] }>('/api/dining/recommend', {
    budget,
    people,
    taste,
  });
  return data.results ?? [];
}

export async function getStyleAdvice(base64Image: string): Promise<string> {
  const data = await apiFetch<{ text: string }>('/api/style/advice', { image: base64Image });
  return data.text;
}

export async function getChatResponse(message: string): Promise<string> {
  const data = await apiFetch<{ text: string }>('/api/chat', { message });
  return data.text;
}

export async function getChatResponseStructured(
  message: string,
  history: { role: 'user' | 'ai'; text: string }[]
): Promise<StructuredChatResponse> {
  const data = await apiFetch<{
    text: string;
    suggestions: string[];
    image_url?: string;
    action?: string;
    action_label?: string;
    route?: string[];
  }>('/api/chat/structured', { message, history });

  return {
    text: data.text,
    suggestions: data.suggestions ?? [],
    imageUrl: data.image_url,
    action: data.action as StructuredChatResponse['action'],
    actionLabel: data.action_label,
    route: data.route,
  };
}

// ── 停车助手功能已停用 ─────────────────────────────────────────────────────────
// export async function getParkingStatus(): Promise<ParkingLevel[]> { ... }

// ── Events ────────────────────────────────────────────────────────────────────

export interface EventItinerary {
  steps: string[];
  tip: string;
}

export interface TodayStatusItem {
  label: string;
  value: string;
  tone: 'green' | 'amber' | 'indigo' | 'neutral';
}

export interface TodayHighlight {
  title: string;
  desc: string;
  action: 'dining' | 'events' | 'chat';
  actionLabel: string;
  query?: string;
}

export interface TodaySummary {
  headline: string;
  subheadline: string;
  statuses: TodayStatusItem[];
  recommendedAction: string;
  rightNow: string;
  avoidNow: string;
  bestFor: string[];
  highlights: TodayHighlight[];
}

export interface DayPlan {
  summary: string;
  steps: string[];
  tip: string;
  suggestions: string[];
  action?: 'dining' | 'events' | 'parking';
  actionLabel?: string;
}

export async function getEventItinerary(params: {
  eventId: string;
  eventTitle: string;
  eventLocation: string;
  eventTime: string;
  eventDetails: string[];
  scene: string;
  arriveTime: string;
}): Promise<EventItinerary> {
  const data = await apiFetch<{ steps: string[]; tip: string }>('/api/events/itinerary', {
    event_id: params.eventId,
    event_title: params.eventTitle,
    event_location: params.eventLocation,
    event_time: params.eventTime,
    event_details: params.eventDetails,
    scene: params.scene,
    arrive_time: params.arriveTime,
  });
  return { steps: data.steps ?? [], tip: data.tip ?? '' };
}

export async function getTodaySummary(): Promise<TodaySummary> {
  const data = await apiGet<{
    headline: string;
    subheadline: string;
    statuses: Array<{ label: string; value: string; tone: TodayStatusItem['tone'] }>;
    recommended_action: string;
    right_now: string;
    avoid_now: string;
    best_for: string[];
    highlights: Array<{
      title: string;
      desc: string;
      action: TodayHighlight['action'];
      action_label: string;
      query?: string;
    }>;
  }>('/api/today/summary');
  return {
    headline: data.headline,
    subheadline: data.subheadline,
    statuses: data.statuses ?? [],
    recommendedAction: data.recommended_action,
    rightNow: data.right_now,
    avoidNow: data.avoid_now,
    bestFor: data.best_for ?? [],
    highlights: (data.highlights ?? []).map((item) => ({
      title: item.title,
      desc: item.desc,
      action: item.action,
      actionLabel: item.action_label,
      query: item.query,
    })),
  };
}

export async function generateDayPlan(params: {
  scene: string;
  durationHours: number;
  budget?: number;
  arrivalTime?: string;
}): Promise<DayPlan> {
  const data = await apiFetch<{
    summary: string;
    steps: string[];
    tip: string;
    suggestions: string[];
    action?: string;
    action_label?: string;
  }>('/api/plan/day', {
    scene: params.scene,
    duration_hours: params.durationHours,
    budget: params.budget,
    arrival_time: params.arrivalTime,
  });

  return {
    summary: data.summary,
    steps: data.steps ?? [],
    tip: data.tip ?? '',
    suggestions: data.suggestions ?? [],
    action: data.action as DayPlan['action'],
    actionLabel: data.action_label,
  };
}
// export async function makeReservation(...): Promise<ParkingReservation> { ... }
// export async function getParkingResponse(...): Promise<string> { ... }
// ──────────────────────────────────────────────────────────────────────────────

// ── Member Center ──────────────────────────────────────────────────────────────

export interface MemberProfile {
  id: string;
  name: string;
  avatarEmoji: string;
  level: string;
  levelLabel: string;
  levelColor: string;
  points: number;
  totalSpending: number;
  checkinStreak: number;
  checkedInToday: boolean;
  nextLevel: string | null;
  nextLevelLabel: string | null;
  nextThreshold: number | null;
  progressPct: number;
}

export interface Coupon {
  id: string;
  title: string;
  desc: string;
  expiry: string;
  minSpend: number;
  discountText: string;
  tag: string;
  used: boolean;
  expired: boolean;
}

export interface Transaction {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  pointsEarned: number;
  category: string;
}

export interface PointsRecord {
  id: string;
  date: string;
  desc: string;
  delta: number;
  type: 'earn' | 'spend';
}

export interface CheckinResult {
  success: boolean;
  pointsEarned: number;
  newTotal: number;
  streak: number;
  message: string;
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? JSON.stringify(err));
  }
  return res.json();
}

export async function getMemberProfile(): Promise<MemberProfile> {
  const data = await apiGet<{
    id: string; name: string; avatar_emoji: string;
    level: string; level_label: string; level_color: string;
    points: number; total_spending: number; checkin_streak: number;
    checked_in_today: boolean; next_level: string | null;
    next_level_label: string | null; next_threshold: number | null;
    progress_pct: number;
  }>('/api/member/profile');
  return {
    id: data.id, name: data.name, avatarEmoji: data.avatar_emoji,
    level: data.level, levelLabel: data.level_label, levelColor: data.level_color,
    points: data.points, totalSpending: data.total_spending,
    checkinStreak: data.checkin_streak, checkedInToday: data.checked_in_today,
    nextLevel: data.next_level, nextLevelLabel: data.next_level_label,
    nextThreshold: data.next_threshold, progressPct: data.progress_pct,
  };
}

export async function postCheckin(): Promise<CheckinResult> {
  const data = await apiFetch<{
    success: boolean; points_earned: number; new_total: number; streak: number; message: string;
  }>('/api/member/checkin', {});
  return {
    success: data.success, pointsEarned: data.points_earned,
    newTotal: data.new_total, streak: data.streak, message: data.message,
  };
}

export async function getMemberCoupons(): Promise<Coupon[]> {
  const data = await apiGet<{ coupons: Array<{
    id: string; title: string; desc: string; expiry: string;
    min_spend: number; discount_text: string; tag: string; used: boolean; expired: boolean;
  }> }>('/api/member/coupons');
  return data.coupons.map(c => ({
    id: c.id, title: c.title, desc: c.desc, expiry: c.expiry,
    minSpend: c.min_spend, discountText: c.discount_text,
    tag: c.tag, used: c.used, expired: c.expired,
  }));
}

export async function getMemberTransactions(): Promise<Transaction[]> {
  const data = await apiGet<{ transactions: Array<{
    id: string; date: string; merchant: string;
    amount: number; points_earned: number; category: string;
  }> }>('/api/member/transactions');
  return data.transactions.map(t => ({
    id: t.id, date: t.date, merchant: t.merchant,
    amount: t.amount, pointsEarned: t.points_earned, category: t.category,
  }));
}

export async function getMemberPointsHistory(): Promise<PointsRecord[]> {
  const data = await apiGet<{ history: Array<{
    id: string; date: string; desc: string; delta: number; type: string;
  }> }>('/api/member/points-history');
  return data.history.map(h => ({
    id: h.id, date: h.date, desc: h.desc, delta: h.delta, type: h.type as 'earn' | 'spend',
  }));
}
