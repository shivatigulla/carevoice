import pytest
from pydantic import ValidationError

from app.services.post_call import CallDecision


def test_valid_decision() -> None:
    d = CallDecision.model_validate_json('{"booked_slot_code": "S3", "confirmed_existing": false, "reason": "fever"}')
    assert d.booked_slot_code == "S3"


@pytest.mark.parametrize("code", ["DROP TABLE", "S", "3", "slot-1", "S12345"])
def test_rejects_anything_but_offered_slot_codes(code: str) -> None:
    with pytest.raises(ValidationError):
        CallDecision(booked_slot_code=code)


def test_extra_fields_ignored_and_defaults_safe() -> None:
    d = CallDecision.model_validate({"unexpected": "x"})
    assert d.booked_slot_code is None and d.confirmed_existing is False
