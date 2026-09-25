import pytest

from app.core.phone import mask_phone, normalize_phone


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("9876543210", "+919876543210"),
        ("098765 43210", "+919876543210"),
        ("+91 98765-43210", "+919876543210"),
        ("919876543210", "+919876543210"),
        ("0091 9876543210", "+919876543210"),
        ("+1 (415) 555-0100", "+14155550100"),
    ],
)
def test_normalize_phone(raw: str, expected: str) -> None:
    assert normalize_phone(raw) == expected


@pytest.mark.parametrize("raw", ["", "12345", "abc", "+0123456789"])
def test_normalize_phone_rejects_garbage(raw: str) -> None:
    with pytest.raises(ValueError):
        normalize_phone(raw)


def test_mask_phone_keeps_only_last_four() -> None:
    assert mask_phone("+919876543210") == "+91 ******3210"
