from typing import Any
import httpx
from config import OPENROUTER_API_KEY, MODEL

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

MessageContent = str | list[dict[str, Any]]


async def call_openrouter(
    messages: list[dict[str, MessageContent]],
    json_mode: bool = False,
) -> str:
    """Calls OpenRouter API and returns the assistant's reply as a string."""
    payload: dict[str, Any] = {
        "model": MODEL,
        "messages": messages,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(OPENROUTER_URL, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()

    return data["choices"][0]["message"]["content"] or ""
