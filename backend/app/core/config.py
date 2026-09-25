"""Application settings, loaded from environment variables / backend/.env."""

from datetime import date
from functools import lru_cache
from typing import Literal

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database (Supabase session pooler URL)
    database_url: str = ""

    # Supabase (service role key is server-side only — never sent to the browser)
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""

    # LLM
    openai_api_key: str = ""
    openai_model: str = "gpt-4.1-mini"
    openai_summary_model: str = "gpt-4.1-mini"

    # Speech
    sarvam_api_key: str = ""
    sarvam_stt_model: str = "saaras:v3"
    sarvam_tts_model: str = "bulbul:v3"
    sarvam_speaker: str = ""

    # Telephony
    telephony_provider: Literal["exotel", "twilio"] = "exotel"
    exotel_sid: str = ""
    exotel_api_key: str = ""
    exotel_api_token: str = ""
    exotel_subdomain: str = "api.exotel.com"
    exophone: str = ""
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_number: str = ""

    # Service wiring
    public_base_url: str = ""
    backend_url: str = "http://localhost:8000"
    internal_api_key: str = ""
    cors_origins: str = Field(default="http://localhost:5173,http://127.0.0.1:5173")

    # Seeding
    seed_test_phone: str = ""
    seed_test_name: str = "Priya Reddy"
    seed_test_dob: date = date(1995, 6, 15)
    demo_admin_email: str = ""
    demo_admin_password: str = ""

    # Cost table (INR) for per-call cost analytics; 0 = not counted
    price_telephony_inr_per_min: float = 0.0
    price_stt_inr_per_sec: float = 0.0
    price_tts_inr_per_1k_chars: float = 0.0
    price_llm_input_inr_per_1m_tokens: float = 0.0
    price_llm_output_inr_per_1m_tokens: float = 0.0

    tz: str = "Asia/Kolkata"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def async_database_url(self) -> str:
        """DATABASE_URL rewritten for SQLAlchemy's asyncpg driver."""
        url = self.database_url.strip()
        for prefix in ("postgresql+asyncpg://", "postgresql://", "postgres://"):
            if url.startswith(prefix):
                return "postgresql+asyncpg://" + url[len(prefix) :]
        return url

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
