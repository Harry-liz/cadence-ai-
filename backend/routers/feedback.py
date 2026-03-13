from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from db.session import get_db
from services.tracking import (
    ensure_tracking_context,
    safe_commit,
    save_feedback,
    save_interaction_event,
)

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


class FeedbackRequest(BaseModel):
    target_type: str
    target_id: str | None = None
    rating: int | None = None
    comment: str | None = None
    payload: dict = Field(default_factory=dict)
    user_id: str | None = None
    session_id: str | None = None
    channel: str = "web"


class FeedbackResponse(BaseModel):
    ok: bool = True
    user_id: str | None = None
    session_id: str | None = None


@router.post("", response_model=FeedbackResponse)
async def create_feedback(
    req: FeedbackRequest,
    db: Session = Depends(get_db),
):
    tracking = ensure_tracking_context(
        db,
        user_id=req.user_id,
        session_id=req.session_id,
        channel=req.channel,
    )

    save_feedback(
        db,
        session_id=tracking.session_id,
        user_id=tracking.user_id,
        target_type=req.target_type,
        target_id=req.target_id,
        rating=req.rating,
        comment=req.comment,
        payload=req.payload,
    )

    save_interaction_event(
        db,
        session_id=tracking.session_id,
        user_id=tracking.user_id,
        event_type="submit_feedback",
        target_type=req.target_type,
        target_id=req.target_id,
        payload={
            "rating": req.rating,
            "comment": req.comment,
            **req.payload,
        },
    )

    safe_commit(db)
    return FeedbackResponse(
        user_id=tracking.user_id,
        session_id=tracking.session_id,
    )
