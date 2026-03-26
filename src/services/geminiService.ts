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

interface TrackingContext {
  userId: string | null;
  sessionId: string | null;
}

const TRACKING_STORAGE_KEY = 'cadence-tracking-context';
const TRACKED_PATHS = new Set([
  '/api/chat',
  '/api/chat/structured',
  '/api/dining/recommend',
  '/api/plan/day',
  '/api/plan/edit-step',
  '/api/interactions/event',
  '/api/feedback',
]);

let trackingContextCache: TrackingContext | null = null;

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function loadTrackingContext(): TrackingContext {
  if (trackingContextCache) return trackingContextCache;
  if (!canUseStorage()) {
    trackingContextCache = { userId: null, sessionId: null };
    return trackingContextCache;
  }

  try {
    const raw = window.localStorage.getItem(TRACKING_STORAGE_KEY);
    if (!raw) {
      trackingContextCache = { userId: null, sessionId: null };
      return trackingContextCache;
    }

    const parsed = JSON.parse(raw) as Partial<TrackingContext>;
    trackingContextCache = {
      userId: typeof parsed.userId === 'string' ? parsed.userId : null,
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
    };
    return trackingContextCache;
  } catch {
    trackingContextCache = { userId: null, sessionId: null };
    return trackingContextCache;
  }
}

function saveTrackingContext(next: Partial<TrackingContext>) {
  const current = loadTrackingContext();
  const merged: TrackingContext = {
    userId: typeof next.userId === 'string' ? next.userId : current.userId,
    sessionId: typeof next.sessionId === 'string' ? next.sessionId : current.sessionId,
  };
  trackingContextCache = merged;

  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Ignore storage write failures; requests can still proceed in-memory.
  }
}

function buildTrackedBody(path: string, body: unknown) {
  if (!TRACKED_PATHS.has(path) || !body || Array.isArray(body) || typeof body !== 'object') {
    return body;
  }

  const payload = body as Record<string, unknown>;
  const tracking = loadTrackingContext();
  return {
    ...payload,
    user_id: payload.user_id ?? tracking.userId,
    session_id: payload.session_id ?? tracking.sessionId,
  };
}

function updateTrackingFromResponse(data: unknown) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;
  const payload = data as Record<string, unknown>;
  const userId = typeof payload.user_id === 'string' ? payload.user_id : undefined;
  const sessionId = typeof payload.session_id === 'string' ? payload.session_id : undefined;
  if (userId || sessionId) {
    saveTrackingContext({ userId, sessionId });
  }
}

async function apiFetch<T>(path: string, body: unknown): Promise<T> {
  const payload = buildTrackedBody(path, body);
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? JSON.stringify(err));
  }
  const data = await res.json();
  updateTrackingFromResponse(data);
  return data;
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

export interface VoiceTranscriptionResult {
  text: string;
  language?: string | null;
}

export async function transcribeVoiceInput(
  audioBase64: string,
  format: string
): Promise<VoiceTranscriptionResult> {
  const data = await apiFetch<{
    text: string;
    language?: string | null;
  }>('/api/voice/transcribe', {
    audio: audioBase64,
    format,
  });

  return {
    text: data.text ?? '',
    language: data.language ?? null,
  };
}

// ── 停车助手功能已停用 ─────────────────────────────────────────────────────────
// export async function getParkingStatus(): Promise<ParkingLevel[]> { ... }

export interface DayPlan {
  summary: string;
  steps: string[];
  tip: string;
  suggestions: string[];
  action?: 'dining' | 'events' | 'parking';
  actionLabel?: string;
}

export type PlanFeel = 'light' | 'balanced' | 'immersive';

export interface PlanVariant {
  id: string;
  feel: PlanFeel;
  label: string;
  subtitle: string;
  fitReason: string;
  plan: DayPlan;
}

export interface DayPlanBundle {
  summary: string;
  defaultVariantId: string;
  feelVariants: PlanVariant[];
}

export interface PlanStepEditResult extends DayPlan {
  assistantNote: string;
  editedStepIndex: number;
}

export interface InteractionEventPayload {
  eventType: string;
  targetType?: string;
  targetId?: string;
  payload?: Record<string, unknown>;
}

export async function generateDayPlan(params: {
  scene: string;
  people?: number;
  durationHours: number;
  budget?: number;
  arrivalTime?: string;
  contentPreferences?: string[];
}): Promise<DayPlanBundle> {
  const data = await apiFetch<{
    summary: string;
    default_variant_id?: string;
    feel_variants?: Array<{
      id: string;
      feel: PlanFeel;
      label: string;
      subtitle: string;
      fit_reason?: string;
      plan: {
        summary: string;
        steps: string[];
        tip: string;
        suggestions: string[];
        action?: string;
        action_label?: string;
      };
    }>;
  }>('/api/plan/day', {
    scene: params.scene,
    people: params.people,
    duration_hours: params.durationHours,
    budget: params.budget,
    arrival_time: params.arrivalTime,
    content_preferences: params.contentPreferences ?? [],
  });

  const feelVariants = (data.feel_variants ?? []).map((variant) => ({
    id: variant.id,
    feel: variant.feel,
    label: variant.label,
    subtitle: variant.subtitle,
    fitReason: variant.fit_reason ?? '',
    plan: {
      summary: variant.plan.summary,
      steps: variant.plan.steps ?? [],
      tip: variant.plan.tip ?? '',
      suggestions: variant.plan.suggestions ?? [],
      action: variant.plan.action as DayPlan['action'],
      actionLabel: variant.plan.action_label,
    },
  }));

  return {
    summary: data.summary,
    defaultVariantId: data.default_variant_id ?? feelVariants[0]?.id ?? 'balanced',
    feelVariants,
  };
}

export async function editDayPlanStep(params: {
  scene: string;
  people?: number;
  durationHours: number;
  budget?: number;
  arrivalTime?: string;
  currentPlan: DayPlan;
  selectedStepIndex: number;
  instruction: string;
  updateScope?: 'single' | 'cascade';
}): Promise<PlanStepEditResult> {
  const data = await apiFetch<{
    assistant_note: string;
    edited_step_index: number;
    summary: string;
    steps: string[];
    tip: string;
    suggestions: string[];
    action?: string;
    action_label?: string;
  }>('/api/plan/edit-step', {
    scene: params.scene,
    people: params.people,
    duration_hours: params.durationHours,
    budget: params.budget,
    arrival_time: params.arrivalTime,
    selected_step_index: params.selectedStepIndex,
    instruction: params.instruction,
    update_scope: params.updateScope ?? 'single',
    current_plan: {
      summary: params.currentPlan.summary,
      steps: params.currentPlan.steps,
      tip: params.currentPlan.tip,
      suggestions: params.currentPlan.suggestions,
      action: params.currentPlan.action,
      action_label: params.currentPlan.actionLabel,
    },
  });

  return {
    assistantNote: data.assistant_note,
    editedStepIndex: data.edited_step_index,
    summary: data.summary,
    steps: data.steps ?? [],
    tip: data.tip ?? '',
    suggestions: data.suggestions ?? [],
    action: data.action as DayPlan['action'],
    actionLabel: data.action_label,
  };
}

export async function postInteractionEvent(params: InteractionEventPayload): Promise<void> {
  await apiFetch('/api/interactions/event', {
    event_type: params.eventType,
    target_type: params.targetType,
    target_id: params.targetId,
    payload: params.payload ?? {},
  });
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
