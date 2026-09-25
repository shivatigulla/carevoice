"""Seed the database with the configuration a hospital needs to start: one tenant, the six agent
configurations, a demo admin login, and (optionally) a test patient for test calls.

Idempotent — safe to re-run. Run with `npm run db:seed` after `npm run db:push`.

Only configuration is seeded; no fake calls, appointments or metrics.
"""

import asyncio
import logging
import sys
import uuid

from sqlalchemy import text

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import dispose_engine, get_sessionmaker
from app.services.supabase_admin import SupabaseAdmin

log = logging.getLogger("carevoice.seed")

TENANT_SLUG = "demo-hospital"
TENANT_NAME = "CareVoice Demo Hospital"
RECORDINGS_BUCKET = "call-recordings"

SAFETY = (
    "You are a hospital voice assistant. Never diagnose, never prescribe or suggest medication or doses, "
    "and never invent appointment slots, prices, policies or medical instructions: only state what a tool "
    "returned. If the caller describes an emergency (chest pain, breathing difficulty, heavy bleeding, "
    "unconsciousness, suicidal thoughts) tell them to call 108 or come to Emergency immediately and escalate "
    "to a human. Speak the caller's language (Telugu, Hindi or English, code-mixing naturally) and keep "
    "replies short, warm and clear."
)

AGENTS = [
    {
        "key": "reception",
        "name": "Reception",
        "description": "Answers inbound calls, understands the need and routes to the right agent or staff.",
        "allowed_tools": ["lookup_patient", "verify_identity", "handoff", "escalate_to_human", "search_knowledge"],
        "prompt": "Greet the caller, find out why they are calling, and hand off to the right agent.",
    },
    {
        "key": "appointment",
        "name": "Appointment",
        "description": "Books, reschedules and cancels appointments using real doctor availability.",
        "allowed_tools": [
            "lookup_patient", "verify_identity", "find_slots", "hold_slot", "book_appointment",
            "reschedule_appointment", "cancel_appointment", "get_patient_appointments", "handoff",
            "escalate_to_human",
        ],
        "prompt": "Help the caller book, reschedule or cancel. Only offer slots returned by find_slots.",
    },
    {
        "key": "follow_up",
        "name": "Follow-up",
        "description": "Calls patients after visits to check recovery and schedule review visits.",
        "allowed_tools": ["verify_identity", "record_follow_up_outcome", "find_slots", "book_appointment", "escalate_to_human"],
        "prompt": "Check how the patient is doing after their visit and record the outcome. Escalate any red flag.",
    },
    {
        "key": "pre_visit",
        "name": "Pre-Visit",
        "description": "Reminds patients before appointments and shares hospital-approved preparation instructions.",
        "allowed_tools": ["verify_identity", "get_patient_appointments", "confirm_appointment", "search_knowledge", "handoff"],
        "prompt": "Remind the patient of their appointment, confirm attendance and share only approved instructions.",
    },
    {
        "key": "caring",
        "name": "Caring",
        "description": "Wellbeing check-ins for chronic-care and elderly patients.",
        "allowed_tools": ["verify_identity", "record_follow_up_outcome", "escalate_to_human"],
        "prompt": "Have a kind, unhurried check-in. Listen, record how they are, and escalate concerns.",
    },
    {
        "key": "console",
        "name": "Console",
        "description": "Staff-facing assistant that answers questions about calls, patients and schedules.",
        "allowed_tools": ["search_calls", "search_knowledge", "get_patient_appointments"],
        "prompt": "Answer hospital staff questions using tool results only.",
    },
]


async def seed() -> None:
    s = get_settings()
    missing = [n for n, v in [("DATABASE_URL", s.database_url), ("SUPABASE_URL", s.supabase_url),
                              ("SUPABASE_SERVICE_ROLE_KEY", s.supabase_service_role_key)] if not v]
    if missing:
        log.error("Missing in backend/.env: %s", ", ".join(missing))
        sys.exit(1)

    sessionmaker = get_sessionmaker()
    async with sessionmaker() as db, db.begin():
        tenant_id: uuid.UUID = (
            await db.execute(
                text(
                    "insert into public.tenants (name, slug) values (:name, :slug) "
                    "on conflict (slug) do update set slug = excluded.slug returning id"
                ),
                {"name": TENANT_NAME, "slug": TENANT_SLUG},
            )
        ).scalar_one()
        log.info("tenant %s (%s)", TENANT_NAME, tenant_id)

        for a in AGENTS:
            await db.execute(
                text(
                    "insert into public.agents (tenant_id, key, name, description, system_prompt, allowed_tools) "
                    "values (:tenant_id, :key, :name, :description, :prompt, :tools) "
                    "on conflict (tenant_id, key) do update set "
                    "name = excluded.name, description = excluded.description, "
                    "system_prompt = excluded.system_prompt, allowed_tools = excluded.allowed_tools"
                ),
                {
                    "tenant_id": tenant_id,
                    "key": a["key"],
                    "name": a["name"],
                    "description": a["description"],
                    "prompt": f"{SAFETY}\n\n{a['prompt']}",
                    "tools": a["allowed_tools"],
                },
            )
        log.info("%d agent configurations", len(AGENTS))

        if s.seed_test_phone:
            await db.execute(
                text(
                    "insert into public.patients (tenant_id, full_name, phone, preferred_language, notes) "
                    "values (:tenant_id, 'Test Patient', :phone, 'te', 'Seeded from SEED_TEST_PHONE for test calls') "
                    "on conflict (tenant_id, phone) do nothing"
                ),
                {"tenant_id": tenant_id, "phone": s.seed_test_phone},
            )
            log.info("test patient %s", s.seed_test_phone)

    admin = SupabaseAdmin()
    await admin.ensure_bucket(RECORDINGS_BUCKET, public=False)
    log.info("storage bucket %s", RECORDINGS_BUCKET)

    if s.demo_admin_email and s.demo_admin_password:
        user = await admin.find_user_by_email(s.demo_admin_email)
        if user is None:
            user = await admin.create_user(s.demo_admin_email, s.demo_admin_password, {"full_name": "Demo Admin"})
            log.info("created demo admin %s", s.demo_admin_email)
        async with sessionmaker() as db, db.begin():
            await db.execute(
                text(
                    "insert into public.tenant_members (tenant_id, user_id, role, full_name) "
                    "values (:tenant_id, :user_id, 'admin', 'Demo Admin') "
                    "on conflict (tenant_id, user_id) do update set role = 'admin'"
                ),
                {"tenant_id": tenant_id, "user_id": uuid.UUID(user["id"])},
            )
        log.info("demo admin %s is an admin of %s", s.demo_admin_email, TENANT_NAME)
    else:
        log.warning("DEMO_ADMIN_EMAIL / DEMO_ADMIN_PASSWORD not set; no login created")

    await dispose_engine()
    log.info("seed complete")


if __name__ == "__main__":
    configure_logging()
    asyncio.run(seed())
