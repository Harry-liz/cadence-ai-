import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.openrouter import call_openrouter
from data.mall import MALL_CONTEXT, RESTAURANTS

router = APIRouter(prefix="/api/dining", tags=["dining"])


class DiningRequest(BaseModel):
    budget: str
    people: int
    taste: str = ""


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


@router.post("/recommend", response_model=DiningResponse)
async def recommend(req: DiningRequest):
    prompt = f"""基于以下商场背景：{MALL_CONTEXT}

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
        return DiningResponse(results=[RestaurantResult(**r) for r in normalized])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
