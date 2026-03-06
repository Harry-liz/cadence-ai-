import math
import random
import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.openrouter import call_openrouter

router = APIRouter(prefix="/api/parking", tags=["parking"])


# ── Data Models ────────────────────────────────────────────────────────────────

class ParkingLevel(BaseModel):
    id: str
    name: str
    total: int
    available: int
    tag: str
    fee: str


class ParkingStatusResponse(BaseModel):
    levels: list[ParkingLevel]


class ParkingReservation(BaseModel):
    level: str
    spot: str
    valid_until: str  # ISO string
    plate_hint: str | None = None


class ReserveRequest(BaseModel):
    level_id: str
    plate_hint: str | None = None


class ParkingChatRequest(BaseModel):
    message: str
    history: list[dict] = []
    parking_levels: list[dict] = []


class ParkingChatResponse(BaseModel):
    text: str
    reserve_level: str | None = None  # e.g. "B1", "B2", "B3" — triggers reservation on frontend


# ── Helpers ────────────────────────────────────────────────────────────────────

def generate_parking_levels() -> list[ParkingLevel]:
    seed = math.floor(time.time() / 30)

    def rng(min_v: int, max_v: int, offset: int) -> int:
        return min_v + ((seed * 7 + offset * 13) % (max_v - min_v))

    return [
        ParkingLevel(id="B1", name="B1 层", total=200, available=rng(15, 80, 1), tag="近主入口", fee="¥6/小时"),
        ParkingLevel(id="B2", name="B2 层", total=300, available=rng(5, 40, 2),  tag="近电梯厅", fee="¥6/小时"),
        ParkingLevel(id="B3", name="B3 层", total=300, available=rng(60, 200, 3), tag="新能源专区", fee="¥6/小时"),
    ]


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/status", response_model=ParkingStatusResponse)
async def get_status():
    return ParkingStatusResponse(levels=generate_parking_levels())


@router.post("/reserve", response_model=ParkingReservation)
async def reserve(req: ReserveRequest):
    levels = generate_parking_levels()
    level = next((l for l in levels if l.id == req.level_id), levels[0])
    row = chr(65 + random.randint(0, 5))
    num = str(random.randint(1, 50)).zfill(2)

    from datetime import datetime, timezone, timedelta
    valid_until = datetime.now(timezone.utc) + timedelta(minutes=20)

    return ParkingReservation(
        level=level.name,
        spot=f"{req.level_id}-{row}{num}",
        valid_until=valid_until.isoformat(),
        plate_hint=req.plate_hint,
    )


@router.post("/chat", response_model=ParkingChatResponse)
async def chat(req: ParkingChatRequest):
    levels = req.parking_levels or [l.model_dump() for l in generate_parking_levels()]
    status_text = "\n".join(
        f"{l['name']}（{l['tag']}）：剩余 {l['available']}/{l['total']} 个车位，{l['fee']}"
        for l in levels
    )
    history_text = "\n".join(
        f"{'用户' if h['role'] == 'user' else '助手'}：{h['text']}"
        for h in req.history[-6:]
    ) or "（对话刚开始）"

    prompt = f"""你是中洲湾 C Future City 的专属停车 AI 助手，名叫 Cadence AI。
你非常懂人，能主动帮用户解决停车烦恼，语气友好、简洁，像一个贴心的人，不像机器人。

当前停车场实时数据（每30秒更新）：
{status_text}

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
{history_text}

用户说：{req.message}

请用简洁、自然的中文回复。如果用户提到了 ETA 或"快到了"，主动帮他分析哪层最合适并询问是否预留。
如果要帮用户预留车位，在回复末尾加上 [RESERVE:B1] 或 [RESERVE:B2] 或 [RESERVE:B3] 触发预定动作（只在用户明确同意预留时使用）。
回复控制在100字以内，口语化。"""

    try:
        raw = await call_openrouter([{"role": "user", "content": prompt}])
        import re
        reserve_match = re.search(r"\[RESERVE:(B\d)\]", raw)
        clean_text = re.sub(r"\[RESERVE:B\d\]", "", raw).strip()
        return ParkingChatResponse(
            text=clean_text,
            reserve_level=reserve_match.group(1) if reserve_match else None,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
