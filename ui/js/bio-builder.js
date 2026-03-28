/* ═══════════════════════════════════════════════════════════════
   bio-builder.js — Bio Builder intake and staging layer
   Lorevox 8.0 — Phase D (builds on Phase B + C foundation)

   Phase D additions over Phase C:
     - FileReader text extraction for text/md/csv/htm uploads
     - Manual paste path for PDF, image, and binary files
     - Pattern-based detection: people (relationship-anchored), dates,
       places, memory fragments — each with sentence context
     - Provenance model: every candidate tracks sourceCardId + filename
     - Source card review surface: extracted text + detected items +
       add-to-candidate actions with duplicate guard
     - Updated Candidates tab: shows source filename as provenance

   Architecture:
     Archive / Source Intake
       ↓
     Bio Builder  ← THIS MODULE
       organizes and stages candidate biographical information
       ↓
     Structured History
       reviewed facts, people, relationships, periods, events
       ↓
     Derived Views (Life Map, Timeline, Peek at Memoir)

   Truth rules:
     - Writes ONLY to state.bioBuilder
     - Never writes to state.archive, state.facts, state.timeline
     - Candidate items are NOT reviewed facts
     - Promotion to structured history requires explicit user action (Phase E)
     - No CDN dependencies — self-contained

   Load order: after app.js / state.js
   Exposes: window.LorevoxBioBuilder
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ───────────────────────────────────────────────────────────
     SECTION DEFINITIONS  (Janice Personal Information model)
  ─────────────────────────────────────────────────────────── */

  var SECTIONS = [
    {
      id: "personal", label: "Personal Information", icon: "👤",
      hint: "Full name, preferred name, birth date, birth place",
      fields: [
        { id: "fullName",      label: "Full Name",      type: "text" },
        { id: "preferredName", label: "Preferred Name", type: "text" },
        { id: "birthOrder",    label: "Birth Order",    type: "text",     placeholder: "e.g. 2 (second child)" },
        { id: "dateOfBirth",   label: "Date of Birth",  type: "text",     placeholder: "YYYY-MM-DD" },
        { id: "timeOfBirth",   label: "Time of Birth",  type: "text",     placeholder: "HH:MM (optional)" },
        { id: "placeOfBirth",  label: "Place of Birth", type: "text",     placeholder: "City, State / Country" },
        { id: "zodiacSign",    label: "Zodiac Sign",    type: "text",     placeholder: "optional" }
      ]
    },
    {
      id: "parents", label: "Parents", icon: "🌱",
      hint: "Mother and father — names, dates, occupation, notable life events",
      repeatable: true, repeatLabel: "parent",
      fields: [
        { id: "firstName",         label: "First Name",                    type: "text" },
        { id: "middleName",        label: "Middle Name",                   type: "text" },
        { id: "lastName",          label: "Last Name",                     type: "text" },
        { id: "birthDate",         label: "Birth Date",                    type: "text", placeholder: "YYYY-MM-DD" },
        { id: "birthPlace",        label: "Birth Place",                   type: "text" },
        { id: "occupation",        label: "Occupation",                    type: "text" },
        { id: "notableLifeEvents", label: "Notable Life Events / Stories", type: "textarea" }
      ]
    },
    {
      id: "grandparents", label: "Grandparents", icon: "🌳",
      hint: "Ancestry, cultural background, memorable stories",
      repeatable: true, repeatLabel: "grandparent",
      fields: [
        { id: "firstName",           label: "First Name",          type: "text" },
        { id: "lastName",            label: "Last Name",           type: "text" },
        { id: "ancestry",            label: "Ancestry",            type: "text" },
        { id: "culturalBackground",  label: "Cultural Background", type: "text" },
        { id: "memorableStories",    label: "Memorable Stories",   type: "textarea" }
      ]
    },
    {
      id: "siblings", label: "Siblings", icon: "👫",
      hint: "Birth order, unique characteristics, shared experiences, memories",
      repeatable: true, repeatLabel: "sibling",
      fields: [
        { id: "firstName",             label: "First Name",             type: "text" },
        { id: "middleName",            label: "Middle Name",            type: "text" },
        { id: "lastName",              label: "Last Name",              type: "text" },
        { id: "birthOrder",            label: "Birth Order",            type: "text" },
        { id: "uniqueCharacteristics", label: "Unique Characteristics", type: "textarea" },
        { id: "sharedExperiences",     label: "Shared Experiences",     type: "textarea" },
        { id: "memories",              label: "Memories",               type: "textarea" }
      ]
    },
    {
      id: "earlyMemories", label: "Early Memories", icon: "🌙",
      hint: "First memory, favorite toy, significant early events",
      fields: [
        { id: "firstMemory",      label: "First Memory",            type: "textarea" },
        { id: "favoriteToy",      label: "Favorite Toy / Object",   type: "textarea" },
        { id: "significantEvent", label: "Significant Early Event", type: "textarea" }
      ]
    },
    {
      id: "education", label: "Education & Career", icon: "🎓",
      hint: "Schooling, higher education, career, community involvement",
      fields: [
        { id: "schooling",             label: "Schooling",              type: "textarea" },
        { id: "higherEducation",       label: "Higher Education",       type: "textarea" },
        { id: "earlyCareer",           label: "Early Career",           type: "textarea" },
        { id: "careerProgression",     label: "Career Progression",     type: "textarea" },
        { id: "communityInvolvement",  label: "Community Involvement",  type: "textarea" },
        { id: "mentorship",            label: "Mentorship",             type: "textarea" }
      ]
    },
    {
      id: "laterYears", label: "Later Years", icon: "🌅",
      hint: "Retirement, life lessons, advice for future generations",
      fields: [
        { id: "retirement",                     label: "Retirement",                      type: "textarea" },
        { id: "lifeLessons",                    label: "Life Lessons",                    type: "textarea" },
        { id: "adviceForFutureGenerations",     label: "Advice for Future Generations",   type: "textarea" }
      ]
    },
    {
      id: "hobbies", label: "Hobbies & Interests", icon: "🎨",
      hint: "Hobbies, world events, personal challenges, travel",
      fields: [
        { id: "hobbies",             label: "Hobbies",             type: "textarea" },
        { id: "worldEvents",         label: "World Events",        type: "textarea" },
        { id: "personalChallenges",  label: "Personal Challenges", type: "textarea" },
        { id: "travel",              label: "Travel",              type: "textarea" }
      ]
    },
    {
      id: "additionalNotes", label: "Additional Notes", icon: "📝",
      hint: "Unfinished dreams, messages for future generations",
      fields: [
        { id: "unfinishedDreams",              label: "Unfinished Dreams",                type: "textarea" },
        { id: "messagesForFutureGenerations",  label: "Messages for Future Generations",  type: "textarea" }
      ]
    }
  ];

  /* ───────────────────────────────────────────────────────────
     STATE MODEL
     All Bio Builder state lives under state.bioBuilder.
     Scoped per narrator by personId.
     Never touches: state.archive, state.facts, state.timeline.

     Phase D additions to source cards:
       detectedItems:     { people, dates, places, memories } — raw detection output
       addedCandidateIds: [] — candidate IDs generated from this card (provenance)
       pastedText:        string | null — manually pasted text for non-text files
       fileSize:          number — bytes
  ─────────────────────────────────────────────────────────── */

  function _ensureState() {
    if (typeof state === "undefined") return null;
    if (!state.bioBuilder) {
      state.bioBuilder = {
        personId:      null,
        quickItems:    [],   // [{id, text, type, ts}]  type: "fact"|"note"
        questionnaire: {},   // {sectionId: data}
        sourceCards:   [],   // [{id, filename, fileSize, sourceType, ts, status,
                             //   extractedText, pastedText, detectedItems,
                             //   addedCandidateIds}]
                             //   status: "extracting"|"extracted"|"manual-only"|"failed"
        candidates: {
          people:        [],
          relationships: [],
          events:        [],
          memories:      [],
          places:        [],
          documents:     []
        }
      };
    }
    return state.bioBuilder;
  }

  function _bb() { return _ensureState(); }

  function _personChanged(newId) {
    var bb = _bb(); if (!bb) return;
    if (bb.personId !== newId) {
      bb.personId      = newId;
      bb.quickItems    = [];
      bb.questionnaire = {};
      bb.sourceCards   = [];
      bb.candidates    = {
        people: [], relationships: [], events: [], memories: [], places: [], documents: []
      };
    }
  }

  /* ───────────────────────────────────────────────────────────
     UTILITIES
  ─────────────────────────────────────────────────────────── */

  function _el(id) { return document.getElementById(id); }

  function _uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function _currentPersonId() {
    try { return (typeof state !== "undefined" && state.person_id) ? state.person_id : null; }
    catch (_) { return null; }
  }

  function _currentPersonName() {
    try {
      if (typeof state !== "undefined" && state.profile && state.profile.basics) {
        return state.profile.basics.preferredName || state.profile.basics.fullName || null;
      }
    } catch (_) {}
    return null;
  }

  function _readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) { resolve(e.target.result || ""); };
      reader.onerror = function () { reject(new Error("FileReader failed")); };
      reader.readAsText(file, "UTF-8");
    });
  }

  function _canExtractText(file) {
    var name = (file.name || "").toLowerCase();
    var mime = (file.type || "").toLowerCase();
    return (
      mime.startsWith("text/") ||
      /\.(txt|md|markdown|csv|tsv|rtf|htm|html|log)$/.test(name)
    );
  }

  function _esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function _formatBytes(bytes) {
    if (!bytes) return "";
    if (bytes < 1024)       return bytes + " B";
    if (bytes < 1048576)    return Math.round(bytes / 1024) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  /* ───────────────────────────────────────────────────────────
     PHASE D — TEXT EXTRACTION ENGINE

     _parseTextItems(text) → { people, dates, places, memories }

     Each detected item:
     {
       id:       uid,
       text:     the matched value (name / year / place / sentence),
       context:  surrounding sentence (shown in review surface),
       relation: (people only) "mother" | "father" | "sister" etc.
       added:    false   ← set true when user adds it as a candidate
     }

     Detection strategy:
       people    — relationship keyword anchor + nearby proper noun
       dates     — full dates, 4-digit years, decade refs
       places    — movement/origin verbs + capitalized phrase
       memories  — sentences containing recall/reminiscence language

     All detection is conservative — context is always shown so the
     user can judge whether each item is worth adding as a candidate.
  ─────────────────────────────────────────────────────────── */

  var REL_KEYWORDS = [
    "mother","father","mom","dad","mama","papa","mum",
    "grandmother","grandfather","grandma","grandpa","gran","granny","nana","grandad","granddad",
    "sister","brother","aunt","uncle",
    "wife","husband","spouse","partner",
    "daughter","son","child",
    "grandson","granddaughter","grandchild",
    "cousin","niece","nephew",
    "stepmother","stepfather","stepdad","stepmom","stepsis","stepbrother",
    "mother-in-law","father-in-law","sister-in-law","brother-in-law"
  ];

  var MEMORY_TRIGGERS = [
    "I remember", "I recall", "I can still", "I'll never forget", "I will never forget",
    "I never forgot", "I always remember", "I used to", "used to",
    "when I was", "as a child", "as a little", "as a kid", "as a young",
    "growing up", "my earliest", "my first", "my favorite", "my fondest",
    "fondly remember", "always cherished", "never forget", "miss those",
    "those days", "back then", "in those days", "at that time"
  ];

  var MOVEMENT_VERBS = [
    "born in", "born near", "born at",
    "grew up in", "grew up near",
    "raised in", "raised near",
    "lived in", "lived near", "lived on",
    "moved to", "moved from",
    "settled in", "settled near",
    "relocated to", "emigrated to", "emigrated from",
    "immigrated to", "immigrated from",
    "came from", "came to",
    "was from", "originally from",
    "grew up outside", "grew up around"
  ];

  /* Split text into sentences for context lookup */
  function _sentences(text) {
    return text
      .split(/(?<=[.!?])\s+(?=[A-Z"']|$)/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 5; });
  }

  /* Find the sentence containing a match */
  function _contextSentence(text, matchIndex, matchLength) {
    var before  = text.slice(0, matchIndex);
    var after   = text.slice(matchIndex + matchLength);
    var sentStart = before.lastIndexOf(". ");
    var sentEnd   = after.search(/[.!?]/);
    var start = sentStart < 0 ? Math.max(0, matchIndex - 80) : sentStart + 2;
    var end   = sentEnd < 0   ? Math.min(text.length, matchIndex + matchLength + 80)
                              : matchIndex + matchLength + sentEnd + 1;
    var ctx = text.slice(start, end).trim();
    if (ctx.length > 200) ctx = ctx.slice(0, 197) + "…";
    return ctx;
  }

  /*
   * Words that begin with a capital letter but are NOT person names.
   * Checked against both the full captured string and its first word.
   */
  var _NOT_NAMES = new Set([
    // Articles / determiners
    "The","A","An","My","Her","His","Their","Our","Your","Its",
    // Pronouns
    "I","We","She","He","They","You","It","Me","Us","Him","Them","Himself","Herself",
    // Demonstratives
    "This","That","These","Those",
    // Prepositions / conjunctions
    "For","On","In","At","To","Of","And","But","Or","So","As","If","By","Up",
    "Out","Off","From","With","About","After","Before","During","Since","Until",
    // Calendar
    "January","February","March","April","May","June","July","August",
    "September","October","November","December",
    "Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday",
    // Common sentence-starters that aren't names
    "There","Here","Where","When","While","Although","Because","Since",
    "Then","Now","Later","Today","Yesterday","Tomorrow",
    "Mr","Mrs","Miss","Ms","Dr","Prof",
    // Days / time words
    "Spring","Summer","Autumn","Fall","Winter",
    "North","South","East","West","Northern","Southern","Eastern","Western",
    // Very common non-name capitalized words in bio text
    "World","War","School","College","University","Church","God","Lord",
    "United","States","America","American","English","Irish","Scottish"
  ]);

  /*
   * Return true if `name` looks like a real person name:
   *   • first char is genuinely uppercase (charCode 65-90 = A-Z)
   *   • not in the exclusion set
   *   • has at least 2 words (single word = too ambiguous)
   *   • each word is 2+ chars
   */
  // Last-word suffixes that indicate a street, road, or geographic feature — not a person
  var _GEO_SUFFIXES = new Set([
    "Street","St","Avenue","Ave","Road","Rd","Drive","Dr","Lane","Ln",
    "Boulevard","Blvd","Court","Ct","Way","Place","Pl","Circle","Cir","Terrace",
    "Highway","Hwy","Parkway","Pkwy","Creek","River","Lake","Mountain","Hill",
    "Valley","Park","Bridge","Farm","Ranch","County","Township","District",
    "Railroad","Railway","College","University","School","Hospital","Church",
    "Elementary","High","Junior","Senior","Middle"
  ]);

  function _looksLikeName(name) {
    var first = name.charCodeAt(0);
    if (first < 65 || first > 90) return false;                  // must start A-Z
    var words = name.split(/\s+/);
    if (words.length < 2) return false;                           // need ≥ 2 words
    if (_NOT_NAMES.has(name) || _NOT_NAMES.has(words[0])) return false;
    if (_GEO_SUFFIXES.has(words[words.length - 1])) return false; // street/place suffix
    if (words.some(function (w) { return w.length < 2; })) return false;
    return true;
  }

  /* ── People detection ───────────────────────────────────── */
  function _detectPeople(text) {
    var found = [];
    var seen  = {};
    var m;

    /*
     * Pattern 1: Relationship keyword → proper name within the same clause.
     *
     * BUG: using `gi` on a regex containing [A-Z] causes JavaScript to
     * expand [A-Z] to match all letters (both cases) due to case-insensitive
     * mode.  We therefore:
     *   a) use `gi` ONLY to locate the relationship keyword, then
     *   b) search the surrounding text with a separate regex that has NO
     *      `i` flag — [A-Z] then strictly matches uppercase A–Z only.
     *
     * Search order: AFTER the keyword first (primary direction), then
     * BEFORE the keyword only as a fallback.  Searching after first
     * prevents a prior name in the window from displacing the intended
     * one (e.g. "...sister Patricia... and his brother Robert..." — when
     * scanning for "brother" we want "Robert", not "Patricia").
     */
    var kwPat   = new RegExp("\\b(" + REL_KEYWORDS.join("|") + ")\\b", "gi");
    // Name pattern — NO `i` flag: [A-Z] = uppercase A-Z only
    var namePat = /\b([A-Z][a-z]{1,18}(?:\s+[A-Z][a-z]{1,18}){1,2})\b/g;

    function _firstNameIn(searchText, fallbackPos) {
      namePat.lastIndex = 0;
      var nm;
      while ((nm = namePat.exec(searchText)) !== null) {
        var candidate = nm[1].trim();
        if (_looksLikeName(candidate)) return candidate;
      }
      return null;
    }

    while ((m = kwPat.exec(text)) !== null) {
      var relation  = m[1].toLowerCase();
      var kwEnd     = m.index + m[0].length;

      // ── Primary: search AFTER the keyword (same clause) ────
      var afterKw   = text.slice(kwEnd, Math.min(text.length, kwEnd + 140));
      var sentBreak = afterKw.search(/[.!?]/);
      var clause    = sentBreak >= 0 ? afterKw.slice(0, sentBreak) : afterKw;

      var name = _firstNameIn(clause);

      // ── Fallback: search BEFORE the keyword ─────────────────
      // Handles "Margaret, his mother, was born…" constructions.
      if (!name) {
        var beforeKw = text.slice(Math.max(0, m.index - 60), m.index);
        // Trim before at previous sentence boundary
        var prevSent = beforeKw.search(/[.!?][^.!?]*$/);
        var beforeClip = prevSent >= 0 ? beforeKw.slice(prevSent + 1) : beforeKw;
        name = _firstNameIn(beforeClip);
      }

      if (!name) continue;
      var key = name.toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;

      var namePos = text.indexOf(name, Math.max(0, m.index - 60));
      found.push({
        id:       _uid(),
        text:     name,
        relation: relation,
        context:  _contextSentence(text, namePos >= 0 ? namePos : m.index, name.length),
        added:    false
      });
    }

    // Pattern 2: "named X" / "called X" / "known as X"  — no `i` flag needed (keywords are lowercase)
    var namedPat = /\b(?:named|called|known as)\s+([A-Z][a-z]{1,18}(?:\s+[A-Z][a-z]{1,18}){0,2})/g;
    while ((m = namedPat.exec(text)) !== null) {
      var name2 = m[1].trim();
      if (!_looksLikeName(name2)) continue;
      var key2 = name2.toLowerCase();
      if (seen[key2]) continue;
      seen[key2] = true;
      found.push({ id: _uid(), text: name2, relation: "", context: _contextSentence(text, m.index, m[0].length), added: false });
    }

    // Pattern 3: Mr. / Mrs. / Miss / Ms. / Dr. followed by a surname
    var titlePat = /\b(Mr\.|Mrs\.|Miss|Ms\.|Dr\.)\s+([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20})?)/g;
    while ((m = titlePat.exec(text)) !== null) {
      var name3 = m[2].trim();
      var full3 = m[1] + " " + name3;
      var key3  = full3.toLowerCase();
      if (seen[key3]) continue;
      seen[key3] = true;
      found.push({ id: _uid(), text: full3, relation: "", context: _contextSentence(text, m.index, m[0].length), added: false });
    }

    return found.slice(0, 20);
  }

  /* ── Date detection ─────────────────────────────────────── */
  function _detectDates(text) {
    var found       = [];
    var seen        = {};
    var seenYears   = new Set(); // years already covered by a full date
    var m;

    // Full dates first: "January 15, 1942" / "15th January 1942"
    // (No `i` flag needed — month names are baked in.)
    var fullDatePat = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+(\d{4})\b/g;
    while ((m = fullDatePat.exec(text)) !== null) {
      var ds = m[0].trim();
      if (!seen[ds]) {
        seen[ds] = true;
        seenYears.add(m[2]); // mark the year so we don't emit it as a bare year too
        found.push({ id: _uid(), text: ds, context: _contextSentence(text, m.index, m[0].length), added: false });
      }
    }

    // Numeric dates: MM/DD/YYYY or DD/MM/YYYY
    var numDatePat = /\b\d{1,2}[\/\-]\d{1,2}[\/\-](19|20)(\d{2})\b/g;
    while ((m = numDatePat.exec(text)) !== null) {
      var ds2 = m[0].trim();
      if (!seen[ds2]) {
        seen[ds2] = true;
        seenYears.add(m[1] + m[2]);
        found.push({ id: _uid(), text: ds2, context: _contextSentence(text, m.index, m[0].length), added: false });
      }
    }

    // Standalone 4-digit year — only if not already captured inside a full date
    var yearPat = /(?<!\d)(1[89]\d{2}|20[0-2]\d)(?!\d)/g;
    while ((m = yearPat.exec(text)) !== null) {
      var yr = m[0];
      if (seenYears.has(yr)) continue; // suppress — already part of a richer date
      if (!seen[yr]) {
        seen[yr] = true;
        found.push({ id: _uid(), text: yr, context: _contextSentence(text, m.index, m[0].length), added: false });
      }
    }

    // Decade references: "the 1950s" / "the '60s"
    var decadePat = /\bthe\s+(1\d{3}s|'\d{2}s)\b/gi;
    while ((m = decadePat.exec(text)) !== null) {
      var dec = m[0].trim();
      if (!seen[dec]) {
        seen[dec] = true;
        found.push({ id: _uid(), text: dec, context: _contextSentence(text, m.index, m[0].length), added: false });
      }
    }

    return found.slice(0, 24);
  }

  /* ── Place detection ────────────────────────────────────── */
  function _detectPlaces(text) {
    var found = [];
    var seen  = {};
    var m;

    /*
     * IMPORTANT: MOVEMENT_VERBS contains space-separated strings like
     * "born in".  The combined regex must NOT use the `i` flag on the
     * capture group, because [A-Z] would otherwise match lowercase with
     * case-insensitive mode.  We use `gi` only for the verb keyword part
     * and verify that the captured place starts with a real uppercase char.
     */
    var verbPat = new RegExp(
      "(?:" + MOVEMENT_VERBS.map(function (v) { return _escapeRegex(v); }).join("|") + ")" +
      // Capture: one or more Title-cased words separated by spaces/commas, max 4 words
      // Stop at: end of clause (. ! ? newline), lowercase continuation word, or 60 chars
      "\\s+([A-Z][a-zA-Z]{1,20}(?:[,\\s]+[A-Z][a-zA-Z]{1,20}){0,3})",
      "gi"
    );
    while ((m = verbPat.exec(text)) !== null) {
      var raw   = m[1] || "";
      var place = raw.trim().replace(/,\s*$/, "");

      // Verify captured text genuinely starts uppercase (gi flag expands [A-Z])
      if (place.charCodeAt(0) < 65 || place.charCodeAt(0) > 90) continue;

      // Strip trailing common stopwords / false-positive words
      place = place
        .replace(/\s+(and|the|a|an|in|on|at|of|from|to|is|was|were|he|she|they|who|where|which)$/i, "")
        .trim();

      // Drop single generic words (too ambiguous)
      if (!place || place.length < 3 || _NOT_NAMES.has(place)) continue;

      var key = place.toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;
      found.push({ id: _uid(), text: place, context: _contextSentence(text, m.index, m[0].length), added: false });
    }

    return found.slice(0, 16);
  }

  /* ── Memory / reminiscence detection ───────────────────── */
  function _detectMemories(text) {
    var found = [];
    var sentences = _sentences(text);
    var trigPat = new RegExp(
      "(" + MEMORY_TRIGGERS.map(function (t) { return _escapeRegex(t); }).join("|") + ")",
      "i"
    );
    sentences.forEach(function (sent) {
      if (trigPat.test(sent) && sent.length > 20) {
        var preview = sent.length > 180 ? sent.slice(0, 177) + "…" : sent;
        found.push({ id: _uid(), text: preview, context: sent, added: false });
      }
    });
    return found.slice(0, 16);
  }

  function _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /* ── Main parse entry point ─────────────────────────────── */
  function _parseTextItems(text) {
    if (!text || !text.trim()) {
      return { people: [], dates: [], places: [], memories: [] };
    }
    return {
      people:   _detectPeople(text),
      dates:    _detectDates(text),
      places:   _detectPlaces(text),
      memories: _detectMemories(text)
    };
  }

  /* ── File extraction orchestration ─────────────────────── */

  function _readAndExtract(cardId, file) {
    return _readFileAsText(file)
      .then(function (text) {
        var bb   = _bb(); if (!bb) return;
        var card = bb.sourceCards.find(function (c) { return c.id === cardId; });
        if (!card) return;
        card.extractedText = text;
        card.status        = "extracted";
        card.detectedItems = _parseTextItems(text);
      })
      .catch(function () {
        var bb   = _bb(); if (!bb) return;
        var card = bb.sourceCards.find(function (c) { return c.id === cardId; });
        if (card) {
          card.status        = "failed";
          card.detectedItems = null;
        }
      });
  }

  /* ───────────────────────────────────────────────────────────
     ACTIVE VIEW TRACKING
  ─────────────────────────────────────────────────────────── */

  var _activeSection      = null; // questionnaire section id currently open
  var _activeTab          = "capture";
  var _activeSourceCardId = null; // source card review panel (Phase D)

  /* ───────────────────────────────────────────────────────────
     CANDIDATE EXTRACTION FROM QUESTIONNAIRE (Phase C — unchanged)
  ─────────────────────────────────────────────────────────── */

  function _extractQuestionnaireCandidates(sectionId) {
    var bb = _bb(); if (!bb) return;
    var q  = bb.questionnaire[sectionId]; if (!q) return;

    if (sectionId === "parents") {
      var parents = Array.isArray(q) ? q : [q];
      parents.forEach(function (parent) {
        var name = [parent.firstName, parent.middleName, parent.lastName].filter(Boolean).join(" ");
        if (!name) return;
        if (_candidateExists(bb, "people", name, "questionnaire:parents")) return;
        bb.candidates.people.push({
          id: _uid(), type: "person", source: "questionnaire:parents",
          sourceId: sectionId, sourceFilename: null,
          data: { name: name, birthDate: parent.birthDate || "",
                  birthPlace: parent.birthPlace || "", occupation: parent.occupation || "",
                  notes: parent.notableLifeEvents || "" },
          status: "pending"
        });
        var narratorName = _currentPersonName();
        if (narratorName && name) {
          if (!_relCandidateExists(bb, narratorName, name)) {
            bb.candidates.relationships.push({
              id: _uid(), type: "relationship", source: "questionnaire:parents",
              sourceId: sectionId, sourceFilename: null,
              data: { personA: narratorName, personB: name, relation: "parent" },
              status: "pending"
            });
          }
        }
      });
    }

    if (sectionId === "grandparents") {
      var gps = Array.isArray(q) ? q : [q];
      gps.forEach(function (gp) {
        var name = [gp.firstName, gp.lastName].filter(Boolean).join(" ");
        if (!name) return;
        if (_candidateExists(bb, "people", name, "questionnaire:grandparents")) return;
        bb.candidates.people.push({
          id: _uid(), type: "person", source: "questionnaire:grandparents",
          sourceId: sectionId, sourceFilename: null,
          data: { name: name, ancestry: gp.ancestry || "",
                  culturalBackground: gp.culturalBackground || "",
                  notes: gp.memorableStories || "" },
          status: "pending"
        });
      });
    }

    if (sectionId === "siblings") {
      var sibs = Array.isArray(q) ? q : [q];
      sibs.forEach(function (sib) {
        var name = [sib.firstName, sib.middleName, sib.lastName].filter(Boolean).join(" ");
        if (!name) return;
        if (_candidateExists(bb, "people", name, "questionnaire:siblings")) return;
        bb.candidates.people.push({
          id: _uid(), type: "person", source: "questionnaire:siblings",
          sourceId: sectionId, sourceFilename: null,
          data: { name: name, birthOrder: sib.birthOrder || "",
                  notes: [sib.uniqueCharacteristics, sib.sharedExperiences, sib.memories].filter(Boolean).join("\n\n") },
          status: "pending"
        });
      });
    }

    if (sectionId === "earlyMemories") {
      var memFields = [
        { key: "firstMemory",      label: "First Memory" },
        { key: "favoriteToy",      label: "Favorite Toy / Object" },
        { key: "significantEvent", label: "Significant Early Event" }
      ];
      memFields.forEach(function (mf) {
        if (!q[mf.key]) return;
        if (_memCandidateExists(bb, q[mf.key])) return;
        bb.candidates.memories.push({
          id: _uid(), type: "memory", source: "questionnaire:earlyMemories",
          sourceId: sectionId, sourceFilename: null,
          data: { label: mf.label, text: q[mf.key] },
          status: "pending"
        });
      });
    }
  }

  function _candidateExists(bb, bucket, name, source) {
    return bb.candidates[bucket].some(function (c) {
      return c.data.name === name && c.source === source;
    });
  }
  function _relCandidateExists(bb, personA, personB) {
    return bb.candidates.relationships.some(function (c) {
      return c.data.personA === personA && c.data.personB === personB;
    });
  }
  function _memCandidateExists(bb, text) {
    return bb.candidates.memories.some(function (c) {
      return c.data && c.data.text === text;
    });
  }

  /* ───────────────────────────────────────────────────────────
     SECTION FILL PROGRESS (Phase C — unchanged)
  ─────────────────────────────────────────────────────────── */

  function _sectionFillCount(section) {
    var bb = _bb(); if (!bb) return 0;
    var q  = bb.questionnaire[section.id]; if (!q) return 0;
    if (section.repeatable) { return (Array.isArray(q) ? q : [q]).length; }
    return section.fields.filter(function (f) { return q[f.id] && String(q[f.id]).trim(); }).length;
  }

  /* ───────────────────────────────────────────────────────────
     RENDERING — MAIN POPOVER
  ─────────────────────────────────────────────────────────── */

  function render() {
    var host = _el("bioBuilderPopover");
    if (!host || !host.hasAttribute("open")) return;
    var pid = _currentPersonId();
    _personChanged(pid);
    _renderHeader();
    _renderTabs();
    _renderActiveTab();
  }

  function _renderHeader() {
    var subtitle = _el("bbSubtitle"); if (!subtitle) return;
    var pid  = _currentPersonId();
    var name = _currentPersonName();
    if (!pid) {
      subtitle.textContent = "No narrator selected — choose one above to begin";
    } else {
      subtitle.textContent = name ? "Capturing biography for " + name : "Capturing biography";
    }
  }

  function _renderTabs() {
    ["bbTabCapture","bbTabQuestionnaire","bbTabSources","bbTabCandidates"].forEach(function (tid) {
      var el = _el(tid); if (!el) return;
      el.classList.toggle("bb-tab-active", el.dataset.tab === _activeTab);
    });
  }

  function _renderActiveTab() {
    var content = _el("bbTabContent"); if (!content) return;
    content.innerHTML = "";
    var pid = _currentPersonId();
    if      (_activeTab === "capture")       _renderCaptureTab(content, pid);
    else if (_activeTab === "questionnaire") _renderQuestionnaireTab(content, pid);
    else if (_activeTab === "sources")       _renderSourcesTab(content, pid);
    else if (_activeTab === "candidates")    _renderCandidatesTab(content, pid);
  }

  /* ── Quick Capture Tab ──────────────────────────────────── */

  function _renderCaptureTab(container, pid) {
    if (!pid) {
      container.innerHTML = _emptyStateHtml(
        "No narrator selected",
        "Choose a narrator from the dropdown above to start capturing their biography.",
        [
          { label: "📋 Questionnaire", action: "window.LorevoxBioBuilder._switchTab('questionnaire')" },
          { label: "📁 Source Inbox",  action: "window.LorevoxBioBuilder._switchTab('sources')" }
        ]
      );
      return;
    }
    var bb = _bb();
    var itemsHtml = "";
    if (bb.quickItems.length > 0) {
      itemsHtml = '<div class="bb-quick-list">'
        + bb.quickItems.slice().reverse().slice(0, 20).map(function (item) {
            var typeLabel = item.type === "fact" ? "Fact" : "Note";
            var preview   = (item.text || "").slice(0, 120) + ((item.text || "").length > 120 ? "…" : "");
            return '<div class="bb-quick-item">'
              + '<span class="bb-quick-type">' + _esc(typeLabel) + '</span>'
              + '<span class="bb-quick-text">' + _esc(preview) + '</span>'
              + '</div>';
          }).join("")
        + '</div>';
    } else {
      itemsHtml = '<p class="bb-hint-text">Facts and notes you add here will appear as candidate items you can review.</p>';
    }
    container.innerHTML =
      '<div class="bb-section-title">Quick Capture</div>'
      + '<div class="bb-quick-entry">'
      +   '<div class="bb-entry-row">'
      +     '<input id="bbFactInput" class="bb-input" type="text" placeholder="Add a quick fact — e.g. Janice was born in Spokane, WA in 1939" />'
      +     '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._addFact()">Add Fact</button>'
      +   '</div>'
      +   '<textarea id="bbNoteInput" class="bb-textarea" placeholder="Paste text, type notes, or add anything biographical — no structure required…" rows="4"></textarea>'
      +   '<div class="bb-entry-row bb-entry-row--end">'
      +     '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._addNote()">Save Note</button>'
      +   '</div>'
      + '</div>'
      + '<div class="bb-section-title bb-section-title--mt">Recent Items</div>'
      + itemsHtml
      + '<div class="bb-quick-links">'
      +   '<button class="bb-ghost-btn" onclick="window.LorevoxBioBuilder._switchTab(\'questionnaire\')">📋 Open Questionnaire</button>'
      +   '<button class="bb-ghost-btn" onclick="window.LorevoxBioBuilder._switchTab(\'sources\')">📁 Add Documents</button>'
      + '</div>';
  }

  /* ── Questionnaire Tab ──────────────────────────────────── */

  function _renderQuestionnaireTab(container, pid) {
    if (!pid) {
      container.innerHTML = _emptyStateHtml("No narrator selected", "Select a narrator to start the structured questionnaire.", []);
      return;
    }
    if (_activeSection) { _renderSectionDetail(container); return; }

    var sectionCards = SECTIONS.map(function (s) {
      var fillCount = _sectionFillCount(s);
      var progressHtml = s.repeatable
        ? (fillCount > 0 ? '<span class="bb-pill bb-pill--has">' + fillCount + ' entr' + (fillCount === 1 ? "y" : "ies") + '</span>' : '<span class="bb-pill bb-pill--empty">Empty</span>')
        : (fillCount > 0 ? '<span class="bb-pill bb-pill--has">' + fillCount + " / " + s.fields.length + ' filled</span>' : '<span class="bb-pill bb-pill--empty">Not started</span>');
      return '<div class="bb-section-card" onclick="window.LorevoxBioBuilder._openSection(\'' + s.id + '\')">'
        + '<div class="bb-section-card-icon">' + s.icon + '</div>'
        + '<div class="bb-section-card-body">'
        +   '<div class="bb-section-card-title">' + _esc(s.label) + '</div>'
        +   '<div class="bb-section-card-hint">' + _esc(s.hint) + '</div>'
        + '</div>'
        + '<div class="bb-section-card-progress">' + progressHtml + '</div>'
        + '</div>';
    }).join("");

    container.innerHTML =
      '<div class="bb-section-title">Questionnaire Sections</div>'
      + '<p class="bb-hint-text">Fill in any section to capture biographical material. Answers become candidate items you can review.</p>'
      + '<div class="bb-section-grid">' + sectionCards + '</div>';
  }

  function _renderSectionDetail(container) {
    var section = SECTIONS.find(function (s) { return s.id === _activeSection; });
    if (!section) { _activeSection = null; _renderActiveTab(); return; }
    var bb = _bb();
    var existing = bb.questionnaire[section.id];
    var fieldsHtml;

    if (section.repeatable) {
      var entries = Array.isArray(existing) ? existing : (existing ? [existing] : [{}]);
      fieldsHtml = entries.map(function (entry, idx) {
        return '<div class="bb-repeat-entry">'
          + '<div class="bb-repeat-label">' + _esc(section.repeatLabel || "entry") + " " + (idx + 1) + '</div>'
          + section.fields.map(function (f) { return _fieldHtml(f, "bbQ_" + idx + "_" + f.id, entry[f.id] || ""); }).join("")
          + '</div>';
      }).join("")
      + '<button class="bb-ghost-btn bb-add-entry-btn" onclick="window.LorevoxBioBuilder._addRepeatEntry(\'' + section.id + '\')">'
      + '+ Add another ' + _esc(section.repeatLabel || "entry") + '</button>';
    } else {
      var q = existing || {};
      fieldsHtml = section.fields.map(function (f) { return _fieldHtml(f, "bbQ_" + f.id, q[f.id] || ""); }).join("");
    }

    container.innerHTML =
      '<div class="bb-section-nav"><button class="bb-ghost-btn bb-back-btn" onclick="window.LorevoxBioBuilder._closeSection()">← Back to Sections</button></div>'
      + '<div class="bb-section-title">' + section.icon + " " + _esc(section.label) + '</div>'
      + '<p class="bb-hint-text">' + _esc(section.hint) + '</p>'
      + '<div class="bb-fields-list">' + fieldsHtml + '</div>'
      + '<div class="bb-section-footer"><button class="bb-btn-primary" onclick="window.LorevoxBioBuilder._saveSection(\'' + section.id + '\')">Save ' + _esc(section.label) + '</button></div>';
  }

  function _fieldHtml(field, domId, value) {
    var va = _esc(value);
    if (field.type === "textarea") {
      return '<div class="bb-field"><label class="bb-label" for="' + domId + '">' + _esc(field.label) + '</label>'
        + '<textarea id="' + domId + '" class="bb-textarea" rows="3" placeholder="' + _esc(field.placeholder || "") + '">' + va + '</textarea></div>';
    }
    return '<div class="bb-field"><label class="bb-label" for="' + domId + '">' + _esc(field.label) + '</label>'
      + '<input id="' + domId + '" class="bb-input" type="text" value="' + va + '" placeholder="' + _esc(field.placeholder || "") + '" /></div>';
  }

  /* ── Source Inbox Tab (Phase D) ─────────────────────────── */

  function _renderSourcesTab(container, pid) {
    if (!pid) {
      container.innerHTML = _emptyStateHtml("No narrator selected", "Select a narrator to start adding documents.", []);
      return;
    }

    // Phase D: if a source card review is active, show the review panel
    if (_activeSourceCardId) {
      _renderSourceReview(container);
      return;
    }

    var bb = _bb();
    var cardsHtml = "";

    if (bb.sourceCards.length > 0) {
      cardsHtml = '<div class="bb-source-cards-list">'
        + bb.sourceCards.map(function (card) {
            var statusInfo = _sourceCardStatusInfo(card);
            var addedCount = (card.addedCandidateIds || []).length;
            var addedBadge = addedCount > 0
              ? '<span class="bb-source-added-badge">' + addedCount + ' added</span>'
              : "";
            var detectedCount = card.detectedItems
              ? (card.detectedItems.people.length + card.detectedItems.dates.length +
                 card.detectedItems.places.length + card.detectedItems.memories.length)
              : 0;
            var detectedBadge = (card.status === "extracted" || card.status === "pasted") && detectedCount > 0
              ? '<span class="bb-source-detected-badge">' + detectedCount + ' detected</span>'
              : "";

            return '<div class="bb-source-card">'
              + '<div class="bb-source-card-icon">' + _sourceIcon(card.sourceType) + '</div>'
              + '<div class="bb-source-card-body">'
              +   '<div class="bb-source-card-name">' + _esc(card.filename) + '</div>'
              +   '<div class="bb-source-card-meta">'
              +     _esc(card.sourceType || "Document") + ' · ' + _esc(statusInfo.label)
              +     (card.fileSize ? ' · ' + _formatBytes(card.fileSize) : '')
              +   '</div>'
              +   '<div class="bb-source-card-badges">' + detectedBadge + addedBadge + '</div>'
              + '</div>'
              + '<div class="bb-source-card-actions">'
              +   '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._reviewSource(\'' + card.id + '\')">'
              +   (statusInfo.canReview ? "Review →" : "View →")
              +   '</button>'
              + '</div>'
              + '</div>';
          }).join("")
        + '</div>';
    }

    container.innerHTML =
      '<div class="bb-section-title">Source Inbox</div>'
      + '<p class="bb-hint-text">Upload text files, documents, or notes. Each becomes a Source Card — Bio Builder extracts people, dates, places, and memories for you to review and add as candidates.</p>'
      + '<div class="bb-drop-zone" onclick="document.getElementById(\'bbFileInput\').click()">'
      +   '<div class="bb-drop-icon">📎</div>'
      +   '<div class="bb-drop-label">Drop files here or click to browse</div>'
      +   '<div class="bb-drop-hint">Text · Markdown · CSV · PDF (paste text) · Images (paste text) · Any document</div>'
      +   '<input id="bbFileInput" type="file" multiple accept="*" style="display:none" onchange="window.LorevoxBioBuilder._handleFiles(this.files)" />'
      + '</div>'
      + (cardsHtml || '<div class="bb-empty-sub">No documents yet — add files above to begin.</div>');
  }

  function _sourceCardStatusInfo(card) {
    var st = card.status || "pending";
    if (st === "extracting")  return { label: "Extracting…",     canReview: false };
    if (st === "extracted")   return { label: "Text extracted ✓", canReview: true  };
    if (st === "pasted")      return { label: "Text pasted ✓",    canReview: true  };
    if (st === "failed")      return { label: "Extraction failed", canReview: true  };
    if (st === "manual-only") return { label: "Paste text to extract", canReview: true };
    return { label: "Pending",        canReview: false };
  }

  /* ── Source Card Review Surface (Phase D) ───────────────── */

  function _renderSourceReview(container) {
    var bb   = _bb(); if (!bb) return;
    var card = bb.sourceCards.find(function (c) { return c.id === _activeSourceCardId; });
    if (!card) { _activeSourceCardId = null; _renderActiveTab(); return; }

    var workingText = card.extractedText || card.pastedText || null;
    var di          = card.detectedItems;
    var statusInfo  = _sourceCardStatusInfo(card);

    // ── Paste zone (for non-text files without extractedText) ──
    var pasteZoneHtml = "";
    if (!workingText) {
      pasteZoneHtml =
        '<div class="bb-review-section">'
        + '<div class="bb-review-section-title">Paste the Document\'s Text</div>'
        + '<p class="bb-hint-text">Bio Builder can\'t automatically extract text from ' + _esc(card.sourceType || "this file") + ' files. Paste the document\'s text below to detect candidates.</p>'
        + '<textarea id="bbPasteArea" class="bb-textarea bb-paste-area" rows="8" placeholder="Paste text from the document here…"></textarea>'
        + '<div class="bb-review-footer">'
        +   '<button class="bb-btn-primary" onclick="window.LorevoxBioBuilder._savePastedText(\'' + card.id + '\')">Extract from Pasted Text</button>'
        + '</div>'
        + '</div>';
    }

    // ── Extracted text preview ──
    var textPreviewHtml = "";
    if (workingText) {
      var previewText = workingText.length > 600 ? workingText.slice(0, 597) + "…" : workingText;
      textPreviewHtml =
        '<div class="bb-review-section">'
        + '<div class="bb-review-section-title">Extracted Text <span class="bb-review-chars">(' + workingText.length.toLocaleString() + ' chars)</span></div>'
        + '<div class="bb-review-text-preview">' + _esc(previewText) + '</div>'
        + '</div>';
    }

    // ── Detected items ──
    var detectedHtml = "";
    if (di) {
      var totalDetected = di.people.length + di.dates.length + di.places.length + di.memories.length;
      if (totalDetected === 0) {
        detectedHtml = '<div class="bb-review-section"><p class="bb-hint-text">No items automatically detected in this text. You can still add notes or facts using Quick Capture.</p></div>';
      } else {
        detectedHtml = '<div class="bb-review-section"><div class="bb-review-section-title">Detected Items — ' + totalDetected + ' found</div>'
          + _renderDetectedBucket(card, "people",   "👤", "People",   di.people,   "person")
          + _renderDetectedBucket(card, "dates",    "📅", "Dates",    di.dates,    "event")
          + _renderDetectedBucket(card, "places",   "📍", "Places",   di.places,   "place")
          + _renderDetectedBucket(card, "memories", "🌙", "Memories", di.memories, "memory")
          + '<div class="bb-review-add-all-row">'
          +   '<button class="bb-btn-primary" onclick="window.LorevoxBioBuilder._addAllFromCard(\'' + card.id + '\')">'
          +   'Add All Detected Items'
          +   '</button>'
          +   '<button class="bb-ghost-btn" onclick="window.LorevoxBioBuilder._closeSourceReview()">Done Reviewing</button>'
          + '</div>'
          + '</div>';
      }
    }

    var addedCount   = (card.addedCandidateIds || []).length;
    var addedSummary = addedCount > 0
      ? '<span class="bb-review-added-summary">' + addedCount + ' candidate' + (addedCount === 1 ? "" : "s") + ' added from this source</span>'
      : "";

    container.innerHTML =
      '<div class="bb-review-nav">'
      +   '<button class="bb-ghost-btn bb-back-btn" onclick="window.LorevoxBioBuilder._closeSourceReview()">← Back to Source Inbox</button>'
      +   addedSummary
      + '</div>'
      + '<div class="bb-review-header">'
      +   '<div class="bb-review-filename">' + _sourceIcon(card.sourceType) + ' ' + _esc(card.filename) + '</div>'
      +   '<div class="bb-review-meta">' + _esc(card.sourceType || "Document") + ' · ' + _esc(statusInfo.label) + (card.fileSize ? ' · ' + _formatBytes(card.fileSize) : '') + '</div>'
      + '</div>'
      + pasteZoneHtml
      + textPreviewHtml
      + detectedHtml;
  }

  function _renderDetectedBucket(card, bucketKey, icon, label, items, candidateType) {
    if (!items || items.length === 0) return "";
    var allAdded = items.every(function (it) { return it.added; });
    var pendingCount = items.filter(function (it) { return !it.added; }).length;

    var itemRows = items.map(function (item) {
      var addedMark = item.added ? '<span class="bb-det-added">✓ Added</span>' : "";
      var addBtn    = !item.added
        ? '<button class="bb-btn-sm bb-det-add-btn" onclick="window.LorevoxBioBuilder._addItemAsCandidate(\'' + card.id + '\',\'' + bucketKey + '\',\'' + item.id + '\',\'' + candidateType + '\')">'
          + 'Add'
          + '</button>'
        : "";
      var relation  = item.relation ? '<span class="bb-det-relation">' + _esc(item.relation) + '</span>' : "";
      var context   = item.context !== item.text ? '<div class="bb-det-context">' + _esc(item.context) + '</div>' : "";
      return '<div class="bb-det-item' + (item.added ? ' bb-det-item--added' : '') + '">'
        + '<div class="bb-det-item-body">'
        +   '<div class="bb-det-item-text">' + _esc(item.text) + relation + '</div>'
        +   context
        + '</div>'
        + '<div class="bb-det-item-actions">' + addedMark + addBtn + '</div>'
        + '</div>';
    }).join("");

    var addAllBtn = !allAdded && pendingCount > 1
      ? '<button class="bb-ghost-btn bb-det-add-all" onclick="window.LorevoxBioBuilder._addAllOfType(\'' + card.id + '\',\'' + bucketKey + '\',\'' + candidateType + '\')">+ Add all ' + label.toLowerCase() + ' (' + pendingCount + ')</button>'
      : "";

    return '<div class="bb-det-bucket">'
      + '<div class="bb-det-bucket-header">' + icon + ' ' + _esc(label) + ' <span class="bb-det-count">(' + items.length + ')</span></div>'
      + '<div class="bb-det-items-list">' + itemRows + '</div>'
      + addAllBtn
      + '</div>';
  }

  /* ── Candidates Tab (updated Phase D — provenance) ──────── */

  function _renderCandidatesTab(container, pid) {
    if (!pid) {
      container.innerHTML = _emptyStateHtml(
        "No narrator selected",
        "Select a narrator and fill in questionnaire sections to generate candidate items.",
        []
      );
      return;
    }

    /* Phase E: mount the review UI into a child div so the popover
       scroll / layout is managed by bio-review.css.  The inner div
       needs display:flex;flex:1 so the review root fills the tab area. */
    container.innerHTML = '<div id="candidateReviewRoot" style="display:flex;flex-direction:column;flex:1;min-height:0;height:100%;"></div>';

    if (window.LorevoxCandidateReview) {
      window.LorevoxCandidateReview.render("candidateReviewRoot");
    } else {
      /* Graceful fallback if bio-review.js has not loaded yet */
      container.innerHTML = _emptyStateHtml(
        "Review module loading…",
        "Reload the page if this message persists.",
        []
      );
    }
  }

  function _candidateSummary(c) {
    var d = c.data || {};
    if (c.type === "person")       return { title: d.name || "Unknown person", detail: [d.birthDate, d.birthPlace, d.occupation].filter(Boolean).join(" · ") };
    if (c.type === "relationship") return { title: (d.personA || "?") + " → " + (d.personB || "?"), detail: d.relation || "" };
    if (c.type === "memory")       return { title: d.label || "Memory", detail: (d.text || "").slice(0, 120) };
    if (c.type === "event")        return { title: d.text || "Date/Event", detail: d.context ? d.context.slice(0, 80) : "" };
    if (c.type === "place")        return { title: d.text || "Place", detail: d.context ? d.context.slice(0, 80) : "" };
    return { title: c.type, detail: "" };
  }

  function _sourceLabel(candidate) {
    var src      = candidate.source || "";
    var filename = candidate.sourceFilename || null;
    if (src.startsWith("questionnaire:")) {
      return "questionnaire — " + src.replace("questionnaire:", "");
    }
    if (src.startsWith("source:")) {
      return filename ? "📄 " + filename : "uploaded document";
    }
    if (src.startsWith("quick:")) return "quick capture";
    return src || "unknown";
  }

  /* ── Helpers ────────────────────────────────────────────── */

  function _emptyStateHtml(title, message, actions) {
    var actionsHtml = (actions || []).map(function (a) {
      return '<button class="bb-ghost-btn" onclick="' + a.action + '">' + _esc(a.label) + '</button>';
    }).join("");
    return '<div class="bb-empty-state">'
      + '<div class="bb-empty-title">' + _esc(title) + '</div>'
      + '<div class="bb-empty-message">' + _esc(message) + '</div>'
      + (actionsHtml ? '<div class="bb-empty-actions">' + actionsHtml + '</div>' : '')
      + '</div>';
  }

  function _sourceIcon(type) {
    var t = (type || "").toLowerCase();
    if (t === "pdf")    return "📄";
    if (t === "image")  return "🖼";
    if (t === "text")   return "📝";
    if (t === "word")   return "📘";
    return "📎";
  }

  /* ───────────────────────────────────────────────────────────
     PUBLIC ACTIONS
  ─────────────────────────────────────────────────────────── */

  function _switchTab(tab) {
    _activeTab          = tab;
    _activeSection      = null;
    _activeSourceCardId = null;
    _renderTabs();
    _renderActiveTab();
  }

  function _addFact() {
    var input = _el("bbFactInput"); if (!input) return;
    var text  = (input.value || "").trim(); if (!text) return;
    var bb    = _bb(); if (bb) bb.quickItems.push({ id: _uid(), type: "fact", text: text, ts: Date.now() });
    input.value = "";
    _renderActiveTab();
  }

  function _addNote() {
    var ta   = _el("bbNoteInput"); if (!ta) return;
    var text = (ta.value || "").trim(); if (!text) return;
    var bb   = _bb(); if (bb) bb.quickItems.push({ id: _uid(), type: "note", text: text, ts: Date.now() });
    ta.value = "";
    _renderActiveTab();
  }

  function _openSection(sectionId)  { _activeSection = sectionId; _renderActiveTab(); }
  function _closeSection()          { _activeSection = null;      _renderActiveTab(); }

  function _addRepeatEntry(sectionId) {
    var bb = _bb(); if (!bb) return;
    if (!Array.isArray(bb.questionnaire[sectionId])) {
      bb.questionnaire[sectionId] = bb.questionnaire[sectionId] ? [bb.questionnaire[sectionId]] : [];
    }
    bb.questionnaire[sectionId].push({});
    _renderSectionDetail(_el("bbTabContent"));
  }

  function _saveSection(sectionId) {
    var section = SECTIONS.find(function (s) { return s.id === sectionId; });
    if (!section) return;
    var bb = _bb(); if (!bb) return;

    if (section.repeatable) {
      var existing = Array.isArray(bb.questionnaire[sectionId])
        ? bb.questionnaire[sectionId]
        : (bb.questionnaire[sectionId] ? [bb.questionnaire[sectionId]] : [{}]);
      bb.questionnaire[sectionId] = existing.map(function (_, idx) {
        var obj = {};
        section.fields.forEach(function (f) {
          var el = _el("bbQ_" + idx + "_" + f.id);
          if (el) obj[f.id] = el.value || "";
        });
        return obj;
      });
    } else {
      var obj = {};
      section.fields.forEach(function (f) {
        var el = _el("bbQ_" + f.id);
        if (el) obj[f.id] = el.value || "";
      });
      bb.questionnaire[sectionId] = obj;
    }

    _extractQuestionnaireCandidates(sectionId);
    _closeSection();
  }

  /* ── Phase D: file handling ─────────────────────────────── */

  function _handleFiles(files) {
    var bb = _bb(); if (!bb) return;
    if (!files || files.length === 0) return;
    var pendingPromises = [];

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var sourceType = _guessSourceType(file.name, file.type);
      var card = {
        id:               _uid(),
        filename:         file.name,
        fileSize:         file.size,
        sourceType:       sourceType,
        ts:               Date.now(),
        status:           "extracting",
        extractedText:    null,
        pastedText:       null,
        detectedItems:    null,
        addedCandidateIds: []
      };
      bb.sourceCards.push(card);

      if (_canExtractText(file)) {
        pendingPromises.push(_readAndExtract(card.id, file));
      } else {
        card.status = "manual-only";
      }
    }

    // Show "extracting" status immediately
    _renderActiveTab();

    // Re-render after all extractions complete
    if (pendingPromises.length > 0) {
      Promise.all(pendingPromises).then(function () { _renderActiveTab(); });
    }
  }

  function _guessSourceType(filename, mimeType) {
    var name = (filename || "").toLowerCase();
    var mime = (mimeType || "").toLowerCase();
    if (mime.startsWith("image/") || /\.(jpg|jpeg|png|gif|heic|tiff|webp|bmp)$/.test(name)) return "Image";
    if (mime === "application/pdf" || name.endsWith(".pdf")) return "PDF";
    if (/\.(doc|docx)$/.test(name)) return "Word";
    if (mime.startsWith("text/") || /\.(txt|md|markdown|csv|tsv|rtf|log)$/.test(name)) return "Text";
    return "Document";
  }

  function _reviewSource(cardId) {
    _activeSourceCardId = cardId;
    _renderActiveTab();
  }

  function _closeSourceReview() {
    _activeSourceCardId = null;
    _renderActiveTab();
  }

  /* ── Phase D: paste text for non-extractable files ──────── */

  function _savePastedText(cardId) {
    var ta   = _el("bbPasteArea"); if (!ta) return;
    var text = (ta.value || "").trim();
    if (!text) { ta.style.borderColor = "rgba(239,68,68,0.5)"; return; }

    var bb   = _bb(); if (!bb) return;
    var card = bb.sourceCards.find(function (c) { return c.id === cardId; });
    if (!card) return;

    card.pastedText    = text;
    card.status        = "pasted";
    card.detectedItems = _parseTextItems(text);
    _renderActiveTab(); // refresh to show detected items
  }

  /* ── Phase D: add detected item as candidate ────────────── */

  function _addItemAsCandidate(cardId, bucketKey, itemId, candidateType) {
    var bb   = _bb(); if (!bb) return;
    var card = bb.sourceCards.find(function (c) { return c.id === cardId; });
    if (!card || !card.detectedItems) return;

    var bucket = card.detectedItems[bucketKey];
    if (!bucket) return;
    var item = bucket.find(function (it) { return it.id === itemId; });
    if (!item || item.added) return;

    // Map detected item → candidate
    var candidate = _detectedItemToCandidate(item, candidateType, card);

    // Duplicate guard
    var existingBucket = candidateType === "person"   ? "people"
                       : candidateType === "event"    ? "events"
                       : candidateType === "place"    ? "places"
                       : candidateType === "memory"   ? "memories"
                       : "documents";

    var isDupe = bb.candidates[existingBucket].some(function (c) {
      return c.data && c.data.text === candidate.data.text && c.source === candidate.source;
    });

    if (!isDupe) {
      bb.candidates[existingBucket].push(candidate);
      card.addedCandidateIds = card.addedCandidateIds || [];
      card.addedCandidateIds.push(candidate.id);
    }

    item.added = true;
    _renderSourceReview(_el("bbTabContent"));
  }

  function _addAllOfType(cardId, bucketKey, candidateType) {
    var bb   = _bb(); if (!bb) return;
    var card = bb.sourceCards.find(function (c) { return c.id === cardId; });
    if (!card || !card.detectedItems) return;

    var bucket = card.detectedItems[bucketKey];
    if (!bucket) return;

    bucket.forEach(function (item) {
      if (item.added) return;
      _addItemAsCandidate(cardId, bucketKey, item.id, candidateType);
    });
  }

  function _addAllFromCard(cardId) {
    var bb   = _bb(); if (!bb) return;
    var card = bb.sourceCards.find(function (c) { return c.id === cardId; });
    if (!card || !card.detectedItems) return;

    var typeMap = { people: "person", dates: "event", places: "place", memories: "memory" };
    Object.keys(typeMap).forEach(function (bucketKey) {
      var bucket = card.detectedItems[bucketKey];
      if (!bucket) return;
      bucket.forEach(function (item) {
        if (item.added) return;
        _addItemAsCandidate(cardId, bucketKey, item.id, typeMap[bucketKey]);
      });
    });
  }

  function _detectedItemToCandidate(item, type, card) {
    var data = {};
    if (type === "person") {
      data = { name: item.text, relation: item.relation || "", context: item.context || "" };
    } else {
      data = { text: item.text, context: item.context || "" };
    }
    /* value + snippet are Phase E top-level fields that bio-review.js reads
       directly.  For questionnaire-generated candidates that were created before
       Phase E, bio-review.js falls back to the nested data object via its compat
       shims (_title / _snippet), so those cards still display correctly. */
    return {
      id:             _uid(),
      type:           type,
      value:          item.text,         // Phase E: direct title accessor
      snippet:        item.context || "", // Phase E: source sentence
      source:         "source:" + card.id,
      sourceId:       card.id,
      sourceFilename: card.filename,
      data:           data,
      status:         "pending"
    };
  }

  /* ───────────────────────────────────────────────────────────
     PUBLIC API
  ─────────────────────────────────────────────────────────── */

  function refresh() {
    _ensureState();
    var host = _el("bioBuilderPopover");
    if (!host || !host.hasAttribute("open")) return;
    render();
  }

  var NS = {};
  NS.render              = render;
  NS.refresh             = refresh;
  NS.SECTIONS            = SECTIONS;

  // Tab navigation
  NS._switchTab          = _switchTab;

  // Quick capture
  NS._addFact            = _addFact;
  NS._addNote            = _addNote;

  // Questionnaire
  NS._openSection        = _openSection;
  NS._closeSection       = _closeSection;
  NS._addRepeatEntry     = _addRepeatEntry;
  NS._saveSection        = _saveSection;

  // Phase D: source inbox + extraction
  NS._handleFiles        = _handleFiles;
  NS._reviewSource       = _reviewSource;
  NS._closeSourceReview  = _closeSourceReview;
  NS._savePastedText     = _savePastedText;

  // Phase D: candidate generation from source
  NS._addItemAsCandidate = _addItemAsCandidate;
  NS._addAllOfType       = _addAllOfType;
  NS._addAllFromCard     = _addAllFromCard;

  // Exposed for tests
  NS._parseTextItems     = _parseTextItems;

  window.LorevoxBioBuilder = NS;

})();
