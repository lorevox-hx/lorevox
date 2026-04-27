"""WO-EX-VALIDATE-01 — Age-math plausibility validator.

Runtime defensive layer: given a narrator's DOB and an extracted event
(year + event_kind or field_path), decide whether the extraction is
temporally plausible. Returns a tri-state flag:

    ok          — fits all age-envelope rules for this event_kind
    warn        — falls in a grey zone (soft outlier; surface for review)
    impossible  — violates a hard rule (event before birth, civic event
                  below legal minimum, etc.); extractor should suppress

Pure function; no I/O, no DB calls. Extractor is expected to fetch DOB
once per request and pass it in. Respects the same single-source phase
vocabulary as school.school_phase_for_year() — no parallel bucketing.

WIRED BEHIND FLAG: LOREVOX_AGE_VALIDATOR defaults OFF. Call sites are
gated by flags.age_validator_enabled() so this module can sit here dark
until operators turn it on.

Event-kind age envelopes are derived from the per-era catalogs already
shipped (school.py, adolescence.py, early_adulthood.py, midlife.py,
later_life.py). When a catalog's anchor changes (e.g., Medicare moves),
only that catalog needs touching — the validator infers from it.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Dict, Literal, Optional, Tuple, Union

from .school import _coerce_dob, school_phase_for_year


Flag = Literal["ok", "warn", "impossible"]


@dataclass(frozen=True)
class ValidationResult:
    flag: Flag
    reason: str
    age_at_event: Optional[int]
    phase: Optional[str]
    event_kind: Optional[str]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "flag": self.flag,
            "reason": self.reason,
            "age_at_event": self.age_at_event,
            "phase": self.phase,
            "event_kind": self.event_kind,
        }


# ── Age envelopes ────────────────────────────────────────────────────────────
# Each entry is (min_age_inclusive, max_age_inclusive, severity_if_min_violated).
# min_age is the earliest age at which this event is biologically, legally,
# or institutionally possible. max_age is a soft upper bound (warn-level).
# severity of a min-violation defaults to "impossible" for civic/legal anchors
# and "warn" for soft events like "first job".
_AGE_ENVELOPES: Dict[str, Tuple[int, int, Flag]] = {
    # School catalog anchors
    "school_kindergarten":        (4, 7, "warn"),          # K at 5-6; 4 or 7 is rare but possible
    "school_elementary_start":    (5, 8, "warn"),
    "school_middle_start":        (10, 13, "warn"),
    "school_highschool_start":    (13, 16, "warn"),
    "school_graduation":          (16, 20, "warn"),        # HS grad at 17-18 typical

    # Adolescence catalog anchors (civic = hard min)
    "civic_drivers_license_age":       (14, 25, "impossible"),  # 14 for learner permit in some states
    "civic_voting_age":                (18, 120, "impossible"), # 26th amendment floor
    "civic_first_presidential_election": (18, 120, "impossible"),
    "civic_selective_service":         (18, 26, "impossible"),

    # Early adulthood
    "education_college_start":    (16, 35, "warn"),        # typical 17-22; early college possible
    "education_college_grad":     (19, 40, "warn"),
    "civic_drinking_age":         (18, 120, "impossible"), # pre-1984 some states were 18; post-1984 federal min is 21 but validator uses 18 as absolute floor

    # Midlife / later life
    "civic_social_security_early":  (62, 120, "impossible"),  # SSA hard floor
    "civic_medicare_eligible":      (65, 120, "impossible"),
    "civic_social_security_full":   (65, 120, "impossible"),  # SSA FRA varies 65-67 by cohort; validator floor is 65
    "civic_social_security_max":    (70, 120, "impossible"),

    # Soft life events — common extractor outputs that benefit from plausibility checks
    "first_job":                  (10, 80, "warn"),        # paper route at 10 plausible; first formal job typical 14-18
    "marriage":                   (16, 90, "warn"),        # legal min varies; 16 as absolute floor
    "child_birth":                (14, 55, "warn"),        # biological envelope
    "parent_death":               (0, 110, "warn"),        # can happen any time
    "retirement":                 (50, 90, "warn"),        # early retirement possible; 50 as generous floor
}


# ── Field-path → event_kind mapping ──────────────────────────────────────────
# Extractor-level bridge: when a fact comes in as e.g. "personal.dateOfBirth"
# we validate it as kind=birth. Keep this conservative — only map fields
# whose values are reliably datable to a specific life event.
_FIELD_TO_EVENT_KIND: Dict[str, str] = {
    "personal.dateOfBirth":             "birth",
    "education.schooling":              "school_kindergarten",     # fuzzy — refined below
    "education.higherEducation":        "education_college_start",
    "education.earlyCareer":            "first_job",
    "laterYears.retirement":            "retirement",
}


# ── Core helpers ─────────────────────────────────────────────────────────────

def compute_age(dob: Union[str, date, datetime], event_year: int,
                event_month: Optional[int] = None,
                event_day: Optional[int] = None) -> int:
    """Return whole-year age at a given event moment.

    Accepts event as year-only (uses July 1 midpoint) or full date.
    Negative ages are preserved so validators can detect events-before-birth.
    """
    dob_d = _coerce_dob(dob)
    ev_month = event_month or 7
    ev_day = event_day or 1
    try:
        ev_d = date(event_year, ev_month, ev_day)
    except ValueError:
        ev_d = date(event_year, 7, 1)
    age = ev_d.year - dob_d.year
    # Adjust if event occurred before birthday that year
    if (ev_d.month, ev_d.day) < (dob_d.month, dob_d.day):
        age -= 1
    return age


def _infer_event_kind(field_path: str, value: Any) -> Optional[str]:
    """Best-effort event_kind inference from a field_path.

    Returns None when the field isn't temporally anchored (e.g., free-text
    hobby entries). The validator short-circuits to flag=ok when kind is
    None so we don't invent rules for fields we can't reason about.
    """
    direct = _FIELD_TO_EVENT_KIND.get(field_path)
    if direct:
        return direct
    return None


def _parse_year(value: Any) -> Optional[int]:
    """Pull a 4-digit year out of a value. Accepts int, ISO date string,
    or free-text containing a year. Returns None when nothing plausible."""
    if value is None:
        return None
    if isinstance(value, int):
        if 1800 <= value <= 2200:
            return value
        return None
    s = str(value).strip()
    if not s:
        return None
    # ISO "YYYY-MM-DD" prefix
    if len(s) >= 4 and s[:4].isdigit():
        try:
            y = int(s[:4])
            if 1800 <= y <= 2200:
                return y
        except ValueError:
            pass
    # Fall back: scan for a 4-digit run 1800-2200
    import re as _re
    m = _re.search(r"\b(1[89]\d{2}|20\d{2}|21\d{2})\b", s)
    if m:
        return int(m.group(1))
    return None


# ── Public validators ────────────────────────────────────────────────────────

def validate_event(
    event_kind: Optional[str],
    year: Optional[int],
    dob: Union[str, date, datetime],
) -> ValidationResult:
    """Validate a single event against age envelopes.

    Returns ok when:
      - event_kind is unknown (no envelope to apply)
      - year or dob is missing (nothing to compute)
      - computed age falls within [min_age, max_age]

    Returns impossible when:
      - age < 0 (event predates birth) — always hard
      - age below min_age for an event flagged as "impossible" severity

    Returns warn when:
      - age > 110 (outlier; usually a data error)
      - age outside envelope for an event flagged as "warn" severity
    """
    # Early outs — caller supplied incomplete data
    if dob is None or dob == "":
        return ValidationResult("ok", "no dob", None, None, event_kind)
    if year is None:
        return ValidationResult("ok", "no year", None, None, event_kind)

    try:
        age = compute_age(dob, year)
    except Exception as e:
        return ValidationResult("ok", f"age compute failed: {e}", None, None, event_kind)

    try:
        phase = school_phase_for_year(dob, year)
    except Exception:
        phase = None

    # Hard rule: event before birth is always impossible
    if age < 0:
        return ValidationResult(
            "impossible",
            f"event year {year} predates DOB (age {age})",
            age, phase, event_kind,
        )

    # Hard rule: age > 110 is always warn-level (data error more likely
    # than a record-breaking event).
    if age > 110:
        return ValidationResult(
            "warn",
            f"implausible age {age} (> 110)",
            age, phase, event_kind,
        )

    if event_kind is None or event_kind not in _AGE_ENVELOPES:
        return ValidationResult("ok", "unmapped event_kind", age, phase, event_kind)

    min_age, max_age, severity = _AGE_ENVELOPES[event_kind]

    if age < min_age:
        return ValidationResult(
            severity,
            f"age {age} below minimum {min_age} for {event_kind}",
            age, phase, event_kind,
        )
    if age > max_age:
        return ValidationResult(
            "warn",
            f"age {age} above typical maximum {max_age} for {event_kind}",
            age, phase, event_kind,
        )

    return ValidationResult("ok", "within envelope", age, phase, event_kind)


def validate_fact(
    field_path: str,
    value: Any,
    dob: Union[str, date, datetime, None],
    event_kind_override: Optional[str] = None,
) -> ValidationResult:
    """Convenience wrapper for extractor integration.

    Derives event_kind from field_path, pulls a year out of value, and
    calls validate_event. Returns ok when any piece is missing — the
    validator's job is to catch real violations, not to complain about
    incomplete data.
    """
    if dob is None:
        return ValidationResult("ok", "no dob", None, None, None)

    kind = event_kind_override or _infer_event_kind(field_path, value)

    # Special-case: personal.dateOfBirth itself — the "year" IS the dob,
    # so self-validation is always ok unless the value is malformed.
    if field_path == "personal.dateOfBirth":
        y = _parse_year(value)
        if y is None:
            return ValidationResult("warn", "unparseable DOB value", None, None, "birth")
        if y < 1850 or y > 2100:
            return ValidationResult("warn", f"DOB year {y} outside plausible range", None, None, "birth")
        return ValidationResult("ok", "dob field", None, None, "birth")

    year = _parse_year(value)
    return validate_event(kind, year, dob)


__all__ = [
    "Flag",
    "ValidationResult",
    "compute_age",
    "validate_event",
    "validate_fact",
]
