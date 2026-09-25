from app.services.outbound import detect_language, parse_transcript


def test_parse_bolna_transcript() -> None:
    raw = "assistant: నమస్కారం Priya garu\nuser: హా చెప్పండి\nassistant: Your appointment is tomorrow\nat 10 AM.\nuser: ok"
    turns = parse_transcript(raw)
    assert [w for w, _ in turns] == ["agent", "patient", "agent", "patient"]
    assert turns[2][1] == "Your appointment is tomorrow at 10 AM."


def test_detect_language_by_script() -> None:
    assert detect_language("రేపు వస్తాను") == "te"
    assert detect_language("हाँ मैं आऊँगा") == "hi"
    assert detect_language("yes I will come") == "en"
