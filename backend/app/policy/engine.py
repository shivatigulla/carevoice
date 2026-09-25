"""Policy Engine: the only path from an LLM tool call to a backend action.

    LLM tool call -> PolicyEngine.evaluate() -> backend service -> DB

It checks that the active agent configuration may use the tool, and that the call-session state
permits it (e.g. caller identity verified before touching patient records). Tool handlers live in
backend services and are registered per tool name.
"""

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ToolCall:
    name: str
    arguments: dict[str, Any]


@dataclass(frozen=True)
class SessionContext:
    tenant_id: str
    call_id: str
    agent_key: str
    allowed_tools: frozenset[str]
    patient_verified: bool = False


@dataclass(frozen=True)
class PolicyDecision:
    allowed: bool
    reason: str = ""
    # What the agent must do first, e.g. ("verify_identity",)
    required_first: tuple[str, ...] = field(default_factory=tuple)


# Tools that read or change patient-specific data need a verified caller.
REQUIRES_VERIFIED_PATIENT = frozenset(
    {"get_patient_appointments", "book_appointment", "reschedule_appointment", "cancel_appointment"}
)


class PolicyEngine:
    def evaluate(self, ctx: SessionContext, call: ToolCall) -> PolicyDecision:
        if call.name not in ctx.allowed_tools:
            return PolicyDecision(False, f"tool {call.name!r} is not allowed for agent {ctx.agent_key!r}")
        if call.name in REQUIRES_VERIFIED_PATIENT and not ctx.patient_verified:
            return PolicyDecision(False, "caller identity not verified", required_first=("verify_identity",))
        return PolicyDecision(True)
