import pytest

from app.core.config import Settings


@pytest.mark.parametrize(
    "raw",
    [
        "postgresql://u:p@host:5432/postgres",
        "postgres://u:p@host:5432/postgres",
        "postgresql+asyncpg://u:p@host:5432/postgres",
    ],
)
def test_database_url_is_rewritten_for_asyncpg(raw: str) -> None:
    assert Settings(database_url=raw).async_database_url == "postgresql+asyncpg://u:p@host:5432/postgres"


def test_empty_database_url_stays_empty() -> None:
    assert Settings(database_url="").async_database_url == ""


def test_cors_origins_are_split_and_trimmed() -> None:
    s = Settings(cors_origins=" http://a.test , http://b.test,, ")
    assert s.cors_origin_list == ["http://a.test", "http://b.test"]


def test_defaults_match_spec() -> None:
    s = Settings()
    assert s.openai_model == "gpt-4.1-mini"
    assert s.sarvam_stt_model == "saaras:v3"
    assert s.sarvam_tts_model == "bulbul:v3"
    assert s.tz == "Asia/Kolkata"


def test_bolna_agent_id_accepts_page_url() -> None:
    url = "https://platform.bolna.ai/agents/aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb?tab=prompt"
    assert Settings(bolna_agent_id=url).bolna_agent_id == "aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb"
