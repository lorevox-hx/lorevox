from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional, Dict


@dataclass
class LifePeriod:
    label: str
    start_year: Optional[int] = None
    end_year: Optional[int] = None
    is_approximate: bool = True
    places: List[str] = field(default_factory=list)
    people: List[str] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)


@dataclass
class TimelineSpine:
    person_id: str
    birth_date: Optional[str] = None
    birth_place: Optional[str] = None
    present_year: int = field(default_factory=lambda: datetime.now().year)
    periods: List[LifePeriod] = field(default_factory=list)
    gap_notes: List[str] = field(default_factory=list)

    def add_period(self, period: LifePeriod) -> None:
        self.periods.append(period)

    def sort_periods(self) -> None:
        self.periods.sort(key=lambda p: (p.start_year is None, p.start_year or 9999))

    def to_dict(self) -> Dict[str, object]:
        return {
            "person_id": self.person_id,
            "birth_date": self.birth_date,
            "birth_place": self.birth_place,
            "present_year": self.present_year,
            "periods": [p.__dict__ for p in self.periods],
            "gap_notes": list(self.gap_notes),
        }


class TimelineBuilder:
    DEFAULT_BUCKETS = [
        ("early_childhood", 0, 5),
        ("school_years", 6, 12),
        ("adolescence", 13, 18),
        ("early_adulthood", 19, 30),
        ("midlife", 31, 55),
        ("later_life", 56, None),
    ]

    def initialize_spine(self, person_id: str, birth_date: str, birth_place: str) -> TimelineSpine:
        spine = TimelineSpine(person_id=person_id, birth_date=birth_date, birth_place=birth_place)
        birth_year = self._year_from_birth_date(birth_date)
        if birth_year is not None:
            for label, start_age, end_age in self.DEFAULT_BUCKETS:
                start_year = birth_year + start_age
                end_year = None if end_age is None else birth_year + end_age
                notes = [f"Born in {birth_place}"] if label == "early_childhood" else []
                places = [birth_place] if label == "early_childhood" else []
                spine.add_period(LifePeriod(label, start_year, end_year, True, places, [], notes))
        spine.sort_periods()
        return spine

    def age_at_year(self, spine: TimelineSpine, year: int) -> Optional[int]:
        birth_year = self._year_from_birth_date(spine.birth_date)
        return None if birth_year is None else year - birth_year

    @staticmethod
    def _year_from_birth_date(birth_date: Optional[str]) -> Optional[int]:
        if not birth_date:
            return None
        try:
            return int(str(birth_date)[:4])
        except Exception:
            return None
