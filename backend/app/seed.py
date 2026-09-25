"""Idempotent seed for the demo hospital. Run with `npm run db:seed` (after `npm run db:push`).

Creates: Sunrise Multispeciality Hospital (Hyderabad), the demo admin login, 7 departments, 10 doctors
with Telugu/Devanagari spellings and weekly schedules, 14 days of slots, 30 patients (patient #1 is
SEED_TEST_PHONE), a set of upcoming appointments, and the 6 agent configurations.

Safe to re-run: existing rows are kept (matched by natural keys), missing ones are added.

Seeded demo patients (other than #1) use +91 555… numbers. No Indian mobile number starts with 5, so
an outbound call can never reach a real person.
"""

import asyncio
import json
import logging
import random
import sys
import uuid
from datetime import date, datetime, time, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.phone import normalize_phone
from app.core.time import IST, utcnow
from app.db.session import dispose_engine, get_sessionmaker
from app.services.slots import ensure_slots
from app.services.supabase_admin import SupabaseAdmin

log = logging.getLogger("carevoice.seed")

TENANT = {
    "slug": "sunrise",
    "name": "Sunrise Multispeciality Hospital",
    "city": "Hyderabad",
    "calling_window_start": time(9, 0),
    "calling_window_end": time(20, 0),
    "recording_disclosure": {
        "te": "నమస్కారం, సన్‌రైజ్ మల్టీస్పెషాలిటీ హాస్పిటల్ నుంచి మాట్లాడుతున్నాం. నాణ్యత కోసం ఈ కాల్ రికార్డ్ చేయబడుతుంది.",
        "hi": "नमस्ते, सनराइज़ मल्टीस्पेशलिटी हॉस्पिटल से बात कर रहे हैं। गुणवत्ता के लिए यह कॉल रिकॉर्ड की जा रही है।",
        "en": "Hello, this is Sunrise Multispeciality Hospital. This call is recorded for quality purposes.",
    },
    "settings": {
        "cancellation_cutoff_hours": 2,
        "max_call_minutes": 8,
        "emergency_keywords": {
            "en": ["chest pain", "can't breathe", "breathing trouble", "unconscious", "heavy bleeding",
                   "fainted", "seizure", "suicide", "kill myself", "stroke"],
            "te": ["గుండె నొప్పి", "ఊపిరి ఆడటం లేదు", "శ్వాస ఆడటం లేదు", "స్పృహ లేదు", "రక్తం ఎక్కువగా",
                   "చనిపోవాలని"],
            "hi": ["सीने में दर्द", "सांस नहीं", "बेहोश", "बहुत खून", "आत्महत्या", "मरना चाहता"],
            "romanized": ["gunde noppi", "swasa ada ledu", "oopiri ada ledu", "spruha ledu", "seene mein dard",
                          "saans nahi", "behosh", "khoon beh raha"],
        },
        "caring_checklist": [
            {"key": "feeling", "en": "How are you feeling today compared to when you went home?",
             "te": "ఇంటికి వెళ్ళినప్పటితో పోలిస్తే ఇప్పుడు ఎలా ఉన్నారు?",
             "hi": "घर जाने के बाद से अब आप कैसा महसूस कर रहे हैं?"},
            {"key": "medicines", "en": "Are you able to take your medicines as the doctor advised?",
             "te": "డాక్టర్ చెప్పినట్లు మందులు వేసుకుంటున్నారా?",
             "hi": "क्या आप डॉक्टर के बताए अनुसार दवाइयाँ ले पा रहे हैं?"},
            {"key": "eating", "en": "Are you eating and drinking normally?",
             "te": "మామూలుగా తింటున్నారా, నీళ్ళు తాగుతున్నారా?",
             "hi": "क्या आप सामान्य रूप से खा-पी रहे हैं?"},
            {"key": "follow_up", "en": "Would you like us to book your follow-up visit?",
             "te": "మీ ఫాలో-అప్ విజిట్ బుక్ చేయమంటారా?",
             "hi": "क्या हम आपकी फॉलो-अप विज़िट बुक कर दें?"},
        ],
        "pronunciation_dict": {"ENT": "E N T", "OPD": "O P D", "Dr.": "Doctor"},
    },
}

DEPARTMENTS = [
    ("General Medicine", "జనరల్ మెడిసిన్", "जनरल मेडिसिन", "Fever, infections, diabetes, BP and general health"),
    ("Cardiology", "కార్డియాలజీ", "कार्डियोलॉजी", "Heart and blood vessel care"),
    ("Orthopedics", "ఆర్థోపెడిక్స్", "ऑर्थोपेडिक्स", "Bones, joints, spine and sports injuries"),
    ("Pediatrics", "పీడియాట్రిక్స్", "पीडियाट्रिक्स", "Care for infants, children and adolescents"),
    ("Gynecology", "గైనకాలజీ", "गायनेकोलॉजी", "Women's health and pregnancy care"),
    ("Dermatology", "డెర్మటాలజీ", "डर्मेटोलॉजी", "Skin, hair and nail conditions"),
    ("ENT", "ఈఎన్‌టీ", "ईएनटी", "Ear, nose and throat"),
]


def _day(start: str, end: str, lunch: tuple[str, str] | None = ("13:00", "14:00")) -> dict[str, str]:
    d = {"start": start, "end": end}
    if lunch:
        d |= {"lunch_start": lunch[0], "lunch_end": lunch[1]}
    return d


def _week(mon_fri: dict[str, str] | None, sat: dict[str, str] | None = None, off: tuple[str, ...] = ()) -> dict[str, Any]:
    days = {k: mon_fri for k in ("mon", "tue", "wed", "thu", "fri")}
    days["sat"] = sat
    days["sun"] = None
    for k in off:
        days[k] = None
    return days


DAY = _day("09:00", "17:00")
MORNING = _day("09:00", "13:00", None)
EVENING = _day("16:00", "20:00", None)

# (name, name_te, name_hi, department, qualification, languages, fee, schedule, slot_minutes)
DOCTORS = [
    ("Dr. Ramesh Reddy", "డా. రమేష్ రెడ్డి", "डॉ. रमेश रेड्डी", "General Medicine", "MBBS, MD (General Medicine)",
     ["te", "en", "hi"], 400, _week(DAY, MORNING), 15),
    ("Dr. Lakshmi Prasanna", "డా. లక్ష్మీ ప్రసన్న", "डॉ. लक्ष्मी प्रसन्ना", "General Medicine", "MBBS, DNB (Family Medicine)",
     ["te", "en"], 350, _week(EVENING, EVENING), 15),
    ("Dr. Srinivas Rao", "డా. శ్రీనివాస్ రావు", "डॉ. श्रीनिवास राव", "Cardiology", "MD, DM (Cardiology)",
     ["te", "en", "hi"], 800, _week(_day("10:00", "16:00"), MORNING, off=("wed",)), 20),
    ("Dr. Anjali Sharma", "డా. అంజలి శర్మ", "डॉ. अंजलि शर्मा", "Cardiology", "MD, DM (Cardiology)",
     ["hi", "en"], 750, _week(_day("11:00", "18:00", ("14:00", "15:00")), None), 20),
    ("Dr. Venkatesh Naidu", "డా. వెంకటేష్ నాయుడు", "डॉ. वेंकटेश नायडू", "Orthopedics", "MS (Orthopedics)",
     ["te", "en"], 600, _week(DAY, MORNING), 15),
    ("Dr. Kavitha Rao", "డా. కవిత రావు", "डॉ. कविता राव", "Pediatrics", "MBBS, MD (Pediatrics)",
     ["te", "en", "hi"], 500, _week(_day("09:30", "15:30"), MORNING), 15),
    ("Dr. Suresh Kumar", "డా. సురేష్ కుమార్", "डॉ. सुरेश कुमार", "Pediatrics", "MBBS, DCH",
     ["te", "hi", "en"], 450, _week(EVENING, EVENING, off=("thu",)), 15),
    ("Dr. Padmaja Reddy", "డా. పద్మజ రెడ్డి", "डॉ. पद्मजा रेड्डी", "Gynecology", "MS (OBG)",
     ["te", "en"], 600, _week(_day("10:00", "17:00"), MORNING), 20),
    ("Dr. Farhan Ali", "డా. ఫర్హాన్ అలీ", "डॉ. फ़रहान अली", "Dermatology", "MD (Dermatology)",
     ["hi", "en", "te"], 550, _week(_day("12:00", "19:00", ("15:00", "16:00")), MORNING, off=("mon",)), 15),
    ("Dr. Madhavi Latha", "డా. మాధవి లత", "डॉ. माधवी लता", "ENT", "MS (ENT)",
     ["te", "en"], 500, _week(DAY, None), 15),
]

# (name, preferred_language, gender, caregiver_name) — patient #1 comes from SEED_TEST_PHONE
PATIENTS = [
    ("Venkata Ramana Murthy", "te", "male", "Srikanth Murthy"),
    ("Lakshmi Devi Kondapalli", "te", "female", "Ravi Kondapalli"),
    ("Srinivas Goud", "te", "male", None),
    ("Padma Priya Chowdary", "te", "female", None),
    ("Ravi Teja Varma", "te", "male", None),
    ("Sai Kiran Reddy", "te", "male", None),
    ("Anusha Yadav", "te", "female", None),
    ("Nagaraju Bandi", "te", "male", "Mounika Bandi"),
    ("Sujatha Rani", "te", "female", None),
    ("Mahesh Kolli", "te", "male", None),
    ("Swathi Naidu", "te", "female", None),
    ("Prakash Rao Gummadi", "te", "male", "Divya Gummadi"),
    ("Bhavani Shankar", "te", "male", None),
    ("Keerthi Reddy", "te", "female", None),
    ("Harika Pasupuleti", "te", "female", None),
    ("Ramakrishna Chary", "te", "male", "Sandeep Chary"),
    ("Vijaya Lakshmi Tadi", "te", "female", None),
    ("Naveen Kumar Tadi", "te", "male", None),
    ("Rajesh Kumar Gupta", "hi", "male", None),
    ("Sunita Sharma", "hi", "female", "Rohit Sharma"),
    ("Amit Verma", "hi", "male", None),
    ("Pooja Agarwal", "hi", "female", None),
    ("Mohammed Imran", "hi", "male", None),
    ("Neha Singh", "hi", "female", None),
    ("Suresh Yadav", "hi", "male", "Kiran Yadav"),
    ("Arjun Menon", "en", "male", None),
    ("Sneha Kapoor", "en", "female", None),
    ("David Raj", "en", "male", None),
    ("Farah Khan", "en", "female", None),
]

VISIT_REASONS = {
    "General Medicine": ["Fever for three days", "Diabetes review", "BP check-up", "General health check"],
    "Cardiology": ["Follow-up after ECG", "Chest discomfort review", "BP medication review"],
    "Orthopedics": ["Knee pain", "Back pain", "Follow-up after fracture"],
    "Pediatrics": ["Child vaccination", "Child fever", "Growth check-up"],
    "Gynecology": ["Routine check-up", "Pregnancy follow-up"],
    "Dermatology": ["Skin rash", "Hair fall"],
    "ENT": ["Ear pain", "Sinus problem", "Throat infection"],
}

SAFETY = (
    "You are a hospital voice assistant. Never diagnose, prescribe or give medical advice. Never invent slots, "
    "doctors, prices, policies or instructions: say only what a tool returned or approved knowledge contains. "
    "If the caller describes an emergency, tell them to call 108 or go to the nearest emergency department now, "
    "and escalate. Reply in the caller's language and mixing style, in at most two short sentences, respectfully "
    "(use 'garu' in Telugu and 'ji' in Hindi)."
)

AGENTS = [
    ("reception", "Reception", "Answers inbound calls, understands why the caller is calling and routes them.",
     "Greet the caller, find out what they need, answer hospital questions from get_hospital_info, and hand off "
     "appointment requests to the Appointment agent.",
     ["get_patient_by_phone", "verify_patient", "get_hospital_info", "list_departments", "record_outcome",
      "escalate", "end_call"]),
    ("appointment", "Appointment", "Books, reschedules and cancels appointments using real doctor availability.",
     "Verify the caller, help them pick a doctor or department, offer at most two real slots, read back the "
     "booking and create it only after a clear yes.",
     ["get_patient_by_phone", "verify_patient", "list_departments", "search_doctors", "get_available_slots",
      "hold_slot", "create_appointment", "get_patient_appointments", "reschedule_appointment",
      "cancel_appointment", "parse_spoken_time", "get_hospital_info", "record_outcome", "escalate", "end_call"]),
    ("follow_up", "Follow-up", "Calls patients about missed visits and callbacks, and reschedules when needed.",
     "Confirm you are speaking to the right person before sharing anything, verify them, explain the purpose "
     "and help them confirm, reschedule or cancel.",
     ["verify_patient", "get_patient_appointments", "get_available_slots", "hold_slot", "create_appointment",
      "reschedule_appointment", "cancel_appointment", "parse_spoken_time", "record_outcome", "escalate",
      "end_call"]),
    ("pre_visit", "Pre-Visit", "Calls the day before a visit to confirm it and share approved preparation steps.",
     "Verify the patient, confirm tomorrow's appointment, and share only approved preparation, document and "
     "arrival instructions.",
     ["verify_patient", "get_patient_appointments", "get_prep_instructions", "get_hospital_info",
      "record_outcome", "escalate", "end_call"]),
    ("caring", "Caring", "Post-discharge check-ins that follow the hospital's checklist and flag concerns.",
     "Check in warmly after discharge, go through the hospital checklist, offer a follow-up booking and "
     "escalate any concern immediately.",
     ["verify_patient", "get_available_slots", "hold_slot", "create_appointment", "record_outcome", "escalate",
      "end_call"]),
    ("console", "Console", "Staff assistant that answers questions and prepares actions for approval.",
     "Help hospital staff with read-only answers and prepare write actions that execute only after staff "
     "approval.",
     ["find_unconfirmed_appointments", "search_patients", "get_patient_overview", "get_doctor_schedule",
      "reschedule_appointment", "cancel_appointment", "create_call_task", "get_stats"]),
]


async def _seed_tenant(db: AsyncSession) -> uuid.UUID:
    t = TENANT
    return (
        await db.execute(
            text(
                "insert into public.tenants (slug, name, city, calling_window_start, calling_window_end, "
                "languages, recording_disclosure, settings) values (:slug, :name, :city, "
                ":cws, :cwe, array['te','hi','en'], "
                "cast(:disc as jsonb), cast(:settings as jsonb)) "
                "on conflict (slug) do update set slug = excluded.slug returning id"
            ),
            {
                "slug": t["slug"], "name": t["name"], "city": t["city"],
                "cws": t["calling_window_start"], "cwe": t["calling_window_end"],
                "disc": json.dumps(t["recording_disclosure"], ensure_ascii=False),
                "settings": json.dumps(t["settings"], ensure_ascii=False),
            },
        )
    ).scalar_one()


async def _seed_departments(db: AsyncSession, tenant_id: uuid.UUID) -> dict[str, uuid.UUID]:
    ids: dict[str, uuid.UUID] = {}
    for name, te, hi, desc in DEPARTMENTS:
        ids[name] = (
            await db.execute(
                text(
                    "insert into public.departments (tenant_id, name, name_te, name_hi, description) "
                    "values (:t, :n, :te, :hi, :d) on conflict (tenant_id, name) do update "
                    "set name_te = excluded.name_te, name_hi = excluded.name_hi returning id"
                ),
                {"t": tenant_id, "n": name, "te": te, "hi": hi, "d": desc},
            )
        ).scalar_one()
    return ids


async def _seed_doctors(db: AsyncSession, tenant_id: uuid.UUID, dept_ids: dict[str, uuid.UUID]) -> None:
    for name, te, hi, dept, qual, langs, fee, schedule, slot_min in DOCTORS:
        await db.execute(
            text(
                "insert into public.doctors (tenant_id, department_id, name, name_te, name_hi, qualification, "
                "languages_spoken, fee, schedule, slot_minutes) values (:t, :d, :n, :te, :hi, :q, :langs, :fee, "
                "cast(:sched as jsonb), :slot) on conflict (tenant_id, name) do nothing"
            ),
            {"t": tenant_id, "d": dept_ids[dept], "n": name, "te": te, "hi": hi, "q": qual, "langs": langs,
             "fee": fee, "sched": json.dumps(schedule), "slot": slot_min},
        )


async def _seed_patients(db: AsyncSession, tenant_id: uuid.UUID, test_phone: str, test_name: str, test_dob: date) -> None:
    rng = random.Random(7)
    rows = [{"mrn": "SUN-0001", "name": test_name, "phone": test_phone, "dob": test_dob, "gender": None,
             "lang": "te", "cg_name": None, "cg_phone": None, "notes": "Test patient (SEED_TEST_PHONE)"}]
    for i, (name, lang, gender, caregiver) in enumerate(PATIENTS, start=2):
        age = rng.randint(62, 80) if caregiver else rng.randint(4, 58) if i % 9 == 0 else rng.randint(21, 58)
        dob = date(date.today().year - age, rng.randint(1, 12), rng.randint(1, 28))
        rows.append({
            "mrn": f"SUN-{i:04d}", "name": name, "phone": f"+9155500000{i:02d}", "dob": dob, "gender": gender,
            "lang": lang, "cg_name": caregiver, "cg_phone": f"+9155500001{i:02d}" if caregiver else None,
            "notes": None,
        })
    await db.execute(
        text(
            "insert into public.patients (tenant_id, mrn, name, phone, dob, gender, preferred_language, "
            "caregiver_name, caregiver_phone, notes) values (:t, :mrn, :name, :phone, :dob, :gender, :lang, "
            ":cg_name, :cg_phone, :notes) on conflict (tenant_id, mrn) where mrn is not null do nothing"
        ),
        [{"t": tenant_id, **r} for r in rows],
    )


async def _seed_agents(db: AsyncSession, tenant_id: uuid.UUID, speaker: str) -> None:
    for type_, display, desc, prompt, tools in AGENTS:
        config = {
            "description": desc,
            "prompt": f"{SAFETY}\n\n{prompt}" if type_ != "console" else prompt,
            "allowed_tools": tools,
            "languages": ["te", "hi", "en"],
            "flow": {},
            "voice": {"speaker": speaker} if speaker else {},
        }
        await db.execute(
            text(
                "insert into public.agents (tenant_id, type, display_name, config) "
                "values (:t, :type, :name, cast(:config as jsonb)) on conflict (tenant_id, type) do nothing"
            ),
            {"t": tenant_id, "type": type_, "name": display, "config": json.dumps(config, ensure_ascii=False)},
        )


async def _seed_appointments(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    """Book upcoming appointments for ~18 patients, only if no future seeded appointments exist yet."""
    existing = (
        await db.execute(
            text("select count(*) from public.appointments where tenant_id = :t and source = 'seed' and starts_at > now()"),
            {"t": tenant_id},
        )
    ).scalar_one()
    if existing:
        return 0

    rng = random.Random(date.today().toordinal())
    patients = (
        await db.execute(text("select id from public.patients where tenant_id = :t and mrn <> 'SUN-0001' order by mrn"),
                         {"t": tenant_id})
    ).scalars().all()
    doctors = (
        await db.execute(
            text("select d.id, dp.name from public.doctors d join public.departments dp on dp.id = d.department_id "
                 "where d.tenant_id = :t"),
            {"t": tenant_id},
        )
    ).all()

    today = utcnow().astimezone(IST).date()
    booked = 0
    for n, patient_id in enumerate(rng.sample(list(patients), k=min(18, len(patients)))):
        doctor_id, dept = doctors[n % len(doctors)]
        day_offset = 0 if n < 6 else rng.randint(1, 6)  # a third of them today, the rest this week
        day_start = datetime.combine(today + timedelta(days=day_offset), datetime.min.time(), IST)
        slot = (
            await db.execute(
                text(
                    "select id, starts_at from public.appointment_slots where doctor_id = :d and status = 'open' "
                    "and starts_at > now() + interval '30 minutes' and starts_at >= :s and starts_at < :e "
                    "order by random() limit 1"
                ),
                {"d": doctor_id, "s": day_start, "e": day_start + timedelta(days=1)},
            )
        ).first()
        if slot is None:
            continue
        await db.execute(text("update public.appointment_slots set status = 'booked' where id = :id"), {"id": slot.id})
        await db.execute(
            text(
                "insert into public.appointments (tenant_id, patient_id, doctor_id, slot_id, starts_at, status, "
                "source, reason) values (:t, :p, :d, :s, :at, :status, 'seed', :reason)"
            ),
            {"t": tenant_id, "p": patient_id, "d": doctor_id, "s": slot.id, "at": slot.starts_at,
             "status": "confirmed" if n % 3 == 0 else "booked", "reason": rng.choice(VISIT_REASONS[dept])},
        )
        booked += 1
    return booked


async def _seed_admin(db: AsyncSession, tenant_id: uuid.UUID, email: str, password: str) -> None:
    admin = SupabaseAdmin()
    user = await admin.find_user_by_email(email)
    if user is None:
        user = await admin.create_user(email, password, {"full_name": "Demo Admin"})
        log.info("created auth user %s", email)
    await db.execute(
        text(
            "insert into public.staff (tenant_id, user_id, role, full_name, email) "
            "values (:t, :u, 'admin', 'Demo Admin', :e) on conflict (tenant_id, user_id) do update set role = 'admin'"
        ),
        {"t": tenant_id, "u": uuid.UUID(user["id"]), "e": email},
    )


async def seed() -> None:
    s = get_settings()
    required = {
        "DATABASE_URL": s.database_url, "SUPABASE_URL": s.supabase_url,
        "SUPABASE_SERVICE_ROLE_KEY": s.supabase_service_role_key, "SEED_TEST_PHONE": s.seed_test_phone,
        "DEMO_ADMIN_EMAIL": s.demo_admin_email, "DEMO_ADMIN_PASSWORD": s.demo_admin_password,
    }
    missing = [k for k, v in required.items() if not v]
    if missing:
        log.error("Missing in backend/.env: %s", ", ".join(missing))
        sys.exit(1)
    try:
        test_phone = normalize_phone(s.seed_test_phone)
    except ValueError as e:
        log.error("SEED_TEST_PHONE: %s", e)
        sys.exit(1)

    async with get_sessionmaker()() as db:
        tenant_id = await _seed_tenant(db)
        log.info("tenant %s (%s)", TENANT["name"], tenant_id)
        dept_ids = await _seed_departments(db, tenant_id)
        await _seed_doctors(db, tenant_id, dept_ids)
        log.info("%d departments, %d doctors", len(DEPARTMENTS), len(DOCTORS))
        await _seed_patients(db, tenant_id, test_phone, s.seed_test_name, s.seed_test_dob)
        log.info("patients ready (patient #1 = %s)", test_phone[:3] + "******" + test_phone[-4:])
        await _seed_agents(db, tenant_id, s.sarvam_speaker)
        await db.commit()

        created = await ensure_slots(db, tenant_id)
        await db.commit()
        log.info("slots: %d new (rolling 14 days)", created)

        booked = await _seed_appointments(db, tenant_id)
        await db.commit()
        log.info("appointments: %d new", booked)

        await _seed_admin(db, tenant_id, s.demo_admin_email, s.demo_admin_password)
        await db.commit()
        log.info("admin login ready: %s", s.demo_admin_email)

    await dispose_engine()
    log.info("seed complete")


if __name__ == "__main__":
    configure_logging()
    asyncio.run(seed())
