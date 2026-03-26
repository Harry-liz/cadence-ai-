import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.openrouter import call_openrouter

router = APIRouter(prefix="/api/voice", tags=["voice"])


class VoiceTranscriptionRequest(BaseModel):
    audio: str
    format: str = "wav"


class VoiceTranscriptionResponse(BaseModel):
    text: str
    language: str | None = None


def _strip_data_url(audio: str) -> str:
    if audio.startswith("data:") and "," in audio:
        return audio.split(",", 1)[1]
    return audio


@router.post("/transcribe", response_model=VoiceTranscriptionResponse)
async def transcribe_voice(req: VoiceTranscriptionRequest):
    prompt = (
        "You are a speech transcription system. Automatically detect the spoken language "
        "from the audio and transcribe it faithfully. Do not translate, summarize, or "
        "rewrite. Preserve the original language and script. If multiple languages are "
        "used, keep them as spoken. Return strict JSON with keys 'text' and 'language'. "
        "Use an empty string when nothing intelligible is spoken."
    )

    try:
        raw = await call_openrouter(
            [{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "input_audio",
                        "input_audio": {
                            "data": _strip_data_url(req.audio),
                            "format": req.format.lower(),
                        },
                    },
                ],
            }],
            json_mode=True,
        )
        payload = json.loads(raw)
    except Exception as exc:
        message = str(exc)
        if "not available in your region" in message.lower():
            raise HTTPException(
                status_code=503,
                detail="当前语音自动识别模型在你所在地区不可用，所以这条自动识别链路暂时无法使用。",
            ) from exc
        raise HTTPException(status_code=500, detail=message) from exc

    text = str(payload.get("text", "")).strip()
    language = payload.get("language")

    return VoiceTranscriptionResponse(
        text=text,
        language=language if isinstance(language, str) and language.strip() else None,
    )
