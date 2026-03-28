# Bio Builder Foundation — Review (Phase B + C + D)

Date: 2026-03-27 (Phase D final)

---

## Phase D Implementation Summary

Phase D added three major capabilities on top of the Phase B/C shell:

**1. File/text intake (FileReader)**
Text files (.txt, .md, .csv, .htm, etc.) are read immediately on upload using the browser's FileReader API. The card status moves from "extracting" → "extracted" as soon as reading completes. Non-text files (PDF, image, Word) get `status: "manual-only"` and show a paste zone in the review surface.

**2. Extracted text on source cards**
Each source card now carries `extractedText` (auto-extracted) or `pastedText` (manually pasted), `detectedItems` (parsed detection results), `status`, and `addedCandidateIds` (provenance tracking). The source list shows "N detected" and "N added" badges.

**3. Candidate generation from source text**
The extraction engine runs four detection passes:
- **People**: relationship-keyword anchor (mother/father/sister/brother/etc.) → proper noun search in the following clause. Two-pass approach: searches after the keyword first (primary direction), falls back to before the keyword only if nothing found. Includes named/called/known-as pattern and title prefix (Mr./Mrs./Dr.) pattern. False positives suppressed by: strict uppercase-first check (charCode 65–90), 2-word minimum, exclusion set (_NOT_NAMES), geographic suffix filter (_GEO_SUFFIXES).
- **Dates**: full month+day+year dates first (suppress the bare year they contain), numeric dates, standalone 4-digit years, decade references.
- **Places**: movement-verb anchor (born in / grew up near / moved to / etc.) → title-cased phrase. Verified starts uppercase without `i` flag expansion. Trailing stopwords stripped. Geographic suffix filter prevents street names.
- **Memories**: sentence-level scan for 17 reminiscence trigger phrases (I remember / used to / as a child / growing up / etc.).

**4. Provenance**
Every candidate carries `source: "source:" + cardId`, `sourceId: cardId`, `sourceFilename: card.filename`. The Candidates tab shows "from 📄 filename.txt" on every source-generated candidate. The source card tracks `addedCandidateIds[]` for its own accounting.

**5. Review surface**
Clicking "Review →" on any source card opens an in-panel review view:
- Extracted text preview (first 600 chars, scrollable)
- Paste zone for non-extractable files
- Detected items grouped by type (People / Dates / Places / Memories)
- Each item shows: detected text + relation badge + context sentence + "Add" button
- "Add all [type]" per section, "Add All Detected Items" at the bottom
- Added items show "✓ Added" in place of the button; whole row dims
- "N candidates added from this source" counter in nav bar
- "Done Reviewing" button returns to source list

---

## Bug Fixed in Phase D

**Root cause**: JavaScript's `i` (case-insensitive) flag on a regex expands `[A-Z]` character class to match *all* letters, not just uppercase. The combined relationship+name regex using `gi` was therefore matching any word after a relationship keyword — "Saturday morning", "Maple Street", "made for me" — as plausible person names.

**Fix applied**: Split into two passes. Pass 1: find relationship keyword positions with `gi` flag only. Pass 2: search the surrounding clause for proper names using a *separate* regex **with no `i` flag** — `[A-Z]` then strictly matches charCodes 65–90. Post-match validation (`_looksLikeName`) adds: charCode gate, 2-word minimum, exclusion set, geographic suffix filter.

---

## Test Results

### Sample 1: bio narrative (Janice)
| Category | Detected | False positives |
|---|---|---|
| People | 7 (mother, father, sister, brother, husband, son, daughter) | 0 |
| Dates | 4 (full + standalone years, years in full dates suppressed) | 0 |
| Places | 3 | 0 |
| Memories | 3 | 0 |

### Sample 2: questionnaire text (structured)
| Category | Detected | False positives |
|---|---|---|
| People | 3 (mother, father, grandmother) | 0 |
| Dates | 4 | 0 |
| Places | 3 | 0 |
| Memories | 1 | 0 |

### End-to-end candidate flow
| Step | Result |
|---|---|
| Source card created on upload | ✓ |
| extractedText populated via FileReader | ✓ |
| detectedItems populated from text | ✓ |
| Individual candidate add | ✓ |
| Duplicate guard (same item twice) | ✓ |
| addAllOfType (adds all of one type) | ✓ |
| addAllFromCard (adds everything) | ✓ |
| All items.added = true after add | ✓ |
| Provenance on all 7 candidates | ✓ |
| Paste text path (manual-only card) | ✓ |
| state.archive untouched | ✓ |
| state.facts untouched | ✓ |
| state.timeline untouched | ✓ |

### Constraint verification
| Constraint | Status |
|---|---|
| No CDN dependencies | ✓ verified (0 external URL references) |
| No truth mutations | ✓ verified (0 writes to archive/facts/timeline) |
| bioBuilderPopover CSS — no display in base rule | ✓ verified |
| bioBuilderPopover:popover-open has display:flex | ✓ verified |
| Life Map popover DOM unmodified | ✓ verified |
| Peek at Memoir popover unmodified | ✓ verified |
| Life Map JS refresh hooks untouched | ✓ verified |

---

## Known Limitations (acceptable at Phase D)

**Structured questionnaire text**: Detection expects natural language prose. Header formats like "Mother: Dorothy Jean Henderson." don't always trigger the relationship keyword pattern because "Mother:" includes a colon which breaks word boundary matching. Detected text from freeform sections works well; structured header fields are partially detected.

**Born-on vs born-in**: "born on June 15, 1939, in Spokane" — the birthplace after the date ("in Spokane") is not captured because "in" alone isn't in MOVEMENT_VERBS. Text formatted as "born in Spokane" is captured correctly. Mitigation: always mention the city early in a natural sentence.

**Single-word names**: Names with only one word are filtered out by the 2-word minimum. "Janny" or "Ida" alone won't be captured. This is intentional — single words are too ambiguous.

**OCR / PDF extraction**: Not implemented. PDF and image cards show a paste zone. Backend extraction is Phase E+ work.

**Candidate promotion to reviewed facts**: Not implemented. All candidates remain in `state.bioBuilder.candidates` until Phase E implements the promotion review flow.

---

## Phase E Recommendations

1. **Questionnaire header extraction**: Add a structured-field parser for "Key: Value" questionnaire lines to supplement the natural language engine.
2. **Candidate promotion UI**: Build the "Promote → Profile / Family / Timeline" review surface with a diff view showing exactly what `state.facts` would change.
3. **Persistence**: Persist `state.bioBuilder` to localStorage so questionnaire answers and candidates survive session reload.
4. **Source card detail update**: After adding all candidates from a card, show a "Complete" state on the card in the source list.
5. **Relationship inference**: When two people candidates share a surname and one has a "parent" relation, auto-generate a relationship candidate linking them.
