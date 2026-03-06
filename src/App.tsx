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
  Navigation,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import {
  getDiningRecommendation, getStyleAdvice, getChatResponse,
  getChatResponseStructured,
  getMemberProfile, postCheckin, getMemberCoupons,
  getMemberTransactions, getMemberPointsHistory,
  getEventItinerary, getTodaySummary, generateDayPlan,
  type Restaurant, type Deal,
  type StructuredChatResponse,
  type MemberProfile, type Coupon, type Transaction, type PointsRecord, type CheckinResult,
  type EventItinerary, type TodaySummary, type DayPlan,
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
}

interface ActivePlan {
  title: string;
  subtitle: string;
  plan: DayPlan;
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
    time: '2026年3月2日 - 2026年3月8日',
    location: '中洲湾 C Future City L1层中庭',
    startDate: new Date('2026-03-02T00:00:00'),
    endDate: new Date('2026-03-08T23:59:59'),
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
    aiInsight: '今天还在！工作日下午人少，限量周边现在还有货，去的话今天是最好的时机。',
    aiTips: ['限量周边通常活动中期就会售罄，越早去越好', '活动在 L1 中庭，从主入口进来直走即可看到', '活动只到 3 月 8 日，别拖到最后一天人挤人'],
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

export default function App() {
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
  const [homeSceneIndex, setHomeSceneIndex] = useState(0);

  // Events State
  const [selectedEvent, setSelectedEvent] = useState<MallEvent | null>(null);
  const [eventScene, setEventScene] = useState('');
  const [eventArriveTime, setEventArriveTime] = useState('');
  const [eventItinerary, setEventItinerary] = useState<EventItinerary | null>(null);
  const [itineraryLoading, setItineraryLoading] = useState(false);
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

  const handleEventScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const cardSlotWidth = el.offsetWidth * 0.78 + 16;
    const idx = Math.round(el.scrollLeft / cardSlotWidth);
    const activeLen = MALL_EVENTS.filter(ev => getEventStatus(ev) !== 'ended').length;
    setCenterEventIndex(Math.max(0, Math.min(idx, activeLen - 1)));
  };

  const handleCarouselCardClick = (index: number) => {
    if (index === centerEventIndex) {
      const activeEvents = MALL_EVENTS.filter(ev => getEventStatus(ev) !== 'ended');
      const ev = activeEvents[index];
      setSelectedEvent(ev);
      setEventScene('');
      setEventItinerary(null);
    } else {
      const el = eventsScrollRef.current;
      if (el) {
        const cardSlotWidth = el.offsetWidth * 0.78 + 16;
        el.scrollTo({ left: index * cardSlotWidth, behavior: 'smooth' });
      }
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
    const activeEvents = MALL_EVENTS.filter(e => getEventStatus(e) !== 'ended');
    const bestIdx = (() => {
      let i = activeEvents.findIndex(e => e.scenes.includes(next) && getEventStatus(e) === 'ongoing');
      if (i >= 0) return i;
      i = activeEvents.findIndex(e => e.scenes.includes(next) && getEventStatus(e) === 'future');
      if (i >= 0) return i;
      return activeEvents.findIndex(e => e.scenes.includes(next));
    })();
    if (bestIdx >= 0) {
      setCenterEventIndex(bestIdx);
      const el = eventsScrollRef.current;
      if (el) {
        const cardSlotWidth = el.offsetWidth * 0.78 + 16;
        el.scrollTo({ left: bestIdx * cardSlotWidth, behavior: 'smooth' });
      }
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
      id: 'quick-2h',
      emoji: '⚡',
      label: '2小时精华',
      desc: '适合下班后或顺路来一趟',
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

  useEffect(() => {
    if (mode !== 'home') return;

    const timer = window.setInterval(() => {
      setHomeSceneIndex((prev) => (prev + 1) % Math.max(quickPlanPresets.length - 1, 1));
    }, 3200);

    return () => window.clearInterval(timer);
  }, [mode, quickPlanPresets.length]);

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
      setResult(advice || "Sorry, I couldn't analyze the image.");
    } catch (err) {
      console.error(err);
      setResult("Error analyzing style. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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
    durationHours: number;
    budget?: number;
  }) => {
    const plan = await generateDayPlan({
      scene: params.scene,
      durationHours: params.durationHours,
      budget: params.budget,
    });

    setActivePlan({
      title: params.title,
      subtitle: params.subtitle,
      plan,
    });
    setMode('plan');
  };

  const handleQuickPlan = async (preset: typeof quickPlanPresets[number]) => {
    setQuickPlanLoadingId(preset.id);
    try {
      await openPlanResult({
        title: preset.label,
        subtitle: preset.desc,
        scene: preset.scene,
        durationHours: preset.durationHours,
        budget: preset.budget,
      });
    } catch (err) {
      console.error(err);
      setActivePlan({
        title: preset.label,
        subtitle: preset.desc,
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
      setQuickPlanLoadingId('today-highlight');
      try {
        await openPlanResult({
          title: 'Today 路线建议',
          subtitle: '基于今天的节奏，直接给你一条更值的路线',
          scene: '自己逛逛',
          durationHours: 2,
          budget: 250,
        });
      } finally {
        setQuickPlanLoadingId(null);
      }
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

  const handleHomeChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    await openFreshChat(msg);
  };

  const handleModeChange = (newMode: Mode) => {
    if (newMode !== 'style') stopCamera();
    setMode(newMode);
    setResult(null);
    if (newMode === 'style') startCamera();
    if (newMode === 'member' && !memberProfile) {
      setMemberLoading(true);
      getMemberProfile().then(p => setMemberProfile(p)).finally(() => setMemberLoading(false));
    }

    // 停车助手功能已停用
    // if (newMode === 'parking' && parkingHistory.length === 0) { ... }
  };

  const handleGenerateItinerary = async () => {
    if (!selectedEvent || !eventScene) return;
    setItineraryLoading(true);
    setEventItinerary(null);
    try {
      const result = await getEventItinerary({
        eventId: selectedEvent.id,
        eventTitle: selectedEvent.title,
        eventLocation: selectedEvent.location,
        eventTime: selectedEvent.time,
        eventDetails: selectedEvent.details,
        scene: eventScene,
        arriveTime: eventArriveTime || '下午2点',
      });
      setEventItinerary(result);
    } catch {
      setEventItinerary({ steps: [], tip: '暂时无法生成行程，请稍后再试' });
    } finally {
      setItineraryLoading(false);
    }
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
  const homeSpotlightPreset = quickPlanPresets[(homeSceneIndex % Math.max(quickPlanPresets.length - 1, 1)) + 1];
  const smartBanner = getSmartBanner();
  const homeStatusItems = todaySummary?.statuses.slice(0, 3) ?? [];
  const homeChatSuggestions = [
    todaySummary?.highlights[0]?.query ?? '今天有什么活动？',
    '现在适合先吃饭还是先逛？',
  ];

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
              className="flex-1 grid grid-rows-[auto,1fr,auto] gap-3 sm:gap-4 py-2 sm:py-4 min-h-0"
            >
              <div className="flex items-center justify-between pt-1 sm:pt-2">
                <div className="space-y-1">
                  <motion.p
                    initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                    className="text-[10px] uppercase tracking-[0.28em] font-bold text-[#1A1A1A]/28"
                >
                    Cadence
                  </motion.p>
                <motion.h2 
                    initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.08 }}
                    className="text-[2.45rem] sm:text-[3rem] font-bold tracking-[-0.065em] text-[#1A1A1A] leading-[0.92]"
                >
                    <span className="font-serif italic bg-gradient-to-br from-[#5649A6] via-[#5C82FF] to-[#AE8BFF] bg-clip-text text-transparent">
                      Cadence
                  </span>
                </motion.h2>
                </div>
                <button
                  onClick={() => handleModeChange('today')}
                  className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-full bg-white/36 backdrop-blur-xl border border-white/45 shadow-[0_16px_40px_rgba(111,123,255,0.12)] text-[10px] sm:text-[11px] font-semibold text-[#1A1A1A]/65 active:scale-95 transition-all"
                >
                  Today
                </button>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.16 }}
                className="relative flex items-center justify-center min-h-0 px-1 sm:px-0"
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-[88%] sm:w-[78%] h-[78%] rounded-full bg-[radial-gradient(circle,_rgba(141,128,255,0.14),_rgba(255,255,255,0))] blur-3xl" />
                </div>

                {smartBanner && (
                  <motion.div
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute top-[7%] sm:top-[17%] left-1 sm:left-0 max-w-[34%] sm:max-w-[46%] px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-[1.1rem] sm:rounded-[1.35rem] bg-white/34 backdrop-blur-xl border border-white/45 shadow-[0_18px_40px_rgba(108,114,255,0.1)]"
                  >
                    <p className="text-[9px] sm:text-[10px] font-semibold text-[#1A1A1A]/70 leading-snug">
                      {smartBanner.icon} {smartBanner.text}
                    </p>
                  </motion.div>
                )}

                <motion.button
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                  onClick={() => handleQuickPlan(homePrimaryPreset)}
                  disabled={quickPlanLoadingId !== null || todayLoading}
                  className={cn(
                    "relative w-full max-w-[22rem] sm:max-w-[30rem] overflow-hidden rounded-[1.9rem] sm:rounded-[2.25rem] border border-white/50 bg-white/40 backdrop-blur-[22px] px-4 sm:px-5 py-4 sm:py-6 text-left shadow-[0_26px_70px_rgba(103,97,191,0.14)] active:scale-[0.985] transition-all",
                    quickPlanLoadingId === homePrimaryPreset.id && "opacity-75"
                  )}
                >
                  <div className="absolute inset-0 bg-[linear-gradient(140deg,rgba(255,255,255,0.58),rgba(255,255,255,0.14)_55%,rgba(176,162,255,0.18))]" />
                  <div className="absolute -right-10 top-8 h-24 sm:h-28 w-24 sm:w-28 rounded-full bg-violet-200/30 blur-3xl" />
                  <div className="absolute -left-8 bottom-3 h-20 sm:h-24 w-20 sm:w-24 rounded-full bg-sky-200/25 blur-3xl" />

                  <div className="relative space-y-4 sm:space-y-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2 min-w-0">
                        <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-[#1A1A1A]/28">
                          Today feels like
                        </p>
                        {todayLoading ? (
                          <div className="h-16 flex items-center">
                            <Loader2 size={18} className="animate-spin text-indigo-400" />
                          </div>
                        ) : (
                          <>
                            <h3 className="text-[1.45rem] sm:text-[1.85rem] font-bold tracking-[-0.05em] text-[#1A1A1A] leading-[1.02]">
                              {todaySummary?.headline ?? '今天适合轻松来逛'}
                            </h3>
                            <p className="text-[12px] sm:text-[13px] leading-relaxed text-[#1A1A1A]/50 max-w-[14rem] sm:max-w-[18rem]">
                              {todaySummary?.recommendedAction ?? '先给你一条今天可以直接走的轻量路线。'}
                            </p>
                          </>
                        )}
                      </div>
                      <div className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full bg-black/[0.04] text-[10px] sm:text-[11px] font-semibold text-[#1A1A1A]/54 whitespace-nowrap">
                        {homePrimaryPreset.emoji} {homePrimaryPreset.label}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {homeStatusItems.map((item) => (
                        <span
                          key={item.label}
                          className="px-2.5 sm:px-3 py-1.5 rounded-full bg-white/34 border border-white/45 text-[9px] sm:text-[10px] font-semibold text-[#1A1A1A]/58"
                        >
                          {item.label} · {item.value}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-[#1A1A1A]/38">直接帮我安排</p>
                        <p className="text-[11px] sm:text-[12px] text-[#1A1A1A]/58 mt-0.5">
                          {homePrimaryPreset.desc}
                        </p>
                      </div>
                      <div className="w-11 h-11 rounded-[1.1rem] bg-[#1A1A1A] text-white flex items-center justify-center shadow-[0_10px_24px_rgba(0,0,0,0.16)] flex-shrink-0">
                        {quickPlanLoadingId === homePrimaryPreset.id ? (
                          <Loader2 size={16} className="animate-spin text-white/80" />
                        ) : (
                          <Navigation size={16} />
                        )}
                      </div>
                    </div>
                  </div>
                </motion.button>

                <motion.button
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 5.6, repeat: Infinity, ease: 'easeInOut' }}
                  onClick={() => handleModeChange('events')}
                  className="absolute top-[13%] sm:top-[23%] right-1 sm:right-0 w-[6.5rem] sm:w-[8.9rem] px-2.5 sm:px-3.5 py-2.5 sm:py-3 rounded-[1.2rem] sm:rounded-[1.5rem] bg-white/30 backdrop-blur-xl border border-white/45 shadow-[0_18px_40px_rgba(108,114,255,0.11)] text-left active:scale-[0.98] transition-all"
                >
                  <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] font-semibold text-[#1A1A1A]/72">
                    <CalendarCheck size={12} />
                    今天看什么
                  </div>
                  <p className="hidden sm:block text-[10px] text-[#1A1A1A]/42 leading-snug mt-1.5">
                    先看今天最值得去的活动
                  </p>
                </motion.button>

                <motion.button
                  animate={{ y: [0, 7, 0] }}
                  transition={{ duration: 6.4, repeat: Infinity, ease: 'easeInOut' }}
                  onClick={() => handleQuickPlan(homeSpotlightPreset)}
                  disabled={quickPlanLoadingId !== null}
                  className="absolute left-1 sm:left-0 bottom-[16%] sm:bottom-[18%] w-[6.9rem] sm:w-[9.4rem] px-2.5 sm:px-3.5 py-2.5 sm:py-3 rounded-[1.2rem] sm:rounded-[1.55rem] bg-white/30 backdrop-blur-xl border border-white/45 shadow-[0_18px_40px_rgba(108,114,255,0.11)] text-left active:scale-[0.98] transition-all"
                >
                  <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.16em] font-bold text-[#1A1A1A]/25">
                    Spotlight
                  </p>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={homeSpotlightPreset.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.22 }}
                      className="mt-1.5"
                    >
                      <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[12px] font-semibold text-[#1A1A1A]/74">
                        <span>{homeSpotlightPreset.emoji}</span>
                        <span>{homeSpotlightPreset.label}</span>
                      </div>
                      <p className="hidden sm:block text-[10px] text-[#1A1A1A]/42 leading-snug mt-1">
                        {homeSpotlightPreset.desc}
                      </p>
                    </motion.div>
                  </AnimatePresence>
                </motion.button>

                <motion.button
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 5.9, repeat: Infinity, ease: 'easeInOut' }}
                  onClick={() => handleModeChange(lastUserPrompt ? 'chat' : 'dining')}
                  className="absolute right-1 sm:right-3 bottom-[6%] sm:bottom-0 w-[7.1rem] sm:w-[10rem] px-2.5 sm:px-3.5 py-2.5 sm:py-3 rounded-[1.2rem] sm:rounded-[1.55rem] bg-white/28 backdrop-blur-xl border border-white/45 shadow-[0_18px_40px_rgba(108,114,255,0.11)] text-left active:scale-[0.98] transition-all"
                >
                  <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] font-semibold text-[#1A1A1A]/72">
                    {lastUserPrompt ? <Sparkles size={12} /> : <Utensils size={12} />}
                    {lastUserPrompt ? '继续对话' : '现在吃什么'}
                  </div>
                  <p className="hidden sm:block text-[10px] text-[#1A1A1A]/42 leading-snug mt-1.5 truncate">
                    {lastUserPrompt || '顺路找一家更适合现在的餐厅'}
                  </p>
                </motion.button>
              </motion.div>

              <div className="space-y-2.5 sm:space-y-3 pb-1 sm:pb-2">
                <form onSubmit={handleHomeChatSubmit} className="relative group">
                  <div className="absolute -inset-1 rounded-[2rem] bg-gradient-to-r from-violet-300/14 via-sky-300/12 to-amber-200/12 blur-md opacity-0 group-focus-within:opacity-100 transition duration-500" />
                  <div className="relative rounded-[1.6rem] sm:rounded-[2rem] border border-white/50 bg-white/40 backdrop-blur-[22px] shadow-[0_18px_48px_rgba(103,97,191,0.11)]">
                  <input 
                    type="text"
                      placeholder="今天想怎么逛？"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                      className="w-full bg-transparent rounded-[1.6rem] sm:rounded-[2rem] py-3.5 sm:py-4 pl-5 sm:pl-6 pr-16 focus:outline-none font-medium text-[#1A1A1A] text-[14px] sm:text-[15px] placeholder:text-black/24"
                  />
                  <button 
                    disabled={loading || !chatInput.trim()}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-11 sm:h-11 bg-[#1A1A1A] text-white rounded-[1rem] sm:rounded-[1.15rem] flex items-center justify-center disabled:opacity-20 transition-all shadow-[0_12px_24px_rgba(0,0,0,0.16)] active:scale-95"
                  >
                      {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={17} />}
                  </button>
                  </div>
                </form>

                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:overflow-x-auto no-scrollbar pb-1">
                  {homeChatSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={async () => {
                        setChatInput('');
                        await openFreshChat(suggestion);
                      }}
                      className="px-3.5 py-2 rounded-full bg-white/28 backdrop-blur-xl border border-white/45 text-[11px] font-medium text-[#1A1A1A]/56 whitespace-nowrap shadow-[0_12px_28px_rgba(103,97,191,0.09)] active:scale-95 transition-all"
                    >
                      {suggestion}
                    </button>
                  ))}

                  {[
                    { mode: 'style' as const, label: '穿搭建议', icon: Shirt },
                    { mode: 'member' as const, label: '会员中心', icon: Crown },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.mode}
                        onClick={() => handleModeChange(item.mode)}
                        className="px-3.5 py-2 rounded-full bg-white/24 backdrop-blur-xl border border-white/45 text-[11px] font-medium text-[#1A1A1A]/54 whitespace-nowrap shadow-[0_12px_28px_rgba(103,97,191,0.08)] active:scale-95 transition-all flex items-center gap-1.5"
                      >
                        <Icon size={12} />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
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

          {mode === 'plan' && activePlan && (
                <motion.div
              key="plan"
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
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                    <Sparkles size={16} className="text-indigo-500" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-[#1A1A1A]">今天的路线建议</p>
                    <p className="text-[12px] text-[#1A1A1A]/55 leading-relaxed">{activePlan.plan.summary}</p>
                  </div>
                </div>

                <div className="rounded-2xl bg-black/[0.025] border border-black/5 overflow-hidden">
                  <div className="px-4 pt-3 pb-1 border-b border-black/5">
                    <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">路线时间线</p>
                  </div>
                  <div className="px-4 py-2 space-y-0">
                    {activePlan.plan.steps.map((step, i) => (
                      <div key={i} className="flex items-start gap-3 py-2 border-b border-black/5 last:border-0">
                        <div className="w-5 h-5 rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-[10px] font-black text-indigo-500">{i + 1}</span>
                        </div>
                        <p className="text-[12px] text-[#1A1A1A]/70 font-medium leading-snug">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-start gap-2 px-3.5 py-3 rounded-2xl bg-amber-50 border border-amber-100">
                  <Quote size={13} className="text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-[12px] text-amber-900/65 leading-relaxed">{activePlan.plan.tip}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => {
                    if (activePlan.plan.action === 'dining' || activePlan.plan.action === 'events') {
                      handleModeChange(activePlan.plan.action);
                    }
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-[#1A1A1A] text-white text-sm font-bold active:scale-[0.98] transition-all"
                >
                  <ChevronRight size={14} />
                  {activePlan.plan.actionLabel ?? '继续下一步'}
                  </button>
                    <button
                  onClick={async () => {
                    const prompt = `${activePlan.title}，帮我继续细化这条路线`;
                    await openFreshChat(prompt);
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-white border border-black/8 text-[#1A1A1A] text-sm font-bold shadow-sm active:scale-[0.98] transition-all"
                >
                  <Send size={14} />
                  继续问 AI
                    </button>
              </div>

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
                {fullChatHistory.map((msg, i) => {
                  const isLastAi = msg.role === 'ai' && i === fullChatHistory.length - 1;
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
                                <p className="text-[12px] text-[#1A1A1A]/70 font-medium leading-snug">{step.replace(/^[①②③④⑤⑥]\s*/, '')}</p>
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
                            ? "bg-[#1A1A1A] border-[#1A1A1A] text-white shadow-md"
                            : "bg-white border-black/8 text-[#1A1A1A]/50 hover:border-black/20"
                        )}
                      >
                        <span className="text-xl leading-none mb-1">{emoji}</span>
                        <span className="text-sm font-bold leading-none">{label}</span>
                        <span className={cn("text-[10px] leading-none mt-0.5", mealType === label ? "text-white/50" : "text-[#1A1A1A]/25")}>{sub}</span>
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
                            "flex flex-col items-center gap-1 py-3 transition-all relative",
                            scene === label ? "opacity-100" : "opacity-40 hover:opacity-70"
                          )}
                        >
                          <span className="text-xl leading-none">{emoji}</span>
                          <span className={cn("text-[11px] font-semibold leading-none", scene === label ? "text-indigo-600" : "text-[#1A1A1A]")}>{label}</span>
                          {scene === label && <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-0.5 bg-indigo-500 rounded-full" />}
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
                            "flex flex-col items-center gap-1 py-2 rounded-xl transition-all",
                            envPrefs.includes(label)
                              ? "bg-indigo-50"
                              : "opacity-35 hover:opacity-60"
                          )}
                        >
                          <span className="text-base leading-none">{emoji}</span>
                          <span className={cn("text-[9px] font-semibold leading-tight text-center px-0.5", envPrefs.includes(label) ? "text-indigo-600" : "text-[#1A1A1A]")}>{label}</span>
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
                              ? "text-[#1A1A1A]"
                              : "text-[#1A1A1A]/25 hover:text-[#1A1A1A]/50"
                          )}
                        >
                          <span className={cn("w-4 h-4 rounded flex items-center justify-center text-[10px] transition-all",
                            envPrefs.includes(label) ? "bg-[#1A1A1A] text-white" : "bg-black/8"
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
                    className="w-full bg-[#1A1A1A] text-white py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-black disabled:opacity-50 transition-all shadow-lg active:scale-[0.98] mt-auto"
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
              {!result ? (
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
                    
                    {/* Viewfinder Overlay */}
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
                    <h3 className="text-xl font-semibold text-[#1A1A1A]">视觉分析</h3>
                    <p className="text-[#1A1A1A]/40 text-sm leading-relaxed max-w-xs mx-auto">请在镜头前展示你的穿搭，我们将为你提供专业建议。</p>
                  </div>
                  <canvas ref={canvasRef} className="hidden" />
                </div>
              ) : (
                <div className="space-y-6">
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass rounded-[2rem] p-8 overflow-hidden relative"
                  >
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-600" />
                    <div className="prose max-w-none prose-amber text-sm">
                      <ReactMarkdown>{typeof result === 'string' ? result : ''}</ReactMarkdown>
                    </div>
                  </motion.div>
                  <button 
                    onClick={() => {
                      setResult(null);
                      startCamera();
                    }}
                    className="w-full py-4 border border-black/5 rounded-2xl hover:bg-black/5 transition-all text-[#1A1A1A]/60 font-medium text-sm"
                  >
                    重新分析
                  </button>
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
                const activeEvents = MALL_EVENTS.filter(e => getEventStatus(e) !== 'ended');
                const pastEvents = MALL_EVENTS.filter(e => getEventStatus(e) === 'ended');
                const centeredEvent = activeEvents[centerEventIndex] ?? activeEvents[0];
                const smartBanner = getSmartBanner();
                const allScenes = [...new Set(activeEvents.flatMap(e => e.scenes))];
                const sceneInsight = eventSceneFilter && centeredEvent?.sceneInsights?.[eventSceneFilter];
                const upcomingSpotlight = activeEvents.find(e => getEventStatus(e) === 'future' && e.id !== centeredEvent?.id);

                return (
                  <>
                    {/* ── Header ── */}
                    <div className="px-5 mb-4">
                      <div className="flex items-baseline justify-between">
                <h3 className="text-2xl font-bold tracking-tight">精彩活动</h3>
                        <span className="text-[11px] text-[#1A1A1A]/30 font-medium">
                          {activeEvents.length} 个进行中 / 即将开始
                        </span>
                      </div>
              </div>

                    {/* ── Smart timing banner ── */}
                    {smartBanner && (
                      <div className={cn("mx-5 mb-5 flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-medium", smartBanner.color)}>
                        <span className="leading-none flex-shrink-0">{smartBanner.icon}</span>
                        <p className="leading-snug">{smartBanner.text}</p>
                      </div>
                    )}

                    {/* ── 场景筛选 chips ── */}
                    <div className="px-5 mb-5">
                      <div className="flex gap-2 flex-wrap">
                        {allScenes.map(scene => (
                          <button
                            key={scene}
                            onClick={() => handleSceneFilter(scene)}
                            className={cn(
                              "text-[12px] font-semibold px-3.5 py-1.5 rounded-full transition-all active:scale-95",
                              eventSceneFilter === scene
                                ? "bg-[#1A1A1A] text-white"
                                : "bg-white border border-black/10 text-[#1A1A1A]/50"
                            )}
                          >
                            {scene === '带小孩来玩' ? '👨‍👩‍👧 ' : scene === '两个人约会' ? '👫 ' : scene === '朋友聚会' ? '👥 ' : '🚶 '}
                            {scene}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* ── Carousel（只展示进行中 + 即将开始） ── */}
                <div 
                  ref={eventsScrollRef}
                  onScroll={handleEventScroll}
                      className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                      style={{ paddingLeft: 'calc(11%)' }}
                    >
                      {activeEvents.map((event, i) => {
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
                              "rounded-3xl overflow-hidden bg-white",
                              isCenter ? "shadow-[0_6px_28px_rgba(0,0,0,0.13)]" : "shadow-sm"
                            )}>
                              {/* Image */}
                              <div className="relative h-56 overflow-hidden">
                                <img
                                  src={event.image}
                                  alt={event.title}
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                                {/* Status badge */}
                                <div className="absolute top-3 left-3 flex items-center gap-1.5">
                          <span className={cn(
                                    "px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest backdrop-blur-md",
                                    status === 'ongoing' ? "bg-emerald-500/85 text-white" : "bg-indigo-500/85 text-white"
                                  )}>
                                    {status === 'ongoing' ? '进行中' : '即将开始'}
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
                                {/* Countdown */}
                                <div className="absolute bottom-3 left-4">
                                  <span className={cn(
                                    "text-[11px] font-bold drop-shadow-sm",
                                    status === 'ongoing' ? "text-emerald-300" : "text-indigo-200"
                                  )}>
                                    {getEventCountdown(event)}
                                  </span>
                            </div>
                                {isCenter && (
                                  <div className="absolute bottom-3 right-4 flex items-center gap-1 text-white/60">
                                    <span className="text-[10px] font-medium">查看详情</span>
                                    <ChevronRight size={10} />
                                  </div>
                            )}
                          </div>
                              {/* Card info — 只保留标题 + 地点，标签移除，减少密度 */}
                              <div className="px-4 pt-3.5 pb-4 space-y-1.5">
                                <h4 className="text-[14px] font-bold text-[#1A1A1A] leading-snug line-clamp-2">{event.title}</h4>
                                <div className="flex items-center gap-1.5 text-[#1A1A1A]/35">
                                  <MapPin size={10} />
                                  <span className="text-[11px] truncate">{event.location.split(' ').slice(-1)[0]}</span>
                                </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                      <div className="flex-shrink-0" style={{ width: 'calc(11% - 16px)' }} />
                </div>

                    {/* ── Dot indicators ── */}
                    <div className="flex justify-center gap-1.5 mt-1.5">
                      {activeEvents.map((_, i) => (
                        <div
                          key={i}
                          className={cn(
                            "h-1.5 rounded-full transition-all duration-300",
                            i === centerEventIndex ? "w-5 bg-[#1A1A1A]" : "w-1.5 bg-[#1A1A1A]/15"
                          )}
                        />
                      ))}
              </div>

                    {/* ── AI Tips：insight + tips 合并成一张卡，减少盒子数量 ── */}
              <AnimatePresence mode="wait">
                    <motion.div
                        key={`tips-${centerEventIndex}-${eventSceneFilter}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="px-5 mt-5"
                    >
                        {centeredEvent && (() => {
                          const st = getEventStatus(centeredEvent);
                          const isSceneMode = !!(eventSceneFilter && sceneInsight);
                          return (
                      <div className={cn(
                              "rounded-2xl p-4 space-y-3",
                              isSceneMode ? "bg-[#1A1A1A]" : st === 'ongoing' ? "bg-emerald-50" : "bg-indigo-50"
                            )}>
                              {/* Insight 主句 */}
                              <div className="flex items-start gap-2.5">
                                <Sparkles size={13} className={cn(
                                  "mt-0.5 flex-shrink-0",
                                  isSceneMode ? "text-white/50" : st === 'ongoing' ? "text-emerald-500" : "text-indigo-500"
                                )} />
                        <div>
                                  {isSceneMode && (
                                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40 mb-1">
                                      {eventSceneFilter} · 专属建议
                                    </p>
                                  )}
                                  <p className={cn(
                                    "text-[12px] font-medium leading-relaxed",
                                    isSceneMode ? "text-white/85" : "text-[#1A1A1A]/65"
                                  )}>
                                    {sceneInsight || centeredEvent.aiInsight}
                                  </p>
                        </div>
                      </div>

                              {/* Tips：分隔线 + 简洁列表，不再单独分盒子 */}
                              {centeredEvent.aiTips.length > 0 && (
                                <div className={cn(
                                  "pt-3 border-t space-y-2",
                                  isSceneMode ? "border-white/10" : "border-black/8"
                                )}>
                                  {centeredEvent.aiTips.map((tip, ti) => (
                                    <div key={ti} className="flex items-start gap-2">
                                      <span className={cn(
                                        "text-[10px] mt-0.5 flex-shrink-0",
                                        isSceneMode ? "text-white/30" : "text-black/25"
                                      )}>•</span>
                                      <p className={cn(
                                        "text-[11px] leading-relaxed",
                                        isSceneMode ? "text-white/60" : "text-[#1A1A1A]/50"
                                      )}>{tip}</p>
                          </div>
                        ))}
                      </div>
                              )}
                            </div>
                          );
                        })()}
                      </motion.div>
                    </AnimatePresence>

                    {/* ── 即将登场 spotlight ── */}
                    {upcomingSpotlight && (
                      <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                        className="mx-5 mt-6"
                      >
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-black/25 mb-2.5">即将登场</p>
                            <button
                          onClick={() => { setSelectedEvent(upcomingSpotlight); setEventScene(''); setEventItinerary(null); }}
                          className="w-full text-left flex items-center gap-3 p-3 rounded-2xl bg-indigo-50 border border-indigo-100 active:bg-indigo-100 transition-colors"
                        >
                          <div className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0">
                            <img src={upcomingSpotlight.image} alt={upcomingSpotlight.title} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-indigo-900/20" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-bold text-[#1A1A1A] line-clamp-1">{upcomingSpotlight.title}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Timer size={10} className="text-indigo-400" />
                              <span className="text-[11px] font-semibold text-indigo-600">{getEventCountdown(upcomingSpotlight)}</span>
                              {upcomingSpotlight.hotTag && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600">{upcomingSpotlight.hotTag}</span>
                              )}
                            </div>
                          </div>
                          <ChevronRight size={15} className="text-indigo-300 flex-shrink-0" />
                        </button>
                      </motion.div>
                    )}

                    {/* ── 往期精彩 ── */}
                    {pastEvents.length > 0 && (
                      <div className="mx-5 mt-6">
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-black/25 mb-2.5">往期精彩</p>
                        <div className="space-y-2">
                          {pastEvents.map(event => (
                            <button
                              key={event.id}
                              onClick={() => { setSelectedEvent(event); setEventScene(''); setEventItinerary(null); }}
                              className="w-full text-left flex items-center gap-3 px-3.5 py-3 bg-white rounded-xl border border-black/6 opacity-60 active:opacity-80 transition-opacity"
                            >
                              <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 grayscale">
                                <img src={event.image} alt={event.title} className="w-full h-full object-cover" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-semibold text-[#1A1A1A]/60 truncate">{event.title}</p>
                                <p className="text-[10px] text-black/30 mt-0.5">{event.time}</p>
                              </div>
                              <div className="flex items-center gap-1 text-black/25 flex-shrink-0">
                                <span className="text-[10px]">已结束</span>
                                <ChevronRight size={12} />
                              </div>
                            </button>
                          ))}
                        <button
                            onClick={() => { void openFreshChat('中洲湾最近还有哪些类似的手作或节日活动？'); }}
                            className="w-full py-2.5 rounded-xl border border-dashed border-black/15 text-[11px] font-semibold text-[#1A1A1A]/35 flex items-center justify-center gap-1.5 active:bg-black/3 transition-all"
                          >
                            <Sparkles size={11} />
                            问问 AI：之后还有类似活动吗？
                        </button>
                      </div>
                      </div>
                    )}
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
                        onClick={() => { setSelectedEvent(null); setEventItinerary(null); setEventScene(''); }}
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
                              st === 'ended' && "bg-black/30 text-white/70"
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
                          getEventStatus(selectedEvent) === 'future' ? "bg-indigo-50" : "bg-neutral-50"
                        )}>
                          <Sparkles size={14} className={cn(
                            "mt-0.5 flex-shrink-0",
                            getEventStatus(selectedEvent) === 'ongoing' ? "text-emerald-500" :
                            getEventStatus(selectedEvent) === 'future' ? "text-indigo-500" : "text-neutral-400"
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

                        {/* ──── AI 行程规划 ──── */}
                        {getEventStatus(selectedEvent) !== 'ended' && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-lg bg-black flex items-center justify-center">
                                <Navigation size={12} className="text-white" />
                              </div>
                              <h4 className="text-sm font-bold">帮我规划当天行程</h4>
                            </div>

                            {/* Scene chips */}
                            <div className="space-y-2">
                              <p className="text-[11px] text-black/40 font-medium">今天是什么场景？</p>
                              <div className="flex flex-wrap gap-2">
                                {selectedEvent.scenes.map(scene => (
                        <button 
                                    key={scene}
                                    onClick={() => { setEventScene(scene); setEventItinerary(null); }}
                          className={cn(
                                      "text-[12px] font-semibold px-3.5 py-1.5 rounded-full transition-all active:scale-95",
                                      eventScene === scene
                                        ? "bg-[#1A1A1A] text-white"
                                        : "bg-black/5 text-[#1A1A1A]/60 hover:bg-black/10"
                                    )}
                                  >
                                    {scene}
                        </button>
                                ))}
                      </div>
                            </div>

                            {/* Arrive time */}
                            {eventScene && (
                              <motion.div
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-2"
                              >
                                <p className="text-[11px] text-black/40 font-medium">预计几点到？</p>
                                <div className="flex flex-wrap gap-2">
                                  {['上午10点', '中午12点', '下午2点', '下午4点', '傍晚6点', '晚上8点'].map(t => (
                                    <button
                                      key={t}
                                      onClick={() => setEventArriveTime(t)}
                                      className={cn(
                                        "text-[12px] font-semibold px-3 py-1.5 rounded-full transition-all active:scale-95",
                                        eventArriveTime === t
                                          ? "bg-indigo-600 text-white"
                                          : "bg-black/5 text-[#1A1A1A]/60"
                                      )}
                                    >
                                      {t}
                                    </button>
                                  ))}
                    </div>
                              </motion.div>
                            )}

                            {/* Generate button */}
                            {eventScene && (
                              <motion.button
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                onClick={handleGenerateItinerary}
                                disabled={itineraryLoading}
                                className="w-full py-3.5 rounded-2xl font-bold text-sm bg-[#1A1A1A] text-white flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-60"
                              >
                                {itineraryLoading ? (
                                  <><Loader2 size={15} className="animate-spin" /> 生成中...</>
                                ) : (
                                  <><Zap size={15} /> 生成 {eventScene} 专属行程</>
                                )}
                              </motion.button>
                            )}

                            {/* Itinerary result */}
                            <AnimatePresence>
                              {eventItinerary && (
                                <motion.div
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0 }}
                                  className="rounded-2xl bg-black/[0.03] border border-black/8 p-4 space-y-3"
                                >
                                  <div className="flex items-center gap-2 mb-1">
                                    <Sparkles size={13} className="text-indigo-500" />
                                    <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-[0.1em]">{eventScene} · 专属行程</p>
                                  </div>
                                  <div className="space-y-2">
                                    {eventItinerary.steps.map((step, i) => (
                                      <p key={i} className="text-[13px] font-medium text-[#1A1A1A]/75 leading-relaxed">{step}</p>
                                    ))}
                                  </div>
                                  {eventItinerary.tip && (
                                    <div className="pt-2 border-t border-black/8 flex items-start gap-2">
                                      <Quote size={12} className="text-black/25 shrink-0 mt-0.5" />
                                      <p className="text-[11px] text-black/45 italic leading-relaxed">{eventItinerary.tip}</p>
                                    </div>
                                  )}
                                  {/* 跳转到美食推荐 */}
                                  <button
                                    onClick={() => { setSelectedEvent(null); setMode('dining'); }}
                                    className="w-full mt-1 py-2.5 rounded-xl bg-white border border-black/10 text-[12px] font-semibold text-[#1A1A1A]/60 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                                  >
                                    <Utensils size={13} />
                                    帮我找这顿饭去哪儿吃
                                    <ChevronRight size={13} />
                                  </button>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}

                        {/* Quick questions → Chat */}
                        {selectedEvent.aiQuestions.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/25">还想了解</p>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedEvent.aiQuestions.map(q => (
                                <button
                                  key={q}
                                  onClick={() => { setSelectedEvent(null); void openFreshChat(q); }}
                                  className="text-[11px] font-semibold px-3 py-1.5 rounded-full bg-black/5 text-[#1A1A1A]/60 hover:bg-black/10 transition-all active:scale-95"
                                >
                                  {q}
                                </button>
                              ))}
                            </div>
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
