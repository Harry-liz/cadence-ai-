import re
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from data.mall import MALL_CONTEXT
from db.session import get_db
from services.openrouter import call_openrouter
from services.tracking import ensure_tracking_context, safe_commit, save_message
from services.user_context import build_user_context

router = APIRouter(prefix="/api/chat", tags=["chat"])

IMAGE_SEEDS: dict[str, str] = {
    "food": "restaurant-food",
    "coffee": "coffee-cafe",
    "event": "art-exhibition",
    "parking": "parking-garage",
    "fashion": "fashion-style",
    "default": "shopping-mall",
}


class ChatRequest(BaseModel):
    message: str
    user_id: str | None = None
    session_id: str | None = None


class ChatResponse(BaseModel):
    text: str
    user_id: str | None = None
    session_id: str | None = None


class HistoryItem(BaseModel):
    role: str
    text: str


class StructuredChatRequest(BaseModel):
    message: str
    history: list[HistoryItem] = Field(default_factory=list)
    user_id: str | None = None
    session_id: str | None = None


class StructuredChatResponse(BaseModel):
    text: str
    suggestions: list[str] = Field(default_factory=list)
    image_url: str | None = None
    action: str | None = None
    action_label: str | None = None
    route: list[str] | None = None
    user_id: str | None = None
    session_id: str | None = None


def build_fallback_chat(message: str) -> StructuredChatResponse:
    if any(word in message for word in ["活动", "展", "快闪"]):
        return StructuredChatResponse(
            text="今天可以先去看 L1 中庭活动，再顺路安排吃饭。我也可以继续帮你排一条轻量路线。",
            suggestions=["今天有什么活动", "帮我规划 2 小时路线", "顺路吃什么"],
            action="events",
            action_label="查看活动",
        )

    if any(word in message for word in ["吃", "餐厅", "咖啡", "奶茶", "晚饭", "午饭"]):
        return StructuredChatResponse(
            text="如果你想先解决吃什么，我可以按场景和预算帮你快速筛餐厅。",
            suggestions=["适合约会的餐厅", "一个人随便吃点", "下午茶推荐"],
            action="dining",
            action_label="去看美食推荐",
        )

    if any(word in message for word in ["路线", "安排", "2小时", "3小时", "怎么玩"]):
        return StructuredChatResponse(
            text="我可以帮你安排一条轻量路线，告诉我你有多久、几个人来就行。",
            suggestions=["我有 2 小时", "带小孩来玩", "两个人约会怎么安排"],
        )

    return StructuredChatResponse(
        text="我在，这会儿可能有点忙。你也可以直接告诉我你想看活动、找餐厅，还是规划今天的路线。",
        suggestions=["今天有什么活动", "推荐一家餐厅", "帮我安排今天"],
    )


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest, db: Session = Depends(get_db)):
    tracking = ensure_tracking_context(
        db,
        user_id=req.user_id,
        session_id=req.session_id,
    )
    save_message(db, session_id=tracking.session_id, role="user", content=req.message, intent="chat")
    user_context = build_user_context(
        db,
        user_id=tracking.user_id,
        session_id=tracking.session_id,
    )
    user_context_block = user_context or "暂无可用用户历史。"

    prompt = f"""基于以下商场背景：{MALL_CONTEXT}

用户历史上下文：
{user_context_block}

用户消息：{req.message}

你是中洲湾 C Future City 的 Cadence AI 助手。请简洁且乐于助人地回答用户的问题。如果他们正在寻找特定的东西，请尝试将其与商场的店铺或餐厅联系起来。可以参考用户历史上下文做轻量个性化，但如果和本轮明确需求冲突，优先本轮需求。请使用中文回答。"""

    try:
        text = await call_openrouter([{"role": "user", "content": prompt}])
        save_message(
            db,
            session_id=tracking.session_id,
            role="assistant",
            content=text,
            intent="chat",
            metadata={"source": "openrouter", "used_user_context": bool(user_context)},
        )
        safe_commit(db)
        return ChatResponse(text=text, user_id=tracking.user_id, session_id=tracking.session_id)
    except Exception:
        fallback = build_fallback_chat(req.message)
        save_message(
            db,
            session_id=tracking.session_id,
            role="assistant",
            content=fallback.text,
            intent="chat",
            metadata={"source": "fallback", "used_user_context": bool(user_context)},
        )
        safe_commit(db)
        return ChatResponse(text=fallback.text, user_id=tracking.user_id, session_id=tracking.session_id)


@router.post("/structured", response_model=StructuredChatResponse)
async def chat_structured(req: StructuredChatRequest, db: Session = Depends(get_db)):
    tracking = ensure_tracking_context(
        db,
        user_id=req.user_id,
        session_id=req.session_id,
    )
    save_message(
        db,
        session_id=tracking.session_id,
        role="user",
        content=req.message,
        intent="structured_chat",
        metadata={"history_length": len(req.history)},
    )
    user_context = build_user_context(
        db,
        user_id=tracking.user_id,
        session_id=tracking.session_id,
    )
    user_context_block = user_context or "暂无可用用户历史。"

    history_text = "\n".join(
        f"{'用户' if h.role == 'user' else 'Cadence'}：{h.text}"
        for h in req.history[-8:]
    ) or "（对话刚开始）"

    now = datetime.now(timezone(timedelta(hours=8)))
    hour = now.hour
    minute = now.minute
    if hour < 11:
        time_context = "早上"
    elif hour < 14:
        time_context = "午餐时间"
    elif hour < 17:
        time_context = "下午"
    elif hour < 20:
        time_context = "傍晚"
    else:
        time_context = "晚上"
    current_time_str = f"{hour}:{str(minute).zfill(2)}"

    prompt = f"""你是中洲湾 C Future City 的 Cadence AI 助手，非常贴心、懂人、语气自然友好。现在是{time_context}，当前时间 {current_time_str}。

商场信息：{MALL_CONTEXT}

用户历史上下文：
{user_context_block}

对话历史：
{history_text}

用户说：{req.message}

请回复用户，要求：
1. 判断用户是否在请求商场游览路线/行程安排（如"帮我规划路线"、"我有X小时"、"怎么玩"、"安排行程"等），如果是，进入【路线规划模式】；否则进入【普通回复模式】。

【路线规划模式】：
- 先用一句话简短破题（不超过20字）
- 紧接着输出 [ROUTE] 标签，然后列出 3-5 个时间节点，每条格式为：
  ① HH:00-HH:00 做什么（楼层/地点）
  ② HH:00-HH:00 做什么（楼层/地点）
  时间段必须从当前时间 {current_time_str} 开始往后排，根据用户说的总时长和偏好合理分配，午/晚餐时间段推荐具体餐厅
- 加 [SUGGEST:调整时间|换个主题|加入停车提醒]
- 加 [ACTION:dining:去看美食推荐]

【普通回复模式】：
- 正文控制在60字以内，简洁有温度，像朋友聊天
- 加 [SUGGEST:选项A|选项B|选项C]，给出2-3个自然追问选项
- 若内容与餐饮相关，加 [ACTION:dining:去看美食推荐]
- 若内容与活动/展览相关，加 [ACTION:events:查看活动]
- 若内容与停车相关，加 [ACTION:parking:打开停车助手]
- 若适合展示图片，加 [IMG:food] 或 [IMG:coffee] 或 [IMG:event] 或 [IMG:fashion]
- 可参考“用户历史上下文”做轻量个性化，但如果与当前用户刚说的话不一致，优先当前用户的话

只返回纯文字，不要 markdown 格式。

示例（普通）：今天午餐推荐绿茶餐厅，性价比高，环境小清新，适合2-3人聚餐。[IMG:food][ACTION:dining:去看美食推荐][SUGGEST:有没有更高档的选择|能帮我预留车位吗|附近有什么活动]
示例（路线）：好的，帮你规划一条4小时精华路线 ✨ [ROUTE]
① 14:00-15:30 teamLab 艺术科技展（L1中庭）
② 15:30-16:00 野人先生冰淇淋 + 逛B1潮流区（B1）
③ 16:00-17:00 探鱼晚餐（B1美食街）
④ 17:00-18:00 露台花园 + 打卡装置艺术（L2）
[ACTION:dining:去看美食推荐][SUGGEST:我有小朋友怎么调整|偏重购物怎么规划|帮我预留停车位]"""

    try:
        raw = await call_openrouter([{"role": "user", "content": prompt}])

        suggest_match = re.search(r"\[SUGGEST:([^\]]+)\]", raw)
        action_match = re.search(r"\[ACTION:(dining|events|parking):([^\]]+)\]", raw)
        img_match = re.search(r"\[IMG:(\w+)\]", raw)

        suggestions = [s.strip() for s in suggest_match.group(1).split("|") if s.strip()] if suggest_match else []
        action = action_match.group(1) if action_match else None
        action_label = action_match.group(2) if action_match else None

        image_url = None
        if img_match:
            seed = IMAGE_SEEDS.get(img_match.group(1), IMAGE_SEEDS["default"])
            image_url = f"https://picsum.photos/seed/{seed}/600/400"

        route = None
        route_match = re.search(r"\[ROUTE\]([\s\S]*?)(?=\[ACTION|\[SUGGEST|\[|$)", raw)
        if route_match:
            route = [
                line.strip() for line in route_match.group(1).split("\n")
                if line.strip() and line.strip()[0] in "①②③④⑤⑥"
            ]

        text = re.sub(r"\[SUGGEST:[^\]]+\]", "", raw)
        text = re.sub(r"\[ACTION:[^\]]+\]", "", text)
        text = re.sub(r"\[IMG:\w+\]", "", text)
        text = re.sub(r"\[ROUTE\][\s\S]*?(?=\[|$)", "", text).strip()

        save_message(
            db,
            session_id=tracking.session_id,
            role="assistant",
            content=text,
            intent="structured_chat",
            metadata={
                "source": "openrouter",
                "action": action,
                "suggestions": suggestions,
                "route": route,
                "used_user_context": bool(user_context),
            },
        )
        safe_commit(db)

        return StructuredChatResponse(
            text=text,
            suggestions=suggestions,
            image_url=image_url,
            action=action,
            action_label=action_label,
            route=route,
            user_id=tracking.user_id,
            session_id=tracking.session_id,
        )
    except Exception:
        fallback = build_fallback_chat(req.message)
        save_message(
            db,
            session_id=tracking.session_id,
            role="assistant",
            content=fallback.text,
            intent="structured_chat",
            metadata={
                "source": "fallback",
                "suggestions": fallback.suggestions,
                "used_user_context": bool(user_context),
            },
        )
        safe_commit(db)
        fallback.user_id = tracking.user_id
        fallback.session_id = tracking.session_id
        return fallback
