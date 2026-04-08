#!/usr/bin/env python3
"""
Lorevox 9.0 — API Smoke Test Suite
Tests all active REST endpoints against a running API on port 8000.

Usage:
    python tests/test_api_smoke.py          # run all
    python tests/test_api_smoke.py -v       # verbose
    python tests/test_api_smoke.py -k ping  # run matching tests

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
TTS_BASE = os.getenv("LOREVOX_TTS_URL", "http://127.0.0.1:8001")


class HealthTests(unittest.TestCase):
    """Group 1: Basic health and connectivity."""

    def test_api_ping(self):
        """AS-01: GET /api/ping returns ok:true"""
        r = requests.get(f"{BASE}/api/ping", timeout=5)
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json().get("ok"))

    def test_tts_voices(self):
        """AS-02: GET /api/tts/voices returns voice list"""
        r = requests.get(f"{TTS_BASE}/api/tts/voices", timeout=10)
        self.assertEqual(r.status_code, 200)
        body = r.json()
        # Should have some voice data
        self.assertIsInstance(body, (dict, list))


class PeopleTests(unittest.TestCase):
    """Group 2: Person CRUD lifecycle."""

    @classmethod
    def setUpClass(cls):
        cls.person_id = None
        cls.test_name = f"Test_Narrator_{uuid.uuid4().hex[:6]}"

    def test_01_create_person(self):
        """AS-03: POST /api/people creates a narrator"""
        r = requests.post(f"{BASE}/api/people", json={
            "display_name": self.test_name,
            "role": "narrator",
            "date_of_birth": "1950-01-15",
            "place_of_birth": "Test City, TS"
        }, timeout=5)
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertIn("person_id", body)
        PeopleTests.person_id = body["person_id"]

    def test_02_list_people(self):
        """AS-04: GET /api/people returns items array with our person"""
        r = requests.get(f"{BASE}/api/people", timeout=5)
        self.assertEqual(r.status_code, 200)
        items = r.json().get("items") or r.json().get("people") or []
        self.assertIsInstance(items, list)
        ids = [p.get("person_id") or p.get("id") for p in items]
        self.assertIn(self.person_id, ids)

    def test_03_get_person(self):
        """AS-05: GET /api/people/{id} returns person details"""
        self.assertIsNotNone(self.person_id)
        r = requests.get(f"{BASE}/api/people/{self.person_id}", timeout=5)
        self.assertEqual(r.status_code, 200)
        body = r.json()
        person = body.get("person", body)  # unwrap nested response
        self.assertEqual(person.get("display_name"), self.test_name)

    def test_04_update_person(self):
        """AS-06: PATCH /api/people/{id} updates display_name"""
        self.assertIsNotNone(self.person_id)
        new_name = f"Updated_{self.test_name}"
        r = requests.patch(f"{BASE}/api/people/{self.person_id}", json={
            "display_name": new_name
        }, timeout=5)
        self.assertEqual(r.status_code, 200)
        # Verify update stuck
        r2 = requests.get(f"{BASE}/api/people/{self.person_id}", timeout=5)
        body2 = r2.json()
        person2 = body2.get("person", body2)  # unwrap nested response
        self.assertEqual(person2.get("display_name"), new_name)

    def test_05_delete_inventory(self):
        """AS-07: GET /api/people/{id}/delete-inventory returns dependency counts"""
        self.assertIsNotNone(self.person_id)
        r = requests.get(f"{BASE}/api/people/{self.person_id}/delete-inventory", timeout=5)
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertIsInstance(body, dict)

    def test_06_soft_delete_person(self):
        """AS-08: DELETE /api/people/{id}?mode=soft soft-deletes"""
        self.assertIsNotNone(self.person_id)
        r = requests.delete(f"{BASE}/api/people/{self.person_id}",
                            params={"mode": "soft", "reason": "smoke test cleanup"},
                            timeout=5)
        self.assertEqual(r.status_code, 200)

    def test_07_restore_person(self):
        """AS-09: POST /api/people/{id}/restore restores soft-deleted"""
        self.assertIsNotNone(self.person_id)
        r = requests.post(f"{BASE}/api/people/{self.person_id}/restore", timeout=5)
        self.assertEqual(r.status_code, 200)

    def test_08_hard_delete_person(self):
        """AS-10: DELETE /api/people/{id}?mode=hard permanently removes"""
        self.assertIsNotNone(self.person_id)
        r = requests.delete(f"{BASE}/api/people/{self.person_id}",
                            params={"mode": "hard", "reason": "smoke test cleanup"},
                            timeout=5)
        self.assertEqual(r.status_code, 200)


class ProfileTests(unittest.TestCase):
    """Group 3: Profile get/put lifecycle."""

    @classmethod
    def setUpClass(cls):
        # Create a test person for profiles
        r = requests.post(f"{BASE}/api/people", json={
            "display_name": f"ProfileTest_{uuid.uuid4().hex[:6]}",
            "role": "narrator",
            "date_of_birth": "1945-06-10",
            "place_of_birth": "Profile Town, PT"
        }, timeout=5)
        cls.person_id = r.json()["person_id"]

    @classmethod
    def tearDownClass(cls):
        requests.delete(f"{BASE}/api/people/{cls.person_id}",
                        params={"mode": "hard", "reason": "test cleanup"}, timeout=5)

    def test_01_get_profile(self):
        """AS-11: GET /api/profiles/{id} returns profile"""
        r = requests.get(f"{BASE}/api/profiles/{self.person_id}", timeout=5)
        self.assertEqual(r.status_code, 200)
        self.assertIn("profile", r.json())

    def test_02_put_profile(self):
        """AS-12: PUT /api/profiles/{id} replaces profile JSON"""
        profile = {
            "basics": {
                "fullname": "Test McProfileson",
                "preferred": "Testy",
                "dob": "1945-06-10",
                "pob": "Profile Town, PT"
            }
        }
        r = requests.put(f"{BASE}/api/profiles/{self.person_id}",
                         json={"profile": profile}, timeout=5)
        self.assertEqual(r.status_code, 200)
        # Verify
        r2 = requests.get(f"{BASE}/api/profiles/{self.person_id}", timeout=5)
        saved = r2.json().get("profile", {})
        self.assertEqual(saved.get("basics", {}).get("fullname"), "Test McProfileson")

    def test_03_patch_profile(self):
        """AS-13: PATCH /api/profiles/{id} merges into existing profile"""
        patch = {"basics": {"nickname": "Smokey"}}
        r = requests.patch(f"{BASE}/api/profiles/{self.person_id}",
                           json={"patch": patch}, timeout=5)
        self.assertEqual(r.status_code, 200)


class SessionTests(unittest.TestCase):
    """Group 4: Session/turn lifecycle."""

    @classmethod
    def setUpClass(cls):
        cls.conv_id = None

    def test_01_new_session(self):
        """AS-14: POST /api/session/new creates session"""
        r = requests.post(f"{BASE}/api/session/new",
                          params={"title": "Smoke Test Session"}, timeout=5)
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertIn("conv_id", body)
        SessionTests.conv_id = body["conv_id"]

    def test_02_list_sessions(self):
        """AS-15: GET /api/sessions/list returns sessions"""
        r = requests.get(f"{BASE}/api/sessions/list", timeout=5)
        self.assertEqual(r.status_code, 200)
        body = r.json()
        items = body.get("items") or body.get("sessions") or []
        self.assertIsInstance(items, list)

    def test_03_put_session(self):
        """AS-16: POST /api/session/put upserts session metadata"""
        self.assertIsNotNone(self.conv_id)
        r = requests.post(f"{BASE}/api/session/put", json={
            "conv_id": self.conv_id,
            "title": "Updated Smoke Session",
            "payload": {"test": True}
        }, timeout=5)
        self.assertEqual(r.status_code, 200)

    def test_04_get_session(self):
        """AS-17: GET /api/session/get returns session"""
        self.assertIsNotNone(self.conv_id)
        r = requests.get(f"{BASE}/api/session/get",
                         params={"conv_id": self.conv_id}, timeout=5)
        self.assertEqual(r.status_code, 200)

    def test_05_get_turns(self):
        """AS-18: GET /api/session/turns returns turns array"""
        self.assertIsNotNone(self.conv_id)
        r = requests.get(f"{BASE}/api/session/turns",
                         params={"conv_id": self.conv_id}, timeout=5)
        self.assertEqual(r.status_code, 200)
        body = r.json()
        turns = body.get("turns") or body.get("items") or []
        self.assertIsInstance(turns, list)

    def test_06_delete_session(self):
        """AS-19: DELETE /api/session/delete removes session"""
        self.assertIsNotNone(self.conv_id)
        r = requests.delete(f"{BASE}/api/session/delete",
                            params={"conv_id": self.conv_id}, timeout=5)
        self.assertEqual(r.status_code, 200)


class FactsTests(unittest.TestCase):
    """Group 5: Facts CRUD and isolation."""

    @classmethod
    def setUpClass(cls):
        r = requests.post(f"{BASE}/api/people", json={
            "display_name": f"FactsTest_{uuid.uuid4().hex[:6]}",
            "role": "narrator"
        }, timeout=5)
        cls.person_id = r.json()["person_id"]
        cls.fact_id = None

    @classmethod
    def tearDownClass(cls):
        requests.delete(f"{BASE}/api/people/{cls.person_id}",
                        params={"mode": "hard", "reason": "test cleanup"}, timeout=5)

    def test_01_add_fact(self):
        """AS-20: POST /api/facts/add creates a fact"""
        r = requests.post(f"{BASE}/api/facts/add", json={
            "person_id": self.person_id,
            "statement": "Born in Test City on January 15, 1950",
            "fact_type": "birth",
            "status": "extracted",
            "confidence": 0.95
        }, timeout=5)
        self.assertEqual(r.status_code, 200)
        body = r.json()
        FactsTests.fact_id = body.get("fact_id") or body.get("id") or (body.get("fact", {}) or {}).get("id")
        self.assertIsNotNone(FactsTests.fact_id)

    def test_02_list_facts(self):
        """AS-21: GET /api/facts/list returns facts for person"""
        r = requests.get(f"{BASE}/api/facts/list",
                         params={"person_id": self.person_id}, timeout=5)
        self.assertEqual(r.status_code, 200)
        body = r.json()
        items = body.get("items") or body.get("facts") or []
        self.assertIsInstance(items, list)
        self.assertGreaterEqual(len(items), 1)

    def test_03_update_fact_status(self):
        """AS-22: PATCH /api/facts/status updates fact status"""
        self.assertIsNotNone(self.fact_id)
        r = requests.patch(f"{BASE}/api/facts/status", json={
            "fact_id": self.fact_id,
            "status": "reviewed"
        }, timeout=5)
        self.assertEqual(r.status_code, 200)

    def test_04_delete_fact(self):
        """AS-23: DELETE /api/facts/delete removes fact"""
        self.assertIsNotNone(self.fact_id)
        r = requests.delete(f"{BASE}/api/facts/delete",
                            params={"id": self.fact_id}, timeout=5)
        self.assertEqual(r.status_code, 200)


class TimelineTests(unittest.TestCase):
    """Group 6: Timeline event lifecycle."""

    @classmethod
    def setUpClass(cls):
        r = requests.post(f"{BASE}/api/people", json={
            "display_name": f"TimelineTest_{uuid.uuid4().hex[:6]}",
            "role": "narrator"
        }, timeout=5)
        cls.person_id = r.json()["person_id"]
        cls.event_id = None

    @classmethod
    def tearDownClass(cls):
        requests.delete(f"{BASE}/api/people/{cls.person_id}",
                        params={"mode": "hard", "reason": "test cleanup"}, timeout=5)

    def test_01_add_timeline_event(self):
        """AS-24: POST /api/timeline/add creates event"""
        r = requests.post(f"{BASE}/api/timeline/add", json={
            "person_id": self.person_id,
            "ts": "1950-01-15T00:00:00Z",
            "title": "Birth",
            "description": "Born in Test City",
            "kind": "birth"
        }, timeout=5)
        self.assertEqual(r.status_code, 200)
        body = r.json()
        TimelineTests.event_id = body.get("event_id") or body.get("id")

    def test_02_list_timeline(self):
        """AS-25: GET /api/timeline/list returns events"""
        r = requests.get(f"{BASE}/api/timeline/list",
                         params={"person_id": self.person_id}, timeout=5)
        self.assertEqual(r.status_code, 200)
        body = r.json()
        items = body.get("items") or body.get("events") or []
        self.assertIsInstance(items, list)

    def test_03_delete_timeline_event(self):
        """AS-26: DELETE /api/timeline/delete removes event"""
        self.assertIsNotNone(self.event_id)
        r = requests.delete(f"{BASE}/api/timeline/delete",
                            params={"id": self.event_id}, timeout=5)
        self.assertEqual(r.status_code, 200)


class NarratorIsolationTests(unittest.TestCase):
    """Group 7: Cross-narrator data isolation."""

    @classmethod
    def setUpClass(cls):
        # Create two narrators
        r1 = requests.post(f"{BASE}/api/people", json={
            "display_name": "Narrator_A_Isolation",
            "role": "narrator",
            "date_of_birth": "1940-03-01",
            "place_of_birth": "City A, AA"
        }, timeout=5)
        cls.person_a = r1.json()["person_id"]

        r2 = requests.post(f"{BASE}/api/people", json={
            "display_name": "Narrator_B_Isolation",
            "role": "narrator",
            "date_of_birth": "1960-07-20",
            "place_of_birth": "City B, BB"
        }, timeout=5)
        cls.person_b = r2.json()["person_id"]

    @classmethod
    def tearDownClass(cls):
        for pid in [cls.person_a, cls.person_b]:
            requests.delete(f"{BASE}/api/people/{pid}",
                            params={"mode": "hard", "reason": "test cleanup"}, timeout=5)

    def test_01_facts_isolated(self):
        """AS-27: Facts added to person A do not appear in person B"""
        # Add fact to person A
        requests.post(f"{BASE}/api/facts/add", json={
            "person_id": self.person_a,
            "statement": "Unique fact for A only: born in City A",
            "fact_type": "birth",
            "status": "extracted"
        }, timeout=5)

        # List facts for person B — should be empty
        r = requests.get(f"{BASE}/api/facts/list",
                         params={"person_id": self.person_b}, timeout=5)
        items = r.json().get("items") or r.json().get("facts") or []
        a_statements = [f.get("statement", "") for f in items if "City A" in f.get("statement", "")]
        self.assertEqual(len(a_statements), 0, "Person B should not see Person A's facts")

    def test_02_timeline_isolated(self):
        """AS-28: Timeline events for person A do not appear in person B"""
        requests.post(f"{BASE}/api/timeline/add", json={
            "person_id": self.person_a,
            "ts": "1940-03-01T00:00:00Z",
            "title": "Unique_Event_For_A",
            "kind": "birth"
        }, timeout=5)

        r = requests.get(f"{BASE}/api/timeline/list",
                         params={"person_id": self.person_b}, timeout=5)
        items = r.json().get("items") or r.json().get("events") or []
        a_titles = [e.get("title", "") for e in items if "Unique_Event_For_A" in e.get("title", "")]
        self.assertEqual(len(a_titles), 0, "Person B should not see Person A's timeline")

    def test_03_profiles_isolated(self):
        """AS-29: Profile for person A is separate from person B"""
        # Set profile for A
        requests.put(f"{BASE}/api/profiles/{self.person_a}",
                     json={"profile": {"basics": {"fullname": "Person A"}}}, timeout=5)
        # Set profile for B
        requests.put(f"{BASE}/api/profiles/{self.person_b}",
                     json={"profile": {"basics": {"fullname": "Person B"}}}, timeout=5)

        # Verify A's profile
        r_a = requests.get(f"{BASE}/api/profiles/{self.person_a}", timeout=5)
        name_a = r_a.json().get("profile", {}).get("basics", {}).get("fullname", "")
        self.assertEqual(name_a, "Person A")

        # Verify B's profile
        r_b = requests.get(f"{BASE}/api/profiles/{self.person_b}", timeout=5)
        name_b = r_b.json().get("profile", {}).get("basics", {}).get("fullname", "")
        self.assertEqual(name_b, "Person B")


class ChatConnectivityTests(unittest.TestCase):
    """Group 8: Chat endpoint connectivity."""

    def test_01_rest_chat_responds(self):
        """AS-30: POST /api/chat returns a response (may be slow due to LLM)"""
        r = requests.post(f"{BASE}/api/chat", json={
            "messages": [{"role": "user", "content": "Say hello in one word."}],
            "max_new": 20,
            "temp": 0.1
        }, timeout=120)
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertTrue(body.get("ok"), f"Chat returned ok=false: {body}")
        self.assertIsInstance(body.get("text"), str)
        self.assertGreater(len(body["text"]), 0)

    def test_02_stream_chat_responds(self):
        """AS-31: POST /api/chat/stream returns NDJSON stream"""
        r = requests.post(f"{BASE}/api/chat/stream", json={
            "messages": [{"role": "user", "content": "Say hi."}],
            "max_new": 20,
            "temp": 0.1
        }, timeout=120, stream=True)
        self.assertEqual(r.status_code, 200)

        chunks = []
        for line in r.iter_lines():
            if line:
                try:
                    chunk = json.loads(line)
                    chunks.append(chunk)
                except json.JSONDecodeError:
                    pass

        # Should have at least one delta and one done
        deltas = [c for c in chunks if "delta" in c]
        dones = [c for c in chunks if c.get("done")]
        self.assertGreater(len(deltas), 0, "No delta chunks received")
        self.assertGreater(len(dones), 0, "No done signal received")


if __name__ == "__main__":
    # Check API is reachable before running
    try:
        r = requests.get(f"{BASE}/api/ping", timeout=5)
        if not r.json().get("ok"):
            raise Exception("API not healthy")
    except Exception as e:
        print(f"ERROR: Cannot reach API at {BASE}/api/ping — {e}")
        print("Make sure the Lorevox API is running before running this test suite.")
        sys.exit(1)

    print(f"\nLorevox 9.0 — API Smoke Tests")
    print(f"API: {BASE}  |  TTS: {TTS_BASE}\n")
    unittest.main(verbosity=2)
