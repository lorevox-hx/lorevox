"""WO-CR-01 — Chronology Accordion Router

Read-only endpoint that merges three lanes into a decade/year accordion payload:
  Lane A: world events from historical_events_1900_2026.json (cached at startup)
  Lane B: verified personal anchors from promoted truth / profile / questionnaire
  Lane C: ghost prompt cues from static life-stage templates

Authority contract: this endpoint NEVER writes to facts, timeline, questionnaire,
archive, or any other truth table.  It only READS.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query

from .. import db
from ..db import (
    ensure_profile,
    ft_list_promoted,
    get_person,
    get_profile,
    get_questionnaire,
)
from ..flags import truth_v2_enabled
from ..life_spine import derive_life_spine

logger = logging.getLogger("chronology_accordion")

router = APIRouter(prefix="/api", tags=["chronology"])

# ─── ERA / AGE MAP ────────────────────────────────────────────────
# Must mirror TIMELINE_ORDER + ERA_AGE_MAP in app.js exactly.
TIMELINE_ORDER = [
    "early_childhood",
    "school_years",
    "adolescence",
    "early_adulthood",
    "midlife",
    "later_life",
]

ERA_AGE_MAP = {
    "early_childhood":  {"start": 0,  "end": 5},
    "school_years":     {"start": 6,  "end": 12},
    "adolescence":      {"start": 13, "end": 18},
    "early_adulthood":  {"start": 19, "end": 30},
    "midlife":          {"start": 31, "end": 55},
    "later_life":       {"start": 56, "end": None},
}

# ─── HISTORICAL SEED (loaded once, cached) ────────────────────────
_SEED_CACHE: Optional[List[Dict[str, Any]]] = None


def _seed_path() -> Path:
    """Resolve the historical events JSON file relative to the server dir."""
    return (
        Path(__file__).resolve().parents[3]  # routers → api → code → server
        / "data" / "historical" / "historical_events_1900_2026.json"
    )


def load_historical_seed() -> List[Dict[str, Any]]:
    """Load historical events from disk on first call, cache thereafter."""
    global _SEED_CACHE
    if _SEED_CACHE is not None:
        return _SEED_CACHE

    seed_file = _seed_path()
    if not seed_file.exists():
        logger.warning("Historical seed file not found: %s", seed_file)
        _SEED_CACHE = []
        return _SEED_CACHE

    with open(seed_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    events = data.get("events", [])
    _SEED_CACHE = events
    logger.info("Loaded %d historical events from seed file", len(events))
    return _SEED_CACHE


# ─── SCAFFOLD ─────────────────────────────────────────────────────

def build_scaffold_periods(birth_year: int) -> List[Dict[str, Any]]:
    """Build fallback life-period scaffold from birth year using ERA_AGE_MAP."""
    periods = []
    for label in TIMELINE_ORDER:
        ages = ERA_AGE_MAP[label]
        periods.append({
            "label": label,
            "start_year": birth_year + ages["start"],
            "end_year": (birth_year + ages["end"]) if ages["end"] is not None else None,
        })
    return periods


def year_to_era(year: int, periods: List[Dict[str, Any]]) -> Optional[str]:
    """Map a calendar year to an era label using the periods list.

    If year falls after the last period's start (later_life with end=None),
    it maps to later_life.  Years before birth return None.
    """
    for p in periods:
        start = p["start_year"]
        end = p.get("end_year")
        if end is None:
            # later_life — open-ended
            if year >= start:
                return p["label"]
        else:
            if start <= year <= end:
                return p["label"]
    return None


# ─── LANE A: WORLD EVENTS ────────────────────────────────────────

def filter_world_events(
    events: List[Dict[str, Any]],
    birth_year: int,
) -> List[Dict[str, Any]]:
    """Filter historical events to the narrator's lifetime.

    Only includes events from birth_year onward.
    Returns ChronologyItem-shaped dicts.
    """
    items = []
    for ev in events:
        yr = ev.get("year", 0)
        if yr < birth_year:
            continue
        items.append({
            "year": yr,
            "label": ev.get("label", ""),
            "lane": "world",
            "category": ev.get("category", ""),
            "tags": ev.get("tags", []),
            "id": ev.get("id", ""),
            # CR-04 provenance: world items are context-only; Lori must
            # never rephrase them as personal biography.
            "source": "historical_json",
        })
    return items


# ─── LANE B: PERSONAL ANCHORS ────────────────────────────────────
# WO-CR-PACK-01 strict authority model.
#
# Source priority (highest → lowest):
#   1. profile basics            — dob / pob (identity captured during onboarding)
#   2. questionnaire fallback    — personal.dateOfBirth / personal.placeOfBirth ONLY
#   3. promoted truth            — primary for expanded anchors (marriages, jobs,
#                                  moves, retirement, etc.)
#
# CRITICAL: expansion beyond birth identity comes from PROMOTED TRUTH ONLY.
# Questionnaire fallback is intentionally restricted to the two canonical birth
# identity fields so unreviewed answers never leak into the sidebar as verified
# anchors.
#
# Dedup uses compound event-kind keys, not generic field names:
#   single-occurrence  : birth:self / death:self
#   multi-occurrence   : marriage:{spouse}:{year} / child:{name}:{year} /
#                        move:{place}:{year} / work_begin:{employer}:{year} ...
# This keeps repeatables from colliding while keeping one-per-narrator anchors
# stable across source layers.

# ── Promoted-truth field whitelist ───────────────────────────────
# Keys = family_truth_promoted.field values produced by extraction + review.
# Spec carries: event_kind (dedup family), label, date (bool), and
# cardinality ("single" one-per-narrator; "multi" repeatable per narrator).
_PROMOTED_ANCHOR_FIELDS: Dict[str, Dict[str, Any]] = {
    # single-occurrence identity anchors
    "date_of_birth":           {"event_kind": "birth",       "label": "Born",            "date": True,  "cardinality": "single"},
    "place_of_birth":          {"event_kind": "birth_place", "label": "Birthplace",      "date": False, "cardinality": "single"},
    "date_of_death":           {"event_kind": "death",       "label": "Died",            "date": True,  "cardinality": "single"},
    # education
    "date_of_graduation":      {"event_kind": "graduation",  "label": "Graduated",       "date": True,  "cardinality": "multi"},
    # military service
    "date_of_military_service":{"event_kind": "military",    "label": "Military service","date": True,  "cardinality": "single"},
    "date_of_enlistment":      {"event_kind": "military",    "label": "Enlisted",        "date": True,  "cardinality": "single"},
    "date_of_discharge":       {"event_kind": "discharge",   "label": "Discharged",      "date": True,  "cardinality": "single"},
    # work / career
    "date_of_first_job":       {"event_kind": "work_begin",  "label": "First job",       "date": True,  "cardinality": "single"},
    "date_of_retirement":      {"event_kind": "retirement",  "label": "Retired",         "date": True,  "cardinality": "single"},
    # relationships
    "date_of_marriage":        {"event_kind": "marriage",    "label": "Married",         "date": True,  "cardinality": "multi"},
    "date_of_divorce":         {"event_kind": "divorce",     "label": "Divorced",        "date": True,  "cardinality": "multi"},
    # moves / residence
    "date_of_move":            {"event_kind": "move",        "label": "Moved",           "date": True,  "cardinality": "multi"},
    "date_of_immigration":     {"event_kind": "immigration", "label": "Immigrated",      "date": True,  "cardinality": "single"},
    # children (narrator-as-parent)
    "date_of_first_child":     {"event_kind": "child",       "label": "First child",     "date": True,  "cardinality": "multi"},
}

# ── Profile basics whitelist (fallback when promoted is empty) ───
# basics.dob + basics.pob combine into a single enriched "Born" anchor.
_PROFILE_ANCHOR_KEYS: Dict[str, Dict[str, Any]] = {
    "dob":          {"event_kind": "birth", "label": "Born",       "date": True,  "cardinality": "single"},
    "pob":          {"event_kind": "birth", "label": "Birthplace", "date": False, "cardinality": "single"},
    # dateOfDeath is allowed at basics level only if a trusted basics slot
    # carries it (not currently populated; wired for forward-compat).
    "dateOfDeath":  {"event_kind": "death", "label": "Died",       "date": True,  "cardinality": "single"},
}

# ── Questionnaire fallback — STRICT identity subset only ─────────
# CR-02 contract: questionnaire fallback is limited to canonical birth
# identity fields. Expanded anchors (marriage/child/job/move/etc.) MUST
# come from promoted truth, not raw questionnaire answers.
_QUESTIONNAIRE_ANCHOR_KEYS: Dict[str, Dict[str, Any]] = {
    "personal.dateOfBirth":   {"event_kind": "birth", "label": "Born",       "date": True,  "cardinality": "single"},
    "personal.placeOfBirth":  {"event_kind": "birth", "label": "Birthplace", "date": False, "cardinality": "single"},
    # dateOfDeath accepted only because it's still a canonical identity
    # field. No other questionnaire keys are promoted to Lane B — that
    # path is reserved for promoted truth.
    "personal.dateOfDeath":   {"event_kind": "death", "label": "Died",       "date": True,  "cardinality": "single"},
}


def _dedup_key_single(event_kind: str) -> str:
    """One-per-narrator anchor (e.g. birth:self, death:self)."""
    return f"{event_kind}:self"


def _dedup_key_multi(event_kind: str, identity: str, year: Optional[int]) -> str:
    """Repeatable anchor keyed by (kind, identity, year).

    identity is a qualifier like spouse name, child name, place, employer —
    whatever makes this instance distinct. Unknown identities fall back to
    the empty string, which still differentiates via year.
    """
    ident = (identity or "").strip().lower()
    yr = str(year) if year is not None else ""
    return f"{event_kind}:{ident}:{yr}"


def _extract_year(value: Any) -> Optional[int]:
    """Try to extract a 4-digit year from a value string.

    Accepts ISO dates (1962-12-24), US-style (12/24/1962), and bare years (1962).
    Returns None if no plausible year (1850-2100) is found.
    """
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    # Normalize separators so we can split once.
    parts = s.replace("-", " ").replace("/", " ").replace(",", " ").split()
    for p in parts:
        if len(p) == 4 and p.isdigit():
            yr = int(p)
            if 1850 <= yr <= 2100:
                return yr
    return None


def _flatten(obj: Dict[str, Any], prefix: str = "") -> Dict[str, Any]:
    """Flatten nested dict keys so 'personal.dateOfBirth' becomes a top-level lookup."""
    out: Dict[str, Any] = {}
    if not isinstance(obj, dict):
        return out
    for k, v in obj.items():
        kp = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out.update(_flatten(v, kp))
        else:
            out[kp] = v
    return out


def _promoted_identity(spec: Dict[str, Any], row: Dict[str, Any]) -> str:
    """Derive the identity qualifier for a multi-cardinality promoted anchor.

    For marriage / child / move / work_begin / work_end, the subject_name
    on the promoted row is the natural identity (spouse name, child name,
    place, employer). For single-cardinality anchors, identity is unused.
    """
    return (row.get("subject_name") or "").strip()


def project_personal_anchors(
    basics: Dict[str, Any],
    questionnaire: Dict[str, Any],
    promoted_rows: List[Dict[str, Any]],
    narrator_display_name: str = "",
) -> List[Dict[str, Any]]:
    """Extract verified personal anchors — narrator (self) only.

    Source order (highest → lowest):
      1. profile basics          — trusted identity fields (dob, pob)
      2. questionnaire           — STRICT subset: personal.dateOfBirth /
                                   placeOfBirth / dateOfDeath only
      3. promoted truth          — expansion layer (marriage, jobs, moves,
                                   retirement, etc.) — self-subject only

    Dedup: compound event-kind keys
      single-occurrence : "{event_kind}:self"                — one per narrator
      multi-occurrence  : "{event_kind}:{identity}:{year}"   — per instance

    Returns ChronologyItem-shaped dicts with lane='personal' and a
    provenance tag source in {"profile","questionnaire","promoted_truth"}.
    """
    items: List[Dict[str, Any]] = []
    seen_dedup: set = set()
    # Track whether the single "birth" anchor has been claimed (prevents
    # double-counting birth across profile/questionnaire/promoted layers).
    birth_claimed = False

    def _claim(dedup_key: str) -> bool:
        """Claim a dedup slot. Returns True if newly claimed, False if already taken."""
        if dedup_key in seen_dedup:
            return False
        seen_dedup.add(dedup_key)
        return True

    # Normalize inputs
    basics = basics or {}
    dob = str(basics.get("dob") or "").strip()
    pob = str(basics.get("pob") or "").strip()
    name_lower = (narrator_display_name or "").strip().lower()

    # ── 1. Profile basics (identity captured during onboarding) ─
    # Enriched "Born" anchor combining dob + pob when both are present.
    if dob:
        yr = _extract_year(dob)
        if yr is not None:
            key = _dedup_key_single("birth")
            if _claim(key):
                if pob:
                    label = f"Born — {pob}"
                else:
                    label = "Born"
                items.append({
                    "year": yr,
                    "label": label,
                    "lane": "personal",
                    "event_kind": "birth",
                    "dedup_key": key,
                    "source": "profile",
                })
                birth_claimed = True

    # Profile-level dateOfDeath (forward-compat slot — not populated today).
    dod_basics = str(basics.get("dateOfDeath") or "").strip()
    if dod_basics:
        yr = _extract_year(dod_basics)
        if yr is not None:
            key = _dedup_key_single("death")
            if _claim(key):
                items.append({
                    "year": yr,
                    "label": "Died",
                    "lane": "personal",
                    "event_kind": "death",
                    "dedup_key": key,
                    "source": "profile",
                })

    # ── 2. Questionnaire fallback (strict identity subset) ──────
    q_obj = questionnaire.get("questionnaire", {}) if questionnaire else {}
    flat = _flatten(q_obj)
    for q_key, spec in _QUESTIONNAIRE_ANCHOR_KEYS.items():
        if not spec["date"]:
            continue  # place-only keys don't produce year-indexed anchors
        val = flat.get(q_key)
        if val is None or str(val).strip() == "":
            continue
        yr = _extract_year(val)
        if yr is None:
            continue
        event_kind = spec["event_kind"]
        key = _dedup_key_single(event_kind)
        if not _claim(key):
            continue  # already claimed by profile (or earlier questionnaire key)

        # If we're filling in the "Born" slot from questionnaire, try to
        # attach a place hint from flat["personal.placeOfBirth"] so the
        # label still reads "Born — {pob}".
        if event_kind == "birth":
            q_pob = str(flat.get("personal.placeOfBirth") or "").strip()
            label = f"Born — {q_pob}" if q_pob else "Born"
        else:
            label = spec["label"]

        items.append({
            "year": yr,
            "label": label,
            "lane": "personal",
            "event_kind": event_kind,
            "dedup_key": key,
            "source": "questionnaire",
        })

    # ── 3. Promoted truth (expansion layer) ─────────────────────
    # Self-filter: only accept rows where subject is the narrator.
    # Non-date promoted rows are skipped (year-indexed accordion).
    for row in promoted_rows or []:
        field = (row.get("field") or "").strip()
        spec = _PROMOTED_ANCHOR_FIELDS.get(field)
        if not spec:
            continue
        if not spec["date"]:
            # place_of_birth etc. — not an anchor on its own; handled via
            # enriched birth label when both dob and pob are available.
            continue

        subject = (row.get("subject_name") or "").strip().lower()
        relationship = (row.get("relationship") or "").strip().lower()
        cardinality = spec.get("cardinality", "single")

        # Narrator-self filter. `relationship` is the authoritative signal:
        # anything flagged spouse/parent/child/friend belongs to a different
        # subject's timeline, not the narrator's.
        if relationship and relationship not in ("self", "narrator", ""):
            continue

        # subject_name self-check applies ONLY to single-cardinality events
        # (birth, death, retirement, first_job, immigration, etc.) where
        # subject_name should be the narrator. For multi-cardinality events
        # (marriage, child, move, work_begin, divorce, graduation),
        # subject_name is the event identity qualifier (spouse name, child
        # name, place, employer) — not a different-person marker.
        if cardinality == "single":
            if subject and name_lower and subject != name_lower:
                continue

        value = (row.get("value") or "").strip()
        if not value:
            continue
        yr = _extract_year(value)
        if yr is None:
            continue

        event_kind = spec["event_kind"]

        if cardinality == "single":
            key = _dedup_key_single(event_kind)
            label = spec["label"]
        else:
            identity = _promoted_identity(spec, row)
            key = _dedup_key_multi(event_kind, identity, yr)
            # Enrich label with identity qualifier when present.
            if identity:
                label = f"{spec['label']} — {identity}"
            else:
                label = spec["label"]

        if not _claim(key):
            continue

        items.append({
            "year": yr,
            "label": label,
            "lane": "personal",
            "event_kind": event_kind,
            "dedup_key": key,
            "source": "promoted_truth",
        })

    return items


# ─── LANE C: GHOST PROMPTS ───────────────────────────────────────
# One ghost per life-stage band, placed at midpoint year.

_GHOST_TEMPLATES = {
    "early_childhood":  "What's your earliest memory from childhood?",
    "school_years":     "What was school like for you growing up?",
    "adolescence":      "What were your teenage years like?",
    "early_adulthood":  "What was life like when you were first on your own?",
    "midlife":          "What stands out about your middle years?",
    "later_life":       "What has this chapter of life been like for you?",
}


def build_band_ghosts(
    birth_year: int,
    periods: List[Dict[str, Any]],
    personal_items: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Generate ghost prompt items — one per life-stage band at midpoint year.

    Suppresses ghost for a band if that band already has >=2 personal anchors.
    """
    # Count personal items per era
    era_counts: Dict[str, int] = {}
    for item in personal_items:
        era = year_to_era(item.get("year", 0), periods)
        if era:
            era_counts[era] = era_counts.get(era, 0) + 1

    items = []
    current_year = 2026  # cap for later_life

    for p in periods:
        label = p["label"]
        if label not in _GHOST_TEMPLATES:
            continue
        # Suppress if band already has 2+ personal anchors
        if era_counts.get(label, 0) >= 2:
            continue

        start = p["start_year"]
        end = p.get("end_year")
        if end is None:
            end = min(birth_year + 90, current_year)
        midpoint = (start + end) // 2

        items.append({
            "year": midpoint,
            "label": _GHOST_TEMPLATES[label],
            "lane": "ghost",
            "era": label,
            # CR-04 provenance: ghost items shape question style only;
            # never asserted as known history about the narrator.
            "source": "life_stage_template",
        })

    return items


# ─── GROUP BY DECADE ──────────────────────────────────────────────

def group_by_decade(
    items: List[Dict[str, Any]],
    periods: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Group items into decade buckets, each containing year sub-groups.

    Returns:
      [
        {
          "decade": 1940,
          "decade_label": "1940s",
          "years": [
            {
              "year": 1940,
              "era": "early_childhood",
              "items": [ ... ]
            },
            ...
          ]
        },
        ...
      ]
    Sorted by decade ascending, years ascending within each decade.
    """
    # Collect items by decade → year
    decade_map: Dict[int, Dict[int, List[Dict[str, Any]]]] = {}
    for item in items:
        yr = item.get("year", 0)
        decade = (yr // 10) * 10
        if decade not in decade_map:
            decade_map[decade] = {}
        if yr not in decade_map[decade]:
            decade_map[decade][yr] = []
        decade_map[decade][yr].append(item)

    # Build sorted output.
    # CR-01B: Within each year, enforce lane priority so personal anchors
    # always appear above ghost prompts, and both above world context.
    # Without this sort, items render in Lane A+B+C concat order, which
    # pushes the narrator's own anchors below Cold War trivia.
    _LANE_PRIORITY = {"personal": 0, "ghost": 1, "world": 2}
    result = []
    for decade in sorted(decade_map.keys()):
        year_groups = []
        for yr in sorted(decade_map[decade].keys()):
            era = year_to_era(yr, periods)
            items_sorted = sorted(
                decade_map[decade][yr],
                key=lambda x: _LANE_PRIORITY.get(x.get("lane"), 9),
            )
            year_groups.append({
                "year": yr,
                "era": era,
                "items": items_sorted,
            })
        result.append({
            "decade": decade,
            "decade_label": f"{decade}s",
            "years": year_groups,
        })

    return result


# ─── MAIN BUILDER ─────────────────────────────────────────────────

def build_chronology_accordion_payload(
    person_id: str,
    profile: Dict[str, Any],
    questionnaire: Dict[str, Any],
    promoted_rows: List[Dict[str, Any]],
    narrator_display_name: str = "",
) -> Dict[str, Any]:
    """Build the full chronology accordion payload.

    Returns the complete JSON response shape for the frontend.
    """
    # Normalize incoming profile shape.  Accepts:
    #   {"basics": {...}}           → use the basics sub-dict
    #   {"dob": ..., "pob": ...}    → already a basics dict
    if isinstance(profile, dict) and "basics" in profile:
        basics = profile["basics"] or {}
    else:
        basics = profile or {}

    # Extract birth year
    dob = basics.get("dob", "")
    birth_year = None
    if dob:
        try:
            birth_year = int(str(dob).strip()[:4])
        except (ValueError, IndexError):
            pass

    if not birth_year:
        return {
            "person_id": person_id,
            "decades": [],
            "periods": [],
            "birth_year": None,
            "error": "no_dob",
        }

    # Build periods (prefer spine if available, else scaffold)
    periods = build_scaffold_periods(birth_year)

    # Load all three lanes
    seed = load_historical_seed()
    lane_a = filter_world_events(seed, birth_year)
    lane_b = project_personal_anchors(
        basics, questionnaire, promoted_rows,
        narrator_display_name=narrator_display_name,
    )

    # WO-LIFE-SPINE-01: derive school-years projection from DOB, add as
    # source='derived' Lane B entries. Dedup against existing Lane B items
    # (which carry source profile/questionnaire/promoted_truth) by event_kind
    # so a confirmed school_graduation never gets a ghost duplicate.
    #
    # Override propagation: any Lane B item whose event_kind matches a spine
    # entry counts as "confirmed" and shifts the spine offset accordingly.
    confirmed_for_spine: List[Dict[str, Any]] = [
        {
            "event_kind": item.get("event_kind"),
            "year": item.get("year"),
            "source": item.get("source"),
        }
        for item in lane_b
        if item.get("event_kind") and item.get("year") is not None
    ]
    # Pass the full profile to the spine so the family catalog can read
    # children. Other catalogs ignore facts. basics-only or full-profile
    # shapes are both accepted by the family catalog's _collect_children.
    spine_items = derive_life_spine(
        dob,
        confirmed_events=confirmed_for_spine,
        facts=profile if isinstance(profile, dict) else basics,
    )
    # Drop spine items whose event_kind already exists in Lane B (dedup).
    existing_kinds = {it.get("event_kind") for it in lane_b if it.get("event_kind")}
    spine_items = [it for it in spine_items if it.get("event_kind") not in existing_kinds]
    lane_b_with_spine = lane_b + spine_items

    lane_c = build_band_ghosts(birth_year, periods, lane_b_with_spine)

    # Merge all items
    all_items = lane_a + lane_b_with_spine + lane_c

    # Group into decades
    decades = group_by_decade(all_items, periods)

    return {
        "person_id": person_id,
        "birth_year": birth_year,
        "periods": [
            {
                "label": p["label"],
                "start_year": p["start_year"],
                "end_year": p.get("end_year"),
            }
            for p in periods
        ],
        "decades": decades,
        "lane_counts": {
            "world": len(lane_a),
            "personal": len(lane_b_with_spine),
            "personal_derived": len(spine_items),
            "ghost": len(lane_c),
        },
    }


# ─── ENDPOINT ─────────────────────────────────────────────────────

@router.get("/chronology-accordion")
def api_chronology_accordion(
    person_id: str = Query(..., description="Narrator person_id"),
):
    """Read-only chronology accordion payload.

    Merges world events, personal anchors, and ghost prompts into
    a decade-grouped structure for the left-side accordion UI.
    """
    person = get_person(person_id)
    if not person:
        raise HTTPException(status_code=404, detail="person not found")

    ensure_profile(person_id)
    profile_row = get_profile(person_id)
    legacy_profile = profile_row.get("profile_json", {}) if profile_row else {}

    # Flag-gated promoted-truth profile build.  build_profile_from_promoted
    # returns {basics, kinship, pets}; legacy_profile also has that shape.
    profile_obj: Dict[str, Any] = legacy_profile or {}
    if truth_v2_enabled("profile"):
        try:
            profile_obj = db.build_profile_from_promoted(person_id)
        except Exception as exc:
            logger.warning(
                "chronology: build_profile_from_promoted failed for %s: %s",
                person_id, exc,
            )
            profile_obj = legacy_profile or {}

    promoted_rows = ft_list_promoted(person_id, limit=10_000)
    questionnaire = get_questionnaire(person_id)

    # Pull the narrator's display name for self-filtering promoted rows.
    narrator_name = (person.get("display_name") or "").strip()

    payload = build_chronology_accordion_payload(
        person_id=person_id,
        profile=profile_obj,
        questionnaire=questionnaire,
        promoted_rows=promoted_rows,
        narrator_display_name=narrator_name,
    )

    return payload
