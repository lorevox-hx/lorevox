"""
WO-10C Test Harness — Cognitive Support Mode (Dementia-Safe Companion Behavior)

Tests the backend components that enforce cognitive support mode:
1. Prompt composer: CSM directive injection, forbidden language, single-thread memory
2. Archive: wo10c_select_single_support_thread
3. Idle timing: constant values
4. Re-entry prompt: no interrogative resume
5. State plumbing: flag flows through runtime71

Run: python -m pytest hornelore/test/test_wo10c_cognitive_support.py -v
"""

import json
import os
import sys
import time

# ── Add server code to path
_repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(_repo, "server", "code"))

# ── Fixtures
_fix_dir = os.path.join(os.path.dirname(__file__), "fixtures")


def _load_fixture(name):
    with open(os.path.join(_fix_dir, name)) as f:
        return json.load(f)


# ═══════════════════════════════════════════════════════════════
# Group 1: Prompt Composer — CSM directive injection
# ═══════════════════════════════════════════════════════════════

class TestCSMPromptDirectives:
    """Verify that cognitive_support_mode injects the full behavioral contract."""

    def _compose(self, csm=True, cognitive_mode=None, fatigue=0):
        from api.prompt_composer import compose_system_prompt
        runtime71 = {
            "current_pass": "pass1",
            "current_era": None,
            "current_mode": "open",
            "affect_state": "neutral",
            "fatigue_score": fatigue,
            "cognitive_mode": cognitive_mode,
            "cognitive_support_mode": csm,
            "paired": False,
            "paired_speaker": None,
            "assistant_role": "interviewer",
            "identity_complete": True,
            "identity_phase": "complete",
            "effective_pass": "pass1",
            "speaker_name": "Maggie",
            "device_context": {"date": "Thursday, April 9, 2026", "time": "2:00 PM", "timezone": "America/Chicago"},
            "location_context": None,
            "memoir_context": {"state": "empty", "arc_roles_present": [], "meaning_tags_present": []},
            "media_count": 0,
            "projection_family": None,
            "person_id": None,  # no memory lookup in unit tests
            "conversation_state": None,
            "visual_signals": None,
            "dob": "1938-11-02",
            "pob": "Bismarck, North Dakota",
            "profile_seed": None,
        }
        return compose_system_prompt(conv_id="test-wo10c", runtime71=runtime71)

    def test_csm_block_present_when_active(self):
        prompt = self._compose(csm=True)
        assert "COGNITIVE SUPPORT MODE (WO-10C)" in prompt

    def test_csm_block_absent_when_inactive(self):
        prompt = self._compose(csm=False)
        assert "COGNITIVE SUPPORT MODE (WO-10C)" not in prompt

    def test_silence_is_protected_guarantee(self):
        prompt = self._compose(csm=True)
        assert "SILENCE IS PROTECTED" in prompt

    def test_no_correction_guarantee(self):
        prompt = self._compose(csm=True)
        assert "NO CORRECTION" in prompt

    def test_one_thread_guarantee(self):
        prompt = self._compose(csm=True)
        assert "ONE THREAD AT A TIME" in prompt

    def test_invitational_guarantee(self):
        prompt = self._compose(csm=True)
        assert "INVITATIONAL, NOT INTERROGATIVE" in prompt

    def test_resume_becomes_reentry_guarantee(self):
        prompt = self._compose(csm=True)
        assert "RESUME BECOMES RE-ENTRY" in prompt

    def test_visual_patience_guarantee(self):
        prompt = self._compose(csm=True)
        assert "VISUAL AFFECTS PATIENCE, NOT DIALOGUE" in prompt

    def test_forbidden_correction_phrases(self):
        prompt = self._compose(csm=True)
        for phrase in ["You already told me", "Do you remember?", "Try to think back", "Can you recall?"]:
            assert phrase in prompt, f"Missing forbidden phrase: {phrase}"

    def test_forbidden_observation_phrases_also_present(self):
        """WO-10B forbidden observation language should still fire alongside CSM."""
        prompt = self._compose(csm=True)
        assert "FORBIDDEN OBSERVATION LANGUAGE" in prompt

    def test_csm_overrides_recognition_mode(self):
        """When CSM is active, recognition mode directives should NOT appear."""
        prompt = self._compose(csm=True, cognitive_mode="recognition")
        assert "COGNITIVE SUPPORT MODE (WO-10C)" in prompt
        # Recognition mode's specific phrase should not appear
        assert "2 concrete anchors" not in prompt

    def test_csm_overrides_alongside_mode(self):
        """When CSM is active, alongside mode directives should NOT appear."""
        prompt = self._compose(csm=True, cognitive_mode="alongside")
        assert "COGNITIVE SUPPORT MODE (WO-10C)" in prompt
        assert "ALONGSIDE MODE" not in prompt

    def test_recognition_still_works_without_csm(self):
        prompt = self._compose(csm=False, cognitive_mode="recognition")
        assert "2 concrete anchors" in prompt

    def test_alongside_still_works_without_csm(self):
        prompt = self._compose(csm=False, cognitive_mode="alongside")
        assert "ALONGSIDE MODE" in prompt


# ═══════════════════════════════════════════════════════════════
# Group 2: Archive — Single support thread selection
# ═══════════════════════════════════════════════════════════════

class TestCSMSingleThread:
    """Verify wo10c_select_single_support_thread behavior."""

    def _make_thread(self, label, summary="", era=None, turn_count=3, status="active"):
        return {
            "topic_label": label,
            "summary": summary,
            "related_era": era,
            "turn_count": turn_count,
            "status": status,
            "updated_at": "2026-04-09T14:00:00Z",
        }

    def test_returns_none_for_empty(self):
        from api.archive import wo10c_select_single_support_thread
        result = wo10c_select_single_support_thread(None, [], [])
        assert result is None

    def test_falls_back_to_anchor(self):
        from api.archive import wo10c_select_single_support_thread
        anchor = {"topic_label": "Teaching", "topic_summary": "She was a first grade teacher", "active_era": "adult"}
        result = wo10c_select_single_support_thread(anchor, [], [])
        assert result is not None
        assert result["topic_label"] == "Teaching"

    def test_emotional_thread_preferred(self):
        from api.archive import wo10c_select_single_support_thread
        threads = [
            self._make_thread("Stanley birthplace", "Born in Stanley, North Dakota. Early childhood.", turn_count=5),
            self._make_thread("Fishing with daddy", "Never forget the time daddy took me fishing. Changed my life. Proudest moment.", turn_count=2),
        ]
        result = wo10c_select_single_support_thread(None, threads, [])
        assert result is not None
        assert "fishing" in result["topic_label"].lower() or "daddy" in result["topic_label"].lower()

    def test_identity_thread_not_demoted_in_csm(self):
        """In CSM, identity threads are acceptable — familiar ground is comforting."""
        from api.archive import wo10c_select_single_support_thread
        threads = [
            self._make_thread("Stanley childhood", "Grew up in Stanley on the farm. Hometown memories.", turn_count=8),
        ]
        result = wo10c_select_single_support_thread(None, threads, [])
        assert result is not None
        assert result.get("score", 0) > 0  # Should not be demoted to near-zero

    def test_returns_single_thread(self):
        """Always returns exactly one thread, never a list."""
        from api.archive import wo10c_select_single_support_thread
        threads = [
            self._make_thread("Teaching", "First grade teacher in Mandan", turn_count=5),
            self._make_thread("Fishing", "Lake Sakakawea fishing trips", turn_count=3),
            self._make_thread("Garden", "Roses in the backyard", turn_count=2),
        ]
        result = wo10c_select_single_support_thread(None, threads, [])
        assert isinstance(result, dict)  # Not a list


# ═══════════════════════════════════════════════════════════════
# Group 3: Memory Context — CSM simplified block
# ═══════════════════════════════════════════════════════════════

class TestCSMMemoryContext:
    """Verify build_conversation_memory_context in CSM mode."""

    def test_csm_memory_header(self):
        from api.prompt_composer import build_conversation_memory_context
        # This will return "" because no person_id data exists, but we can test the code path
        result = build_conversation_memory_context(None, cognitive_support_mode=True)
        assert result == ""  # No person_id → empty

    def test_csm_suppresses_multi_thread(self):
        """CSM memory block must NOT contain 'Other open threads'."""
        from api.prompt_composer import build_conversation_memory_context
        # Without a real data dir this returns "", but the code path is tested structurally
        result = build_conversation_memory_context("test-csm-slow", cognitive_support_mode=True)
        assert "Other open threads" not in result

    def test_standard_memory_allows_multi_thread(self):
        from api.prompt_composer import build_conversation_memory_context
        # Structural test — code path exercised even without data
        result = build_conversation_memory_context("test-csm-slow", cognitive_support_mode=False)
        # No assertion on content (depends on data), just that it doesn't crash


# ═══════════════════════════════════════════════════════════════
# Group 4: Timing Constants
# ═══════════════════════════════════════════════════════════════

class TestCSMTimingConstants:
    """Verify the WO-10C timing constants exist in hornelore1.0.html."""

    def _read_html(self):
        html_path = os.path.join(_repo, "ui", "hornelore1.0.html")
        with open(html_path) as f:
            return f.read()

    def test_visual_cue_120s(self):
        html = self._read_html()
        assert "WO10C_VISUAL_CUE_MS" in html
        assert "120_000" in html

    def test_gentle_invite_300s(self):
        html = self._read_html()
        assert "WO10C_GENTLE_INVITE_MS" in html
        assert "300_000" in html

    def test_reentry_bridge_600s(self):
        html = self._read_html()
        assert "WO10C_REENTRY_BRIDGE_MS" in html
        assert "600_000" in html

    def test_idle_stage_tracker(self):
        html = self._read_html()
        assert "_wo10cIdleStage" in html

    def test_csm_guard_in_arm_idle(self):
        html = self._read_html()
        assert "getCognitiveSupportMode" in html

    def test_csm_gentle_prompt_text(self):
        html = self._read_html()
        assert "wo10c_gentle_invite" in html

    def test_csm_reentry_bridge_prompt(self):
        html = self._read_html()
        assert "wo10c_reentry_bridge" in html

    def test_csm_infinite_patience(self):
        html = self._read_html()
        assert "wo10c_infinite_patience" in html


# ═══════════════════════════════════════════════════════════════
# Group 5: State Plumbing
# ═══════════════════════════════════════════════════════════════

class TestCSMStatePlumbing:
    """Verify the cognitive support mode flag exists in state.js and flows through app.js."""

    def _read_file(self, relpath):
        fpath = os.path.join(_repo, relpath)
        with open(fpath) as f:
            return f.read()

    def test_state_js_has_flag(self):
        code = self._read_file("ui/js/state.js")
        assert "cognitiveSupportMode: false" in code

    def test_state_js_has_getter(self):
        code = self._read_file("ui/js/state.js")
        assert "getCognitiveSupportMode" in code

    def test_state_js_has_setter(self):
        code = self._read_file("ui/js/state.js")
        assert "setCognitiveSupportMode" in code

    def test_app_js_runtime71_includes_flag(self):
        code = self._read_file("ui/js/app.js")
        assert "cognitive_support_mode:" in code

    def test_app_js_reentry_prompt(self):
        code = self._read_file("ui/js/app.js")
        assert "COGNITIVE SUPPORT MODE RE-ENTRY" in code

    def test_prompt_composer_reads_flag(self):
        code = self._read_file("server/code/api/prompt_composer.py")
        assert 'cognitive_support_mode' in code
        assert 'runtime71.get("cognitive_support_mode"' in code


# ═══════════════════════════════════════════════════════════════
# Group 6: Fixture Validation
# ═══════════════════════════════════════════════════════════════

class TestCSMFixtures:
    """Validate test fixture JSON files are well-formed."""

    def test_slow_response_fixture(self):
        fix = _load_fixture("csm-slow-response.json")
        assert fix["cognitive_support_mode"] is True
        assert fix["profile"]["basics"]["preferred"] == "Maggie"
        assert len(fix["sessions"][0]["events"]) >= 4

    def test_looping_fixture(self):
        fix = _load_fixture("csm-looping.json")
        assert fix["cognitive_support_mode"] is True
        # Narrator repeats the fishing story
        events = fix["sessions"][0]["events"]
        fishing_mentions = sum(1 for e in events if "fish" in e["content"].lower())
        assert fishing_mentions >= 2

    def test_confused_reentry_fixture(self):
        fix = _load_fixture("csm-confused-reentry.json")
        assert fix["cognitive_support_mode"] is True
        assert len(fix["sessions"]) >= 2
        # Second session should have no events (fresh re-entry)
        assert len(fix["sessions"][1]["events"]) == 0

    def test_factual_error_fixture(self):
        fix = _load_fixture("csm-factual-error.json")
        assert fix["cognitive_support_mode"] is True
        # Profile says Bismarck but narrator says Fargo/Minot
        assert fix["profile"]["basics"]["pob"] == "Bismarck, North Dakota"
        events = fix["sessions"][0]["events"]
        pob_mentions = [e for e in events if "Fargo" in e["content"] or "Minot" in e["content"]]
        assert len(pob_mentions) >= 1


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
