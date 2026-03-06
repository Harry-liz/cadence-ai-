from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.openrouter import call_openrouter

router = APIRouter(prefix="/api/events", tags=["events"])


class ItineraryRequest(BaseModel):
    event_id: str
    event_title: str
    event_location: str
    event_time: str
    event_details: list[str] = []
    scene: str          # 例如：亲子、约会、独自打卡
    arrive_time: str    # 例如：下午2点


class ItineraryResponse(BaseModel):
    steps: list[str]
    tip: str


@router.post("/itinerary", response_model=ItineraryResponse)
async def generate_itinerary(req: ItineraryRequest):
    details_text = "\n".join(f"- {d}" for d in req.event_details) if req.event_details else "暂无详情"

    prompt = f"""你是中洲湾 C Future City 的 Cadence AI 助手，帮用户规划参加活动的当天行程。

活动信息：
- 活动名称：{req.event_title}
- 活动地点：{req.event_location}
- 活动时间：{req.event_time}
- 活动详情：
{details_text}

用户场景：{req.scene}
计划到达时间：{req.arrive_time}

请为用户生成一份简洁、贴心的当天行程安排，要求：
1. 输出 3-5 个时间节点，每条格式为：「HH:00 做什么（地点/楼层）」，时间从{req.arrive_time}开始排
2. 结合商场其他体验（餐饮、购物、拍照打卡等）穿插进去，让整天更丰富
3. 根据用户场景（{req.scene}）调整推荐侧重点
4. 最后给一句贴心小提示（tip），例如停车、最佳打卡时间、避开人流等实用建议

只输出 JSON，格式如下，不要其他内容：
{{
  "steps": [
    "14:00 抵达 L1 中庭，优先体验 {req.event_title} 核心装置",
    "15:30 前往 B1 美食街，推荐探鱼或绿茶餐厅",
    "16:30 逛 L2-L3 潮流品牌区，顺路拍露台打卡照",
    "17:30 在野人先生买一份下午茶，边走边逛"
  ],
  "tip": "周末人流较多，建议 14:00 前到达可享受最佳体验，停车推荐走东侧入口。"
}}"""

    try:
        import json, re
        raw = await call_openrouter([{"role": "user", "content": prompt}])

        json_match = re.search(r'\{[\s\S]*\}', raw)
        if not json_match:
            raise ValueError("AI 未返回有效 JSON")
        data = json.loads(json_match.group())
        steps = data.get("steps", [])
        tip = data.get("tip", "")
        return ItineraryResponse(steps=steps, tip=tip)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
