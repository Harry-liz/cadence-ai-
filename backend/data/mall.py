from dataclasses import dataclass, field


@dataclass
class Deal:
    name: str
    price: str


@dataclass
class Restaurant:
    name: str
    type: str
    category: str  # 'meal' | 'light'
    budget: str
    rating: str
    image: str
    dishes: list[str]
    ambiance: list[str]
    facilities: list[str]
    deals: list[Deal] = field(default_factory=list)


RESTAURANTS: list[Restaurant] = [
    Restaurant(
        name="探魚·鲜青椒爽麻烤鱼 (福田中洲湾店)",
        type="烤鱼/川湘菜",
        category="meal",
        budget="~￥80/人",
        rating="4.0",
        image="/探鱼.webp",
        dishes=["鲜青椒爽麻烤鱼", "绝绝紫苏牛蛙", "冰粉自由", "黄金组合", "酱香烤鱼", "蒜香烤鱼"],
        ambiance=["小清新", "热闹有活力"],
        facilities=["有大桌", "付费停车", "有宝宝椅"],
        deals=[
            Deal(name="好运无限双人餐", price="¥208"),
            Deal(name="0.1元换购随机好物", price="¥0.1"),
        ],
    ),
    Restaurant(
        name="绿茶餐厅 (福田中洲湾店)",
        type="浙江菜/创意菜",
        category="meal",
        budget="~￥60/人",
        rating="4.1",
        image="/绿茶.webp",
        dishes=["面包诱惑", "粉丝裹虾", "石锅西施豆腐", "绿茶烤鸡", "龙井虾仁"],
        ambiance=["小清新", "随意休闲"],
        facilities=["免费停车", "有宝宝椅", "可预订"],
        deals=[
            Deal(name="面包诱惑美味3人餐", price="¥163"),
            Deal(name="甜宠星期二·面包诱惑", price="¥4.9"),
        ],
    ),
    Restaurant(
        name="椿庐ChunLounge (中洲湾店)",
        type="川菜/精致中餐",
        category="meal",
        budget="~￥219/人",
        rating="4.8",
        image="/椿庐.webp",
        dishes=["豆腐花水煮鱼", "山珍脆鲩", "乘云·上上签", "手作红糖糍粑", "椿庐宫保多宝鱼",
                "百香果益力多", "口水鸡", "鱼羊上上鲜", "蜜瓜樟茶鸭", "清汤鸡豆花",
                "鲜花妙龄乳鸽", "火焰澳洲牛小排"],
        ambiance=["高端精致", "安静私密"],
        facilities=["有包厢", "有大桌", "付费停车", "可预订"],
        deals=[
            Deal(name="午市豆花水煮鱼双人餐", price="¥393"),
            Deal(name="骏马迎椿双人餐", price="¥493"),
        ],
    ),
    Restaurant(
        name="客家围·客家菜 (福田中洲湾店)",
        type="客家菜",
        category="meal",
        budget="~￥88/人",
        rating="4.3",
        image="/客家围客家菜.webp",
        dishes=["招牌客家窑鸡", "客家酿豆腐(6块)", "红葱肉沫蒸鸡蛋", "金沙咸香鸡",
                "石窝金汁豆腐", "白灼牛百叶", "手撕东海黄花鱼", "桂花糯米藕",
                "蒜蓉粉丝蒸凤尾虾", "猪油渣炒连州菜心"],
        ambiance=["随意休闲"],
        facilities=["有包厢", "免费停车", "可带宠物"],
        deals=[
            Deal(name="超值工作餐｜双人套餐", price="¥143"),
            Deal(name="藕断丝连｜桂花糯米藕", price="¥5.5"),
        ],
    ),
    Restaurant(
        name="Peet's Coffee 皮爷咖啡 (中洲湾店)",
        type="咖啡/甜点",
        category="light",
        budget="~￥40/人",
        rating="4.7",
        image="/Peet's Coffee.webp",
        dishes=["拿铁咖啡", "经典栗子蛋糕", "芝士分子拿铁"],
        ambiance=["小清新", "安静私密"],
        facilities=[],
        deals=[
            Deal(name="【招牌必喝】经典咖啡双杯", price="¥45.15"),
            Deal(name="【新人专享】第一杯招牌咖啡", price="¥19.48"),
        ],
    ),
    Restaurant(
        name="1-7Bread (中洲湾店)",
        type="面包/烘焙",
        category="light",
        budget="~￥29/人",
        rating="4.3",
        image="/1-7Bread.webp",
        dishes=["豆乳咸蛋黄迷你吐司", "日式餐包", "白玉红豆"],
        ambiance=["小清新", "随意休闲"],
        facilities=[],
        deals=[
            Deal(name="低油低糖豆乳吐司", price="¥19.9"),
            Deal(name="招牌面包二选一", price="¥5.9"),
        ],
    ),
    Restaurant(
        name="霸王茶姬 (广东深圳福田中洲湾店)",
        type="茶饮",
        category="light",
        budget="~￥19/人",
        rating="4.1",
        image="/霸王茶姬.webp",
        dishes=["伯牙绝弦", "桂馥兰香", "桂子飘飘", "去云南·玫瑰普洱", "山野栀子",
                "白雾红尘", "春日桃桃", "花田乌龙", "新品纯茶", "粉芭乐"],
        ambiance=["随意休闲", "热闹有活力"],
        facilities=[],
        deals=[],
    ),
    Restaurant(
        name="野人先生现做冰淇淋",
        type="冰淇淋",
        category="light",
        budget="~￥30/人",
        rating="4.4",
        image="",
        dishes=["开心果冰淇淋", "榛子巧克力冰淇淋", "五常大米", "抹茶冰淇淋",
                "榴莲冰淇淋", "山楂冰淇淋", "羽衣甘蓝青苹果酸奶"],
        ambiance=["随意休闲"],
        facilities=["付费停车", "有宝宝椅"],
        deals=[],
    ),
    Restaurant(
        name="KOI Thé (福田中洲湾店)",
        type="茶饮",
        category="light",
        budget="~￥22/人",
        rating="4.7",
        image="/KOI-The.png",
        dishes=["黄金珍奶", "饼干奶茶(原创)", "浆果乳酪奶绿", "烤糖粉粿冬瓜金乌龙",
                "金乌龙", "黑金乳酪金乌龙奶茶", "波霸黑糖轻乳茶", "白玉黑金乳酪金乌龙奶茶"],
        ambiance=["随意休闲", "小清新"],
        facilities=["付费停车"],
        deals=[
            Deal(name="KOI招牌2选1（大杯）", price="¥21.8"),
            Deal(name="饼干奶茶（大杯）", price="¥26.8"),
        ],
    ),
    Restaurant(
        name="灼灼木自助寿司·任点任食 (中洲湾店)",
        type="日料/自助寿司",
        category="meal",
        budget="~￥64/人",
        rating="3.9",
        image="/灼灼木寿司.png",
        dishes=["三文鱼寿司", "火炙芝士鳗鱼寿司", "火炙芝士三文鱼寿司", "鳗鱼寿司",
                "火山熔岩", "三文鱼熔岩", "红蟹子车腚", "北极贝", "甜虾寿司"],
        ambiance=["随意休闲", "热闹有活力"],
        facilities=["免费停车", "有宝宝椅", "可带宠物", "可预订"],
        deals=[
            Deal(name="工作日晚市/周末节假日全天单人自助", price="¥69"),
            Deal(name="工作日午市单人任点任食套餐", price="¥59"),
        ],
    ),
]


def build_restaurant_context() -> str:
    lines = []
    for i, r in enumerate(RESTAURANTS):
        image_line = f'image: "{r.image}"' if r.image else 'image: (无本地图片，请用 picsum.photos 链接)'
        deals_str = str([{"name": d.name, "price": d.price} for d in r.deals]) if r.deals else "[]"
        lines.append(
            f'{i + 1}. "{r.name}" — {r.type}\n'
            f'   category: {r.category} | budget: {r.budget} | rating: {r.rating}\n'
            f'   {image_line}\n'
            f'   dishes: {", ".join(r.dishes)}\n'
            f'   ambiance: [{", ".join(r.ambiance)}]\n'
            f'   facilities: [{", ".join(r.facilities) if r.facilities else "暂无特殊设施"}]\n'
            f'   deals: {deals_str}'
        )
    return "\n\n".join(lines)


MALL_CONTEXT = f"""
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
{build_restaurant_context()}
"""
