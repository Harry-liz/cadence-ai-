import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import CORS_ORIGINS, ENABLE_DATABASE, ROLLUP_IDLE_INTERVAL_SECONDS
from db import SessionLocal
from ingestion.router import router as ingest_router
from routers import chat, dining, style, member, plan, interactions, feedback, voice
from services.rollups import roll_up_idle_sessions
# from routers import parking  # 停车助手功能已停用

logger = logging.getLogger(__name__)


async def _idle_rollup_loop():
    while True:
        try:
            with SessionLocal() as db:
                results = roll_up_idle_sessions(db)
            if results:
                logger.info("Idle session rollup processed %s session(s).", len(results))
        except Exception:
            logger.exception("Idle session rollup failed.")
        await asyncio.sleep(ROLLUP_IDLE_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(_: FastAPI):
    rollup_task: asyncio.Task | None = None
    if ENABLE_DATABASE and ROLLUP_IDLE_INTERVAL_SECONDS > 0:
        rollup_task = asyncio.create_task(_idle_rollup_loop())
    try:
        yield
    finally:
        if rollup_task:
            rollup_task.cancel()
            with suppress(asyncio.CancelledError):
                await rollup_task


app = FastAPI(title="Cadence AI Backend", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)
app.include_router(dining.router)
app.include_router(style.router)
app.include_router(member.router)
app.include_router(plan.router)
app.include_router(interactions.router)
app.include_router(feedback.router)
app.include_router(voice.router)
app.include_router(ingest_router)
# app.include_router(parking.router)  # 停车助手功能已停用


@app.get("/health")
async def health():
    return {"status": "ok"}
