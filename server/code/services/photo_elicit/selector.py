"""Phase 1 photo selector — deterministic, no ML, no scoring.

Contract (per WO-LORI-PHOTO-SHARED-01 §10):

* ``ZERO_RECALL_COOLDOWN = 10`` shows.
* ``DISTRESS_ABORT_COOLDOWN = 30`` shows.
* Cooldowns are HARD, not soft — a photo whose last show was a
  ``distress_abort`` is not a candidate again until at least 30
  subsequent shows (on any photo, for this narrator) have happened.
* Photos never shown before take priority over previously-shown photos.
* Returns ``None`` when no ready photo is currently eligible.

The selector reads from a ``repository``-shaped object; at runtime this
is ``server.code.services.photos.repository`` but any object that
exposes ``list_photos`` / ``last_show_for_photo`` / ``recent_shows``
works (the Phase 1 tests pass fakes to exercise cooldown math without
touching SQLite).
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional


ZERO_RECALL_COOLDOWN: int = 10
DISTRESS_ABORT_COOLDOWN: int = 30

# Outcomes that trigger cooldowns. Other outcomes
# (``story_captured``, ``skipped``, ``shown``) are re-eligible immediately.
_COOLDOWN_OUTCOMES = {
    "distress_abort": DISTRESS_ABORT_COOLDOWN,
    "zero_recall": ZERO_RECALL_COOLDOWN,
}


def _photo_id(photo: Any) -> Optional[str]:
    if isinstance(photo, dict):
        return photo.get("id")
    return getattr(photo, "id", None)


def _show_field(show: Any, name: str) -> Any:
    if show is None:
        return None
    if isinstance(show, dict):
        return show.get(name)
    return getattr(show, name, None)


def _count_shows_since(
    shown_index: Iterable[Dict[str, Any]],
    anchor_shown_at: Optional[str],
) -> int:
    """Number of shows in ``shown_index`` that happened after ``anchor_shown_at``.

    ``shown_at`` is an ISO-8601 string; string comparison orders correctly.
    """

    if not anchor_shown_at:
        # Anchor unknown — treat the cooldown as already elapsed so we
        # don't wedge on corrupt rows. Phase 2 may tighten this.
        return DISTRESS_ABORT_COOLDOWN
    count = 0
    for show in shown_index:
        ts = _show_field(show, "shown_at")
        if ts is None:
            continue
        if ts > anchor_shown_at:
            count += 1
    return count


def select_next_photo(
    narrator_id: str,
    repository: Any,
) -> Optional[Dict[str, Any]]:
    """Pick the next photo to show this narrator, or ``None`` if no candidate.

    Phase 1 algorithm is deterministic: photos are scanned in
    repository-native order (``list_photos`` already sorts by
    ``created_at ASC, id ASC``); unshown photos are preferred over
    previously-shown ones; cooldowns are applied hard.
    """

    ready_photos = repository.list_photos(
        narrator_id,
        narrator_ready=True,
        deleted=False,
    )
    if not ready_photos:
        return None

    shown_index = repository.recent_shows(
        narrator_id,
        limit=max(ZERO_RECALL_COOLDOWN, DISTRESS_ABORT_COOLDOWN),
    )

    unshown: List[Any] = []
    previously_shown: List[Any] = []
    last_cache: Dict[str, Optional[Dict[str, Any]]] = {}

    for photo in ready_photos:
        pid = _photo_id(photo)
        if pid is None:
            # Corrupt row — skip rather than raise.
            continue
        last = repository.last_show_for_photo(pid)
        last_cache[pid] = last
        if last is None:
            unshown.append(photo)
        else:
            previously_shown.append(photo)

    # Prefer photos the narrator has never seen.
    for photo in unshown:
        return photo

    # Fall back to previously-shown photos, skipping anything on cooldown.
    for photo in previously_shown:
        pid = _photo_id(photo)
        last = last_cache.get(pid) if pid else None
        outcome = _show_field(last, "outcome")
        cooldown = _COOLDOWN_OUTCOMES.get(outcome)
        if cooldown is not None:
            distance = _count_shows_since(
                shown_index, _show_field(last, "shown_at")
            )
            if distance < cooldown:
                continue
        return photo

    return None


__all__ = [
    "ZERO_RECALL_COOLDOWN",
    "DISTRESS_ABORT_COOLDOWN",
    "select_next_photo",
]
