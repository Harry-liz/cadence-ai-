from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import chat, dining, style, member, events
# from routers import parking  # 停车助手功能已停用

app = FastAPI(title="Cadence AI Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)
app.include_router(dining.router)
app.include_router(style.router)
app.include_router(member.router)
app.include_router(events.router)
# app.include_router(parking.router)  # 停车助手功能已停用


@app.get("/health")
async def health():
    return {"status": "ok"}
