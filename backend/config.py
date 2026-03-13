import os
from dotenv import load_dotenv

load_dotenv()


def _env_flag(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
MODEL: str = os.getenv("MODEL", "google/gemini-3-flash-preview")
DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@localhost:5432/cadence_ai",
)
ENABLE_DATABASE: bool = _env_flag("ENABLE_DATABASE", False)


def require_openrouter_api_key() -> str:
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not set. Please add it to backend/.env")
    return OPENROUTER_API_KEY
