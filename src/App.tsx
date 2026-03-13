/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  Utensils, 
  Shirt, 
  Camera, 
  ChevronLeft, 
  Send, 
  Loader2, 
  Sparkles,
  MapPin,
  Users,
  Wallet,
  User,
  Star,
  Quote,
  Clock,
  X,
  ChevronRight,
  Info,
  Gift,
  CalendarCheck,
  Receipt,
  Coins,
  Crown,
  TrendingUp,
  Timer,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import {
  getDiningRecommendation, getStyleAdvice, getChatResponse,
  getChatResponseStructured,
  getMemberProfile, postCheckin, getMemberCoupons,
  getMemberTransactions, getMemberPointsHistory, editDayPlanStep,
  getTodaySummary, generateDayPlan,
  type Restaurant, type Deal,
  type StructuredChatResponse,
  type MemberProfile, type Coupon, type Transaction, type PointsRecord, type CheckinResult,
  type TodaySummary, type DayPlan,
} from './services/geminiService';
// 停车助手功能已停用：getParkingResponse, getParkingStatus, makeReservation
// type ParkingLevel, type ParkingReservation
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DEFAULT_RESTAURANT_IMAGE = 'https://picsum.photos/seed/cfuturecity-default/1200/800';

function resolveRestaurantImage(src: string) {
  if (!src) return DEFAULT_RESTAURANT_IMAGE;

  // Local paths with spaces/Chinese need URL encoding to avoid 404.
  if (src.startsWith('/')) return encodeURI(src);

  return src;
}

type Mode = 'home' | 'today' | 'plan' | 'chat' | 'dining' | 'style' | 'events' | 'member'; // 'parking' 已停用

type MemberSubPage = 'overview' | 'coupons' | 'transactions' | 'points';

interface ChatMsg {
  role: 'user' | 'ai';
  text: string;
  suggestions?: string[];
  imageUrl?: string;
  action?: StructuredChatResponse['action'];
  actionLabel?: string;
  route?: string[];
  hidden?: boolean;
}

interface ActivePlan {
  title: string;
  subtitle: string;
  scene: string;
  people: number;
  durationHours: number;
  budget?: number;
  arrivalTime?: string;
  contentPreferences: PlanContentPreference[];
  plan: DayPlan;
}

type PlanContentPreference = '活动' | '购物' | '美食';

interface PlanPreferences {
  sceneId: string;
  people: number;
  durationHours: number;
  contentPreferences: PlanContentPreference[];
}

type StyleSeason = '春夏' | '秋冬';
type StyleOccasion = '通勤' | '约会' | '休闲' | '运动';
type StyleCategory = '上衣' | '外套' | '裙装' | '裤装' | '鞋包配饰';

interface StyleSpot {
  id: string;
  title: string;
  floor: string;
  subtitle: string;
  tags: string[];
  seasons: StyleSeason[];
  occasions: StyleOccasion[];
  categories: StyleCategory[];
}

interface MallEvent {
  id: string;
  title: string;
  time: string;
  location: string;
  startDate: Date;
  endDate: Date;
  image: string;
  details: string[];
  gift?: string;
  notes?: string;
  tags: string[];
  scenes: string[];        // 适合哪些场景，用于 chip 筛选
  aiInsight: string;
  aiTips: string[];
  aiQuestions: string[];
  ticketInfo?: string;
  hotTag?: string;         // 紧迫感标签，如「限量告急」「早鸟票开抢」
  sceneInsights?: Record<string, string>; // 场景专属 AI 一句话
}

function getEventStatus(event: MallEvent): 'future' | 'ongoing' | 'ended' {
  const now = new Date();
  if (now < event.startDate) return 'future';
  if (now > event.endDate) return 'ended';
  return 'ongoing';
}

function getEventCountdown(event: MallEvent): string {
  const now = new Date();
  const status = getEventStatus(event);
  if (status === 'ended') return '已结束';
  const target = status === 'future' ? event.startDate : event.endDate;
  const diff = target.getTime() - now.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (status === 'future') {
    return days > 0 ? `${days} 天后开幕` : `${hours} 小时后开始`;
  }
  return days > 0 ? `还剩 ${days} 天` : hours > 0 ? `还剩 ${hours} 小时` : '即将结束';
}

const MALL_EVENTS: MallEvent[] = [
  {
    id: '4',
    title: '超级巨星·惊喜降临 — 亚洲顶流女星官方快闪',
    time: '2026年3月2日 - 2026年3月20日',
    location: '中洲湾 C Future City L1层中庭',
    startDate: new Date('2026-03-02T00:00:00'),
    endDate: new Date('2026-03-20T23:59:59'),
    image: '/亚洲女星活动.png',
    details: [
      '亚洲顶流女星官方快闪「大陆首场」登陆中洲湾',
      '沉浸式还原专属格调美学空间',
      '官方独家周边亮相，限量发售',
      'ta 是谁？现场揭晓！不见不散',
    ],
    tags: ['限时快闪', '限量周边', '明星活动'],
    scenes: ['两个人约会', '朋友聚会', '自己逛逛'],
    ticketInfo: '免费入场',
    hotTag: '限量周边告急',
    aiInsight: '现在正在进行中，工作日下午人少，限量周边还有机会买到，最近去最合适。',
    aiTips: ['限量周边通常活动中后期就会逐渐售罄，想买的话建议这几天就去', '活动在 L1 中庭，从主入口进来直走即可看到', '活动持续到 3 月 20 日，周末会明显更挤，工作日体验更好'],
    aiQuestions: ['ta 是哪位明星？', '周边怎么购买？', '顺道推荐什么餐厅？'],
    sceneInsights: {
      '两个人约会': '一起来打卡快闪，逛完正好去 B1 探鱼或绿茶，时间刚好控制在 2 小时内。',
      '朋友聚会': '适合 2-4 人组队，氛围感强，朋友们一起拍照出片率很高。',
      '自己逛逛': '工作日一个人来完全不尴尬，人少随便拍，周边也更容易抢到。',
    },
  },
  {
    id: '3',
    title: 'teamLab Future Park: 艺术与科技展',
    time: '2026年4月1日 - 2026年5月31日',
    location: '中洲湾 C Future City L1层',
    startDate: new Date('2026-04-01T00:00:00'),
    endDate: new Date('2026-05-31T23:59:59'),
    image: '/teamlab艺术展.png',
    details: [
      '全天开放',
      '沉浸式光影体验',
      '互动艺术装置',
      '适合亲子及艺术爱好者',
    ],
    tags: ['亲子出游', '情侣约会', '艺术爱好者'],
    scenes: ['带小孩来玩', '两个人约会', '朋友聚会', '自己逛逛'],
    ticketInfo: '需购票入场',
    hotTag: '早鸟票预售中',
    aiInsight: '还有 26 天开幕，现在关注官方购票渠道可以抢早鸟票，节假日票通常提前一周售罄。',
    aiTips: ['工作日下午 2-4 点人流量约为周末的 1/3，体验最佳', '带小朋友来光影互动区会是最大亮点', '建议提前在官方小程序购票，现场排队等候时间长'],
    aiQuestions: ['怎么买票？', '适合几岁的小孩？', '帮我规划当天行程'],
    sceneInsights: {
      '带小孩来玩': '光影互动区对 3-10 岁小朋友最有吸引力，建议工作日下午来避开人群，玩完可去 L3 客家围用餐。',
      '两个人约会': '光影展天然出片，适合傍晚入场配合自然光，展后可去露台花园续摊。',
      '朋友聚会': '适合 3-6 人小团体，互动装置大家一起玩更有趣，记得提前团票更便宜。',
      '自己逛逛': '一个人来反而能沉浸体验，工作日早场 10-12 点最清静，可以慢慢拍照。',
    },
  },
  {
    id: '1',
    title: '"客味团圆·手作暖心" 元宵节汤圆 DIY',
    time: '2026年3月1日 15:00-16:00',
    location: '中洲湾 C Future City L3层客家围店铺',
    startDate: new Date('2026-03-01T15:00:00'),
    endDate: new Date('2026-03-01T16:00:00'),
    image: '/客味团圆活动.png',
    details: [
      '14:50-15:00 入场签到',
      '15:00-15:10 老师讲解',
      '15:10-15:50 汤圆DIY制作环节',
      '15:50-16:00 汤圆分享合影留念',
    ],
    gift: '活动结束额外获赠元宵节灯笼一个及客家围品牌代金券',
    notes: '请准时入场，迟到视为自动放弃活动名额。',
    tags: ['家庭亲子', '传统节日', '免费参与'],
    scenes: ['带小孩来玩', '朋友聚会'],
    ticketInfo: '会员免费，凭积分报名',
    aiInsight: '这个活动已结束，同类节日手作活动会持续推出，下次来得及早报名。',
    aiTips: ['关注中洲湾公众号，新活动第一时间通知', '类似亲子手工活动每个节日前后都会推出', '活动结束后可以在 L3 客家围用代金券继续用餐'],
    aiQuestions: ['之后还有类似活动吗？', '客家围怎么预订？'],
  },
  {
    id: '2',
    title: '马年新春灯笼DIY沙龙',
    time: '2026年2月8日 15:00-16:30',
    location: '中洲湾 C Future City L3层VIP中心',
    startDate: new Date('2026-02-08T15:00:00'),
    endDate: new Date('2026-02-08T16:30:00'),
    image: '/马年灯笼活动.jpg',
    details: [
      '14:50-15:00 入场签到',
      '15:00-15:20 老师讲解',
      '15:20-16:20 制作环节',
      '16:20-16:30 合影留念',
    ],
    gift: '额外获得马年新春DIY萌马帽一份',
    notes: '请准时入场，迟到视为自动放弃活动名额。',
    tags: ['节日限定', '手工体验', '会员专属'],
    scenes: ['带小孩来玩', '朋友聚会', '两个人约会'],
    aiInsight: '这个活动已结束，同系列节日手作活动会持续推出，敬请期待。',
    aiTips: ['关注中洲湾公众号，新活动第一时间通知', '类似亲子手工活动每个节日前后都会推出'],
    aiQuestions: ['之后还有类似活动吗？', '我想了解其他活动'],
  },
];

const STYLE_SPOTS: StyleSpot[] = [
  {
    id: 'l1-flagship',
    title: 'L1 国际品牌旗舰店区',
    floor: 'L1',
    subtitle: '适合先看主打单品和完整成套搭配，逛起来更高效。',
    tags: ['质感单品', '成套搭配', '经典不过时'],
    seasons: ['春夏', '秋冬'],
    occasions: ['通勤', '约会'],
    categories: ['上衣', '外套', '裙装', '裤装', '鞋包配饰'],
  },
  {
    id: 'l2-designer',
    title: 'L2 设计师品牌区',
    floor: 'L2',
    subtitle: '更适合找有风格感的穿搭，出片和辨识度会更高。',
    tags: ['设计感', '剪裁好', '更有记忆点'],
    seasons: ['春夏', '秋冬'],
    occasions: ['约会', '休闲', '通勤'],
    categories: ['上衣', '外套', '裙装', '裤装'],
  },
  {
    id: 'l2-lifestyle',
    title: 'L2 生活方式精品店',
    floor: 'L2',
    subtitle: '适合补鞋包、配饰和日常感单品，搭配完成度更高。',
    tags: ['配饰友好', '鞋包优先', '轻松好搭'],
    seasons: ['春夏', '秋冬'],
    occasions: ['通勤', '休闲', '约会'],
    categories: ['鞋包配饰', '上衣'],
  },
  {
    id: 'b1-trend',
    title: 'B1 潮流零售区',
    floor: 'B1',
    subtitle: '更偏轻松和街头一点，适合先找基础款和休闲单品。',
    tags: ['休闲感', '轻运动', '年轻一点'],
    seasons: ['春夏', '秋冬'],
    occasions: ['休闲', '运动'],
    categories: ['上衣', '裤装', '鞋包配饰', '外套'],
  },
];

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [splashPointer, setSplashPointer] = useState({ x: 0, y: 0 });
  const [homeActionsOpen, setHomeActionsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('home');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | Restaurant[] | null>(null);

  // Dining State
  const [budget, setBudget] = useState('200');
  const [people, setPeople] = useState(2);
  const [taste, setTaste] = useState('');
  const [mealType, setMealType] = useState(''); // '正餐' | '轻食/咖啡' | ''
  const [scene, setScene] = useState('');
  const [envPrefs, setEnvPrefs] = useState<string[]>([]);

  const toggleEnvPref = (pref: string) => {
    setEnvPrefs(prev =>
      prev.includes(pref) ? prev.filter(p => p !== pref) : [...prev, pref]
    );
  };

  // Style State
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [styleSeason, setStyleSeason] = useState<StyleSeason>('春夏');
  const [styleOccasion, setStyleOccasion] = useState<StyleOccasion>('通勤');
  const [styleCategory, setStyleCategory] = useState<StyleCategory>('上衣');
  const [styleCameraOpen, setStyleCameraOpen] = useState(false);
  const [styleAnalysisResult, setStyleAnalysisResult] = useState<string | null>(null);
  const [styleSpotResults, setStyleSpotResults] = useState<StyleSpot[]>([]);
  const [styleRecommendationApplied, setStyleRecommendationApplied] = useState(false);

  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
  const [fullChatHistory, setFullChatHistory] = useState<ChatMsg[]>([]);
  const [chatStreaming, setChatStreaming] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const [todaySummary, setTodaySummary] = useState<TodaySummary | null>(null);
  const [todayLoading, setTodayLoading] = useState(true);
  const [quickPlanLoadingId, setQuickPlanLoadingId] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<ActivePlan | null>(null);
  const [planEditOpen, setPlanEditOpen] = useState(false);
  const [selectedPlanStepIndex, setSelectedPlanStepIndex] = useState<number | null>(null);
  const [planEditInput, setPlanEditInput] = useState('');
  const [planEditLoading, setPlanEditLoading] = useState(false);
  const [planEditNote, setPlanEditNote] = useState<string | null>(null);
  const [planEditScope, setPlanEditScope] = useState<'single' | 'cascade'>('single');
  const [recentlyEditedPlanStepIndex, setRecentlyEditedPlanStepIndex] = useState<number | null>(null);
  const [planPreferences, setPlanPreferences] = useState<PlanPreferences>({
    sceneId: 'solo',
    people: 1,
    durationHours: 2,
    contentPreferences: ['活动', '购物', '美食'],
  });
  const [planGenerating, setPlanGenerating] = useState(false);

  // Events State
  const [selectedEvent, setSelectedEvent] = useState<MallEvent | null>(null);
  const [eventSceneFilter, setEventSceneFilter] = useState(''); // 场景筛选 chip

  // Member State
  const [memberProfile, setMemberProfile] = useState<MemberProfile | null>(null);
  const [memberCoupons, setMemberCoupons] = useState<Coupon[]>([]);
  const [memberTransactions, setMemberTransactions] = useState<Transaction[]>([]);
  const [memberPointsHistory, setMemberPointsHistory] = useState<PointsRecord[]>([]);
  const [memberSubPage, setMemberSubPage] = useState<MemberSubPage>('overview');
  const [memberLoading, setMemberLoading] = useState(false);
  const [checkinResult, setCheckinResult] = useState<CheckinResult | null>(null);
  const [checkinAnimating, setCheckinAnimating] = useState(false);

  // 停车助手功能已停用
  // const [parkingLevels, setParkingLevels] = useState<ParkingLevel[]>([]);
  // const [parkingHistory, setParkingHistory] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  // const [parkingInput, setParkingInput] = useState('');
  // const [parkingLoading, setParkingLoading] = useState(false);
  // const [parkingReservation, setParkingReservation] = useState<ParkingReservation | null>(null);
  // const [displayedText, setDisplayedText] = useState('');
  // const parkingChatRef = useRef<HTMLDivElement>(null);
  // const proactiveTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [centerEventIndex, setCenterEventIndex] = useState(0);
  const eventsScrollRef = useRef<HTMLDivElement>(null);
  const restaurantsScrollRef = useRef<HTMLDivElement>(null);

  const getCarouselEvents = () => [
    ...MALL_EVENTS.filter((event) => getEventStatus(event) === 'ongoing'),
    ...MALL_EVENTS.filter((event) => getEventStatus(event) === 'future'),
    ...MALL_EVENTS.filter((event) => getEventStatus(event) === 'ended'),
  ];

  const scrollToEventIndex = (index: number) => {
    const el = eventsScrollRef.current;
    if (el) {
      const cardSlotWidth = el.offsetWidth * 0.78 + 16;
      el.scrollTo({ left: index * cardSlotWidth, behavior: 'smooth' });
    }
  };

  const handleEventScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const cardSlotWidth = el.offsetWidth * 0.78 + 16;
    const idx = Math.round(el.scrollLeft / cardSlotWidth);
    const totalLen = getCarouselEvents().length;
    setCenterEventIndex(Math.max(0, Math.min(idx, totalLen - 1)));
  };

  const handleCarouselCardClick = (index: number) => {
    if (index === centerEventIndex) {
      const ev = getCarouselEvents()[index];
      setSelectedEvent(ev);
    } else {
      scrollToEventIndex(index);
    }
  };

  const scrollEvents = (_direction: 'left' | 'right') => {
    // unused; scroll is handled by handleCarouselCardClick
  };

  // 场景筛选：跳到最匹配的活动
  const handleSceneFilter = (scene: string) => {
    const next = eventSceneFilter === scene ? '' : scene;
    setEventSceneFilter(next);
    if (!next) return;
    const carouselEvents = getCarouselEvents();
    const bestIdx = (() => {
      let i = carouselEvents.findIndex(e => e.scenes.includes(next) && getEventStatus(e) === 'ongoing');
      if (i >= 0) return i;
      i = carouselEvents.findIndex(e => e.scenes.includes(next) && getEventStatus(e) === 'future');
      if (i >= 0) return i;
      i = carouselEvents.findIndex(e => e.scenes.includes(next) && getEventStatus(e) === 'ended');
      if (i >= 0) return i;
      return carouselEvents.findIndex(e => e.scenes.includes(next));
    })();
    if (bestIdx >= 0) {
      setCenterEventIndex(bestIdx);
      scrollToEventIndex(bestIdx);
    }
  };

  // 动态时机 banner 文案
  const getSmartBanner = () => {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    const isWeekend = day === 0 || day === 6;
    const ongoing = MALL_EVENTS.filter(e => getEventStatus(e) === 'ongoing');
    if (ongoing.length > 0) {
      const e = ongoing[0];
      const daysLeft = Math.floor((e.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 2) return { icon: '⚡', text: `快闪结束倒计时 ${daysLeft + 1} 天，今天是最后机会`, color: 'bg-rose-50 border-rose-100 text-rose-700' };
      if (!isWeekend && hour >= 13 && hour <= 18) return { icon: '✨', text: '工作日下午，现在是人流最低的黄金时段', color: 'bg-emerald-50 border-emerald-100 text-emerald-700' };
      if (isWeekend && hour >= 11 && hour <= 14) return { icon: '👥', text: '周末人流高峰，建议 15:00 后再来更宽松', color: 'bg-amber-50 border-amber-100 text-amber-700' };
      if (hour >= 19) return { icon: '🌙', text: '商场 22:00 关闭，今晚还有 2-3 小时可以体验', color: 'bg-indigo-50 border-indigo-100 text-indigo-700' };
      return { icon: '🎯', text: '进行中的活动今天就可以去，越早去体验越好', color: 'bg-emerald-50 border-emerald-100 text-emerald-700' };
    }
    const future = MALL_EVENTS.filter(e => getEventStatus(e) === 'future');
    if (future.length > 0) {
      const daysUntil = Math.floor((future[0].startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return { icon: '🔔', text: `下一个活动 ${daysUntil} 天后开幕，可以提前购票或关注`, color: 'bg-indigo-50 border-indigo-100 text-indigo-700' };
    }
    return null;
  };

  const quickPlanPresets = [
    {
      id: 'planner',
      emoji: '⚡',
      label: '一键成行',
      desc: '先选人数、时长和状态，再生成路线',
      scene: '自己逛逛',
      durationHours: 2,
      budget: 200,
    },
    {
      id: 'date',
      emoji: '💞',
      label: '约会下午',
      desc: '活动 + 咖啡 + 晚饭',
      scene: '两个人约会',
      durationHours: 3,
      budget: 400,
    },
    {
      id: 'family',
      emoji: '🧒',
      label: '带娃半天',
      desc: '轻松一点，不要太赶',
      scene: '带小孩来玩',
      durationHours: 3,
      budget: 300,
    },
    {
      id: 'friends',
      emoji: '🎉',
      label: '朋友聚会',
      desc: '先逛再吃，比较热闹',
      scene: '朋友聚会',
      durationHours: 4,
      budget: 350,
    },
  ] as const;

  const planSceneOptions = [
    { id: 'solo', emoji: '🧍', title: '自己来', subtitle: '轻松逛', scene: '自己逛逛', defaultPeople: 1 },
    { id: 'date', emoji: '💞', title: '和对象', subtitle: '有氛围', scene: '两个人约会', defaultPeople: 2 },
    { id: 'friends', emoji: '🎉', title: '和朋友', subtitle: '热闹点', scene: '朋友聚会', defaultPeople: 3 },
    { id: 'kids', emoji: '🧒', title: '带孩子', subtitle: '别太累', scene: '带小孩来玩', defaultPeople: 3 },
    { id: 'family', emoji: '🏡', title: '和家人', subtitle: '舒服逛', scene: '和家人', defaultPeople: 3 },
  ] as const;

  const planPeopleOptions = [1, 2, 3, 4, 5] as const;
  const planDurationOptions = [2, 3, 4] as const;
  const planContentOptions: PlanContentPreference[] = ['活动', '购物', '美食'];

  const togglePlanContentPreference = (item: PlanContentPreference) => {
    setPlanPreferences((prev) => {
      const exists = prev.contentPreferences.includes(item);
      if (exists && prev.contentPreferences.length === 1) return prev;
      return {
        ...prev,
        contentPreferences: exists
          ? prev.contentPreferences.filter((value) => value !== item)
          : [...prev.contentPreferences, item],
      };
    });
  };

  const getTodayToneClasses = (tone: TodaySummary['statuses'][number]['tone']) => {
    if (tone === 'green') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    if (tone === 'amber') return 'bg-amber-50 text-amber-700 border-amber-100';
    if (tone === 'indigo') return 'bg-indigo-50 text-indigo-700 border-indigo-100';
    return 'bg-neutral-50 text-neutral-700 border-neutral-200';
  };

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      setStream(s);
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("无法访问摄像头，请确保已授予权限。");
    }
  };

  // Sync stream to video element
  React.useEffect(() => {
    if (stream && videoRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(e => console.error("Video play error:", e));
    }
  }, [stream, mode]);

  useEffect(() => {
    let mounted = true;
    getTodaySummary()
      .then((data) => {
        if (mounted) setTodaySummary(data);
      })
      .catch((err) => {
        console.error(err);
        if (mounted) {
          setTodaySummary({
            headline: '今天适合轻松来逛',
            subheadline: '如果你时间不多，建议优先看活动或先吃饭，不要把路线排太满。',
            statuses: [
              { label: '今日活动', value: '可以先看 L1 中庭', tone: 'green' },
              { label: '餐饮状态', value: '错峰更舒服', tone: 'amber' },
              { label: '商场人流', value: '整体可接受', tone: 'indigo' },
            ],
            recommendedAction: '先看活动，再顺路去 B1 或 L3 吃饭，会更轻松。',
            rightNow: '先看一个重点内容，再顺路吃饭会最舒服。',
            avoidNow: '不要把路线排太满，也别一上来就冲最热门的店。',
            bestFor: ['2 小时轻量逛', '下班后顺路来', '约会碰面'],
            highlights: [
              {
                title: '今天先看什么',
                desc: '先从活动重点开始最不容易踩坑。',
                action: 'events',
                actionLabel: '查看活动',
              },
              {
                title: '今天怎么吃更顺',
                desc: '想少排队，就把用餐安排在活动之后。',
                action: 'dining',
                actionLabel: '去看美食推荐',
              },
              {
                title: '直接帮我安排',
                desc: '如果你只想要一条今天最值的路线，我可以直接排给你。',
                action: 'chat',
                actionLabel: '让 Cadence 安排',
                query: '帮我安排今天在中洲湾的路线',
              },
            ],
          });
        }
      })
      .finally(() => {
        if (mounted) setTodayLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!showSplash) return;

    const handleMove = (event: MouseEvent) => {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const x = (event.clientX - centerX) / centerX;
      const y = (event.clientY - centerY) / centerY;

      setSplashPointer({
        x: Math.max(-1, Math.min(1, x)),
        y: Math.max(-1, Math.min(1, y)),
      });
    };

    const resetPointer = () => setSplashPointer({ x: 0, y: 0 });

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseleave', resetPointer);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseleave', resetPointer);
    };
  }, [showSplash]);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const context = canvasRef.current.getContext('2d');
    if (!context) return;

    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    context.drawImage(videoRef.current, 0, 0);
    
    const imageData = canvasRef.current.toDataURL('image/jpeg');
    stopCamera();
    
    setLoading(true);
    try {
      const advice = await getStyleAdvice(imageData);
      setStyleAnalysisResult(advice || "Sorry, I couldn't analyze the image.");
      setStyleCameraOpen(false);
    } catch (err) {
      console.error(err);
      setStyleAnalysisResult("Error analyzing style. Please try again.");
      setStyleCameraOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const handleStyleRecommend = () => {
    const ranked = STYLE_SPOTS
      .map((spot) => {
        let score = 0;
        if (spot.seasons.includes(styleSeason)) score += 2;
        if (spot.occasions.includes(styleOccasion)) score += 2;
        if (spot.categories.includes(styleCategory)) score += 2;
        return { spot, score };
      })
      .sort((a, b) => b.score - a.score);

    setStyleSpotResults(ranked.slice(0, 3).map((item) => item.spot));
    setStyleRecommendationApplied(true);
    setStyleAnalysisResult(null);
    setStyleCameraOpen(false);
    stopCamera();
  };

  const handleOpenStyleCamera = async () => {
    setStyleAnalysisResult(null);
    setStyleCameraOpen(true);
    await startCamera();
  };

  const handleCloseStyleCamera = () => {
    stopCamera();
    setStyleCameraOpen(false);
  };

  useEffect(() => {
    setStyleRecommendationApplied(false);
  }, [styleSeason, styleOccasion, styleCategory]);

  useEffect(() => {
    if (recentlyEditedPlanStepIndex === null) return;
    const timer = window.setTimeout(() => setRecentlyEditedPlanStepIndex(null), 2600);
    return () => window.clearTimeout(timer);
  }, [recentlyEditedPlanStepIndex]);

  const handleDiningSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const fullPrefs = [
        mealType && `类型：${mealType}`,
        scene && `场景：${scene}`,
        envPrefs.length > 0 && `环境需求：${envPrefs.join('、')}`,
        taste && `口味偏好：${taste}`,
      ].filter(Boolean).join('；');
      const recommendation = await getDiningRecommendation(budget, people, fullPrefs);
      setResult(recommendation);
    } catch (err) {
      console.error(err);
      setResult("Error getting recommendations.");
    } finally {
      setLoading(false);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = chatInput.trim();
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    try {
      const response = await getChatResponse(userMsg);
      setChatHistory(prev => [...prev, { role: 'ai', text: response || "I'm sorry, I couldn't process that." }]);
    } catch (err) {
      console.error(err);
      setChatHistory(prev => [...prev, { role: 'ai', text: "Error connecting to AI. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  // 停车助手功能已停用 ── streamText, proactive timers, handleParkingSubmit

  const sendChatMessage = async (msg: string, options?: { resetHistory?: boolean }) => {
    if (!msg.trim()) return;
    const userMsg: ChatMsg = { role: 'user', text: msg.trim() };
    const nextHistory = options?.resetHistory ? [userMsg] : [...fullChatHistory, userMsg];
    setFullChatHistory(nextHistory);
    setChatInput('');
    setLoading(true);
    setChatStreaming('');

    try {
      const res = await getChatResponseStructured(
        msg.trim(),
        nextHistory.map(m => ({ role: m.role, text: m.text }))
      );
      // Stream the text character by character
      const aiMsg: ChatMsg = { role: 'ai', ...res };
      setFullChatHistory([...nextHistory, aiMsg]);
      let i = 0;
      const interval = setInterval(() => {
        setChatStreaming(res.text.slice(0, i + 1));
        i++;
        if (i >= res.text.length) {
          clearInterval(interval);
          setChatStreaming('');
        }
      }, 20);
    } catch (err) {
      console.error(err);
      try {
        const fallbackText = await getChatResponse(msg.trim());
        setFullChatHistory([
          ...nextHistory,
          {
            role: 'ai',
            text: fallbackText || '我这会儿有点忙，但你可以换个问法再试试。',
            suggestions: ['今天有什么活动', '推荐一家餐厅', '帮我安排今天'],
          },
        ]);
      } catch (fallbackErr) {
        console.error(fallbackErr);
        setFullChatHistory([
          ...nextHistory,
          {
            role: 'ai',
            text: '抱歉，Cadence 现在有点忙。你可以先看 Today 状态，或者试试「一键成行」。',
            suggestions: ['今天值不值得来', '我有 2 小时', '推荐一家餐厅'],
          },
        ]);
      }
    } finally {
      setLoading(false);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  const openPlanResult = async (params: {
    title: string;
    subtitle: string;
    scene: string;
    people: number;
    durationHours: number;
    budget?: number;
    contentPreferences: PlanContentPreference[];
  }) => {
    const plan = await generateDayPlan({
      scene: params.scene,
      people: params.people,
      durationHours: params.durationHours,
      budget: params.budget,
      contentPreferences: params.contentPreferences,
    });

    setPlanEditOpen(false);
    setSelectedPlanStepIndex(null);
    setPlanEditInput('');
    setPlanEditLoading(false);
    setPlanEditNote(null);
    setPlanEditScope('single');
    setRecentlyEditedPlanStepIndex(null);
    setActivePlan({
      title: params.title,
      subtitle: params.subtitle,
      scene: params.scene,
      people: params.people,
      durationHours: params.durationHours,
      budget: params.budget,
      contentPreferences: params.contentPreferences,
      plan,
    });
    setMode('plan');
  };

  const openPlanBuilder = (overrides?: Partial<PlanPreferences>) => {
    setPlanEditOpen(false);
    setSelectedPlanStepIndex(null);
    setPlanEditInput('');
    setPlanEditLoading(false);
    setPlanEditNote(null);
    setPlanEditScope('single');
    setRecentlyEditedPlanStepIndex(null);
    setActivePlan(null);
    if (overrides) {
      setPlanPreferences((prev) => ({ ...prev, ...overrides }));
    }
    setMode('plan');
  };

  const handleQuickPlan = async (preset: typeof quickPlanPresets[number]) => {
    if (preset.id === 'planner') {
      openPlanBuilder();
      return;
    }

    setQuickPlanLoadingId(preset.id);
    try {
      await openPlanResult({
        title: preset.label,
        subtitle: preset.desc,
        scene: preset.scene,
        people: planPreferences.people,
        durationHours: preset.durationHours,
        budget: preset.budget,
        contentPreferences: planPreferences.contentPreferences,
      });
    } catch (err) {
      console.error(err);
      setPlanEditOpen(false);
      setSelectedPlanStepIndex(null);
      setPlanEditInput('');
      setPlanEditLoading(false);
      setPlanEditNote(null);
      setPlanEditScope('single');
      setRecentlyEditedPlanStepIndex(null);
      setActivePlan({
        title: preset.label,
        subtitle: preset.desc,
        scene: preset.scene,
        people: planPreferences.people,
        durationHours: preset.durationHours,
        budget: preset.budget,
        contentPreferences: planPreferences.contentPreferences,
        plan: {
          summary: '我先给你一个轻量建议：先去 L1 看重点活动，再顺路去 B1 或 L3 吃饭，这样今天最不容易踩坑。',
          steps: ['先去 L1 中庭看重点活动', '再去 B1 或 L3 安排用餐', '最后留一点时间轻松逛逛'],
          tip: '时间不多的时候，不要把路线排得太满。',
          suggestions: ['换一个场景试试', '帮我推荐餐厅', '今天有什么活动'],
          action: 'dining',
          actionLabel: '去看美食推荐',
        },
      });
      setMode('plan');
    } finally {
      setQuickPlanLoadingId(null);
    }
  };

  const handleTodayHighlight = async (highlight: TodaySummary['highlights'][number]) => {
    if (highlight.action === 'chat') {
      openPlanBuilder({ sceneId: 'solo', people: 1, durationHours: 2 });
      return;
    }

    if (highlight.action === 'dining' || highlight.action === 'events') {
      handleModeChange(highlight.action);
    }
  };

  const openFreshChat = async (msg: string) => {
    setMode('chat');
    await sendChatMessage(msg, { resetHistory: true });
  };

  const handlePlanStepEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePlan || selectedPlanStepIndex === null || !planEditInput.trim()) return;

    setPlanEditLoading(true);
    try {
      const updated = await editDayPlanStep({
        scene: activePlan.scene,
        people: activePlan.people,
        durationHours: activePlan.durationHours,
        budget: activePlan.budget,
        arrivalTime: activePlan.arrivalTime,
        currentPlan: activePlan.plan,
        selectedStepIndex: selectedPlanStepIndex,
        instruction: planEditInput.trim(),
        updateScope: planEditScope,
      });

      setActivePlan({
        ...activePlan,
        plan: {
          summary: updated.summary,
          steps: updated.steps,
          tip: updated.tip,
          suggestions: updated.suggestions,
          action: updated.action,
          actionLabel: updated.actionLabel,
        },
      });
      setSelectedPlanStepIndex(updated.editedStepIndex);
      setRecentlyEditedPlanStepIndex(updated.editedStepIndex);
      setPlanEditNote(updated.assistantNote);
      setPlanEditInput('');
    } catch (err) {
      console.error(err);
      setPlanEditNote('这一步暂时没改成功，你可以换个说法再试一次。');
    } finally {
      setPlanEditLoading(false);
    }
  };

  const openPlanChatFollowup = async () => {
    if (!activePlan) return;
    const routeText = activePlan.plan.steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
    const hiddenContext: ChatMsg = {
      role: 'user',
      hidden: true,
      text: [
        `这是用户当前的一键成行路线，请你后续都基于这条路线继续对话。`,
        `标题：${activePlan.title}`,
        `副标题：${activePlan.subtitle}`,
        `场景：${activePlan.scene}`,
        `人数：${activePlan.people}`,
        `时长：${activePlan.durationHours} 小时`,
        `预算：${activePlan.budget ?? '未指定'}`,
        `路线偏好：${activePlan.contentPreferences.join('、')}`,
        `路线摘要：${activePlan.plan.summary}`,
        '路线节点：',
        routeText,
        `执行提醒：${activePlan.plan.tip}`,
        '当用户后续提问时，默认认为他是在基于这条路线继续追问、解释或调整。',
      ].join('\n'),
    };
    const introMessage: ChatMsg = {
      role: 'ai',
      text: `这条路线我已经收到了。你可以直接基于它问我，比如想了解更多店铺信息或者看看哪里更值得停留。`,
      route: activePlan.plan.steps.map((step, index) => `${index + 1}. ${step}`),
      suggestions: activePlan.plan.suggestions.length > 0
        ? activePlan.plan.suggestions
        : ['这条路线哪里最值得改', '第二步能换一下吗', '顺路吃什么更合适'],
    };

    setPlanEditOpen(false);
    setSelectedPlanStepIndex(null);
    setPlanEditInput('');
    setPlanEditNote(null);
    setPlanEditScope('single');
    setChatInput('');
    setChatStreaming('');
    setLoading(false);
    setFullChatHistory([hiddenContext, introMessage]);
    setMode('chat');
    setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const openEventChatQuestion = async (event: MallEvent, question: string) => {
    const hiddenContext: ChatMsg = {
      role: 'user',
      hidden: true,
      text: [
        '这是用户刚刚在活动页点击进入聊天时的上下文，请你优先基于这场活动回答。',
        `活动标题：${event.title}`,
        `活动时间：${event.time}`,
        `活动地点：${event.location}`,
        `活动状态：${getEventStatus(event) === 'ongoing' ? '进行中' : getEventStatus(event) === 'future' ? '即将开始' : '已结束'}`,
        `活动亮点：${event.tags.join('、')}`,
        `活动简介：${event.aiInsight}`,
        `活动详情：${event.details.join('；')}`,
        '如果用户继续追问，默认认为他是在围绕这场活动继续问。',
      ].join('\n'),
    };
    const userMsg: ChatMsg = { role: 'user', text: question };
    const nextHistory = [hiddenContext, userMsg];

    setSelectedEvent(null);
    setMode('chat');
    setFullChatHistory(nextHistory);
    setChatInput('');
    setLoading(true);
    setChatStreaming('');

    try {
      const res = await getChatResponseStructured(
        question,
        nextHistory.map((m) => ({ role: m.role, text: m.text }))
      );
      const aiMsg: ChatMsg = { role: 'ai', ...res };
      setFullChatHistory([...nextHistory, aiMsg]);
      let i = 0;
      const interval = setInterval(() => {
        setChatStreaming(res.text.slice(0, i + 1));
        i++;
        if (i >= res.text.length) {
          clearInterval(interval);
          setChatStreaming('');
        }
      }, 20);
    } catch (err) {
      console.error(err);
      try {
        const fallbackText = await getChatResponse(question);
        setFullChatHistory([
          ...nextHistory,
          {
            role: 'ai',
            text: fallbackText || '我先按这场活动来回答你，你也可以继续追问更具体一点。',
            suggestions: event.aiQuestions.slice(0, 3),
          },
        ]);
      } catch (fallbackErr) {
        console.error(fallbackErr);
        setFullChatHistory([
          ...nextHistory,
          {
            role: 'ai',
            text: '我先按这场活动的上下文接住你了，你可以换个更具体的问题再试试。',
            suggestions: event.aiQuestions.slice(0, 3),
          },
        ]);
      }
    } finally {
      setLoading(false);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  const handleGenerateCustomPlan = async () => {
    const selectedScene = planSceneOptions.find((item) => item.id === planPreferences.sceneId) ?? planSceneOptions[0];
    const budget = planPreferences.durationHours * 90 + Math.max(planPreferences.people - 1, 0) * 40;

    setPlanGenerating(true);
    try {
      await openPlanResult({
        title: '一键成行',
        subtitle: `${selectedScene.title} · ${planPreferences.people >= 5 ? '5+ 人' : `${planPreferences.people} 人`} · ${planPreferences.durationHours} 小时`,
        scene: selectedScene.scene,
        people: planPreferences.people,
        durationHours: planPreferences.durationHours,
        budget,
        contentPreferences: planPreferences.contentPreferences,
      });
    } catch (err) {
      console.error(err);
      setPlanEditOpen(false);
      setSelectedPlanStepIndex(null);
      setPlanEditInput('');
      setPlanEditLoading(false);
      setPlanEditNote(null);
      setPlanEditScope('single');
      setRecentlyEditedPlanStepIndex(null);
      setActivePlan({
        title: '一键成行',
        subtitle: `${selectedScene.title} · ${planPreferences.people >= 5 ? '5+ 人' : `${planPreferences.people} 人`} · ${planPreferences.durationHours} 小时`,
        scene: selectedScene.scene,
        people: planPreferences.people,
        durationHours: planPreferences.durationHours,
        budget,
        contentPreferences: planPreferences.contentPreferences,
        plan: {
          summary: '我先给你一条稳妥路线：先看一个重点活动，再顺路吃饭，最后留一点时间轻松逛。',
          steps: ['先去 L1 看今天最值得去的活动', '按你的人数和节奏安排顺路用餐', '最后留一点时间逛 B1 或 B2 收尾'],
          tip: '路线好不好，关键不在点位多，而在于节奏顺不顺。',
          suggestions: ['我想再轻松一点', '顺路吃什么更合适', '帮我改成约会路线'],
          action: 'dining',
          actionLabel: '去看美食推荐',
        },
      });
      setMode('plan');
    } finally {
      setPlanGenerating(false);
    }
  };

  const handleHomeChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    await openFreshChat(msg);
  };

  const handleModeChange = (newMode: Mode) => {
    if (newMode !== 'style') {
      stopCamera();
      setStyleCameraOpen(false);
    }
    setMode(newMode);
    setResult(null);
    if (newMode === 'style') {
      setStyleAnalysisResult(null);
    }
    if (newMode === 'member' && !memberProfile) {
      setMemberLoading(true);
      getMemberProfile().then(p => setMemberProfile(p)).finally(() => setMemberLoading(false));
    }

    // 停车助手功能已停用
    // if (newMode === 'parking' && parkingHistory.length === 0) { ... }
  };

  const handleCheckin = async () => {
    if (checkinAnimating) return;
    setCheckinAnimating(true);
    try {
      const result = await postCheckin();
      setCheckinResult(result);
      if (result.success && memberProfile) {
        setMemberProfile({ ...memberProfile, points: result.newTotal, checkedInToday: true, checkinStreak: result.streak });
      }
    } finally {
      setTimeout(() => setCheckinAnimating(false), 1500);
    }
  };

  const handleLoadMemberTab = async (tab: MemberSubPage) => {
    setMemberSubPage(tab);
    if (tab === 'coupons' && memberCoupons.length === 0) {
      getMemberCoupons().then(setMemberCoupons);
    }
    if (tab === 'transactions' && memberTransactions.length === 0) {
      getMemberTransactions().then(setMemberTransactions);
    }
    if (tab === 'points' && memberPointsHistory.length === 0) {
      getMemberPointsHistory().then(setMemberPointsHistory);
    }
  };

  const lastUserPrompt = fullChatHistory.filter(m => m.role === 'user').slice(-1)[0]?.text ?? '';
  const homePrimaryPreset = quickPlanPresets[0];
  const smartBanner = getSmartBanner();
  const homeStatusItems = todaySummary?.statuses.slice(0, 3) ?? [];
  const homeChatSuggestions = [
    todaySummary?.highlights[0]?.query ?? '今天有什么活动？',
    '现在适合先吃饭还是先逛？',
  ];
  const selectedPlanScene = planSceneOptions.find((item) => item.id === planPreferences.sceneId) ?? planSceneOptions[0];
  const eyeOffsetX = splashPointer.x * 4;
  const eyeOffsetY = splashPointer.y * 3;

  if (showSplash) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#F7F5F1] text-[#1A1A1A]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(167,148,223,0.18),transparent_24%),radial-gradient(circle_at_16%_18%,rgba(220,211,245,0.34),transparent_28%),radial-gradient(circle_at_82%_72%,rgba(231,220,255,0.32),transparent_24%),radial-gradient(circle_at_76%_18%,rgba(209,231,255,0.18),transparent_18%),radial-gradient(circle_at_18%_82%,rgba(255,232,208,0.18),transparent_20%),linear-gradient(180deg,#FCFBF8_0%,#F7F4F7_48%,#F4EFF9_100%)]" />
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute left-[12%] top-[18%] h-24 w-24 rounded-full bg-[#D9CFF2]/70 blur-3xl sm:h-32 sm:w-32"
          animate={{ y: [0, -16, 0], x: [0, 8, 0], scale: [1, 1.06, 1] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute right-[10%] top-[28%] h-28 w-28 rounded-full bg-[#D6CCE9]/66 blur-3xl sm:h-40 sm:w-40"
          animate={{ y: [0, 14, 0], x: [0, -10, 0], scale: [1, 1.08, 1] }}
          transition={{ duration: 8.5, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[14%] right-[18%] h-20 w-20 rounded-full bg-[#F4E2E7]/70 blur-3xl sm:h-28 sm:w-28"
          animate={{ y: [0, -12, 0], x: [0, 10, 0] }}
          transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
        />

        <div className="relative flex min-h-screen flex-col justify-between px-6 py-8 sm:px-10 sm:py-10">
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="max-w-[18rem] self-end text-right sm:max-w-md"
          >
            <div className="inline-flex rounded-full border border-white/60 bg-white/45 px-3 py-1.5 backdrop-blur-md">
              <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-[#9A8EB6] sm:text-xs">
                Cadence AI
              </p>
            </div>
            <h1 className="mt-4 text-[2.25rem] font-semibold leading-[1.02] tracking-[-0.05em] text-[#534C69] sm:text-6xl sm:font-bold">
              轻点一下
              <br />
              开始今天的商场旅程
            </h1>
            <p className="mt-4 text-[13px] leading-6 text-[#9086AA] sm:text-base">
              点击左下角的形象，进入首页。
            </p>
          </motion.div>

          <motion.button
            type="button"
            onClick={() => setShowSplash(false)}
            initial={{ opacity: 0, x: -30, y: 24 }}
            animate={{ opacity: 1, x: 0, y: [0, -10, 0] }}
            transition={{
              opacity: { duration: 0.55, delay: 0.15 },
              x: { duration: 0.55, delay: 0.15 },
              y: { duration: 4.8, repeat: Infinity, ease: 'easeInOut', delay: 0.35 },
            }}
            whileHover={{ x: 10, y: -12, scale: 1.03, rotate: -2 }}
            whileTap={{ scale: 0.98 }}
            className="group relative -ml-6 mt-10 flex w-fit items-end bg-transparent text-left outline-none sm:-ml-10"
            aria-label="进入 Cadence 首页"
          >
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-3 left-4 h-10 w-[72%] rounded-full bg-[#8D74FF]/22 blur-2xl sm:left-8 sm:h-12"
              animate={{ scaleX: [1, 1.08, 1], opacity: [0.22, 0.34, 0.22] }}
              transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
            />

            <motion.div
              className="relative z-10 flex w-[22rem] max-w-[82vw] flex-col items-center sm:w-[28rem]"
              animate={{ rotate: [0, -1.6, 0, 1.2, 0] }}
              transition={{ duration: 5.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <motion.div
                className="mb-4 rounded-full border border-white/70 bg-white/78 px-4 py-2 text-sm font-medium text-[#5B4FA8] shadow-[0_18px_45px_rgba(126,106,255,0.18)] backdrop-blur-md sm:text-base"
                animate={{ y: [0, -6, 0], scale: [1, 1.03, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              >
                WELCOME
              </motion.div>

              <div className="relative">
                <motion.div
                  className="relative h-[9.75rem] w-[18rem] overflow-hidden rounded-t-[999px] border border-white/60 border-b-0 bg-[linear-gradient(145deg,#ead6fa_0%,#d7b3f2_38%,#c393e8_68%,#b883df_100%)] shadow-[0_28px_70px_rgba(184,131,223,0.26)] sm:h-[11.25rem] sm:w-[21rem]"
                  animate={{ y: [0, -8, 0], scale: [1, 1.01, 1] }}
                  transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <div className="absolute inset-x-0 top-0 h-[52%] rounded-t-[999px] bg-[linear-gradient(180deg,rgba(255,255,255,0.28),rgba(255,255,255,0))]" />
                  <div className="absolute left-[16%] top-[14%] h-[34%] w-[26%] rotate-[-18deg] rounded-full bg-white/24 blur-md" />
                  <div className="absolute right-[14%] top-[24%] h-[12%] w-[8%] rounded-full bg-white/32 blur-[2px]" />

                  <motion.div
                    className="absolute left-[24%] top-[43%] h-5 w-10 rounded-t-full border-[5px] border-b-0 border-[#3f245f] sm:h-6 sm:w-12 sm:border-[6px]"
                    animate={{ x: eyeOffsetX, y: eyeOffsetY }}
                    transition={{ type: 'spring', stiffness: 220, damping: 22, mass: 0.35 }}
                  />

                  <motion.div
                    className="absolute right-[24%] top-[43%] h-5 w-10 rounded-t-full border-[5px] border-b-0 border-[#3f245f] sm:h-6 sm:w-12 sm:border-[6px]"
                    animate={{ x: eyeOffsetX, y: eyeOffsetY }}
                    transition={{ type: 'spring', stiffness: 220, damping: 22, mass: 0.35 }}
                  />

                  <div className="absolute left-[18%] top-[68%] h-5 w-8 rounded-full bg-[#e7cff8]/40 blur-[1px]" />
                  <div className="absolute right-[18%] top-[68%] h-5 w-8 rounded-full bg-[#e7cff8]/40 blur-[1px]" />
                  <div className="absolute left-1/2 top-[65%] h-5 w-11 -translate-x-1/2 rounded-b-[999px] bg-[#2d1f5e]" />
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 200 24"
                    preserveAspectRatio="none"
                    className="absolute inset-x-0 bottom-[-1px] h-5 w-full"
                  >
                    <path
                      d="M0 8C14 2 28 2 42 8C56 14 70 14 84 8C98 2 112 2 126 8C140 14 154 14 168 8C180 3 190 3 200 8V24H0Z"
                      fill="#b883df"
                    />
                  </svg>
                </motion.div>

                <motion.div
                  className="absolute -right-12 -top-6 flex h-16 w-16 items-center justify-center rounded-full bg-[linear-gradient(145deg,#FAF0FF,#E6CCFA)] text-lg font-semibold text-[#734a9f] shadow-[0_18px_35px_rgba(184,131,223,0.22)] sm:-right-14 sm:-top-8 sm:h-[4.5rem] sm:w-[4.5rem] sm:text-xl"
                  animate={{ rotate: [0, 12, 0, -8, 0], y: [0, -4, 0] }}
                  transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  Hi
                </motion.div>
              </div>
            </motion.div>

            <motion.div
              className="absolute bottom-8 left-[60%] rounded-full border border-white/70 bg-white/72 px-4 py-2 text-xs font-medium text-[#5A507E] shadow-[0_18px_45px_rgba(164,138,255,0.16)] backdrop-blur-md transition-all group-hover:bg-white/88 group-hover:text-[#433B63] sm:bottom-10 sm:px-5 sm:py-2.5 sm:text-sm"
              animate={{ y: [0, -6, 0], scale: [1, 1.03, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              点击进入
            </motion.div>
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F5F1] text-[#1A1A1A] font-sans selection:bg-indigo-100 overflow-x-hidden">
      {/* Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-12%] left-[-10%] w-[48%] h-[44%] bg-violet-200/35 blur-[150px] rounded-full" />
        <div className="absolute top-[18%] right-[-12%] w-[42%] h-[36%] bg-sky-200/26 blur-[150px] rounded-full" />
        <div className="absolute bottom-[-14%] left-[12%] w-[38%] h-[30%] bg-fuchsia-100/26 blur-[145px] rounded-full" />
        <div className="absolute bottom-[-16%] right-[-10%] w-[42%] h-[34%] bg-amber-100/18 blur-[150px] rounded-full" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/35 backdrop-blur-2xl border-b border-white/30 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4 cursor-pointer" onClick={() => handleModeChange('home')}>
          <div className="flex items-center gap-2.5 px-1 py-1.5">
            <img 
              src="/CFutureCity-logo.png" 
              alt="C Future City Logo" 
              className="h-8 w-8 object-contain flex-shrink-0 opacity-95"
            />
            <span className="text-sm font-bold tracking-tight text-[#1A1A1A] leading-none">C Future City</span>
          </div>
        </div>
        {mode !== 'home' && (
          <button 
            onClick={() => handleModeChange('home')}
            className="p-2.5 hover:bg-black/5 rounded-full transition-colors border border-transparent hover:border-black/5"
          >
            <ChevronLeft size={22} className="text-[#1A1A1A]" />
          </button>
        )}
      </header>

      <main className={cn(
        "max-w-2xl mx-auto px-4 py-5 sm:p-6 relative z-10",
        mode === 'home' ? "h-[calc(100dvh-60px)] flex flex-col overflow-hidden" : "",
        mode === 'home' || mode === 'dining' ? "" : "min-h-screen pb-8"
      )}>
        <AnimatePresence mode="wait">
          {mode === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="relative flex-1 flex items-center justify-center py-6 sm:py-10"
            >
              <div className="w-full max-w-3xl space-y-8 sm:space-y-10 -translate-y-8 sm:-translate-y-[3.75rem]">
                <div className="relative space-y-5 text-center -translate-y-6 sm:-translate-y-6">
                  <motion.p
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.02 }}
                    className="text-[11px] sm:text-[12px] font-semibold uppercase tracking-[0.34em] text-[#6A5BB4]/55"
                  >
                    A Better Way to Mall
                  </motion.p>
                  <div className="pointer-events-none absolute left-1/2 top-[52%] h-24 w-[14rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(132,110,229,0.24),rgba(132,110,229,0.08)_40%,rgba(255,255,255,0)_72%)] blur-2xl sm:h-32 sm:w-[22rem]" />
                  <motion.h2
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.08 }}
                    className="relative text-[3.15rem] sm:text-[5.2rem] font-semibold tracking-[-0.02em] text-[#1A1A1A] leading-[1.02]"
                  >
                    <span className="inline-block px-3 sm:px-5 font-serif bg-gradient-to-r from-[#45397E] via-[#6656C9] to-[#A288E3] bg-clip-text text-transparent drop-shadow-[0_14px_34px_rgba(102,86,201,0.14)]">
                      Cadence
                    </span>
                  </motion.h2>
                </div>

                <div className="rounded-[2rem] sm:rounded-[2.4rem] border border-white/70 bg-white/44 backdrop-blur-[26px] shadow-[0_24px_70px_rgba(17,24,39,0.05)] px-4 py-5 sm:px-6 sm:py-7">
                  <div className="space-y-5 sm:space-y-6">
                    {lastUserPrompt && (
                      <div className="flex justify-center">
                        <button
                          onClick={() => handleModeChange('chat')}
                          className="inline-flex w-full max-w-md items-center justify-center gap-2.5 rounded-[1.1rem] border border-black/[0.05] bg-white/76 px-4 py-3 text-[13px] font-semibold text-[#1A1A1A]/58 shadow-[0_10px_22px_rgba(17,24,39,0.04)] transition-all active:scale-95"
                        >
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-50 text-indigo-500 flex-shrink-0">
                            <Sparkles size={13} />
                          </span>
                          <span className="truncate max-w-[15rem] sm:max-w-[22rem]">继续上次对话 · {lastUserPrompt}</span>
                        </button>
                      </div>
                    )}

                    <form onSubmit={handleHomeChatSubmit} className="relative group">
                      <div className="absolute -inset-1.5 rounded-[2.15rem] bg-gradient-to-r from-violet-200/14 via-white/10 to-indigo-200/14 blur-lg opacity-60 transition duration-500 group-focus-within:opacity-100" />
                      <div className="relative overflow-hidden rounded-[1.7rem] sm:rounded-[2rem] border border-white/95 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,255,255,0.90))] backdrop-blur-[24px] shadow-[0_18px_48px_rgba(17,24,39,0.06)]">
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" />
                        <div className="px-5 pt-4 sm:px-6 sm:pt-5">
                          <p className="text-[11px] sm:text-[12px] font-semibold tracking-[0.16em] uppercase text-[#6D63A8]/55">
                            Ask Cadence
                          </p>
                        </div>
                        <input 
                          type="text"
                          placeholder="今天想怎么逛？"
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          className="w-full bg-transparent rounded-[1.7rem] sm:rounded-[2rem] pt-2 pb-4 sm:pt-2.5 sm:pb-5 pl-5 sm:pl-6 pr-16 sm:pr-20 focus:outline-none font-medium text-[#1A1A1A] text-[16px] sm:text-[20px] placeholder:text-black/22 text-left"
                        />
                        <button 
                          disabled={loading || !chatInput.trim()}
                          className="absolute right-3 bottom-3 sm:right-3.5 sm:bottom-3.5 w-11 h-11 sm:w-12 sm:h-12 bg-[#1A1A1A] text-white rounded-[1rem] sm:rounded-[1.15rem] flex items-center justify-center disabled:opacity-20 transition-all shadow-[0_12px_24px_rgba(0,0,0,0.16)] active:scale-95"
                        >
                          {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                        </button>
                      </div>
                    </form>

                    <div className="flex flex-col items-center gap-3">
                      <button
                        onClick={() => setHomeActionsOpen((prev) => !prev)}
                        className="inline-flex w-full max-w-md items-center justify-between rounded-[1.1rem] border border-black/[0.05] bg-white/74 px-4 py-3 text-[13px] font-semibold text-[#1A1A1A]/60 shadow-[0_10px_22px_rgba(17,24,39,0.04)] transition-all active:scale-95"
                      >
                        <span className="flex items-center gap-2.5">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-50 text-violet-500">
                            <Sparkles size={13} />
                          </span>
                          功能
                        </span>
                        <ChevronRight
                          size={15}
                          className={cn(
                            "transition-transform duration-200",
                            homeActionsOpen && "rotate-90"
                          )}
                        />
                      </button>

                      <AnimatePresence initial={false}>
                        {homeActionsOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            className="flex w-full max-w-md flex-col gap-2.5"
                          >
                            {[
                              { label: '一键成行', icon: Zap, onClick: () => handleModeChange('plan') },
                              { label: '今天看什么', icon: CalendarCheck, onClick: () => handleModeChange('events') },
                              { label: '今日吃什么', icon: Utensils, onClick: () => handleModeChange('dining') },
                              { label: '穿搭建议', icon: Shirt, onClick: () => handleModeChange('style') },
                              { label: '会员中心', icon: Crown, onClick: () => handleModeChange('member') },
                            ].map((item) => {
                              const Icon = item.icon;
                              return (
                                <button
                                  key={item.label}
                                  onClick={() => {
                                    setHomeActionsOpen(false);
                                    item.onClick();
                                  }}
                                  className="inline-flex w-full items-center justify-between rounded-[1.1rem] border border-black/[0.05] bg-white/74 px-4 py-3 text-[13px] font-semibold text-[#1A1A1A]/58 shadow-[0_10px_22px_rgba(17,24,39,0.04)] transition-all active:scale-95"
                                >
                                  <span className="flex items-center gap-2.5">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/[0.03] text-[#1A1A1A]/58">
                                      <Icon size={13} />
                                    </span>
                                    {item.label}
                                  </span>
                                  <ChevronRight size={14} className="text-[#1A1A1A]/22" />
                                </button>
                              );
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                  </div>
                </div>

              </div>

              <div className="absolute inset-x-0 bottom-3 flex justify-center">
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12 }}
                  className="text-center text-[11px] sm:text-[12px] uppercase tracking-[0.28em] font-semibold text-[#1A1A1A]/22"
                >
                  Personal Mall AI
                </motion.p>
              </div>
            </motion.div>
          )}

          {mode === 'today' && (
            <motion.div
              key="today"
              initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              {todaySummary && (
                <>
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#1A1A1A]/25">Today</p>
                    <h3 className="text-2xl font-bold tracking-tight text-[#1A1A1A]">{todaySummary.headline}</h3>
                    <p className="text-sm text-[#1A1A1A]/38 leading-relaxed">{todaySummary.subheadline}</p>
                  </div>

                  <div className="bg-white rounded-3xl border border-black/8 p-4 shadow-sm space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                        <TrendingUp size={16} className="text-indigo-500" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-[#1A1A1A]">今天的建议</p>
                        <p className="text-[12px] text-[#1A1A1A]/55 leading-relaxed">{todaySummary.recommendedAction}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {todaySummary.statuses.map((item) => (
                        <div
                          key={item.label}
                          className={cn("rounded-2xl border px-3 py-3", getTodayToneClasses(item.tone))}
                        >
                          <p className="text-[9px] font-bold uppercase tracking-[0.08em] opacity-55">{item.label}</p>
                          <p className="text-[11px] font-semibold leading-snug mt-1">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div className="bg-white rounded-2xl border border-black/8 p-4 shadow-sm">
                      <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-[#1A1A1A]/25 mb-2">此刻更适合</p>
                      <p className="text-[13px] font-semibold text-[#1A1A1A] leading-relaxed">{todaySummary.rightNow}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-black/8 p-4 shadow-sm">
                      <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-[#1A1A1A]/25 mb-2">现在先别急着做</p>
                      <p className="text-[13px] font-semibold text-[#1A1A1A] leading-relaxed text-[#1A1A1A]/70">{todaySummary.avoidNow}</p>
                    </div>
                  </div>

                  <div className="bg-white rounded-3xl border border-black/8 p-4 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#1A1A1A]/25">今天适合谁来</p>
                      <Users size={14} className="text-black/20" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {todaySummary.bestFor.map((item) => (
                        <span
                          key={item}
                          className="text-[11px] font-medium px-3 py-1.5 rounded-full bg-black/[0.03] text-[#1A1A1A]/55"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#1A1A1A]/25">从这里继续</p>
                    <div className="space-y-2">
                      {todaySummary.highlights.map((item) => (
                        <button
                          key={item.title}
                          onClick={() => handleTodayHighlight(item)}
                          className="w-full flex items-center gap-3 p-4 rounded-2xl bg-white border border-black/8 shadow-sm text-left active:scale-[0.98] transition-all"
                        >
                          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                      <Sparkles size={14} className="text-indigo-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-bold text-[#1A1A1A]">{item.title}</p>
                            <p className="text-[11px] text-[#1A1A1A]/40 mt-0.5 leading-relaxed">{item.desc}</p>
                    </div>
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#1A1A1A]/40 flex-shrink-0">
                            <span>{item.actionLabel}</span>
                            <ChevronRight size={13} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {mode === 'plan' && !activePlan && (
            <motion.div
              key="plan-builder"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#1A1A1A]/25">Quick Plan</p>
                <h3 className="text-2xl font-bold tracking-tight text-[#1A1A1A]">一键成行</h3>
                <p className="text-sm text-[#1A1A1A]/38 leading-relaxed">先选你的状态，我再给你一条更顺的路线。</p>
              </div>

              <div className="bg-white rounded-[2rem] border border-black/8 p-4 shadow-sm space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-[#1A1A1A]/25">Quick Plan</p>
                    <p className="text-[18px] font-bold text-[#1A1A1A] leading-tight">按和谁去、几个人、待多久，直接给路线</p>
                  </div>
                  <p className="text-[11px] font-medium text-[#1A1A1A]/32 whitespace-nowrap">{planPreferences.people >= 5 ? '5+ 人' : `${planPreferences.people} 人`}</p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {planSceneOptions.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => setPlanPreferences((prev) => ({
                        ...prev,
                        sceneId: option.id,
                        people: option.defaultPeople,
                      }))}
                      className={cn(
                        "rounded-[1.25rem] border p-3 text-left transition-all active:scale-[0.98]",
                        planPreferences.sceneId === option.id
                          ? "bg-[linear-gradient(135deg,#E0D2F0_0%,#CCB8E4_100%)] text-[#503D6A] border-[#BFA8DB] shadow-[0_14px_32px_rgba(122,98,158,0.20)]"
                          : "bg-[#F5F4F7] text-[#1A1A1A] border-black/6"
                      )}
                    >
                      <div className="text-lg leading-none">{option.emoji}</div>
                      <p className="mt-3 text-[13px] font-bold">{option.title}</p>
                      <p className={cn(
                        "text-[11px] mt-1",
                        planPreferences.sceneId === option.id ? "text-[#503D6A]/62" : "text-[#1A1A1A]/40"
                      )}>
                        {option.subtitle}
                      </p>
                    </button>
                  ))}
                </div>

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Users size={14} className="text-[#1A1A1A]/38" />
                    {planPeopleOptions.map((count) => (
                      <button
                        key={count}
                        onClick={() => setPlanPreferences((prev) => ({ ...prev, people: count }))}
                        className={cn(
                          "px-3.5 py-2 rounded-full text-[12px] font-semibold border transition-all active:scale-95",
                          planPreferences.people === count
                            ? "bg-[#ECE0F8] text-[#664D8C] border-[#DAC6EE] shadow-sm"
                            : "bg-white text-[#1A1A1A]/65 border-black/10"
                        )}
                      >
                        {count === 5 ? '5+' : `${count} 人`}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Clock size={14} className="text-[#1A1A1A]/38" />
                    {planDurationOptions.map((duration) => (
                      <button
                        key={duration}
                        onClick={() => setPlanPreferences((prev) => ({ ...prev, durationHours: duration }))}
                        className={cn(
                          "px-3.5 py-2 rounded-full text-[12px] font-semibold border transition-all active:scale-95",
                          planPreferences.durationHours === duration
                            ? "bg-[#F1E9E4] text-[#81685E] border-[#E6D9D1] shadow-sm"
                            : "bg-white text-[#1A1A1A]/65 border-black/10"
                        )}
                      >
                        {duration}h
                      </button>
                    ))}
                    <span className="ml-auto text-[11px] font-medium text-[#1A1A1A]/35">约 ¥ {planPreferences.durationHours * 90 + Math.max(planPreferences.people - 1, 0) * 40}+</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-[#1A1A1A]/38" />
                    <p className="text-[11px] font-medium text-[#1A1A1A]/42">这条路线更想包含什么？</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {planContentOptions.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => togglePlanContentPreference(item)}
                        className={cn(
                          "px-3.5 py-2 rounded-full text-[12px] font-semibold border transition-all active:scale-95",
                          planPreferences.contentPreferences.includes(item)
                            ? "bg-[#EEE4F5] text-[#6B5A86] border-[#DDCFEA] shadow-sm"
                            : "bg-white text-[#1A1A1A]/65 border-black/10"
                        )}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleGenerateCustomPlan}
                  disabled={planGenerating}
                  className="w-full flex items-center justify-between px-4 py-4 rounded-[1.6rem] bg-[linear-gradient(135deg,#8F73C6_0%,#755CA9_100%)] border border-[#A88ED6] text-white text-left transition-all shadow-[0_18px_38px_rgba(117,92,169,0.28)] active:scale-[0.98]"
                >
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold">生成适合你的路线</p>
                    <p className="text-[12px] text-white/68 mt-1">{selectedPlanScene.title} · {planPreferences.people >= 5 ? '5+ 人' : `${planPreferences.people} 人`} · {planPreferences.durationHours} 小时</p>
                  </div>
                  {planGenerating ? (
                    <Loader2 size={16} className="animate-spin text-white/75 flex-shrink-0" />
                  ) : (
                    <ChevronRight size={16} className="text-white/72 flex-shrink-0" />
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {mode === 'plan' && activePlan && (
                <motion.div
              key="plan-result"
              initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#1A1A1A]/25">Plan</p>
                <h3 className="text-2xl font-bold tracking-tight text-[#1A1A1A]">{activePlan.title}</h3>
                <p className="text-sm text-[#1A1A1A]/38 leading-relaxed">{activePlan.subtitle}</p>
              </div>

              <div className="bg-white rounded-3xl border border-black/8 p-4 shadow-sm space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#ECE0F8] flex items-center justify-center flex-shrink-0">
                    <Sparkles size={16} className="text-[#755CA9]" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-[#1A1A1A]">今天的路线建议</p>
                    <p className="text-[12px] text-[#1A1A1A]/55 leading-relaxed">{activePlan.plan.summary}</p>
                  </div>
                </div>

                <div className="rounded-2xl bg-black/[0.025] border border-black/5 overflow-hidden">
                  <div className="px-4 pt-3 pb-1 border-b border-black/5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] font-bold text-[#755CA9] uppercase tracking-wider">路线时间线</p>
                      {planEditOpen && (
                        <p className="text-[10px] font-medium text-[#755CA9]/55">点选其中一步后再输入修改指令</p>
                      )}
                    </div>
                  </div>
                  <div className="px-4 py-2 space-y-0">
                    {activePlan.plan.steps.map((step, i) => (
                      <button
                        key={i}
                        type="button"
                        disabled={!planEditOpen}
                        onClick={() => {
                          setSelectedPlanStepIndex(i);
                          setPlanEditNote(null);
                        }}
                        className={cn(
                          "flex w-full items-start gap-3 py-2 border-b border-black/5 last:border-0 text-left transition-all",
                          planEditOpen && "rounded-xl px-2",
                          planEditOpen && selectedPlanStepIndex === i && "bg-[#F6F0FB]",
                          recentlyEditedPlanStepIndex === i && "bg-[#F3ECFB]",
                          planEditOpen ? "active:scale-[0.99]" : "cursor-default"
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 rounded-full bg-[#ECE0F8] flex items-center justify-center flex-shrink-0 mt-0.5 transition-all",
                          planEditOpen && selectedPlanStepIndex === i && "bg-[#DCCAF2]",
                          recentlyEditedPlanStepIndex === i && "bg-[#D8C3F3]"
                        )}>
                          <span className="text-[10px] font-black text-[#755CA9]">{i + 1}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] text-[#1A1A1A]/70 font-medium leading-snug">{step}</p>
                          {planEditOpen && selectedPlanStepIndex === i && (
                            <p className="mt-1 text-[10px] font-medium text-[#755CA9]/60">当前准备修改这一步</p>
                          )}
                          {!planEditOpen && recentlyEditedPlanStepIndex === i && (
                            <p className="mt-1 text-[10px] font-medium text-[#755CA9]/60">刚刚已更新这一步</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-start gap-2 px-3.5 py-3 rounded-2xl bg-amber-50 border border-amber-100">
                  <Quote size={13} className="text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-[12px] text-amber-900/65 leading-relaxed">{activePlan.plan.tip}</p>
                </div>

                <AnimatePresence initial={false}>
                  {planEditOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="rounded-2xl border border-[#E5DAEF] bg-[#FCFAFF] p-4 space-y-3"
                    >
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#755CA9]/58">Continue With AI</p>
                        {recentlyEditedPlanStepIndex !== null && (
                          <div className="inline-flex rounded-full bg-[#F1E8FB] px-2.5 py-1 text-[10px] font-semibold text-[#755CA9]">
                            已更新第 {recentlyEditedPlanStepIndex + 1} 步
                          </div>
                        )}
                        <p className="text-[13px] font-semibold text-[#1A1A1A]">
                          {selectedPlanStepIndex === null
                            ? '先点选上面想改的一步，再输入你的修改要求'
                            : `正在调整第 ${selectedPlanStepIndex + 1} 步`}
                        </p>
                        {selectedPlanStepIndex !== null && (
                          <p className="text-[12px] leading-relaxed text-[#1A1A1A]/48">
                            {activePlan.plan.steps[selectedPlanStepIndex]}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {[
                          { id: 'single', label: '只改这一步' },
                          { id: 'cascade', label: '联动后续路线' },
                        ].map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setPlanEditScope(item.id as 'single' | 'cascade')}
                            className={cn(
                              "text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-all active:scale-95",
                              planEditScope === item.id
                                ? "bg-[#EEE4F8] border-[#DDCFF0] text-[#6A5890]"
                                : "bg-white border-[#E5DAEF] text-[#6C617F]"
                            )}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>

                      <form onSubmit={handlePlanStepEditSubmit} className="space-y-3">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={planEditInput}
                            onChange={(e) => setPlanEditInput(e.target.value)}
                            placeholder={selectedPlanStepIndex === null ? '先点选一个路线节点' : '比如：把这一步换成更便宜的餐厅'}
                            disabled={selectedPlanStepIndex === null || planEditLoading}
                            className="flex-1 rounded-2xl border border-[#E5DAEF] bg-white px-4 py-3 text-sm text-[#1A1A1A] placeholder:text-[#1A1A1A]/28 focus:outline-none focus:ring-2 focus:ring-[#8F73C6]/18"
                          />
                          <button
                            type="submit"
                            disabled={selectedPlanStepIndex === null || !planEditInput.trim() || planEditLoading}
                            className="px-4 py-3 rounded-2xl bg-[linear-gradient(135deg,#8F73C6_0%,#755CA9_100%)] border border-[#A88ED6] text-white text-sm font-bold disabled:opacity-45 active:scale-[0.98] transition-all"
                          >
                            {planEditLoading ? <Loader2 size={16} className="animate-spin" /> : '调整这一步'}
                          </button>
                        </div>

                        {planEditNote && (
                          <div className="rounded-2xl bg-[#F4ECFB] px-3.5 py-3 text-[12px] leading-relaxed text-[#5E5179]">
                            {planEditNote}
                          </div>
                        )}
                      </form>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => {
                      setPlanEditOpen((prev) => {
                        const next = !prev;
                        if (!next) {
                          setSelectedPlanStepIndex(null);
                          setPlanEditInput('');
                          setPlanEditNote(null);
                          setPlanEditScope('single');
                        }
                        return next;
                      });
                    }}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-[linear-gradient(135deg,#8F73C6_0%,#755CA9_100%)] border border-[#A88ED6] text-white text-sm font-bold shadow-[0_14px_30px_rgba(117,92,169,0.22)] active:scale-[0.98] transition-all"
                >
                  <Sparkles size={14} />
                  {planEditOpen ? '收起微调' : '微调路线'}
                  </button>
                    <button
                  onClick={() => { void openPlanChatFollowup(); }}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-white border border-black/8 text-[#1A1A1A] text-sm font-bold shadow-sm active:scale-[0.98] transition-all"
                >
                  <Send size={14} />
                  继续问 AI
                    </button>
              </div>

              <button
                onClick={() => openPlanBuilder()}
                className="w-full px-4 py-3 rounded-2xl bg-white border border-black/8 text-[#1A1A1A]/60 text-sm font-semibold shadow-sm active:scale-[0.98] transition-all"
              >
                重新选条件
              </button>

              {activePlan.plan.suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {activePlan.plan.suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={async () => {
                        await openFreshChat(suggestion);
                      }}
                      className="text-[11px] font-medium px-3 py-1.5 rounded-full bg-white border border-black/8 text-[#1A1A1A]/55 shadow-sm active:scale-95 transition-all"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {mode === 'chat' && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed inset-x-0 flex flex-col bg-[#FAF9F6]"
              style={{ top: '60px', bottom: '0' }}
            >
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2 space-y-4 min-h-0">
                {fullChatHistory.filter((msg) => !msg.hidden).map((msg, i, visibleHistory) => {
                  const isLastAi = msg.role === 'ai' && i === visibleHistory.length - 1;
                  const displayText = isLastAi && chatStreaming ? chatStreaming : msg.text;
                  return (
                    <div key={i} className={cn("flex flex-col", msg.role === 'user' ? 'items-end' : 'items-start')}>
                      {/* Bubble */}
                      <div className={cn(
                        "max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                        msg.role === 'user'
                          ? "bg-[#1A1A1A] text-white rounded-tr-sm"
                          : "bg-white border border-black/8 text-[#1A1A1A] rounded-tl-sm shadow-sm"
                      )}>
                        {msg.role === 'ai' && (
                          <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Cadence AI</p>
                        )}
                        <p>{displayText}{isLastAi && chatStreaming && <span className="inline-block w-0.5 h-3.5 bg-indigo-400 ml-0.5 animate-pulse align-middle" />}</p>
                      </div>

                      {/* Route timeline */}
                      {msg.role === 'ai' && msg.route && msg.route.length > 0 && !chatStreaming && (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-2 max-w-[90%] bg-white border border-black/8 rounded-2xl overflow-hidden shadow-sm"
                        >
                          <div className="px-4 pt-3 pb-1 border-b border-black/5">
                            <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">行程时间线</p>
                          </div>
                          <div className="px-4 py-2 space-y-0">
                            {msg.route.map((step, si) => (
                              <div key={si} className="flex items-start gap-3 py-2 border-b border-black/5 last:border-0">
                                <div className="w-5 h-5 rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                                  <span className="text-[10px] font-black text-indigo-500">{si + 1}</span>
                                </div>
                                <p className="text-[12px] text-[#1A1A1A]/70 font-medium leading-snug">{step.replace(/^(?:[①②③④⑤⑥]|\d+\.)\s*/, '')}</p>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}

                      {/* Image card */}
                      {msg.role === 'ai' && msg.imageUrl && !chatStreaming && (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-2 max-w-[82%] rounded-2xl overflow-hidden border border-black/8 shadow-sm"
                        >
                          <img src={msg.imageUrl} alt="" className="w-full h-36 object-cover" />
                        </motion.div>
                      )}

                      {/* Action button */}
                      {msg.role === 'ai' && msg.action && !chatStreaming && (
                        <motion.button
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          onClick={() => handleModeChange(msg.action as Mode)}
                          className="mt-2 flex items-center gap-1.5 px-3.5 py-2 bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-sm active:scale-95 transition-all"
                        >
                          <Sparkles size={12} />
                          {msg.actionLabel ?? msg.action}
                        </motion.button>
                      )}

                      {/* Suggestion chips */}
                      {msg.role === 'ai' && msg.suggestions && msg.suggestions.length > 0 && !chatStreaming && (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex flex-wrap gap-1.5 mt-2 max-w-[92%]"
                        >
                          {msg.suggestions.map((s, si) => (
                            <button
                              key={si}
                              onClick={() => sendChatMessage(s)}
                              className="text-[11px] font-medium px-3 py-1.5 rounded-full bg-white border border-black/10 text-[#1A1A1A]/60 hover:border-indigo-300 hover:text-indigo-600 transition-all shadow-sm active:scale-95"
                            >
                              {s}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </div>
                  );
                })}

                {/* Typing indicator */}
                {loading && (
                  <div className="flex items-start gap-2">
                    <div className="bg-white border border-black/8 rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1.5 shadow-sm">
                      {[0, 1, 2].map(i => (
                        <span key={i} className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Input */}
              <div className="flex-shrink-0 px-4 pb-5 pt-2">
                <form
                  onSubmit={(e) => { e.preventDefault(); sendChatMessage(chatInput); }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    placeholder="继续问..."
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    className="flex-1 bg-white border border-black/8 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all shadow-sm placeholder:text-black/25"
                  />
                  <button
                    type="submit"
                    disabled={loading || !chatInput.trim()}
                    className="w-11 h-11 bg-[#1A1A1A] text-white rounded-2xl flex items-center justify-center disabled:opacity-30 active:scale-95 transition-all shadow-md flex-shrink-0"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </form>
              </div>
            </motion.div>
          )}

          {mode === 'dining' && (
            <motion.div
              key="dining"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="fixed inset-x-0 bg-[#FAF9F6]"
              style={{ top: '60px', bottom: '0' }}
            >
              {!result ? (
                <form
                  onSubmit={handleDiningSubmit}
                  className="h-full flex flex-col gap-2.5 px-4 py-3 overflow-y-auto"
                >
                  {/* 标题 */}
                  <div className="pb-0.5">
                    <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#1A1A1A]/25 mb-0.5">美食推荐</p>
                    <h2 className="text-xl font-bold text-[#1A1A1A] leading-tight">今天想吃<span className="font-serif italic text-indigo-500">什么？</span></h2>
                  </div>

                  {/* 用餐类型 — 两列大切换 */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: '正餐', sub: '午餐 / 晚餐', emoji: '🍽️' },
                      { label: '轻食/咖啡', sub: '下午茶 / 饮品', emoji: '☕' },
                    ].map(({ label, sub, emoji }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setMealType(mealType === label ? '' : label)}
                        className={cn(
                          "flex flex-col items-start gap-0.5 px-4 py-3.5 rounded-2xl border transition-all text-left",
                          mealType === label
                            ? "bg-[linear-gradient(135deg,#E4DBEF_0%,#D4C7E4_100%)] border-[#CCBDE0] text-[#564A6C] shadow-[0_12px_30px_rgba(122,98,158,0.18)]"
                            : "bg-white border-black/8 text-[#1A1A1A]/50 hover:border-[#DDD4E2]"
                        )}
                      >
                        <span className="text-xl leading-none mb-1">{emoji}</span>
                        <span className="text-sm font-bold leading-none">{label}</span>
                        <span className={cn("text-[10px] leading-none mt-0.5", mealType === label ? "text-[#564A6C]/58" : "text-[#1A1A1A]/25")}>{sub}</span>
                      </button>
                    ))}
                  </div>

                  {/* 场景 — 3×2 网格，无独立边框 */}
                  <div className="bg-white rounded-2xl border border-black/8 overflow-hidden">
                    <div className="px-4 pt-3 pb-1 text-[9px] uppercase tracking-[0.25em] font-bold text-[#1A1A1A]/25">场景</div>
                    <div className="grid grid-cols-3">
                      {[
                        { label: '约会浪漫', emoji: '💕' },
                        { label: '家庭聚餐', emoji: '👨‍👩‍👧' },
                        { label: '商务宴请', emoji: '💼' },
                        { label: '朋友聚会', emoji: '🎉' },
                        { label: '独自用餐', emoji: '🧘' },
                        { label: '生日庆祝', emoji: '🎂' },
                      ].map(({ label, emoji }) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setScene(scene === label ? '' : label)}
                          className={cn(
                            "mx-1 my-1 flex flex-col items-center gap-1 rounded-[1rem] border py-3 transition-all relative",
                            scene === label
                              ? "border-[#E9DDD2] bg-[#F8F2EC] opacity-100 shadow-[0_8px_20px_rgba(126,108,94,0.08)]"
                              : "border-transparent opacity-40 hover:opacity-70"
                          )}
                        >
                          <span className="text-xl leading-none">{emoji}</span>
                          <span className={cn("text-[11px] font-semibold leading-none", scene === label ? "text-[#7A665C]" : "text-[#1A1A1A]")}>{label}</span>
                          {scene === label && <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-[#B89A8A] rounded-full" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 氛围 + 特殊需求 — 同一卡片，分隔线区分 */}
                  <div className="bg-white rounded-2xl border border-black/8 overflow-hidden">
                    <div className="px-4 pt-3 pb-1 text-[9px] uppercase tracking-[0.25em] font-bold text-[#1A1A1A]/25">环境氛围</div>
                    <div className="grid grid-cols-5 px-2 pb-2">
                      {[
                        { label: '安静私密', emoji: '🤫' },
                        { label: '热闹有活力', emoji: '🎶' },
                        { label: '小清新', emoji: '🌿' },
                        { label: '高端精致', emoji: '✨' },
                        { label: '随意休闲', emoji: '😌' },
                      ].map(({ label, emoji }) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => toggleEnvPref(label)}
                          className={cn(
                            "flex flex-col items-center gap-1 rounded-xl border py-2 transition-all",
                            envPrefs.includes(label)
                              ? "border-[#E7DDD3] bg-[#F7F2EC] shadow-[0_6px_18px_rgba(126,108,94,0.06)]"
                              : "border-transparent opacity-35 hover:opacity-60"
                          )}
                        >
                          <span className="text-base leading-none">{emoji}</span>
                          <span className={cn("text-[9px] font-semibold leading-tight text-center px-0.5", envPrefs.includes(label) ? "text-[#7A665C]" : "text-[#1A1A1A]")}>{label}</span>
                        </button>
                      ))}
                    </div>
                    <div className="h-px bg-black/5 mx-4" />
                    <div className="px-4 pt-2 pb-2 flex flex-wrap gap-x-4 gap-y-1">
                      {[
                        { label: '需要包厢', emoji: '🚪' },
                        { label: '可带宠物', emoji: '🐾' },
                        { label: '有宝宝椅', emoji: '👶' },
                        { label: '免费停车', emoji: '🅿️' },
                        { label: '可预订', emoji: '📅' },
                      ].map(({ label, emoji }) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => toggleEnvPref(label)}
                          className={cn(
                            "flex items-center gap-1.5 text-[11px] font-medium transition-all py-1",
                            envPrefs.includes(label)
                              ? "text-[#7A665C]"
                              : "text-[#1A1A1A]/25 hover:text-[#1A1A1A]/50"
                          )}
                        >
                          <span className={cn("w-4 h-4 rounded flex items-center justify-center text-[10px] transition-all",
                            envPrefs.includes(label) ? "bg-[#EADFD4] text-[#8B6E60]" : "bg-black/8"
                          )}>{emoji}</span>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 人数 & 预算 — 单行卡片 */}
                  <div className="bg-white rounded-2xl border border-black/8 flex items-center px-4 py-3 gap-3">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-[10px] font-bold text-[#1A1A1A]/30 uppercase tracking-wider">人数</span>
                      <button type="button" onClick={() => setPeople(p => Math.max(1, p - 1))}
                        className="w-6 h-6 rounded-full bg-black/5 flex items-center justify-center text-[#1A1A1A]/40 hover:bg-black/10 font-bold active:scale-90 transition-all text-sm leading-none">−</button>
                      <span className="text-sm font-bold text-[#1A1A1A] w-5 text-center">{people}</span>
                      <button type="button" onClick={() => setPeople(p => Math.min(10, p + 1))}
                        className="w-6 h-6 rounded-full bg-black/5 flex items-center justify-center text-[#1A1A1A]/40 hover:bg-black/10 font-bold active:scale-90 transition-all text-sm leading-none">+</button>
                    </div>
                    <div className="w-px h-6 bg-black/8 flex-shrink-0" />
                    <div className="flex items-center gap-1.5 flex-1">
                      <span className="text-[10px] font-bold text-[#1A1A1A]/30 uppercase tracking-wider flex-shrink-0">预算</span>
                      <span className="text-[#1A1A1A]/30 text-sm">¥</span>
                      <input
                        type="number"
                        placeholder="人均"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        className="flex-1 bg-transparent focus:outline-none font-semibold text-[#1A1A1A] text-sm placeholder:text-[#1A1A1A]/20 w-0"
                      />
                      <span className="text-[10px] text-[#1A1A1A]/25 flex-shrink-0">/人</span>
                    </div>
                  </div>

                  {/* 口味偏好 — 嵌入卡片 */}
                  <div className="bg-white rounded-2xl border border-black/8 flex items-center gap-2 px-4 py-3">
                    <Sparkles size={13} className="text-[#1A1A1A]/20 flex-shrink-0" />
                    <input
                      type="text"
                      placeholder="口味偏好或其他特殊需求..."
                      value={taste}
                      onChange={(e) => setTaste(e.target.value)}
                      className="flex-1 bg-transparent focus:outline-none text-sm text-[#1A1A1A] placeholder:text-[#1A1A1A]/25 font-medium"
                    />
                  </div>

                  <button
                    disabled={loading}
                    className="w-full bg-[linear-gradient(135deg,#E3D8F0_0%,#D2C3E7_100%)] text-[#55476E] py-3.5 rounded-2xl border border-[#EADFF5] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-[0_16px_36px_rgba(122,98,158,0.20)] active:scale-[0.98] mt-auto"
                  >
                    {loading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={15} />}
                    获取推荐
                  </button>
                </form>
              ) : (
                <div
                  className="fixed inset-x-0 overflow-y-auto snap-y snap-mandatory no-scrollbar bg-[#FAF9F6]"
                  style={{ top: '60px', bottom: '0' }}
                >
                  {Array.isArray(result) && result.map((res, idx) => (
                    <div
                      key={idx}
                      className="snap-start snap-always w-full h-full flex flex-col px-4 py-3 gap-3"
                    >
                      {/* Progress dots + 重新搜索 */}
                      <div className="flex items-center flex-shrink-0 relative">
                        <div className="flex-1" />
                        <div className="flex items-center gap-1.5">
                          {(result as Restaurant[]).map((_, i) => (
                            <div key={i} className={cn(
                              "h-1 rounded-full transition-all duration-300",
                              i === idx ? "w-6 bg-indigo-500" : "w-1.5 bg-black/10"
                            )} />
                          ))}
                        </div>
                        <div className="flex-1 flex justify-end">
                          {idx === (result as Restaurant[]).length - 1 && (
                            <button
                              onClick={() => setResult(null)}
                              className="text-[11px] font-semibold text-black/25 hover:text-black/50 transition-colors active:scale-95"
                            >
                              重新搜索
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Image — 占约 38% 高度 */}
                      <div className="relative rounded-2xl overflow-hidden flex-shrink-0" style={{ height: '38%' }}>
                        <img
                          src={resolveRestaurantImage(res.image)}
                          alt={res.name}
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const img = e.currentTarget;
                            if (img.dataset.fallbackApplied === 'true') return;
                            img.dataset.fallbackApplied = 'true';
                            img.src = DEFAULT_RESTAURANT_IMAGE;
                          }}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <div className="absolute top-2.5 left-3">
                          <span className={cn(
                            "text-[10px] font-bold px-2 py-0.5 rounded-full",
                            res.category === 'light'
                              ? "bg-amber-400/90 text-amber-900"
                              : "bg-indigo-500/90 text-white"
                          )}>
                            {res.category === 'light' ? '☕ 轻食/咖啡' : '🍽️ 正餐'}
                          </span>
                        </div>
                        <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                          <h3 className="text-base font-bold text-white leading-tight">{res.name}</h3>
                          <div className="flex items-center gap-1 bg-black/30 backdrop-blur-md px-2 py-0.5 rounded-lg text-[11px] font-bold text-white flex-shrink-0 ml-2">
                            <Star size={10} fill="currentColor" className="text-amber-400" /> {res.rating}
                          </div>
                        </div>
                      </div>

                      {/* Main card body — 撑满剩余空间，内部不滚动 */}
                      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-black/5 flex flex-col overflow-hidden min-h-0">

                        {/* Budget */}
                        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-black/5 flex-shrink-0">
                          <Utensils size={12} className="text-indigo-400" />
                          <span className="text-xs font-semibold text-indigo-500 tracking-wide">{res.budget}</span>
                        </div>

                        {/* Dishes — 最多显示 5 个 */}
                        <div className="px-4 py-3 flex-shrink-0 border-b border-black/5">
                          <p className="text-[9px] font-bold text-black/25 uppercase tracking-[0.2em] mb-2">必点推荐</p>
                          <div className="flex flex-wrap gap-1.5">
                            {res.dishes.map((dish: string, dIdx: number) => (
                              <span
                                key={dIdx}
                                className={cn(
                                  "text-xs font-semibold px-2.5 py-1 rounded-xl",
                                  dIdx === 0
                                    ? "bg-indigo-500 text-white"
                                    : "bg-indigo-50 text-indigo-700"
                                )}
                              >
                                {dish}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Group deals — 最多 2 条 */}
                        {res.deals && res.deals.length > 0 && (
                          <div className="px-4 py-3 flex-shrink-0 border-b border-black/5">
                            <p className="text-[9px] font-bold text-black/25 uppercase tracking-[0.2em] mb-2">团购套餐</p>
                            <div className="flex flex-col gap-1.5">
                              {res.deals.slice(0, 2).map((deal: Deal, dIdx: number) => (
                                <div key={dIdx} className="flex items-center justify-between bg-amber-50 rounded-xl px-3 py-2">
                                  <span className="text-xs font-medium text-amber-900/70 flex-1 mr-2 line-clamp-1">{deal.name}</span>
                                  <span className="text-sm font-bold text-amber-600 flex-shrink-0">{deal.price}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Reason */}
                        <div className="px-4 pt-3 pb-4 flex-1 min-h-0">
                          <p className="text-[9px] font-bold text-black/25 uppercase tracking-[0.2em] mb-2">推荐理由</p>
                          <p className="text-sm text-black/55 leading-relaxed">{res.reason}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {mode === 'style' && (
            <motion.div 
              key="style"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {styleAnalysisResult ? (
                <div className="space-y-6">
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass rounded-[2rem] p-8 overflow-hidden relative"
                  >
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-600" />
                    <div className="prose max-w-none prose-amber text-sm">
                      <ReactMarkdown>{styleAnalysisResult}</ReactMarkdown>
                    </div>
                  </motion.div>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => setStyleAnalysisResult(null)}
                      className="py-4 border border-black/5 rounded-2xl hover:bg-black/5 transition-all text-[#1A1A1A]/60 font-medium text-sm"
                    >
                      返回筛选推荐
                    </button>
                    <button 
                      onClick={handleOpenStyleCamera}
                      className="py-4 bg-[#1A1A1A] text-white rounded-2xl transition-all font-medium text-sm active:scale-[0.98]"
                    >
                      重新拍照分析
                    </button>
                  </div>
                  <canvas ref={canvasRef} className="hidden" />
                </div>
              ) : styleCameraOpen ? (
                <div className="space-y-6">
                  <div className="relative aspect-[3/4] bg-neutral-100 rounded-[2rem] overflow-hidden shadow-xl border border-black/5">
                    {stream ? (
                      <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        muted
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-black/5 space-y-4">
                        <Camera size={60} strokeWidth={1} />
                        <p className="text-xs font-medium tracking-widest uppercase text-black/20">正在启动镜头</p>
                      </div>
                    )}

                    <div className="absolute inset-0 border-[30px] border-white/40 pointer-events-none" />
                    <div className="absolute top-8 left-8 w-6 h-6 border-t-2 border-l-2 border-black/10" />
                    <div className="absolute top-8 right-8 w-6 h-6 border-t-2 border-r-2 border-black/10" />
                    <div className="absolute bottom-8 left-8 w-6 h-6 border-b-2 border-l-2 border-black/10" />
                    <div className="absolute bottom-8 right-8 w-6 h-6 border-b-2 border-r-2 border-black/10" />

                    <div className="absolute bottom-10 left-0 right-0 flex justify-center">
                      <button 
                        onClick={handleCapture}
                        disabled={loading || !stream}
                        className="group relative w-16 h-16 flex items-center justify-center disabled:opacity-50"
                      >
                        <div className="absolute inset-0 bg-black/5 rounded-full blur-md group-hover:bg-black/10 transition-all" />
                        <div className="w-14 h-14 bg-[#1A1A1A] rounded-full flex items-center justify-center shadow-xl active:scale-90 transition-transform">
                          {loading ? <Loader2 className="animate-spin text-white" /> : <div className="w-10 h-10 border-2 border-white/20 rounded-full" />}
                        </div>
                      </button>
                    </div>
                  </div>
                  
                  <div className="text-center space-y-2">
                    <h3 className="text-xl font-semibold text-[#1A1A1A]">拍照分析</h3>
                    <p className="text-[#1A1A1A]/40 text-sm leading-relaxed max-w-xs mx-auto">拍一张你的当前穿搭，我会结合商场动线给你更适合逛的店铺建议。</p>
                  </div>
                  <button
                    onClick={handleCloseStyleCamera}
                    className="w-full py-4 border border-black/5 rounded-2xl hover:bg-black/5 transition-all text-[#1A1A1A]/60 font-medium text-sm"
                  >
                    返回筛选推荐
                  </button>
                  <canvas ref={canvasRef} className="hidden" />
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#1A1A1A]/25">Style Finder</p>
                    <h3 className="text-2xl font-bold tracking-tight text-[#1A1A1A]">衣服店铺推荐</h3>
                    <p className="text-sm text-[#1A1A1A]/40 leading-relaxed">
                      先按季节、场景和单品类型筛一遍，Cadence 会优先给你更适合逛的店铺区域。
                    </p>
                  </div>

                  <div className="bg-white rounded-[2rem] border border-black/8 p-4 shadow-sm space-y-4">
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-[#1A1A1A]/25">季节</p>
                      <div className="grid grid-cols-2 gap-2">
                        {(['春夏', '秋冬'] as StyleSeason[]).map((item) => (
                          <button
                            key={item}
                            onClick={() => setStyleSeason(item)}
                            className={cn(
                              "rounded-[1.25rem] px-4 py-3 text-sm font-semibold border transition-all active:scale-[0.98]",
                              styleSeason === item
                                ? "bg-[#E4DBEF] text-[#564A6C] border-[#CFC0E2] shadow-[0_8px_20px_rgba(122,98,158,0.16)]"
                                : "bg-[#F6F4FA] text-[#1A1A1A]/60 border-black/6"
                            )}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-[#1A1A1A]/25">场景</p>
                      <div className="flex flex-wrap gap-2">
                        {(['通勤', '约会', '休闲', '运动'] as StyleOccasion[]).map((item) => (
                          <button
                            key={item}
                            onClick={() => setStyleOccasion(item)}
                            className={cn(
                              "px-3.5 py-2 rounded-full text-[12px] font-semibold border transition-all active:scale-95",
                              styleOccasion === item
                                ? "bg-[#EEE4F5] text-[#6B5A86] border-[#DDCFEA]"
                                : "bg-white text-[#1A1A1A]/60 border-black/10"
                            )}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-[#1A1A1A]/25">我想找</p>
                      <div className="flex flex-wrap gap-2">
                        {(['上衣', '外套', '裙装', '裤装', '鞋包配饰'] as StyleCategory[]).map((item) => (
                          <button
                            key={item}
                            onClick={() => setStyleCategory(item)}
                            className={cn(
                              "px-3.5 py-2 rounded-full text-[12px] font-semibold border transition-all active:scale-95",
                              styleCategory === item
                                ? "bg-[#EFE7E3] text-[#82655F] border-[#E4D5CE]"
                                : "bg-white text-[#1A1A1A]/60 border-black/10"
                            )}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 pt-2">
                      <button
                        onClick={handleStyleRecommend}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-[1.4rem] bg-[linear-gradient(135deg,#E3D8F0_0%,#D2C3E7_100%)] text-[#55476E] border border-[#EADFF5] shadow-[0_14px_30px_rgba(122,98,158,0.18)] font-semibold text-sm active:scale-[0.98] transition-all"
                      >
                        <Shirt size={15} />
                        推荐适合逛的店铺
                      </button>
                      <button
                        onClick={handleOpenStyleCamera}
                        className="w-full sm:w-auto px-4 py-3.5 rounded-[1.4rem] border border-[#E3D8EC] bg-white/82 text-[#6C617F] font-medium text-sm hover:bg-white transition-all active:scale-[0.98]"
                      >
                        拍照分析
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {styleRecommendationApplied ? (
                      styleSpotResults.map((spot) => (
                        <div key={spot.id} className="bg-white rounded-[1.6rem] border border-black/8 p-4 shadow-sm space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-[#1A1A1A]/25">{spot.floor}</p>
                              <h4 className="text-[18px] font-bold text-[#1A1A1A] leading-tight">{spot.title}</h4>
                              <p className="text-[12px] text-[#1A1A1A]/50 leading-relaxed">{spot.subtitle}</p>
                            </div>
                            <div className="w-10 h-10 rounded-2xl bg-[#F3F0FF] flex items-center justify-center flex-shrink-0">
                              <Shirt size={16} className="text-[#6D63A8]" />
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {spot.tags.map((tag) => (
                              <span
                                key={tag}
                                className="text-[11px] font-medium px-3 py-1.5 rounded-full bg-black/[0.03] text-[#1A1A1A]/55"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[1.6rem] border border-dashed border-black/10 bg-white/70 px-5 py-6 text-center shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1A1A1A]/28">
                          Style Match
                        </p>
                        <p className="mt-2 text-[16px] font-semibold text-[#1A1A1A]">
                          先选条件，再点击推荐店铺
                        </p>
                        <p className="mt-2 text-[13px] leading-relaxed text-[#1A1A1A]/45">
                          我会根据你选的季节、场景和单品类型，推荐更适合先逛的楼层和店铺区域。
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {mode === 'events' && (
            <motion.div 
              key="events"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="pb-6"
            >
              {(() => {
                const carouselEvents = getCarouselEvents();
                const centeredEvent = carouselEvents[centerEventIndex] ?? carouselEvents[0];
                const sceneInsight = eventSceneFilter && centeredEvent?.sceneInsights?.[eventSceneFilter];

                return (
                  <>
                    {/* ── Header ── */}
                    <div className="px-5 mb-4">
                      <div className="flex items-baseline justify-between">
                <h3 className="text-2xl font-bold tracking-tight">精彩活动</h3>
                        <span className="text-[11px] text-[#1A1A1A]/30 font-medium">
                          {carouselEvents.length} 个活动
                        </span>
                      </div>
              </div>

                    {/* ── Carousel（未来 / 进行中 / 已结束） ── */}
                <div 
                  ref={eventsScrollRef}
                  onScroll={handleEventScroll}
                      className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                      style={{ paddingLeft: 'calc(11%)' }}
                    >
                      {carouselEvents.map((event, i) => {
                        const dist = Math.abs(i - centerEventIndex);
                        const isCenter = dist === 0;
                        const status = getEventStatus(event);
                        const sceneMatch = eventSceneFilter ? event.scenes.includes(eventSceneFilter) : true;
                    return (
                      <motion.div
                        key={event.id}
                            animate={{
                              scale: isCenter ? 1 : 0.88,
                              opacity: isCenter ? 1 : dist === 1 ? (sceneMatch ? 0.55 : 0.35) : 0.25,
                              filter: isCenter ? 'blur(0px)' : 'blur(2px)',
                            }}
                            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                            className="w-[78%] flex-shrink-0 snap-center cursor-pointer"
                            onClick={() => handleCarouselCardClick(i)}
                          >
                        <div className={cn(
                              "relative h-[20rem] rounded-3xl overflow-hidden",
                              isCenter ? "shadow-[0_8px_32px_rgba(0,0,0,0.16)]" : "shadow-sm"
                            )}>
                                <img
                                  src={event.image}
                                  alt={event.title}
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/82 via-black/26 to-transparent" />
                                {/* Status badge */}
                                <div className="absolute top-3 left-3 flex items-center gap-1.5">
                          <span className={cn(
                                    "px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest backdrop-blur-md",
                                    status === 'ongoing' && "bg-emerald-500/85 text-white",
                                    status === 'future' && "bg-indigo-500/85 text-white",
                                    status === 'ended' && "bg-fuchsia-500/85 text-white"
                                  )}>
                                    {status === 'ongoing' ? '进行中' : status === 'future' ? '未来' : '已结束'}
                          </span>
                                  {event.hotTag && isCenter && (
                                    <span className="px-2 py-1 rounded-full text-[9px] font-bold bg-rose-500/85 text-white backdrop-blur-md">
                                      {event.hotTag}
                                    </span>
                                  )}
                        </div>
                                {/* Scene match glow for non-center */}
                                {!isCenter && eventSceneFilter && sceneMatch && (
                                  <div className="absolute inset-0 ring-2 ring-inset ring-indigo-400/40 rounded-3xl" />
                                )}
                                {isCenter && (
                                  <div className="absolute bottom-3 right-4 flex items-center gap-1 text-white/60">
                                    <span className="text-[10px] font-medium">查看详情</span>
                                    <ChevronRight size={10} />
                                  </div>
                            )}
                                <div className="absolute inset-x-0 bottom-0 px-4 pb-10 pt-12">
                                  <h4 className="text-[18px] sm:text-[20px] font-bold text-white leading-snug line-clamp-2 [text-shadow:0_2px_10px_rgba(0,0,0,0.45)]">
                                    {event.title}
                                  </h4>
                                </div>
                        </div>
                      </motion.div>
                    );
                  })}
                      <div className="flex-shrink-0" style={{ width: 'calc(11% - 16px)' }} />
                </div>

                    {/* ── Dot indicators ── */}
                    <div className="flex justify-center gap-1.5 mt-1.5">
                      {carouselEvents.map((_, i) => (
                        <div
                          key={i}
                          className={cn(
                            "h-1.5 rounded-full transition-all duration-300",
                            i === centerEventIndex ? "w-5 bg-[#1A1A1A]" : "w-1.5 bg-[#1A1A1A]/15"
                          )}
                        />
                      ))}
              </div>

                    {/* ── Bottom info sheet ── */}
              <AnimatePresence mode="wait">
                    <motion.div
                        key={`tips-${centerEventIndex}-${eventSceneFilter}`}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.22 }}
                        className="mt-5 min-h-[38vh] sm:min-h-[32vh] rounded-t-[2rem] bg-white px-5 pt-5 pb-8 shadow-[0_-10px_30px_rgba(17,24,39,0.04)]"
                    >
                        {centeredEvent && (() => {
                          const st = getEventStatus(centeredEvent);
                          const isSceneMode = !!(eventSceneFilter && sceneInsight);
                          const primaryLine = isSceneMode
                            ? `${eventSceneFilter}可优先看这场`
                            : st === 'ongoing'
                              ? '现在去正合适'
                              : st === 'future'
                                ? '可以提前安排'
                                : '这场已经结束';
                          const detailLine = sceneInsight || centeredEvent.aiInsight;
                          const accentClass =
                            st === 'ongoing'
                              ? "bg-emerald-500"
                              : st === 'future'
                                ? "bg-indigo-500"
                                : "bg-fuchsia-500";
                          const accentTextClass =
                            st === 'ongoing'
                              ? "text-emerald-600"
                              : st === 'future'
                                ? "text-indigo-600"
                                : "text-fuchsia-600";

                          return (
                            <div className="flex min-h-[30vh] sm:min-h-[24vh] flex-col justify-between space-y-5">
                              <div className="flex items-center gap-2">
                                <span className={cn("h-2 w-2 rounded-full", accentClass)} />
                                <p className={cn("text-[11px] font-semibold tracking-[0.14em] uppercase", accentTextClass)}>
                                  {st === 'ongoing' ? 'Now Showing' : st === 'future' ? 'Coming Up' : 'Archive'}
                                </p>
                              </div>

                              <div className="space-y-3">
                                <p className="text-[18px] sm:text-[20px] font-semibold leading-[1.5] text-[#1A1A1A]">
                                  {primaryLine}
                                </p>
                                <p className="text-[13px] sm:text-[14px] leading-relaxed text-[#1A1A1A]/46">
                                  {detailLine}
                                </p>
                              </div>

                              <div className="grid grid-cols-2 gap-2.5">
                                <div className="rounded-[1.15rem] bg-black/[0.03] px-3.5 py-3">
                                  <div className="flex items-center gap-2 text-[#1A1A1A]/32">
                                    <Clock size={12} />
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">时间</span>
                                  </div>
                                  <p className="mt-2 text-[12px] font-semibold leading-snug text-[#1A1A1A]/68 line-clamp-2">
                                    {centeredEvent.time}
                                  </p>
                                </div>

                                <div className="rounded-[1.15rem] bg-black/[0.03] px-3.5 py-3">
                                  <div className="flex items-center gap-2 text-[#1A1A1A]/32">
                                    <MapPin size={12} />
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">地点</span>
                                  </div>
                                  <p className="mt-2 text-[12px] font-semibold leading-snug text-[#1A1A1A]/68 line-clamp-2">
                                    {centeredEvent.location}
                                  </p>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <span className={cn(
                                  "px-3 py-1.5 rounded-full text-[11px] font-semibold",
                                  st === 'ongoing' && "bg-emerald-50 text-emerald-600",
                                  st === 'future' && "bg-indigo-50 text-indigo-600",
                                  st === 'ended' && "bg-fuchsia-50 text-fuchsia-600"
                                )}>
                                  {st === 'ended' ? '已结束' : getEventCountdown(centeredEvent)}
                                </span>
                                {centeredEvent.ticketInfo && (
                                  <span className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-black/[0.03] text-[#1A1A1A]/55">
                                    {centeredEvent.ticketInfo}
                                  </span>
                                )}
                              </div>

                              <div className="grid grid-cols-2 gap-2.5 pt-1">
                                <div className="rounded-[1.15rem] bg-black/[0.02] px-3.5 py-3 space-y-2">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#1A1A1A]/30">
                                    适合
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {centeredEvent.scenes.slice(0, 2).map((scene) => (
                                      <span
                                        key={scene}
                                        className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-white text-[#1A1A1A]/58"
                                      >
                                        {scene}
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                <div className="rounded-[1.15rem] bg-black/[0.02] px-3.5 py-3 space-y-2">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#1A1A1A]/30">
                                    亮点
                                  </p>
                                  <p className="text-[12px] font-medium leading-relaxed text-[#1A1A1A]/58">
                                    {centeredEvent.tags.slice(0, 2).join(' · ')}
                                  </p>
                                </div>
                              </div>

                              {centeredEvent.aiQuestions.length > 0 && (
                                <div className="space-y-2 pt-1">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#1A1A1A]/30">
                                    还想了解
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {centeredEvent.aiQuestions
                                      .filter((question) => !question.includes('规划'))
                                      .slice(0, 3)
                                      .map((question) => (
                                        <button
                                          key={question}
                                          onClick={() => { void openEventChatQuestion(centeredEvent, question); }}
                                          className="text-[11px] font-medium px-3 py-1.5 rounded-full bg-black/[0.03] text-[#1A1A1A]/58 active:scale-95 transition-all"
                                        >
                                          {question}
                                        </button>
                                      ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </motion.div>
                    </AnimatePresence>

                  </>
                  );
                })()}

              {/* ── Event Detail Modal ── */}
              <AnimatePresence>
                {selectedEvent && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] bg-white flex flex-col"
                  >
                    {/* Hero Image */}
                    <div className="relative h-[38vh] overflow-hidden flex-shrink-0">
                      <img 
                        src={selectedEvent.image} 
                        alt={selectedEvent.title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent" />
                      <button 
                        onClick={() => { setSelectedEvent(null); }}
                        className="absolute top-6 right-6 w-10 h-10 bg-black/20 backdrop-blur-xl rounded-full flex items-center justify-center text-white"
                      >
                        <X size={20} />
                      </button>
                      {/* Status badge */}
                      <div className="absolute top-6 left-6">
                        {(() => {
                          const st = getEventStatus(selectedEvent);
                          return (
                          <span className={cn(
                              "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest backdrop-blur-md",
                              st === 'future' && "bg-indigo-500/80 text-white",
                              st === 'ongoing' && "bg-emerald-500/80 text-white",
                              st === 'ended' && "bg-fuchsia-500/80 text-white"
                            )}>
                              {st === 'future' ? getEventCountdown(selectedEvent) : st === 'ongoing' ? getEventCountdown(selectedEvent) : '已结束'}
                          </span>
                          );
                        })()}
                        </div>
                      </div>

                    {/* Content */}
                    <div className="flex-1 -mt-8 relative bg-white rounded-t-[2.5rem] overflow-y-auto">
                      <div className="px-6 pt-8 pb-32 space-y-6">
                        {/* Title + tags */}
                        <div className="space-y-3">
                          <h2 className="text-2xl font-bold tracking-tight leading-tight">{selectedEvent.title}</h2>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedEvent.tags.map(tag => (
                              <span key={tag} className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-black/5 text-black/50">{tag}</span>
                            ))}
                            {selectedEvent.ticketInfo && (
                              <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600">{selectedEvent.ticketInfo}</span>
                            )}
                          </div>
                        </div>

                        {/* Time + location */}
                        <div className="flex flex-col gap-2.5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500 shrink-0">
                              <Clock size={16} />
                          </div>
                            <p className="text-sm font-semibold text-[#1A1A1A]/70">{selectedEvent.time}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500 shrink-0">
                              <MapPin size={16} />
                            </div>
                            <p className="text-sm font-semibold text-[#1A1A1A]/70">{selectedEvent.location}</p>
                        </div>
                      </div>

                        {/* AI Insight */}
                        <div className={cn(
                          "rounded-2xl px-4 py-3 flex items-start gap-3",
                          getEventStatus(selectedEvent) === 'ongoing' ? "bg-emerald-50" :
                          getEventStatus(selectedEvent) === 'future' ? "bg-indigo-50" : "bg-fuchsia-50"
                        )}>
                          <Sparkles size={14} className={cn(
                            "mt-0.5 flex-shrink-0",
                            getEventStatus(selectedEvent) === 'ongoing' ? "text-emerald-500" :
                            getEventStatus(selectedEvent) === 'future' ? "text-indigo-500" : "text-fuchsia-500"
                          )} />
                          <p className="text-[12px] font-medium leading-relaxed text-[#1A1A1A]/70">{selectedEvent.aiInsight}</p>
                        </div>

                        {/* Details */}
                        <div className="space-y-3">
                          <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/25">活动流程</h4>
                          <div className="space-y-2.5">
                          {selectedEvent.details.map((detail, i) => (
                              <div key={i} className="flex items-start gap-3 text-sm text-black/60">
                                <div className="w-5 h-5 rounded-full bg-black/5 flex items-center justify-center flex-shrink-0 mt-0.5">
                                  <span className="text-[10px] font-bold text-black/30">{i + 1}</span>
                                </div>
                                <span className="font-medium leading-snug">{detail}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {selectedEvent.gift && (
                          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 space-y-1.5">
                            <div className="flex items-center gap-2 text-amber-600">
                              <Gift size={14} />
                              <span className="text-[10px] font-bold uppercase tracking-widest">伴手礼</span>
                          </div>
                            <p className="text-sm text-amber-900/70 font-medium leading-relaxed">{selectedEvent.gift}</p>
                        </div>
                      )}

                      {selectedEvent.notes && (
                          <div className="flex gap-3 p-3.5 bg-orange-50/50 rounded-xl border border-orange-100/50">
                            <Info size={14} className="text-orange-400 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-orange-900/60 leading-relaxed">{selectedEvent.notes}</p>
                        </div>
                      )}

                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* 停车助手功能已停用 */}
          {/* {mode === 'parking' && ( ... )} */}

          {mode === 'member' && (
            <motion.div
              key="member"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="fixed inset-x-0 overflow-y-auto bg-[#FAF9F6]"
              style={{ top: '60px', bottom: '0' }}
            >
              {memberLoading || !memberProfile ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 size={28} className="animate-spin text-indigo-400" />
                </div>
              ) : (
                <div className="pb-10">
                  {/* ── Hero Card ── */}
                  <div className="relative mx-4 mt-4 rounded-3xl overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-500 p-5 shadow-xl">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-10 translate-x-10" />
                    <div className="absolute bottom-0 left-0 w-28 h-28 bg-white/5 rounded-full translate-y-8 -translate-x-8" />

                    {/* Top row */}
                    <div className="flex items-start justify-between relative">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl">
                          {memberProfile.avatarEmoji}
                        </div>
                  <div>
                          <p className="text-white font-bold text-base leading-tight">{memberProfile.name}</p>
                          <p className="text-white/50 text-[11px] mt-0.5">ID {memberProfile.id}</p>
                        </div>
                      </div>
                      {/* Level badge */}
                      <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur-md rounded-xl px-3 py-1.5">
                        <Crown size={12} className="text-amber-300" />
                        <span className="text-white text-[11px] font-bold">{memberProfile.levelLabel}</span>
                      </div>
                    </div>

                    {/* Points */}
                    <div className="mt-5 relative">
                      <p className="text-white/50 text-[10px] uppercase tracking-[0.2em] font-bold">当前积分</p>
                      <p className="text-white text-4xl font-black tracking-tight leading-none mt-1">
                        {memberProfile.points.toLocaleString()}
                      </p>
                    </div>

                    {/* Progress bar */}
                    {memberProfile.nextLevel && (
                      <div className="mt-4 relative">
                        <div className="flex justify-between items-center mb-1.5">
                          <p className="text-white/50 text-[10px] font-medium">累计消费</p>
                          <p className="text-white/50 text-[10px] font-medium">
                            距{memberProfile.nextLevelLabel} 还差 ¥{((memberProfile.nextThreshold ?? 0) - memberProfile.totalSpending).toLocaleString()}
                          </p>
                        </div>
                        <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${memberProfile.progressPct}%` }}
                            transition={{ duration: 0.8, ease: 'easeOut' }}
                            className="h-full bg-white rounded-full"
                          />
                        </div>
                      </div>
                    )}

                    {/* Check-in button */}
                    <div className="mt-4 flex items-center justify-between relative">
                      <div className="flex items-center gap-1.5 text-white/60 text-[11px] font-medium">
                        <CalendarCheck size={13} className="text-white/50" />
                        已连续签到 <span className="text-white font-bold">{memberProfile.checkinStreak}</span> 天
                  </div>
                  <button
                        onClick={handleCheckin}
                        disabled={memberProfile.checkedInToday || checkinAnimating}
                        className={cn(
                          "flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold transition-all active:scale-95",
                          memberProfile.checkedInToday
                            ? "bg-white/10 text-white/40 cursor-not-allowed"
                            : "bg-white text-indigo-600 shadow-lg hover:bg-white/90"
                        )}
                      >
                        {checkinAnimating ? <Loader2 size={13} className="animate-spin" /> : <CalendarCheck size={13} />}
                        {memberProfile.checkedInToday ? '已签到' : '立即签到'}
                  </button>
                </div>

                    {/* Checkin toast */}
                    <AnimatePresence>
                      {checkinResult && checkinResult.success && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          onAnimationComplete={() => setTimeout(() => setCheckinResult(null), 2000)}
                          className="absolute inset-x-4 bottom-14 bg-emerald-500 rounded-xl px-4 py-2 flex items-center gap-2"
                        >
                          <Sparkles size={14} className="text-white" />
                          <p className="text-white text-xs font-semibold">{checkinResult.message}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* ── Quick action tabs ── */}
                  <div className="flex gap-2 px-4 mt-4 overflow-x-auto no-scrollbar">
                    {([
                      { tab: 'overview' as const,      label: '概览',   icon: <Crown size={14} /> },
                      { tab: 'coupons' as const,       label: '优惠券', icon: <Gift size={14} /> },
                      { tab: 'transactions' as const,  label: '消费记录', icon: <Receipt size={14} /> },
                      { tab: 'points' as const,        label: '积分明细', icon: <Coins size={14} /> },
                    ] as const).map(({ tab, label, icon }) => (
                      <button
                        key={tab}
                        onClick={() => handleLoadMemberTab(tab)}
                        className={cn(
                          "flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-[12px] font-semibold flex-shrink-0 transition-all active:scale-95",
                          memberSubPage === tab
                            ? "bg-indigo-600 text-white shadow-md"
                            : "bg-white border border-black/8 text-[#1A1A1A]/50"
                        )}
                      >
                        {icon}{label}
                      </button>
                    ))}
                </div>

                  {/* ── Overview ── */}
                  {memberSubPage === 'overview' && (
                  <motion.div
                      key="overview"
                      initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                      className="px-4 mt-4 space-y-3"
                    >
                      {/* Stats row */}
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: '累计消费', value: `¥${memberProfile.totalSpending.toLocaleString()}`, icon: <TrendingUp size={15} className="text-indigo-400" /> },
                          { label: '可用积分', value: memberProfile.points.toLocaleString(), icon: <Coins size={15} className="text-amber-400" /> },
                        ].map(item => (
                          <div key={item.label} className="bg-white rounded-2xl border border-black/8 p-4 flex items-center gap-3 shadow-sm">
                            <div className="w-9 h-9 rounded-xl bg-[#FAF9F6] flex items-center justify-center flex-shrink-0">{item.icon}</div>
                            <div>
                              <p className="text-[10px] text-[#1A1A1A]/35 font-medium">{item.label}</p>
                              <p className="text-base font-bold text-[#1A1A1A] leading-tight">{item.value}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Benefits card */}
                      <div className="bg-white rounded-2xl border border-black/8 overflow-hidden shadow-sm">
                        <div className="px-4 pt-3.5 pb-2 border-b border-black/5 flex items-center gap-2">
                          <Crown size={13} className="text-amber-400" />
                          <p className="text-[11px] font-bold text-[#1A1A1A]/40 uppercase tracking-wider">{memberProfile.levelLabel}权益</p>
                        </div>
                        <div className="px-4 py-3 space-y-2.5">
                          {[
                            { icon: '🎁', text: '每月专属优惠券 × 2 张' },
                            { icon: '⭐', text: '消费 ¥10 = 1 积分（翻倍加速）' },
                            { icon: '🎂', text: '生日月专属立减礼' },
                            { icon: '📱', text: '优先抢购限量活动名额' },
                          ].map((b, i) => (
                            <div key={i} className="flex items-center gap-3">
                              <span className="text-base w-6 text-center flex-shrink-0">{b.icon}</span>
                              <p className="text-[12px] text-[#1A1A1A]/65 font-medium">{b.text}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Level roadmap */}
                      <div className="bg-white rounded-2xl border border-black/8 overflow-hidden shadow-sm">
                        <div className="px-4 pt-3.5 pb-2 border-b border-black/5">
                          <p className="text-[11px] font-bold text-[#1A1A1A]/40 uppercase tracking-wider">会员等级</p>
                        </div>
                        <div className="px-4 py-3 space-y-3">
                          {[
                            { key: 'regular',  label: '普通会员', threshold: '¥0',     color: 'bg-gray-400' },
                            { key: 'gold',     label: '黄金会员', threshold: '¥1,000', color: 'bg-amber-400' },
                            { key: 'platinum', label: '铂金会员', threshold: '¥5,000', color: 'bg-violet-500' },
                            { key: 'diamond',  label: '钻石会员', threshold: '¥15,000', color: 'bg-blue-500' },
                          ].map(l => (
                            <div key={l.key} className="flex items-center gap-3">
                              <div className={cn("w-2 h-2 rounded-full flex-shrink-0", l.color, memberProfile.level === l.key && "ring-2 ring-offset-1 ring-indigo-400")} />
                              <p className={cn("text-[12px] font-semibold flex-1", memberProfile.level === l.key ? "text-indigo-600" : "text-[#1A1A1A]/40")}>
                                {l.label}
                              </p>
                              <p className="text-[11px] text-[#1A1A1A]/30 font-medium">{l.threshold} 起</p>
                              {memberProfile.level === l.key && (
                                <span className="text-[9px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">当前</span>
                              )}
                      </div>
                          ))}
                    </div>
                      </div>
                  </motion.div>
                )}

                  {/* ── Coupons ── */}
                  {memberSubPage === 'coupons' && (
                    <motion.div key="coupons" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="px-4 mt-4 space-y-3">
                      {memberCoupons.length === 0 ? (
                        <div className="flex items-center justify-center py-16 text-[#1A1A1A]/25">
                          <Loader2 size={22} className="animate-spin" />
                        </div>
                      ) : memberCoupons.map(c => (
                        <div
                          key={c.id}
                          className={cn(
                            "bg-white rounded-2xl border overflow-hidden shadow-sm",
                            c.used || c.expired ? "opacity-45 border-black/5" : "border-black/8"
                          )}
                        >
                          <div className="flex">
                            {/* Discount badge */}
                    <div className={cn(
                              "w-20 flex-shrink-0 flex flex-col items-center justify-center py-4 border-r border-dashed",
                              c.used || c.expired ? "border-black/10 bg-[#FAF9F6]" : "border-indigo-100 bg-indigo-50"
                            )}>
                              <p className={cn("text-lg font-black leading-none", c.used || c.expired ? "text-[#1A1A1A]/30" : "text-indigo-600")}>
                                {c.discountText}
                              </p>
                              <p className={cn("text-[9px] font-medium mt-1", c.used || c.expired ? "text-[#1A1A1A]/25" : "text-indigo-400")}>
                                {c.tag}
                              </p>
                    </div>
                            {/* Info */}
                            <div className="flex-1 px-4 py-3 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-bold text-[#1A1A1A] leading-tight">{c.title}</p>
                                {c.used && <span className="text-[9px] font-bold text-[#1A1A1A]/30 bg-black/5 px-2 py-0.5 rounded-full flex-shrink-0">已使用</span>}
                                {c.expired && !c.used && <span className="text-[9px] font-bold text-red-400 bg-red-50 px-2 py-0.5 rounded-full flex-shrink-0">已过期</span>}
                  </div>
                              <p className="text-[11px] text-[#1A1A1A]/40 mt-1 leading-snug">{c.desc}</p>
                              <div className="flex items-center justify-between mt-2">
                                {c.minSpend > 0 && (
                                  <p className="text-[10px] text-[#1A1A1A]/30 font-medium">满 ¥{c.minSpend} 可用</p>
                                )}
                                <p className="text-[10px] text-[#1A1A1A]/30 ml-auto">{c.expiry} 到期</p>
                    </div>
                  </div>
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  )}

                  {/* ── Transactions ── */}
                  {memberSubPage === 'transactions' && (
                    <motion.div key="transactions" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="px-4 mt-4">
                      {memberTransactions.length === 0 ? (
                        <div className="flex items-center justify-center py-16 text-[#1A1A1A]/25">
                          <Loader2 size={22} className="animate-spin" />
              </div>
                      ) : (
                        <div className="bg-white rounded-2xl border border-black/8 overflow-hidden shadow-sm divide-y divide-black/5">
                          {memberTransactions.map(t => (
                            <div key={t.id} className="flex items-center gap-3 px-4 py-3.5">
                              <div className="w-9 h-9 rounded-xl bg-[#FAF9F6] flex items-center justify-center flex-shrink-0 text-base">
                                {t.category === '餐饮' ? '🍽️' : t.category === '咖啡' ? '☕' : '🛍️'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-[#1A1A1A] truncate">{t.merchant}</p>
                                <p className="text-[11px] text-[#1A1A1A]/35 mt-0.5">{t.date}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-sm font-bold text-[#1A1A1A]">¥{t.amount}</p>
                                <p className="text-[10px] text-amber-500 font-medium">+{t.pointsEarned}分</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* ── Points history ── */}
                  {memberSubPage === 'points' && (
                    <motion.div key="points" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="px-4 mt-4">
                      {memberPointsHistory.length === 0 ? (
                        <div className="flex items-center justify-center py-16 text-[#1A1A1A]/25">
                          <Loader2 size={22} className="animate-spin" />
                        </div>
                      ) : (
                        <div className="bg-white rounded-2xl border border-black/8 overflow-hidden shadow-sm divide-y divide-black/5">
                          {memberPointsHistory.map(h => (
                            <div key={h.id} className="flex items-center gap-3 px-4 py-3.5">
                              <div className={cn(
                                "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
                                h.type === 'earn' ? "bg-amber-50" : "bg-red-50"
                              )}>
                                {h.type === 'earn'
                                  ? <Coins size={16} className="text-amber-400" />
                                  : <Gift size={16} className="text-red-400" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-[#1A1A1A] truncate">{h.desc}</p>
                                <p className="text-[11px] text-[#1A1A1A]/35 mt-0.5">{h.date}</p>
                              </div>
                              <p className={cn(
                                "text-sm font-bold flex-shrink-0",
                                h.type === 'earn' ? "text-amber-500" : "text-red-400"
                              )}>
                                {h.type === 'earn' ? '+' : ''}{h.delta}
                              </p>
                            </div>
                    ))}
                  </div>
                )}
                    </motion.div>
                  )}
              </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

    </div>
  );
}
