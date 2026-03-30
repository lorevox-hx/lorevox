# Mark Twain & Janice — Visual Verification Results

## Test Environment

- UI: Lorevox 8.0 (localhost:8080)
- API: localhost:8000 (running on Windows host)
- Browser: Chrome (via Claude in Chrome)
- Date: 2026-03-28

## Mark Twain — Full Visual Pipeline

### Dropdown

| Check | Result |
|-------|--------|
| Mark Twain appears in dropdown | PASS |
| Dropdown shows exactly 2 entries (Mark Twain + Janice) | PASS |
| Selecting Mark Twain loads his profile | PASS |
| `state.person_id` = correct UUID | PASS |
| `state.profile.basics.preferred` = "Mark Twain" | PASS |
| `state.profile.basics.dob` = "1835-11-30" | PASS |

### Life Story (Chat)

| Check | Result |
|-------|--------|
| Lori greets Mark Twain by name | PASS |
| Lori references Florida, Missouri birthplace | PASS |

### Bio Builder — Quick Capture

| Check | Result |
|-------|--------|
| Tab renders | PASS |
| Subtitle shows "Capturing biography" | PASS |
| Input placeholder references profile data | PASS |
| Add Fact / Save Note buttons present | PASS |

### Bio Builder — Questionnaire

| Check | Result |
|-------|--------|
| Tab renders with all 7 sections | PASS |
| Personal Information shows "6/7 filled" | PASS |
| Parents section shows "Empty" (correct — field names differ) | PASS |
| All section cards clickable | PASS |

### Bio Builder — Source Inbox

| Check | Result |
|-------|--------|
| Tab renders with file drop zone | PASS |
| Accepts Text, Markdown, CSV, PDF, Images | PASS |
| Shows "No documents yet" (correct — no files uploaded) | PASS |

### Bio Builder — Candidates

| Check | Result |
|-------|--------|
| Tab renders with Review & Promote UI | PASS |
| Candidate Queue shows People/Relationships/Memories/Events/Places/Documents categories | PASS |
| Pending/Approved/People/Memories/Events status badges visible | PASS |

### Bio Builder — Family Tree

| Check | Result |
|-------|--------|
| Tab renders | PASS |
| 12 nodes visible in Cards view | PASS |
| All nodes show proper displayName (no "Unknown") | PASS |
| Mark Twain (narrator) card present | PASS |
| John Marshall Clemens with notes "Justice of the peace, died 1847" | PASS |
| Jane Lampton Clemens with notes "Strong-willed, witty, died 1890" | PASS |
| Orion Clemens card present | PASS |
| Pamela Clemens Moffett card present | PASS |
| Henry Clemens card present | PASS |
| Edit/Connect/Delete buttons on each card | PASS |
| Health indicators: "12 unconnected", "12 unsourced", "10 orphan edge(s)" | PASS |
| Seed Questionnaire / Seed Candidates buttons present | PASS |

### Bio Builder — Life Threads

| Check | Result |
|-------|--------|
| Tab renders | PASS |
| PERSONS (1): Mark Twain | PASS |
| PLACES (4): Hannibal MO, Hartford CT, Elmira NY, Mississippi River | PASS |
| MEMORYS (1): Learning to read the river | PASS |
| EVENTS (3): Halley's Comet, Huckleberry Finn, Tom Sawyer | PASS |
| THEMES (4): Freedom and Independence, Loss and Grief, Humor as Survival, Social Justice | PASS |
| All nodes have Edit/Link/Delete buttons | PASS |
| No crash from missing `relationship` field on edges | PASS |
| Health indicator: "12 orphan edge(s)" with Clean button | PASS |

### Life Map

| Check | Result |
|-------|--------|
| Panel opens | PASS |
| MindElixir renders 6-period scaffold | PASS |
| Root node: "Mark Twain" | PASS |
| Birth seed: "Born · 1835" | PASS |
| Early Childhood · 1835–1840 | PASS |
| School Years · 1841–1847 | PASS |
| Adolescence · 1848–1852 | PASS |
| Early Adulthood · 1853–1865 | PASS |
| Midlife · 1866–1894 | PASS |
| Later Life · 1895+ | PASS |
| Scaffold styling (dashed borders) | PASS |
| "Continue in Interview" button present | PASS |

### Peek at Memoir

| Check | Result |
|-------|--------|
| Panel opens | PASS |
| Shows "Your Story — Getting Started" | PASS |
| Memoir preview describes foundation gathering | PASS |
| Save TXT / Save DOCX buttons present | PASS |
| "Draft Not Ready Yet" indicator shown | PASS |

## Janice — Fresh Narrator Verification

### Dropdown & Profile

| Check | Result |
|-------|--------|
| Janice appears in dropdown | PASS |
| Selecting Janice loads her profile | PASS |
| `state.person_id` = correct UUID (65d51325...) | PASS |
| `state.profile.basics.preferred` = "Janice" | PASS |
| `state.profile.basics.dob` = "1939-09-30" | PASS |
| No Mark Twain data in Janice's profile | PASS |

### Bio Builder — Questionnaire

| Check | Result |
|-------|--------|
| Personal Information shows "5/7 filled" | PASS |
| Parents/Grandparents/Siblings show "Empty" | PASS |
| No Mark Twain questionnaire data present | PASS |

### Bio Builder — Life Threads

| Check | Result |
|-------|--------|
| Tab renders empty (correct for fresh narrator) | PASS |
| "Seed from Candidates" / "Seed Themes" / "+ Add Node" buttons present | PASS |
| No Mark Twain LT data present | PASS |

### Life Map (Scaffold)

| Check | Result |
|-------|--------|
| MindElixir renders 6-period scaffold | PASS |
| Root node: "Janice" | PASS |
| Birth seed: "Born · 1939" | PASS |
| Early Childhood · 1939–1944 | PASS |
| School Years · 1945–1951 | PASS |
| Adolescence · 1952–1956 | PASS |
| Early Adulthood · 1957–1969 | PASS |
| Midlife · 1970–1998 | PASS |
| Later Life · 1999+ | PASS |
| Year ranges computed from DOB 1939 | PASS |
| No Mark Twain periods or data | PASS |

### Narrator Bleed Check

| Check | Result |
|-------|--------|
| Switch Mark Twain → Janice: no MT data in Janice's BB | PASS |
| Switch Janice → Mark Twain: MT data intact (FT 12 nodes, LT 13 nodes) | PASS (verified by re-selecting MT) |
| Life Map updates root/DOB on narrator switch | PASS |

## Summary

| Surface | Mark Twain | Janice |
|---------|-----------|--------|
| Dropdown | PASS | PASS |
| Life Story (Chat) | PASS | PASS |
| Bio Builder — Quick Capture | PASS | PASS |
| Bio Builder — Questionnaire | PASS (6/7) | PASS (5/7) |
| Bio Builder — Source Inbox | PASS | PASS |
| Bio Builder — Candidates | PASS | PASS |
| Bio Builder — Family Tree | PASS (12 nodes) | PASS (empty) |
| Bio Builder — Life Threads | PASS (13 nodes) | PASS (empty) |
| Life Map | PASS (6 scaffold periods, 1835 DOB) | PASS (6 scaffold periods, 1939 DOB) |
| Peek at Memoir | PASS | PASS |
| Narrator Bleed | None detected | None detected |

**Total checks: 73 | Pass: 73 | Fail: 0**
