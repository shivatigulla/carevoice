from app.policy.engine import PolicyEngine, SessionContext, ToolCall

engine = PolicyEngine()


def ctx(tools: set[str], verified: bool = False) -> SessionContext:
    return SessionContext(
        tenant_id="t1", call_id="c1", agent_key="appointment", allowed_tools=frozenset(tools), patient_verified=verified
    )


def test_tool_not_in_agent_config_is_denied() -> None:
    d = engine.evaluate(ctx({"find_slots"}), ToolCall("cancel_appointment", {}))
    assert not d.allowed
    assert "not allowed" in d.reason


def test_patient_tool_requires_verification() -> None:
    d = engine.evaluate(ctx({"book_appointment"}), ToolCall("book_appointment", {}))
    assert not d.allowed
    assert d.required_first == ("verify_identity",)


def test_verified_caller_may_book() -> None:
    assert engine.evaluate(ctx({"book_appointment"}, verified=True), ToolCall("book_appointment", {})).allowed


def test_non_patient_tool_needs_no_verification() -> None:
    assert engine.evaluate(ctx({"find_slots"}), ToolCall("find_slots", {})).allowed
