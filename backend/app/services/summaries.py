"""Post-call summaries: any finished call with a conversation but no summary gets one from OpenAI."""

import json

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.providers.llm import OpenAIProvider

PROMPT = (
    "Summarise this hospital phone call for the front-desk staff in 2-3 short English sentences: why the call "
    "happened, what the patient said (translate Telugu/Hindi), and the outcome or next step. Do not add anything "
    "that was not said. No medical advice."
)


async def summarize_finished_calls(db: AsyncSession, limit: int = 5) -> int:
    s = get_settings()
    if not s.openai_api_key:
        return 0
    rows = (
        await db.execute(
            text(
                "select c.id, c.intent, c.summary from public.calls c where c.status in ('completed', 'no_answer', 'failed') "
                "and c.ended_at > now() - interval '1 day' and coalesce(c.summary->>'summary_en', '') = '' "
                "and exists (select 1 from public.call_transcripts t where t.call_id = c.id and t.speaker = 'patient') "
                "order by c.ended_at desc limit :n"
            ),
            {"n": limit},
        )
    ).all()
    llm = OpenAIProvider(s)
    for call in rows:
        turns = (
            await db.execute(
                text("select speaker, text from public.call_transcripts where call_id = :c order by start_ms nulls first, created_at"),
                {"c": call.id},
            )
        ).all()
        convo = "\n".join(f"{'Agent' if t.speaker == 'agent' else 'Patient'}: {t.text}" for t in turns)
        summary = await llm.complete(
            [{"role": "system", "content": PROMPT}, {"role": "user", "content": f"Call purpose: {call.intent or 'unknown'}\n\n{convo}"}],
            model=s.openai_summary_model,
        )
        merged = {**(call.summary or {}), "summary_en": summary.strip()}
        await db.execute(
            text("update public.calls set summary = cast(:s as jsonb) where id = :c"),
            {"s": json.dumps(merged, ensure_ascii=False), "c": call.id},
        )
        await db.commit()
    return len(rows)
