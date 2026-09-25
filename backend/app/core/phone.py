"""Phone numbers are stored in E.164 (+919876543210)."""

import re

_E164 = re.compile(r"^\+[1-9]\d{7,14}$")


def normalize_phone(raw: str, default_country_code: str = "91") -> str:
    """Normalise user/provider input to E.164. Bare 10-digit Indian numbers get +91.

    Accepts spaces, dashes, brackets, a leading 0 (trunk prefix) or 00 (international prefix).
    Raises ValueError when the result is not a plausible E.164 number.
    """
    s = re.sub(r"[\s\-().]", "", raw or "")
    if s.startswith("00"):
        s = "+" + s[2:]
    elif not s.startswith("+"):
        s = s.lstrip("0")
        if len(s) == 10:
            s = f"+{default_country_code}{s}"
        elif s.startswith(default_country_code) and len(s) == 10 + len(default_country_code):
            s = "+" + s
        else:
            s = "+" + s
    if not _E164.match(s):
        raise ValueError(f"not a valid phone number: {raw!r}")
    return s


def mask_phone(e164: str) -> str:
    """+919876543210 -> +91 ******3210 (for logs and agent-facing lookups)."""
    if len(e164) < 6:
        return "****"
    return f"{e164[:3]} ******{e164[-4:]}"
