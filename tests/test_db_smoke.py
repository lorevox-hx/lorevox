#!/usr/bin/env python3
"""
Lorevox 9.0 — DB Smoke Test Suite
Tests database persistence, isolation, and integrity by exercising
the DB layer through the REST API.

Usage:
    python tests/test_db_smoke.py          # run all
    python tests/test_db_smoke.py -v       # verbose
    python tests/test_db_smoke.py -k iso   # run matching tests

Requires: requests  (pip install requests)
"""
import os
import sys
import json
import time
import unittest
import uuid

try:
    import requests
except ImportError:
    print("ERROR: 'requests' not installed. Run: pip install requests --break-system-packages")
    sys.exit(1)

BASE = os.getenv("LOREVOX_API_URL", "http://127.0.0.1:8000")


class DBPersistenceTests(unittest.TestCase):
    """Group 1: Data survives create → read round-trip."""

    @classmethod
    def setUpClass(cls):
        r = requests.post(f"{BASE}/api/people", json={
            "display_name": f"DBPersist_{uuid.uuid4().hex[:6]}",
            "role": "narrator",
            "date_of_birth": "1938-11-22",
            "place_of_birth": "Persist City, DB"
        }, timeout=5)
        cls.person_id = r.json()["person_id"]

    @classmethod
    def tearDownClass(cls):
        requests.delete(f"{BASE}/api/people/{cls.person_id}",
                        params={"mode": "hard", "reason": "test cleanup"}, timeout=5)

    def test_01_person_persists(self):
        """DB-01: Created person survives immediate read-back"""
        r = requests.get(f"{BASE}/api/people/{self.person_id}", timeout=5)
        self.assertEqual(r.status_code, 200)
        body = r.json()
        person = body.get("person", body)  # unwrap nested response
        self.assertEqual(person["date_of_birth"], "1938-11-22")

    def test_02_profile_persists(self):
        """DB-02: Profile JSON survives put → get round-trip"""
        profile = {
            "basics": {"fullname": "Persist Person", "dob": "1938-11-22"},
            "kinship": [{"name": "Spouse", "relation": "husband"}]
        }
        requests.put(f"{BASE}/api/profiles/{self.person_id}",
                     json={"profile": profile}, timeout=5)
        r = requests.get(f"{BASE}/api/profiles/{self.person_id}", timeout=5)
        saved = r.json().get("profile", {})
        self.assertEqual(saved["basics"]["fullname"], "Persist Person")
        self.assertEqual(len(saved.get("kinship", [])), 1)

    def test_03_fact_persists(self):
        """DB-03: Fact survives add → list round-trip"""
        requests.post(f"{BASE}/api/facts/add", json={
            "person_id": self.person_id,
            "statement": "Graduated from Persist University in 1960",
            "fact_type": "education",
            "status": "extracted",
            "confidence": 0.9
        }, timeout=5)
        r = requests.get(f"{BASE}/api/facts/list",
                         params={"person_id": self.person_id}, timeout=5)
        items = r.json().get("items") or r.json().get("facts") or []
        stmts = [f["statement"] for f in items]
        self.assertIn("Graduated from Persist University in 1960", stmts)

    def test_04_timeline_persists(self):
        """DB-04: Timeline event survives add → list round-trip"""
        requests.post(f"{BASE}/api/timeline/add", json={
            "person_id": self.person_id,
            "ts": "1960-06-15T00:00:00Z",
            "title": "Graduation Day",
            "kind": "education"
        }, timeout=5)
        r = requests.get(f"{BASE}/api/timeline/list",
                         params={"person_id": self.person_id}, timeout=5)
        items = r.json().get("items") or r.json().get("events") or []
        titles = [e["title"] for e in items]
        self.assertIn("Graduation Day", titles)

    def test_05_session_persists(self):
        """DB-05: Session metadata survives upsert → get round-trip"""
        r = requests.post(f"{BASE}/api/session/new",
                          params={"title": "DB Persist Session"}, timeout=5)
        conv_id = r.json()["conv_id"]

        requests.post(f"{BASE}/api/session/put", json={
            "conv_id": conv_id,
            "title": "DB Persist Session Updated",
            "payload": {"test_key": "test_value"}
        }, timeout=5)

        r2 = requests.get(f"{BASE}/api/session/get",
                          params={"conv_id": conv_id}, timeout=5)
        self.assertEqual(r2.status_code, 200)
        # Clean up
        requests.delete(f"{BASE}/api/session/delete",
                        params={"conv_id": conv_id}, timeout=5)


class DBIsolationTests(unittest.TestCase):
    """Group 2: Cross-narrator data isolation in the DB."""

    @classmethod
    def setUpClass(cls):
        cls.persons = []
        for label in ["IsoA", "IsoB"]:
            r = requests.post(f"{BASE}/api/people", json={
                "display_name": f"{label}_{uuid.uuid4().hex[:4]}",
                "role": "narrator"
            }, timeout=5)
            cls.persons.append(r.json()["person_id"])

    @classmethod
    def tearDownClass(cls):
        for pid in cls.persons:
            requests.delete(f"{BASE}/api/people/{pid}",
                            params={"mode": "hard", "reason": "test cleanup"}, timeout=5)

    def test_01_facts_do_not_leak(self):
        """DB-06: Facts for person A are invisible to person B query"""
        pid_a, pid_b = self.persons
        unique_stmt = f"UniqueFactA_{uuid.uuid4().hex[:8]}"
        requests.post(f"{BASE}/api/facts/add", json={
            "person_id": pid_a,
            "statement": unique_stmt,
            "fact_type": "general",
            "status": "extracted"
        }, timeout=5)

        r = requests.get(f"{BASE}/api/facts/list",
                         params={"person_id": pid_b}, timeout=5)
        items = r.json().get("items") or r.json().get("facts") or []
        leaked = [f for f in items if unique_stmt in f.get("statement", "")]
        self.assertEqual(len(leaked), 0, f"Fact leaked from A to B: {unique_stmt}")

    def test_02_timeline_does_not_leak(self):
        """DB-07: Timeline events for person A are invisible to person B"""
        pid_a, pid_b = self.persons
        unique_title = f"UniqueEventA_{uuid.uuid4().hex[:8]}"
        requests.post(f"{BASE}/api/timeline/add", json={
            "person_id": pid_a,
            "ts": "1950-01-01T00:00:00Z",
            "title": unique_title,
            "kind": "event"
        }, timeout=5)

        r = requests.get(f"{BASE}/api/timeline/list",
                         params={"person_id": pid_b}, timeout=5)
        items = r.json().get("items") or r.json().get("events") or []
        leaked = [e for e in items if unique_title in e.get("title", "")]
        self.assertEqual(len(leaked), 0, f"Timeline leaked from A to B: {unique_title}")

    def test_03_profile_does_not_leak(self):
        """DB-08: Profile for person A is distinct from person B"""
        pid_a, pid_b = self.persons
        unique_name = f"UniqueName_{uuid.uuid4().hex[:8]}"
        requests.put(f"{BASE}/api/profiles/{pid_a}",
                     json={"profile": {"basics": {"fullname": unique_name}}}, timeout=5)

        r = requests.get(f"{BASE}/api/profiles/{pid_b}", timeout=5)
        b_name = r.json().get("profile", {}).get("basics", {}).get("fullname", "")
        self.assertNotEqual(b_name, unique_name, "Profile leaked from A to B")


class DBDeleteCascadeTests(unittest.TestCase):
    """Group 3: Hard delete cleans up all dependent data."""

    def test_01_hard_delete_cleans_facts(self):
        """DB-09: Hard-deleting a person removes their facts"""
        r = requests.post(f"{BASE}/api/people", json={
            "display_name": f"DeleteCascade_{uuid.uuid4().hex[:6]}",
            "role": "narrator"
        }, timeout=5)
        pid = r.json()["person_id"]

        # Add facts
        requests.post(f"{BASE}/api/facts/add", json={
            "person_id": pid,
            "statement": "Cascade test fact",
            "fact_type": "general",
            "status": "extracted"
        }, timeout=5)

        # Hard delete person
        requests.delete(f"{BASE}/api/people/{pid}",
                        params={"mode": "hard", "reason": "cascade test"}, timeout=5)

        # Facts should be gone
        r = requests.get(f"{BASE}/api/facts/list",
                         params={"person_id": pid}, timeout=5)
        items = r.json().get("items") or r.json().get("facts") or []
        self.assertEqual(len(items), 0, "Facts should be deleted after hard delete")

    def test_02_hard_delete_cleans_timeline(self):
        """DB-10: Hard-deleting a person removes their timeline events"""
        r = requests.post(f"{BASE}/api/people", json={
            "display_name": f"DeleteTimeline_{uuid.uuid4().hex[:6]}",
            "role": "narrator"
        }, timeout=5)
        pid = r.json()["person_id"]

        requests.post(f"{BASE}/api/timeline/add", json={
            "person_id": pid,
            "ts": "1950-01-01T00:00:00Z",
            "title": "Cascade timeline test",
            "kind": "birth"
        }, timeout=5)

        requests.delete(f"{BASE}/api/people/{pid}",
                        params={"mode": "hard", "reason": "cascade test"}, timeout=5)

        r = requests.get(f"{BASE}/api/timeline/list",
                         params={"person_id": pid}, timeout=5)
        items = r.json().get("items") or r.json().get("events") or []
        self.assertEqual(len(items), 0, "Timeline should be deleted after hard delete")


class DBSoftDeleteTests(unittest.TestCase):
    """Group 4: Soft delete and restore behavior."""

    def test_01_soft_delete_hides_from_list(self):
        """DB-11: Soft-deleted person does not appear in default list"""
        r = requests.post(f"{BASE}/api/people", json={
            "display_name": f"SoftHide_{uuid.uuid4().hex[:6]}",
            "role": "narrator"
        }, timeout=5)
        pid = r.json()["person_id"]

        # Soft delete
        requests.delete(f"{BASE}/api/people/{pid}",
                        params={"mode": "soft", "reason": "soft test"}, timeout=5)

        # Default list should not include
        r = requests.get(f"{BASE}/api/people", timeout=5)
        ids = [p.get("person_id") or p.get("id") for p in r.json().get("items", r.json().get("people", []))]
        self.assertNotIn(pid, ids, "Soft-deleted person should not appear in default list")

        # include_deleted should include
        r2 = requests.get(f"{BASE}/api/people",
                          params={"include_deleted": "true"}, timeout=5)
        ids2 = [p.get("person_id") or p.get("id") for p in r2.json().get("items", r2.json().get("people", []))]
        self.assertIn(pid, ids2, "Soft-deleted person should appear with include_deleted=true")

        # Clean up
        requests.delete(f"{BASE}/api/people/{pid}",
                        params={"mode": "hard", "reason": "test cleanup"}, timeout=5)

    def test_02_restore_makes_visible(self):
        """DB-12: Restored person appears in default list again"""
        r = requests.post(f"{BASE}/api/people", json={
            "display_name": f"SoftRestore_{uuid.uuid4().hex[:6]}",
            "role": "narrator"
        }, timeout=5)
        pid = r.json()["person_id"]

        requests.delete(f"{BASE}/api/people/{pid}",
                        params={"mode": "soft", "reason": "restore test"}, timeout=5)
        requests.post(f"{BASE}/api/people/{pid}/restore", timeout=5)

        r = requests.get(f"{BASE}/api/people", timeout=5)
        ids = [p.get("person_id") or p.get("id") for p in r.json().get("items", r.json().get("people", []))]
        self.assertIn(pid, ids, "Restored person should appear in default list")

        # Clean up
        requests.delete(f"{BASE}/api/people/{pid}",
                        params={"mode": "hard", "reason": "test cleanup"}, timeout=5)


class DBFactStatusWorkflowTests(unittest.TestCase):
    """Group 5: Fact status transitions (extracted → reviewed → rejected)."""

    @classmethod
    def setUpClass(cls):
        r = requests.post(f"{BASE}/api/people", json={
            "display_name": f"FactWF_{uuid.uuid4().hex[:6]}",
            "role": "narrator"
        }, timeout=5)
        cls.person_id = r.json()["person_id"]

    @classmethod
    def tearDownClass(cls):
        requests.delete(f"{BASE}/api/people/{cls.person_id}",
                        params={"mode": "hard", "reason": "test cleanup"}, timeout=5)

    def test_01_fact_status_transitions(self):
        """DB-13: Fact can transition through extracted → reviewed → rejected"""
        r = requests.post(f"{BASE}/api/facts/add", json={
            "person_id": self.person_id,
            "statement": "Workflow test fact",
            "fact_type": "general",
            "status": "extracted"
        }, timeout=5)
        fid = r.json().get("fact_id") or r.json().get("id") or (r.json().get("fact", {}) or {}).get("id")

        # extracted → reviewed
        r2 = requests.patch(f"{BASE}/api/facts/status", json={
            "fact_id": fid, "status": "reviewed"
        }, timeout=5)
        self.assertEqual(r2.status_code, 200)

        # reviewed → rejected
        r3 = requests.patch(f"{BASE}/api/facts/status", json={
            "fact_id": fid, "status": "rejected"
        }, timeout=5)
        self.assertEqual(r3.status_code, 200)

    def test_02_fact_filter_by_status(self):
        """DB-14: Listing facts filters by status"""
        # Add facts with different statuses
        for st in ["extracted", "reviewed"]:
            requests.post(f"{BASE}/api/facts/add", json={
                "person_id": self.person_id,
                "statement": f"Status filter test: {st}",
                "fact_type": "general",
                "status": st
            }, timeout=5)

        r = requests.get(f"{BASE}/api/facts/list",
                         params={"person_id": self.person_id, "status": "reviewed"}, timeout=5)
        items = r.json().get("items") or r.json().get("facts") or []
        for f in items:
            self.assertEqual(f.get("status"), "reviewed",
                             f"Expected only reviewed facts, got {f.get('status')}")


if __name__ == "__main__":
    try:
        r = requests.get(f"{BASE}/api/ping", timeout=5)
        if not r.json().get("ok"):
            raise Exception("API not healthy")
    except Exception as e:
        print(f"ERROR: Cannot reach API at {BASE}/api/ping — {e}")
        print("Make sure the Lorevox API is running before running this test suite.")
        sys.exit(1)

    print(f"\nLorevox 9.0 — DB Smoke Tests")
    print(f"API: {BASE}\n")
    unittest.main(verbosity=2)
