const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY as string;
const MODEL = "google/gemini-3-flash-preview";

type MessageContent = string | Array<{ type: string; text?: string; image_url?: { url: string } }>;

async function callOpenRouter(
  messages: Array<{ role: string; content: MessageContent }>,
  jsonMode = false
): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(JSON.stringify(err));
  }
  const data = await res.json();
  return data.choices[0].message.content ?? "";
}

export interface Deal {
  name: string;
  price: string;
}

export interface Restaurant {
  name: string;
  image: string;
  dishes: string[];
  budget: string;
  reason: string;
  rating: string;
  deals: Deal[];
  category: 'meal' | 'light';
}

interface RestaurantData {
  name: string;
  type: string;
  category: 'meal' | 'light';
  budget: string;
  rating: string;
  image: string;
  dishes: string[];
  ambiance: string[];   // 氛围标签，匹配用户的"环境/氛围"偏好
  facilities: string[]; // 设施标签，匹配用户的"特殊需求"
  deals: Deal[];
}

// 新增餐厅只需在此数组追加一条记录，无需修改 prompt 规则
export const RESTAURANTS: RestaurantData[] = [
  {
    name: "探魚·鲜青椒爽麻烤鱼 (福田中洲湾店)",
    type: "烤鱼/川湘菜",
    category: "meal",
    budget: "~￥80/人",
    rating: "4.0",
    image: "/探鱼.webp",
    dishes: ["鲜青椒爽麻烤鱼", "绝绝紫苏牛蛙", "冰粉自由", "黄金组合", "酱香烤鱼", "蒜香烤鱼"],
    ambiance: ["小清新", "热闹有活力"],
    facilities: ["有大桌", "付费停车", "有宝宝椅"],
    deals: [
      { name: "好运无限双人餐", price: "¥208" },
      { name: "0.1元换购随机好物", price: "¥0.1" },
    ],
  },
  {
    name: "绿茶餐厅 (福田中洲湾店)",
    type: "浙江菜/创意菜",
    category: "meal",
    budget: "~￥60/人",
    rating: "4.1",
    image: "/绿茶.webp",
    dishes: ["面包诱惑", "粉丝裹虾", "石锅西施豆腐", "绿茶烤鸡", "龙井虾仁"],
    ambiance: ["小清新", "随意休闲"],
    facilities: ["免费停车", "有宝宝椅", "可预订"],
    deals: [
      { name: "面包诱惑美味3人餐", price: "¥163" },
      { name: "甜宠星期二·面包诱惑", price: "¥4.9" },
    ],
  },
  {
    name: "椿庐ChunLounge (中洲湾店)",
    type: "川菜/精致中餐",
    category: "meal",
    budget: "~￥219/人",
    rating: "4.8",
    image: "/椿庐.webp",
    dishes: ["豆腐花水煮鱼", "山珍脆鲩", "乘云·上上签", "手作红糖糍粑", "椿庐宫保多宝鱼", "百香果益力多", "口水鸡", "鱼羊上上鲜", "蜜瓜樟茶鸭", "清汤鸡豆花", "鲜花妙龄乳鸽", "火焰澳洲牛小排"],
    ambiance: ["高端精致", "安静私密"],
    facilities: ["有包厢", "有大桌", "付费停车", "可预订"],
    deals: [
      { name: "午市豆花水煮鱼双人餐", price: "¥393" },
      { name: "骏马迎椿双人餐", price: "¥493" },
    ],
  },
  {
    name: "客家围·客家菜 (福田中洲湾店)",
    type: "客家菜",
    category: "meal",
    budget: "~￥88/人",
    rating: "4.3",
    image: "/客家围客家菜.webp",
    dishes: ["招牌客家窑鸡", "客家酿豆腐(6块)", "红葱肉沫蒸鸡蛋", "金沙咸香鸡", "石窝金汁豆腐", "白灼牛百叶", "手撕东海黄花鱼", "桂花糯米藕", "蒜蓉粉丝蒸凤尾虾", "猪油渣炒连州菜心"],
    ambiance: ["随意休闲"],
    facilities: ["有包厢", "免费停车", "可带宠物"],
    deals: [
      { name: "超值工作餐｜双人套餐", price: "¥143" },
      { name: "藕断丝连｜桂花糯米藕", price: "¥5.5" },
    ],
  },
  {
    name: "Peet's Coffee 皮爷咖啡 (中洲湾店)",
    type: "咖啡/甜点",
    category: "light",
    budget: "~￥40/人",
    rating: "4.7",
    image: "/Peet's Coffee.webp",
    dishes: ["拿铁咖啡", "经典栗子蛋糕", "芝士分子拿铁"],
    ambiance: ["小清新", "安静私密"],
    facilities: [],
    deals: [
      { name: "【招牌必喝】经典咖啡双杯", price: "¥45.15" },
      { name: "【新人专享】第一杯招牌咖啡", price: "¥19.48" },
    ],
  },
  {
    name: "1-7Bread (中洲湾店)",
    type: "面包/烘焙",
    category: "light",
    budget: "~￥29/人",
    rating: "4.3",
    image: "/1-7Bread.webp",
    dishes: ["豆乳咸蛋黄迷你吐司", "日式餐包", "白玉红豆"],
    ambiance: ["小清新", "随意休闲"],
    facilities: [],
    deals: [
      { name: "低油低糖豆乳吐司", price: "¥19.9" },
      { name: "招牌面包二选一", price: "¥5.9" },
    ],
  },
  {
    name: "霸王茶姬 (广东深圳福田中洲湾店)",
    type: "茶饮",
    category: "light",
    budget: "~￥19/人",
    rating: "4.1",
    image: "/霸王茶姬.webp",
    dishes: ["伯牙绝弦", "桂馥兰香", "桂子飘飘", "去云南·玫瑰普洱", "山野栀子", "白雾红尘", "春日桃桃", "花田乌龙", "新品纯茶", "粉芭乐"],
    ambiance: ["随意休闲", "热闹有活力"],
    facilities: [],
    deals: [],
  },
  {
    name: "野人先生现做冰淇淋",
    type: "冰淇淋",
    category: "light",
    budget: "~￥30/人",
    rating: "4.4",
    image: "",
    dishes: ["开心果冰淇淋", "榛子巧克力冰淇淋", "五常大米", "抹茶冰淇淋", "榴莲冰淇淋", "山楂冰淇淋", "羽衣甘蓝青苹果酸奶"],
    ambiance: ["随意休闲"],
    facilities: ["付费停车", "有宝宝椅"],
    deals: [],
  },
  {
    name: "KOI Thé (福田中洲湾店)",
    type: "茶饮",
    category: "light",
    budget: "~￥22/人",
    rating: "4.7",
    image: "/KOI-The.png",
    dishes: ["黄金珍奶", "饼干奶茶(原创)", "浆果乳酪奶绿", "烤糖粉粿冬瓜金乌龙", "金乌龙", "黑金乳酪金乌龙奶茶", "波霸黑糖轻乳茶", "白玉黑金乳酪金乌龙奶茶"],
    ambiance: ["随意休闲", "小清新"],
    facilities: ["付费停车"],
    deals: [
      { name: "KOI招牌2选1（大杯）", price: "¥21.8" },
      { name: "饼干奶茶（大杯）", price: "¥26.8" },
    ],
  },
  {
    name: "灼灼木自助寿司·任点任食 (中洲湾店)",
    type: "日料/自助寿司",
    category: "meal",
    budget: "~￥64/人",
    rating: "3.9",
    image: "/灼灼木寿司.png",
    dishes: ["三文鱼寿司", "火炙芝士鳗鱼寿司", "火炙芝士三文鱼寿司", "鳗鱼寿司", "火山熔岩", "三文鱼熔岩", "红蟹子车腚", "北极贝", "甜虾寿司"],
    ambiance: ["随意休闲", "热闹有活力"],
    facilities: ["免费停车", "有宝宝椅", "可带宠物", "可预订"],
    deals: [
      { name: "工作日晚市/周末节假日全天单人自助", price: "¥69" },
      { name: "工作日午市单人任点任食套餐", price: "¥59" },
    ],
  },
];

// 由数据自动生成，无需手动维护
function buildRestaurantContext(): string {
  return RESTAURANTS.map((r, i) => {
    const lines = [
      `${i + 1}. "${r.name}" — ${r.type}`,
      `   category: ${r.category} | budget: ${r.budget} | rating: ${r.rating}`,
      r.image ? `   image: "${r.image}"` : `   image: (无本地图片，请用 picsum.photos 链接)`,
      `   dishes: ${r.dishes.join(', ')}`,
      `   ambiance: [${r.ambiance.join(', ')}]`,
      `   facilities: [${r.facilities.length ? r.facilities.join(', ') : '暂无特殊设施'}]`,
      r.deals.length
        ? `   deals: ${JSON.stringify(r.deals)}`
        : `   deals: []`,
    ];
    return lines.join('\n');
  }).join('\n\n');
}

export const MALL_CONTEXT = `
You are an AI Mall Assistant for "C Future City" (中洲湾 C Future City) located in Futian, Shenzhen.
C Future City is a futuristic mall known for its integration of art, technology, and nature, featuring permanent installations by teamLab and Patrick Blanc.

Mall Structure & Floor Guide:
- B2层: 地铁直达入口，停车场，生活超市，TSUTAYA BOOKSTORE 蔦屋书店（B2-B228，评分4.9，¥73/人，艺术/日本进口书籍、动漫周边、主题打印机，免费停车）
- B1层: 潮流美食街（探鱼、绿茶、野人先生冰淇淋、霸王茶姬、1-7Bread面包店、PURE nfTEA、Peet's Coffee等），潮流零售，POPMART泡泡玛特（B1-57A，评分4.7，盲盒/手办/潮玩，¥194/人），直连地铁
- L1层: 国际品牌旗舰店，teamLab Future Park 艺术科技展（L1中庭，**2026年4月1日开幕，尚未开放**），亚洲顶流女星快闪店（L1中庭，3月2日-3月8日限时）
- L2层: 设计师品牌，生活方式精品店，户外露台花园，寰映影城激光IMAX（L2影院入口，票价¥45起），熊怡怡·娃娃屋（L2，评分4.1，游艺机/娃娃抓机，游戏币100枚¥39.9）
- L3层: 特色餐厅（椿庐精品粤菜、客家围客家菜），VIP中心，活动举办地
- L4层: 高端餐饮，天台花园

Parking: B1/B2停车场，约600个车位，¥6/小时，当日最高¥50

Entertainment & Retail Highlights:
- 寰映影城 (L2): 激光IMAX影厅，票价¥45起，国语2D/IMAX2D，适合观影休闲
- 熊怡怡·娃娃屋 (L2): 娃娃抓机/游艺，100枚游戏币¥39.9，适合亲子/情侣，营业10:00-22:00
- 泡泡玛特POPMART (B1-57A): 盲盒/手办/潮玩，评分4.7，¥194/人，营业10:00-22:00
- TSUTAYA BOOKSTORE蔦屋 (B2-B228): 日式书店，艺术/日本进口书，动漫主题打印机，评分4.9，¥73/人，营业10:00-22:00

Restaurants at C Future City:
${buildRestaurantContext()}
`;

export async function getDiningRecommendation(budget: string, people: number, taste: string): Promise<Restaurant[]> {
  const prompt = `基于以下商场背景：${MALL_CONTEXT}

  用户正在寻找用餐地点：
  - 人均预算：${budget} 元
  - 人数：${people} 人
  - 偏好/需求：${taste || '无特殊要求'}

  请根据以下通用规则，从上方餐厅数据中推荐 2-3 家最合适的餐厅：
  1. 类型匹配：若用户提到"正餐/吃饭/午晚餐"，优先 category=meal；提到"咖啡/下午茶/轻食/甜点"，优先 category=light
  2. 氛围匹配：将用户的氛围偏好与餐厅的 ambiance 标签对比，优先推荐标签重合多的餐厅
  3. 设施匹配：若用户有特殊需求（如需要包厢、可带宠物等），只推荐 facilities 标签中包含该需求的餐厅；不得编造未在 facilities 中列出的设施
  4. 预算匹配：优先推荐人均预算与用户预算相近的餐厅
  5. reason 字段须说明为何该餐厅匹配用户的具体需求，不超过40字

  返回一个合法的 JSON 对象，格式为 {"results": [...]}，数组每项包含：name, image（使用数据中的 image，无则用 picsum.photos 链接）, category, dishes（5-8个）, budget, reason, rating, deals（使用数据中的 deals，无则返回空数组）。

  只返回 JSON，不要任何其他文字。`;

  try {
    const text = await callOpenRouter([{ role: "user", content: prompt }], true);
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : (parsed.results ?? []);
  } catch (e) {
    console.error("Failed to parse dining recommendation JSON", e);
    return [];
  }
}

export async function getStyleAdvice(base64Image: string) {
  const prompt = `基于以下商场背景：${MALL_CONTEXT}
  从图像中分析此人的体型和当前风格。
  推荐中洲湾商场中适合他们的 2-3 个特定服装品牌或店铺。
  建议他们应该寻找什么样的单品（例如，"来自 Public Tokyo 的剪裁精良的西装夹克，可以衬托您的身形"）。请使用中文回答。`;

  const text = await callOpenRouter([{
    role: "user",
    content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: base64Image } },
    ],
  }]);
  return text;
}

// ─── 停车助手 ────────────────────────────────────────────────────────────────

export interface ParkingLevel {
  id: string;
  name: string;
  total: number;
  available: number;
  tag: string;
  fee: string;
}

export interface ParkingReservation {
  level: string;
  spot: string;
  validUntil: Date;
  plateHint?: string;
}

// 模拟实时停车数据（实际项目应接入真实 API）
function generateParkingLevels(): ParkingLevel[] {
  const seed = Math.floor(Date.now() / 30000); // 每30秒刷新一次
  const rng = (min: number, max: number, offset: number) =>
    min + ((seed * 7 + offset * 13) % (max - min));

  return [
    { id: 'B1', name: 'B1 层', total: 200, available: rng(15, 80, 1), tag: '近主入口', fee: '¥6/小时' },
    { id: 'B2', name: 'B2 层', total: 300, available: rng(5, 40, 2),  tag: '近电梯厅', fee: '¥6/小时' },
    { id: 'B3', name: 'B3 层', total: 300, available: rng(60, 200, 3), tag: '新能源专区', fee: '¥6/小时' },
  ];
}

export function getParkingStatus(): ParkingLevel[] {
  return generateParkingLevels();
}

export function makeReservation(levelId: string, plateHint?: string): ParkingReservation {
  const level = generateParkingLevels().find(l => l.id === levelId) ?? generateParkingLevels()[0];
  const row = String.fromCharCode(65 + Math.floor(Math.random() * 6));
  const num = String(Math.floor(Math.random() * 50) + 1).padStart(2, '0');
  return {
    level: level.name,
    spot: `${levelId}-${row}${num}`,
    validUntil: new Date(Date.now() + 20 * 60 * 1000), // 20 分钟有效
    plateHint,
  };
}

export async function getParkingResponse(
  message: string,
  history: { role: 'user' | 'assistant'; text: string }[],
  parkingLevels: ParkingLevel[]
): Promise<string> {
  const statusText = parkingLevels
    .map(l => `${l.name}（${l.tag}）：剩余 ${l.available}/${l.total} 个车位，${l.fee}`)
    .join('\n');

  const historyText = history
    .slice(-6)
    .map(h => `${h.role === 'user' ? '用户' : '助手'}：${h.text}`)
    .join('\n');

  const prompt = `你是中洲湾 C Future City 的专属停车 AI 助手，名叫 Cadence AI。
你非常懂人，能主动帮用户解决停车烦恼，语气友好、简洁，像一个贴心的人，不像机器人。

当前停车场实时数据（每30秒更新）：
${statusText}

停车场规则：
- 首小时 ¥6，之后每小时 ¥6，当日最高 ¥50
- 支持微信/支付宝/信用卡
- 预约车位有效期 20 分钟，超时释放
- 新能源车辆优先停 B3

你的能力：
1. 告诉用户各层实时车位数量和拥挤程度
2. 根据用户 ETA（预计到达时间）推荐最合适的停车层
3. 帮用户预留车位（用户确认后执行）
4. 提供从停车场到商场各区域的步行引导
5. 计算停车费用

对话上下文：
${historyText || '（对话刚开始）'}

用户说：${message}

请用简洁、自然的中文回复。如果用户提到了 ETA 或"快到了"，主动帮他分析哪层最合适并询问是否预留。
如果要帮用户预留车位，在回复末尾加上 [RESERVE:B1] 或 [RESERVE:B2] 或 [RESERVE:B3] 触发预定动作（只在用户明确同意预留时使用）。
回复控制在100字以内，口语化。`;

  return await callOpenRouter([{ role: "user", content: prompt }]);
}

// ─────────────────────────────────────────────────────────────────────────────

export async function getChatResponse(message: string) {
  const prompt = `基于以下商场背景：${MALL_CONTEXT}
  用户消息：${message}
  
  你是中洲湾 C Future City 的 Cadence AI 助手。请简洁且乐于助人地回答用户的问题。如果他们正在寻找特定的东西，请尝试将其与商场的店铺或餐厅联系起来。请使用中文回答。`;

  return await callOpenRouter([{ role: "user", content: prompt }]);
}

// ─── 结构化聊天（带建议选项、图片、跳转动作）─────────────────────────────────

export interface StructuredChatResponse {
  text: string;
  suggestions: string[];
  imageUrl?: string;
  action?: 'dining' | 'events' | 'parking';
  actionLabel?: string;
  route?: string[];
}

const IMAGE_SEEDS: Record<string, string> = {
  food: 'restaurant-food',
  coffee: 'coffee-cafe',
  event: 'art-exhibition',
  parking: 'parking-garage',
  fashion: 'fashion-style',
  default: 'shopping-mall',
};

export async function getChatResponseStructured(
  message: string,
  history: { role: 'user' | 'ai'; text: string }[]
): Promise<StructuredChatResponse> {
  const historyText = history
    .slice(-8)
    .map(h => `${h.role === 'user' ? '用户' : 'Cadence'}：${h.text}`)
    .join('\n');

  const isFirstMessage = history.length <= 1;
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const timeContext = hour < 11 ? '早上' : hour < 14 ? '午餐时间' : hour < 17 ? '下午' : hour < 20 ? '傍晚' : '晚上';
  const currentTimeStr = `${hour}:${String(minute).padStart(2, '0')}`;

  const prompt = `你是中洲湾 C Future City 的 Cadence AI 助手，非常贴心、懂人、语气自然友好。现在是${timeContext}，当前时间 ${currentTimeStr}。

商场信息：${MALL_CONTEXT}

对话历史：
${historyText || '（对话刚开始）'}

用户说：${message}

请回复用户，要求：
1. 判断用户是否在请求商场游览路线/行程安排（如"帮我规划路线"、"我有X小时"、"怎么玩"、"安排行程"等），如果是，进入【路线规划模式】；否则进入【普通回复模式】。

【路线规划模式】：
- 先用一句话简短破题（不超过20字）
- 紧接着输出 [ROUTE] 标签，然后列出 3-5 个时间节点，每条格式为：
  ① HH:00-HH:00 做什么（楼层/地点）
  ② HH:00-HH:00 做什么（楼层/地点）
  时间段必须从当前时间 ${currentTimeStr} 开始往后排，根据用户说的总时长和偏好合理分配，午/晚餐时间段推荐具体餐厅
- 加 [SUGGEST:调整时间|换个主题|加入停车提醒]
- 加 [ACTION:dining:去看美食推荐]

【普通回复模式】：
- 正文控制在60字以内，简洁有温度，像朋友聊天
- 加 [SUGGEST:选项A|选项B|选项C]，给出2-3个自然追问选项
- 若内容与餐饮相关，加 [ACTION:dining:去看美食推荐]
- 若内容与活动/展览相关，加 [ACTION:events:查看活动]
- 若内容与停车相关，加 [ACTION:parking:打开停车助手]
- 若适合展示图片，加 [IMG:food] 或 [IMG:coffee] 或 [IMG:event] 或 [IMG:fashion]

只返回纯文字，不要 markdown 格式。

示例（普通）：今天午餐推荐绿茶餐厅，性价比高，环境小清新，适合2-3人聚餐。[IMG:food][ACTION:dining:去看美食推荐][SUGGEST:有没有更高档的选择|能帮我预留车位吗|附近有什么活动]
示例（路线）：好的，帮你规划一条4小时精华路线 ✨ [ROUTE]
① 14:00-15:30 teamLab 艺术科技展（L1中庭）
② 15:30-16:00 野人先生冰淇淋 + 逛B1潮流区（B1）
③ 16:00-17:00 探鱼晚餐（B1美食街）
④ 17:00-18:00 露台花园 + 打卡装置艺术（L2）
[ACTION:dining:去看美食推荐][SUGGEST:我有小朋友怎么调整|偏重购物怎么规划|帮我预留停车位]`;

  const raw = await callOpenRouter([{ role: "user", content: prompt }]);

  // 解析结构化标记
  const suggestMatch = raw.match(/\[SUGGEST:([^\]]+)\]/);
  const actionMatch = raw.match(/\[ACTION:(dining|events|parking):([^\]]+)\]/);
  const imgMatch = raw.match(/\[IMG:(\w+)\]/);

  const suggestions = suggestMatch
    ? suggestMatch[1].split('|').map(s => s.trim()).filter(Boolean)
    : [];

  const action = actionMatch?.[1] as StructuredChatResponse['action'];
  const actionLabel = actionMatch?.[2];

  let imageUrl: string | undefined;
  if (imgMatch) {
    const seed = IMAGE_SEEDS[imgMatch[1]] ?? IMAGE_SEEDS.default;
    imageUrl = `https://picsum.photos/seed/${seed}/600/400`;
  }

  // 解析 [ROUTE] 时间线
  let route: string[] | undefined;
  const routeMatch = raw.match(/\[ROUTE\]([\s\S]*?)(?=\[ACTION|SUGGEST|\[|$)/);
  if (routeMatch) {
    route = routeMatch[1]
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && /^[①②③④⑤⑥]/.test(l));
  }

  const text = raw
    .replace(/\[SUGGEST:[^\]]+\]/g, '')
    .replace(/\[ACTION:[^\]]+\]/g, '')
    .replace(/\[IMG:\w+\]/g, '')
    .replace(/\[ROUTE\][\s\S]*?(?=\[|$)/g, '')
    .trim();

  return { text, suggestions, imageUrl, action, actionLabel, route };
}
