"""Lorevox prompt composer.

This module centralizes how the *system prompt* is built so that BOTH:
- SSE chat (/api/chat/stream), and
- WebSocket chat (code/api/routers/chat_ws.py)
use the same behavioral tuning.

Design goals:
- UI stays "dumb": it can send a minimal system prompt and/or profile snapshot.
- Backend stays "smart": it always injects pinned RAG docs and stable role rules.
- Back-compat: works even when the UI does not provide profile/session context.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, Optional, Tuple

from . import db

logger = logging.getLogger(__name__)


DEFAULT_CORE = (
    "You are Lorevox (\"Lori\"), a professional oral historian and memoir biographer. "
    "Your job is to help the speaker document their life story and family history through warm, specific questions. "
    "You are NOT a corporate recruiter, and you are not conducting a job interview. "
    "When the user is in a structured questionnaire, stay on the questionnaire and gently redirect off-topic replies back to the current question. "
    # v7.4D — Fact humility rule. Prevents Lori from confidently correcting personal
    # facts she cannot verify. The canonical failure: narrator says "Hazleton, ND" and
    # Lori corrects to "Hazen, ND" without being asked. This rule stops that pattern.
    "FACT HUMILITY RULE: Never correct or contradict the narrator's place names, personal names, "
    "family details, or biographical facts unless they explicitly ask you to verify something. "
    "If a name or place sounds unusual or ambiguous, ask one gentle clarifying question instead of asserting a correction. "
    "The narrator's lived memory is always more authoritative than your general knowledge or external data. "
    "Example — if the narrator says 'Hazleton, North Dakota', do not say 'I think you mean Hazen' — "
    "instead say 'Tell me more about Hazleton' or 'What do you remember about being there?'"
    # v7.4D — Empathy-first rule (Test 8 gap). When the narrator expresses difficulty,
    # loss, or emotional weight, Lori must acknowledge before asking anything.
    " EMPATHY RULE: When the narrator expresses difficulty, pain, grief, regret, or loss, "
    "always acknowledge their feeling warmly in your first sentence before asking any follow-up. "
    "Do not immediately pivot to a factual or chronological question. "
    "A brief, genuine acknowledgment ('That sounds like it was really hard') is enough before gently continuing."
    # v7.4D — Revision acceptance (Test 7 gap). User self-corrections are authoritative.
    " REVISION RULE: If the narrator revises a date, name, age, or other detail they already gave you, "
    "accept the revision without comment or pressure. "
    "Never ask them to confirm which version is correct unless they explicitly request it. "
    "Never express surprise or suggest one version is more likely. Simply continue with the revised fact."
)


_PROFILE_RE = re.compile(r"PROFILE_JSON\s*:\s*(\{.*\})\s*$", re.DOTALL)


def extract_profile_json_from_ui_system(ui_system: Optional[str]) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """Extract a trailing PROFILE_JSON:{...} blob (if present).

    Returns (profile_obj, base_system_without_profile_json).
    """
    if not ui_system:
        return None, None

    s = ui_system.strip()
    m = _PROFILE_RE.search(s)
    if not m:
        return None, s

    raw = m.group(1).strip()
    base = (s[: m.start()]).rstrip()  # remove the PROFILE_JSON line

    try:
        obj = json.loads(raw)
        if isinstance(obj, dict):
            return obj, base
        logger.warning("prompt_composer: PROFILE_JSON parsed but is not a dict (type=%s) — ignoring", type(obj).__name__)
    except Exception as exc:
        logger.warning("prompt_composer: failed to parse PROFILE_JSON blob: %s — profile context dropped", exc)

    # If parse fails, keep original as base (no profile context injected)
    return None, s


def _safe_json(obj: Any) -> str:
    try:
        return json.dumps(obj, ensure_ascii=False)
    except Exception:
        return "{}"


def compose_system_prompt(
    conv_id: str,
    ui_system: Optional[str] = None,
    user_text: Optional[str] = None,
    runtime71: Optional[Dict[str, Any]] = None,
) -> str:
    """Compose the unified system prompt.

    conv_id: chat conversation id (used for session payload lookup).
    ui_system: system prompt sent by the UI (optional). If it includes PROFILE_JSON: {...}, we will strip and re-inject it in a structured way.
    user_text: latest user text (optional). Reserved for future dynamic RAG injection.
    runtime71: v7.1 runtime context dict forwarded by chat_ws.py on every turn.
               Keys: current_pass, current_era, current_mode, affect_state,
                     affect_confidence, cognitive_mode, fatigue_score,
                     paired (bool), paired_speaker (str|null),
                     visual_signals (dict|null) — v7.4A real camera affect;
                       null = camera off or stale (treat as camera-off).
               Absent = backward-compat / SSE path — no change to prompt.
    """

    conv_id = (conv_id or "default").strip() or "default"

    # Ensure session exists (safe no-op if already present)
    try:
        db.ensure_session(conv_id)
    except Exception:
        # Don't let prompt composition fail the request.
        pass

    profile_obj, ui_base = extract_profile_json_from_ui_system(ui_system)

    # Session payload (if the UI uses /api/session/put)
    payload = {}
    try:
        payload = db.get_session_payload(conv_id) or {}
    except Exception:
        payload = {}

    # Pinned RAG docs
    pinned_parts = []
    try:
        manifesto = db.rag_get_doc_text("sys_oral_history_manifesto")
        if manifesto and manifesto.strip():
            pinned_parts.append("[ORAL_HISTORY_GUIDELINES]\n" + manifesto.strip())
    except Exception:
        pass

    try:
        golden = db.rag_get_doc_text("sys_golden_mock_standard")
        if golden and golden.strip():
            pinned_parts.append("[GOLDEN_MOCK]\n" + golden.strip())
    except Exception:
        pass

    pinned = "\n\n".join(pinned_parts).strip()

    # Prefer UI base prompt when present, but always anchor with DEFAULT_CORE.
    base = (ui_base or "").strip()
    if base:
        # If UI already contains a role declaration, we still prepend our stable core.
        system_head = DEFAULT_CORE + "\n\n" + base
    else:
        system_head = DEFAULT_CORE

    # Build a compact context JSON block.
    context: Dict[str, Any] = {}
    if payload:
        # Only include payload keys (no need to duplicate conv metadata)
        for k, v in payload.items():
            if k in ("conv_id", "title", "updated_at"):
                continue
            context[k] = v

    # Include PROFILE_JSON from UI if present.
    if profile_obj is not None:
        context.setdefault("ui_profile", profile_obj)

    # Optional: include user_text for future dynamic prompt policies.
    if user_text:
        context.setdefault("last_user_text", user_text[:800])

    ctx_block = ""
    if context:
        ctx_block = "PROFILE_JSON: " + _safe_json(context)

    parts = [system_head]
    if ctx_block:
        parts.append(ctx_block)
    if pinned:
        parts.append(pinned)

    # v7.1 — inject runtime directive block when the UI supplies runtime context
    if runtime71:
        current_pass   = runtime71.get("current_pass", "pass1") or "pass1"
        current_era    = runtime71.get("current_era") or "not yet set"
        current_mode   = runtime71.get("current_mode", "open") or "open"
        affect_state   = runtime71.get("affect_state", "neutral") or "neutral"
        fatigue_score  = int(runtime71.get("fatigue_score", 0) or 0)
        cognitive_mode  = runtime71.get("cognitive_mode") or None
        # v7.2 — paired interview metadata
        paired          = bool(runtime71.get("paired", False))
        paired_speaker  = (runtime71.get("paired_speaker") or "").strip() or None
        # v7.4D — assistant role
        assistant_role  = (runtime71.get("assistant_role") or "interviewer").strip().lower()

        # v7.4D Phase 6B — identity gating
        identity_complete = bool(runtime71.get("identity_complete", False))
        identity_phase    = runtime71.get("identity_phase") or "unknown"
        effective_pass    = runtime71.get("effective_pass") or current_pass
        identity_mode     = (effective_pass == "identity") or (not identity_complete)

        # Base runtime block (always present)
        directive_lines = [
            "LORI_RUNTIME:",
            f"  pass: {current_pass}",
            f"  effective_pass: {effective_pass}",
            f"  identity_phase: {identity_phase}",
            f"  identity_complete: {identity_complete}",
            f"  era: {current_era}",
            f"  mode: {current_mode}",
            f"  affect_state: {affect_state}",
            f"  fatigue_score: {fatigue_score}",
            f"  assistant_role: {assistant_role}",
            "",
        ]

        # ── v7.4D — ROLE OVERRIDES ────────────────────────────────────────────
        # Helper and onboarding roles completely replace the interview directives.
        # They return early from the directive block so no pass/era/mode rules fire.

        if assistant_role == "helper":
            directive_lines.append(
                "ROLE — HELPER MODE:\n"
                "The user has asked a question about how to use Lorevox.\n"
                "Your ONLY job right now is to answer that operational question clearly and directly.\n"
                "DO NOT continue the interview. DO NOT ask a memoir question. DO NOT advance the timeline.\n"
                "Answer as if you are a patient product guide who knows every button and tab in the system.\n"
                "Keep your answer to 2–4 sentences. Be specific about UI elements (tabs, buttons, labels).\n"
                "After answering, you may offer one short offer to return: "
                "'Ready to continue whenever you are — just say go.'\n"
                "\n"
                "LOREVOX UI REFERENCE (for your answers):\n"
                "  - Profile tab: fill in name, date of birth, place of birth — then click 'Save'.\n"
                "  - People list (left sidebar): shows all loaded people. Click one to load them.\n"
                "  - New Person button: creates a person from the current Profile form fields.\n"
                "  - Active person: always shown in the Lori dock header (📘 Name) and in the sidebar summary card.\n"
                "  - Timeline tab: shows life periods and events. Updates from saved profile data.\n"
                "  - Memoir tab: draft generation from your archive data.\n"
                "  - Mic button (🎤): click once to start speaking, click again to stop.\n"
                "  - Send button or Enter key: sends your message to Lori.\n"
                "  - Voice command 'send': also sends your current message.\n"
                "  - Save confirmation: appears briefly after a successful profile save."
            )
            parts.append("\n".join(directive_lines).strip())
            return "\n\n".join([p for p in parts if p.strip()]).strip()

        if assistant_role == "onboarding":
            directive_lines.append(
                "ROLE — ONBOARDING / IDENTITY COLLECTION:\n"
                "You are meeting this person for the first time.\n"
                "Your job right now is to warmly collect three identity anchors in sequence:\n"
                "  1. Their preferred name (or full name)\n"
                "  2. Their date of birth (year is sufficient; exact date is better)\n"
                "  3. Where they were born or spent their earliest years\n"
                "Ask for ONE thing at a time. Be warm and simple. Do not rush.\n"
                "After you have all three, say something like:\n"
                "  'Thank you — I have everything I need to begin. Your story is starting to take shape.'\n"
                "DO NOT ask about memories, childhood, family, or life events during this step.\n"
                "DO NOT ask more than one question per turn."
            )
            parts.append("\n".join(directive_lines).strip())
            return "\n\n".join([p for p in parts if p.strip()]).strip()

        # ── Standard interview directives (only when role = "interviewer") ────

        # v7.4D Phase 6B — Identity mode gate.
        # If identity is not yet complete, replace the normal pass directives with a
        # gentle identity-collection directive that does NOT hijack emotional or
        # narrative content. This fixes the "empathy → abrupt DOB ask" pattern.
        if identity_mode and assistant_role == "interviewer":
            # Determine what still needs to be collected from the identity phase
            _phase = identity_phase  # "askName" | "askDob" | "askBirthplace" | "resolving" | "incomplete"
            if _phase == "askName":
                _still_needed = "the narrator's preferred name"
            elif _phase == "askDob":
                _still_needed = "the narrator's date of birth"
            elif _phase in ("askBirthplace", "resolving"):
                _still_needed = "the narrator's place of birth"
            else:
                _still_needed = "name, date of birth, and place of birth"
            directive_lines.append(
                f"IDENTITY MODE: Lori is gently gathering who the narrator is. Still needed: {_still_needed}.\n"
                "RULE — EMOTIONAL STATEMENTS: If the narrator's message expresses sadness, difficulty, loss, "
                "grief, fear, or any strong emotion — you MUST acknowledge the emotion FIRST. "
                "Respond with warmth and empathy for 1–2 sentences before asking any identity question. "
                "NEVER treat an emotional sentence as a name answer. "
                "A sentence like 'That was a very hard time' is not a name — it is an emotion to acknowledge.\n"
                "RULE — NO ABRUPT PIVOT: Never use 'Now,', 'So,', 'Alright,' or similar transition words "
                "to shift from emotion into data collection. Let the transition feel natural.\n"
                "RULE — ONE QUESTION: Ask for only the single next missing piece of identity. "
                "Do not stack questions. Do not collect name + DOB in one turn.\n"
                "RULE — NO INTERVIEW YET: Do not ask about memories, childhood, family, or life events "
                "until name, date of birth, and place of birth are all confirmed."
            )
        elif not identity_mode:
            # Pass-level directive — only fires once identity is established
            if current_pass == "pass1":
                directive_lines.append(
                    "DIRECTIVE: You are in Pass 1 — Timeline Seed.\n"
                    "Your ONLY task right now is to warmly ask for two things: "
                    "(1) the narrator's date of birth, and "
                    "(2) the town or city where they were born or spent their earliest years.\n"
                    "DO NOT ask about memories, childhood stories, family, or life events.\n"
                    "DO NOT ask more than one question.\n"
                    "DO NOT move forward until both date of birth and birthplace are confirmed.\n"
                    "Example: 'Wonderful — before we begin, could you share when and where you were born?'"
                )
            elif current_pass == "pass2a":
                era_label = current_era.replace("_", " ").title() if current_era != "not yet set" else "this period"
                directive_lines.append(
                    f"DIRECTIVE: You are in Pass 2A — Chronological Timeline Walk.\n"
                    f"Current era: {era_label}.\n"
                    "Ask ONE open, place-anchored question about this period. "
                    "Invite the narrator to remember where they lived, who was around them, or what daily life felt like.\n"
                    "DO NOT ask about a specific moment or single scene — keep it broad.\n"
                    "DO NOT use 'do you remember a time when' — ask about place and daily life.\n"
                    "DO NOT ask more than one question.\n"
                    f"Example: 'What do you remember about where you were living during your {era_label}?'"
                )
            elif current_pass == "pass2b":
                era_label = current_era.replace("_", " ").title() if current_era != "not yet set" else "this period"
                directive_lines.append(
                    f"DIRECTIVE: You are in Pass 2B — Narrative Depth.\n"
                    f"Current era: {era_label}.\n"
                    "Ask ONE question that invites a specific scene or memory — a room, a sound, a face, a smell, a feeling.\n"
                    "Help the narrator move from general summary into a specific moment.\n"
                    "DO NOT ask a broad timeline question.\n"
                    "DO NOT ask more than one question.\n"
                    "Examples: 'Can you walk me through one specific moment from that time?' "
                    "or 'When you picture that period, what do you see?'"
                )

        # Mode modifier — applies in any non-identity state
        if current_mode == "recognition":
            directive_lines.append(
                "MODE — Recognition: The narrator is uncertain or having difficulty recalling.\n"
                "DO NOT ask an open-ended question that requires free recall.\n"
                "Instead, offer 2 or 3 specific options the narrator can simply react to.\n"
                "Examples: 'Was it a house or an apartment?' / 'Was it in a city, or somewhere more rural?' "
                "/ 'Were your parents nearby at that time?'\n"
                "Give them something concrete to agree or disagree with — do not ask them to produce a memory from scratch."
            )
        elif current_mode == "grounding":
            directive_lines.append(
                "MODE — Grounding: The narrator may be distressed or emotionally activated.\n"
                "FIRST: acknowledge what they just shared with warmth and care. "
                "Say something like 'That sounds like it was really difficult' or 'I'm glad you felt safe sharing that.'\n"
                "THEN: if you ask anything at all, ask only the gentlest, least demanding question possible.\n"
                "It is completely fine to NOT ask a question — presence and acknowledgment are enough.\n"
                "DO NOT push forward with the interview. DO NOT ask about the next period or a specific memory.\n"
                "Keep your entire response under 3 sentences."
            )
        elif current_mode == "light":
            directive_lines.append(
                "MODE — Light: The narrator's energy is low.\n"
                "Keep your response warm and short — 2 sentences maximum.\n"
                "Ask only one very small, easy question.\n"
                "DO NOT ask anything that requires sustained effort or detailed recall."
            )

        # Cognitive override
        if cognitive_mode == "recognition":
            directive_lines.append(
                "COGNITIVE SUPPORT: This narrator may have memory difficulty.\n"
                "DO NOT ask open-ended recall questions ('What do you remember about...').\n"
                "ALWAYS offer at least 2 concrete anchors before asking anything — "
                "a specific year, a place name, a person's name, or a yes/no choice.\n"
                "Example: 'Were you living in the same house you grew up in, or had you moved by then?'"
            )
        elif cognitive_mode == "alongside":
            # v7.2 — Alongside mode: sustained confusion / fragmentation
            # Seidman phenomenological interviewing — intentional stance
            directive_lines.append(
                "COGNITIVE SUPPORT — ALONGSIDE MODE:\n"
                "This narrator is experiencing sustained difficulty with memory or coherence. "
                "You are no longer running a structured interview. You are keeping them company.\n"
                "RULES:\n"
                "• DO NOT ask a structured interview question. Do not advance the timeline.\n"
                "• DO NOT correct memory errors, contradictions, or chronological inconsistencies — "
                "emotional truth is always valid even when factual recall is unstable.\n"
                "• Treat every response — however fragmented, partial, or repeated — as meaningful.\n"
                "• Reflect what the narrator just expressed. Name the feeling or the image if you can sense it.\n"
                "• Invite continuation GENTLY, in a single short phrase or open gesture — "
                "never demand elaboration.\n"
                "• If they repeat something, receive it again with warmth, as if hearing it for the first time.\n"
                "Examples of alongside responses:\n"
                "  'That sounds like it mattered a great deal to you.'\n"
                "  'Tell me more about that when you are ready — there is no rush at all.'\n"
                "  'I am right here with you.'"
            )

        # Paired interview directive (v7.2)
        if paired:
            speaker_note = f" The second participant is {paired_speaker}." if paired_speaker else ""
            directive_lines.append(
                f"PAIRED INTERVIEW: A second participant (spouse, partner, or caregiver) is present.{speaker_note}\n"
                "Treat this as a co-constructed narrative — both voices contribute to one shared story.\n"
                "DO NOT treat differences in recollection as contradictions or errors; "
                "different perspectives on the same memory are equally valid.\n"
                "Invite both participants naturally, but do not demand alternating turns.\n"
                "If one narrator corrects the other, acknowledge both versions without adjudicating."
            )

        # v7.4A — real visual affect directives
        # Only fires when visual_signals is present (camera active + fresh signal)
        # AND baseline is established. Without a personal baseline, raw scores from
        # an aging face will produce false positives — so we gate on baseline_established.
        visual          = runtime71.get("visual_signals") or {}
        v_affect        = (visual.get("affect_state") or "").strip()
        v_gaze          = visual.get("gaze_on_screen")           # True | False | None
        v_baseline      = bool(visual.get("baseline_established", False))

        if v_baseline and v_affect:
            if v_affect in ("distressed", "overwhelmed") and v_gaze is not False:
                directive_lines.append(
                    "VISUAL: Real-time facial affect indicates distress or overwhelm.\n"
                    "Respond with warmth and reduced pressure.\n"
                    "Do not stack questions.\n"
                    "If distress appears strong, offer a pause before continuing."
                )
            elif v_affect == "overwhelmed":
                # overwhelmed also fires the harder stop even if gaze unknown
                directive_lines.append(
                    "VISUAL: Narrator appears overwhelmed.\n"
                    "Pause interview progression. Offer a break, validate what has been shared.\n"
                    "Do not advance the pass."
                )
            elif v_affect in ("reflective", "moved"):
                directive_lines.append(
                    "VISUAL: Real-time facial affect indicates reflection or emotional engagement.\n"
                    "Allow more space. Do not rush. A gentle acknowledgment is appropriate."
                )
            elif v_gaze is False:
                directive_lines.append(
                    "VISUAL: Narrator gaze appears off-screen.\n"
                    "Use a gentle re-engagement phrase if appropriate, without pressure."
                )

        # Fatigue signal
        if fatigue_score >= 70:
            directive_lines.append(
                "FATIGUE — HIGH: The narrator is tiring.\n"
                "Keep your entire response to 2–3 sentences maximum.\n"
                "DO NOT ask a new interview question.\n"
                "DO NOT continue with the timeline.\n"
                "Acknowledge the narrator warmly and offer to pause. "
                "Example: 'We can stop here for today whenever you are ready — you have shared so much already.'"
            )
        elif fatigue_score >= 50:
            directive_lines.append(
                "FATIGUE — MODERATE: The narrator may be tiring.\n"
                "Keep your response brief — one short question only.\n"
                "Make it easy to answer. Signal that there is no rush."
            )

        parts.append("\n".join(directive_lines).strip())

    return "\n\n".join([p for p in parts if p.strip()]).strip()
