from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from db.session import get_db
from services.tracking import ensure_tracking_context, safe_commit, save_interaction_event

router = APIRouter(prefix="/api/interactions", tags=["interactions"])


class InteractionEventRequest(BaseModel):
    event_type: str
    target_type: str | None = None
    target_id: str | None = None
    payload: dict = Field(default_factory=dict)
    user_id: str | None = None
    session_id: str | None = None
    channel: str = "web"


class InteractionEventResponse(BaseModel):
    ok: bool = True
    user_id: str | None = None
    session_id: str | None = None


@router.post("/event", response_model=InteractionEventResponse)
async def create_interaction_event(
    req: InteractionEventRequest,
    db: Session = Depends(get_db),
):
    tracking = ensure_tracking_context(
        db,
        user_id=req.user_id,
        session_id=req.session_id,
        channel=req.channel,
    )
    save_interaction_event(
        db,
        session_id=tracking.session_id,
        user_id=tracking.user_id,
        event_type=req.event_type,
        target_type=req.target_type,
        target_id=req.target_id,
        payload=req.payload,
    )
    safe_commit(db)
    return InteractionEventResponse(
        user_id=tracking.user_id,
        session_id=tracking.session_id,
    )
