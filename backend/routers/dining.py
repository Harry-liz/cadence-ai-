import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from config import MODEL
from db.session import get_db
from services.dining_context import build_dining_context
from services.openrouter import call_openrouter
from services.tracking import (
    ensure_tracking_context,
    safe_commit,
    save_message,
    save_recommendation_result,
)
from services.user_context import build_user_context

router = APIRouter(prefix="/api/dining", tags=["dining"])


class DiningRequest(BaseModel):
    budget: str
    people: int
    taste: str = ""
    user_id: str | None = None
    session_id: str | None = None


class Deal(BaseModel):
    name: str
    price: str


class RestaurantResult(BaseModel):
    name: str
    image: str
    category: str
    dishes: list[str]
    budget: str
    reason: str
    rating: str
    deals: list[Deal]


class DiningResponse(BaseModel):
    results: list[RestaurantResult]
    user_id: str | None = None
    session_id: str | None = None


@router.post("/recommend", response_model=DiningResponse)
async def recommend(req: DiningRequest, db: Session = Depends(get_db)):
    tracking = ensure_tracking_context(
        db,
        user_id=req.user_id,
        session_id=req.session_id,
    )
    save_message(
        db,
        session_id=tracking.session_id,
        role="user",
        content=f"推荐餐厅：预算 {req.budget}，人数 {req.people}，偏好 {req.taste or '无特殊要求'}",
        intent="dining_recommendation",
        metadata={"budget": req.budget, "people": req.people, "taste": req.taste},
    )
    dining_context = build_dining_context(db)
    user_context = build_user_context(
        db,
        user_id=tracking.user_id,
        session_id=tracking.session_id,
    )
    user_context_block = user_context or "暂无可用用户历史。"

    prompt = f"""基于以下商场背景：{dining_context}

用户历史上下文：
{user_context_block}

用户正在寻找用餐地点：
- 人均预算：{req.budget} 元
- 人数：{req.people} 人
- 偏好/需求：{req.taste or '无特殊要求'}

请根据以下通用规则，从上方餐厅数据中推荐 2-3 家最合适的餐厅：
1. 类型匹配：若用户提到"正餐/吃饭/午晚餐"，优先 category=meal；提到"咖啡/下午茶/轻食/甜点"，优先 category=light
2. 氛围匹配：将用户的氛围偏好与餐厅的 ambiance 标签对比，优先推荐标签重合多的餐厅
3. 设施匹配：若用户有特殊需求（如需要包厢、可带宠物等），只推荐 facilities 标签中包含该需求的餐厅；不得编造未在 facilities 中列出的设施
4. 预算匹配：优先推荐人均预算与用户预算相近的餐厅
5. reason 字段须说明为何该餐厅匹配用户的具体需求，不超过40字
6. 可以参考“用户历史上下文”做轻量个性化，但如果和本轮明确需求冲突，优先本轮需求，不要把旧偏好当成硬约束

返回一个合法的 JSON 对象，格式为 {{"results": [...]}}，数组每项包含：name, image（使用数据中的 image，无则用 picsum.photos 链接）, category, dishes（5-8个）, budget, reason, rating, deals（使用数据中的 deals，无则返回空数组）。

只返回 JSON，不要任何其他文字。"""

    try:
        text = await call_openrouter([{"role": "user", "content": prompt}])
        parsed = json.loads(text)
        results = parsed if isinstance(parsed, list) else parsed.get("results", [])
        normalized = [
            {**r, "rating": str(r.get("rating", "")), "budget": str(r.get("budget", ""))}
            for r in results
        ]
        response = DiningResponse(
            results=[RestaurantResult(**r) for r in normalized],
            user_id=tracking.user_id,
            session_id=tracking.session_id,
        )
        save_message(
            db,
            session_id=tracking.session_id,
            role="assistant",
            content=json.dumps(response.model_dump(mode="json"), ensure_ascii=False),
            intent="dining_recommendation",
            metadata={"source": "openrouter", "used_user_context": bool(user_context)},
        )
        save_recommendation_result(
            db,
            session_id=tracking.session_id,
            user_id=tracking.user_id,
            recommendation_type="dining",
            request_payload={
                "budget": req.budget,
                "people": req.people,
                "taste": req.taste,
            },
            result_payload=response.model_dump(mode="json"),
            model_name=MODEL,
        )
        safe_commit(db)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
