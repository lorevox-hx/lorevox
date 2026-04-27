"""WO-13 shared feature-flag helper.

One place to ask "is truth-v2 on for {consumer}?" so every router
reads the same env vars. Kept intentionally tiny.

Consumers:
  - 'facts_write'  → LOREVOX_TRUTH_V2
        Phase 4 legacy /api/facts/add write freeze. When on, the
        legacy write endpoint returns 410 Gone.
  - 'profile'      → LOREVOX_TRUTH_V2_PROFILE
        Phase 8 read seam. When on, GET /api/profiles/{id} returns
        a profile assembled from family_truth_promoted instead of
        the raw profiles.profile_json blob.

Default for every consumer is OFF.

WO-LIFE-SPINE-05 / WO-EX-VALIDATE-01 additions:
  - age_validator_enabled()         → LOREVOX_AGE_VALIDATOR
        Runtime age-math plausibility gate in /api/extract-fields.
        When on, extractor annotates items with plausibility_flag and
        drops items marked 'impossible'. Default OFF for pre-test safety.
  - phase_aware_questions_enabled() → LOREVOX_PHASE_AWARE_QUESTIONS
        Interview router uses data/prompts/question_bank.json to pick
        phase-appropriate questions instead of strict sequential DB
        ordering. Default OFF so tomorrow's test sees unchanged flow.
"""

from __future__ import annotations

import os
from typing import Final

_TRUTHY: Final = ("1", "true", "yes", "on")


def _truthy(raw: str | None) -> bool:
    return str(raw or "").strip().lower() in _TRUTHY


def truth_v2_enabled(consumer: str) -> bool:
    """Return True when the truth-v2 path is enabled for ``consumer``.

    Unknown consumers return False so adding a call site in advance of
    wiring its env var is safe.
    """
    if consumer == "facts_write":
        return _truthy(os.environ.get("LOREVOX_TRUTH_V2"))
    if consumer == "profile":
        return _truthy(os.environ.get("LOREVOX_TRUTH_V2_PROFILE"))
    return False


def age_validator_enabled() -> bool:
    """WO-EX-VALIDATE-01. When True, /api/extract-fields runs each item
    through life_spine.validator.validate_fact() and drops any item
    flagged 'impossible'. Default OFF."""
    return _truthy(os.environ.get("LOREVOX_AGE_VALIDATOR"))


def phase_aware_questions_enabled() -> bool:
    """WO-LIFE-SPINE-05. When True, interview router uses the phase-aware
    composer (question_bank.json) to pick the next question when a
    narrator DOB is available. Falls back to sequential DB ordering when
    composer returns None. Default OFF."""
    return _truthy(os.environ.get("LOREVOX_PHASE_AWARE_QUESTIONS"))


def claims_validators_enabled() -> bool:
    """WO-EX-CLAIMS-02. When True, /api/extract-fields runs three
    post-extraction validators: value-shape rejection, relation allowlist,
    and confidence floor. Default ON — these are safe guardrails that only
    drop clearly-bad items."""
    return _truthy(os.environ.get("LOREVOX_CLAIMS_VALIDATORS", "1"))


def twopass_extract_enabled() -> bool:
    """WO-EX-TWOPASS-01. When True, /api/extract-fields uses the two-pass
    extraction pipeline (pass 1: span tagger, pass 2: field classifier)
    instead of single-pass LLM extraction. Falls back to single-pass on
    pass 1 failure. Default OFF."""
    return _truthy(os.environ.get("LOREVOX_TWOPASS_EXTRACT"))


def photo_enabled() -> bool:
    """WO-LORI-PHOTO-SHARED-01. When True, the ``/api/photos`` router is
    mounted and returns live responses. When False, every endpoint under
    the prefix returns 404 (the router is registered but guards each
    handler), so the entire photo surface is invisible to the UI unless
    the operator opts in. Default OFF.

    Phase 2 adds two sibling flags that gate behavior *within* the
    mounted router:
      - LOREVOX_PHOTO_INTAKE  → EXIF + real geocoder + conflict detector
      - LOREVOX_PHOTO_ELICIT  → LLM-tuned prompts + photo_memory extraction
    The Phase 1 router must be on before either Phase 2 flag takes effect.
    """
    return _truthy(os.environ.get("LOREVOX_PHOTO_ENABLED"))


def media_archive_enabled() -> bool:
    """WO-MEDIA-ARCHIVE-01. When True, the ``/api/media-archive``
    router serves live; when False, every endpoint returns 404 (the
    router is mounted but each handler guards itself), so the
    Document Archive surface stays invisible to the UI unless the
    operator opts in.

    This is the curator-side lane for PDFs / scanned documents /
    handwritten notes / genealogy outlines / letters / certificates /
    clippings — separate from Photo Intake which is for memory-prompt
    images shown to narrators.

    Default OFF. Flip via ``LOREVOX_MEDIA_ARCHIVE_ENABLED=1`` in
    ``.env`` then cycle the stack.
    """
    return _truthy(os.environ.get("LOREVOX_MEDIA_ARCHIVE_ENABLED"))


def photo_intake_enabled() -> bool:
    """WO-LORI-PHOTO-INTAKE-01 Phase 2 (partial). When True, the
    ``/api/photos`` upload handler runs EXIF extraction on each incoming
    file and auto-fills date / GPS fields the curator left blank.

    Curator-supplied values always win over EXIF (the handler only fills
    when the form field was None or 'unknown'). The raw EXIF tag map is
    stored in ``photos.metadata_json`` under the ``"exif"`` key for
    forensic review regardless of whether any field was auto-filled.

    Default OFF — uploads behave exactly like Phase 1 when this flag is
    not set, so flipping it is fully reversible. Requires
    ``LOREVOX_PHOTO_ENABLED`` to also be on (the upload handler is
    gated behind ``_require_enabled()`` first).
    """
    return _truthy(os.environ.get("LOREVOX_PHOTO_INTAKE"))


def archive_enabled() -> bool:
    """WO-ARCHIVE-AUDIO-01. When True, the ``/api/memory-archive`` router
    is mounted and serves live responses. When False, every endpoint under
    the prefix returns 404 via _require_enabled so the surface is invisible
    to the UI unless the operator opts in.

    The archive itself is the durable home for two-sided transcripts and
    narrator-only audio at:

        DATA_DIR/memory/archive/people/<person_id>/sessions/<conv_id>/

    Storage cap behavior is controlled by two sibling env vars:
      - LOREVOX_ARCHIVE_MAX_MB_PER_PERSON  (default 500)
      - LOREVOX_ARCHIVE_WARN_AT            (default 0.8)

    Hard invariant: Lori / assistant audio uploads are rejected 400
    inside the router regardless of flag state.  The flag only gates
    mount; it does not relax role validation.
    """
    return _truthy(os.environ.get("LOREVOX_ARCHIVE_ENABLED"))


def spantag_enabled() -> bool:
    """WO-EX-SPANTAG-01. When True, /api/extract-fields uses the two-pass
    SPANTAG extraction pipeline: Pass 1 emits a schema-blind NL tag
    inventory of evidence spans; Pass 2 binds those tags to canonical
    fieldPaths using section / target_path / era / pass / mode as explicit
    controlled priors (not implicit forces). Falls back to single-pass on
    any parse failure. Default OFF.

    SPANTAG supersedes the earlier single-pass stub (#87) and runs in
    parallel with TWOPASS during the migration — once SPANTAG ships
    default-on, TWOPASS is retired.

    Ship gate (per WO-EX-SPANTAG-01 §Acceptance):
      - v3 contract ≥ 34/62, v2 contract ≥ 31/62, must_not_write = 0.0%
      - ≥ 3 of 4 dual-answer-defensible cases (008/009/018/082) stable_pass
      - Fallback rate ≤ 5% on the 104-case master
      - p95 latency ≤ 1.8× r4i
      - sourceSpan coverage ≥ 80% of emitted writes
    """
    return _truthy(os.environ.get("LOREVOX_SPANTAG"))
