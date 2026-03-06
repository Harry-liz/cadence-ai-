from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.openrouter import call_openrouter
from data.mall import MALL_CONTEXT

router = APIRouter(prefix="/api/style", tags=["style"])


class StyleRequest(BaseModel):
    image: str  # base64 data URL, e.g. "data:image/jpeg;base64,..."


class StyleResponse(BaseModel):
    text: str


@router.post("/advice", response_model=StyleResponse)
async def get_advice(req: StyleRequest):
    prompt = f"""基于以下商场背景：{MALL_CONTEXT}
从图像中分析此人的体型和当前风格。
推荐中洲湾商场中适合他们的 2-3 个特定服装品牌或店铺。
建议他们应该寻找什么样的单品（例如，"来自 Public Tokyo 的剪裁精良的西装夹克，可以衬托您的身形"）。请使用中文回答。"""

    try:
        text = await call_openrouter([{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": req.image}},
            ],
        }])
        return StyleResponse(text=text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
