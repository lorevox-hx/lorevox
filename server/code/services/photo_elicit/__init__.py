"""Narrator-facing photo elicitation services.

Phase 1 (WO-LORI-PHOTO-SHARED-01) ships the non-LLM surface:
  * template_prompt.build_photo_prompt (three tiers + forbidden phrasing filter)
  * selector.select_next_photo (hard cooldowns for distress_abort / zero_recall)

Phase 2 (WO-LORI-PHOTO-ELICIT-01) extends this package with:
  * extraction.extract_from_photo_memory (photo_memory extraction profile)
  * memory_prompt.generate_llm_prompt (LLM-tuned per-photo prompts with
    forbidden-phrasing filter + 240-char cap)
  * scheduler (in-process extraction queue)
"""

from .template_prompt import (  # noqa: F401
    TIER_HIGH,
    TIER_MEDIUM,
    TIER_ZERO,
    build_photo_prompt,
    classify_tier,
)
from .selector import (  # noqa: F401
    DISTRESS_ABORT_COOLDOWN,
    ZERO_RECALL_COOLDOWN,
    select_next_photo,
)

__all__ = [
    "TIER_HIGH",
    "TIER_MEDIUM",
    "TIER_ZERO",
    "build_photo_prompt",
    "classify_tier",
    "DISTRESS_ABORT_COOLDOWN",
    "ZERO_RECALL_COOLDOWN",
    "select_next_photo",
]
