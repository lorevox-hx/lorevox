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
     OPTION CONSTANTS
  ─────────────────────────────────────────────────────────── */

  var ZODIAC_OPTIONS = [
    "", "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
  ];

  var BIRTH_ORDER_OPTIONS = [
    "", "First child", "Second child", "Third child", "Fourth child",
    "Fifth child", "Sixth child", "Seventh child", "Eighth child",
    "Ninth child", "Tenth child", "Only child", "Twin", "Triplet", "Other/custom"
  ];

  var RELATION_OPTIONS = [
    "", "Mother", "Father", "Stepmother", "Stepfather",
    "Adoptive mother", "Adoptive father", "Guardian",
    "Grandmother", "Grandfather", "Other"
  ];

  var SIBLING_RELATION_OPTIONS = [
    "", "Sister", "Brother", "Half-sister", "Half-brother",
    "Stepsister", "Stepbrother", "Adoptive sister", "Adoptive brother", "Other"
  ];

  /* ── US state abbreviation map (for place-of-birth normalization) ── */
  var US_STATES = {
    AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",
    CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",
    HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",
    KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",
    MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",
    NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",
    NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",
    OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",
    SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",
    VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",
    WI:"Wisconsin",WY:"Wyoming",DC:"District of Columbia"
  };

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
        { id: "birthOrder",    label: "Birth Order",    type: "select",   options: BIRTH_ORDER_OPTIONS },
        { id: "dateOfBirth",   label: "Date of Birth",  type: "text",     placeholder: "12241962, 12/24/1962, Dec 24 1962 → auto-parsed", inputHelper: "normalizeDob" },
        { id: "timeOfBirth",   label: "Time of Birth",  type: "text",     placeholder: "1250p, 12:50 pm → auto-parsed", inputHelper: "normalizeTime" },
        { id: "placeOfBirth",  label: "Place of Birth", type: "text",     placeholder: "Williston ND → Williston, North Dakota", inputHelper: "normalizePlace" },
        { id: "zodiacSign",    label: "Zodiac Sign",    type: "select",   options: ZODIAC_OPTIONS, autoDerive: "zodiacFromDob" }
      ]
    },
    {
      id: "parents", label: "Parents", icon: "🌱",
      hint: "Mother and father — names, dates, occupation, notable life events",
      repeatable: true, repeatLabel: "parent",
      fields: [
        { id: "relation",          label: "Relation",                      type: "select",   options: RELATION_OPTIONS },
        { id: "firstName",         label: "First Name",                    type: "text" },
        { id: "middleName",        label: "Middle Name",                   type: "text" },
        { id: "lastName",          label: "Last Name",                     type: "text" },
        { id: "maidenName",        label: "Maiden / Birth Name",           type: "text",     placeholder: "if different from last name" },
        { id: "birthDate",         label: "Birth Date",                    type: "text",     placeholder: "YYYY-MM-DD", inputHelper: "normalizeDob" },
        { id: "birthPlace",        label: "Birth Place",                   type: "text",     inputHelper: "normalizePlace" },
        { id: "occupation",        label: "Occupation",                    type: "text" },
        { id: "notableLifeEvents", label: "Notable Life Events / Stories", type: "textarea" },
        { id: "notes",             label: "Additional Notes",              type: "textarea" }
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
        { id: "relation",              label: "Relation",               type: "select",   options: SIBLING_RELATION_OPTIONS },
        { id: "firstName",             label: "First Name",             type: "text" },
        { id: "middleName",            label: "Middle Name",            type: "text" },
        { id: "lastName",              label: "Last Name",              type: "text" },
        { id: "birthOrder",            label: "Birth Order",            type: "select",   options: BIRTH_ORDER_OPTIONS },
        { id: "uniqueCharacteristics", label: "Unique Characteristics", type: "textarea" },
        { id: "sharedExperiences",     label: "Shared Experiences",     type: "textarea" },
        { id: "memories",              label: "Memories",               type: "textarea" },
        { id: "notes",                 label: "Additional Notes",       type: "textarea" }
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

  /* ── v8 Narrator-switch hard reset ─────────────────────────
     Called from app.js lvxSwitchNarratorSafe() BEFORE profile
     hydration.  Runs even when Bio Builder popover is closed.
  ─────────────────────────────────────────────────────────── */
  function _resetNarratorScopedState(newId) {
    var bb = _bb(); if (!bb) return;

    // v8-fix: persist outgoing narrator's questionnaire before clearing (WD-1 fix)
    var outgoingPid = bb.personId;
    if (outgoingPid && bb.questionnaire && Object.keys(bb.questionnaire).length > 0) {
      _persistDrafts(outgoingPid);
    }

    bb.personId      = newId || null;
    bb.quickItems    = [];
    bb.questionnaire = {};
    bb.sourceCards   = [];
    bb.candidates    = {
      people: [], relationships: [], events: [], memories: [], places: [], documents: []
    };

    if (!bb.familyTreeDraftsByPerson)  bb.familyTreeDraftsByPerson  = {};
    if (!bb.lifeThreadsDraftsByPerson) bb.lifeThreadsDraftsByPerson = {};

    // v8-fix: restore incoming narrator's questionnaire from localStorage (WD-1 fix)
    _loadDrafts(newId);
  }

  /* ── v8 Explicit narrator-switch entry point ───────────────
     Called from app.js after loadPerson() completes.
     Resets narrator-scoped state, then re-hydrates from the
     newly loaded profile.
  ─────────────────────────────────────────────────────────── */
  function _onNarratorSwitch(newId) {
    var bb = _bb(); if (!bb) return;
    _resetNarratorScopedState(newId);
    _hydrateQuestionnaireFromProfile(bb);
  }

  /* ───────────────────────────────────────────────────────────
     PERSISTENCE (v4)
     Persist FT/LT drafts to localStorage per narrator.
     Keys: lorevox_ft_draft_{pid}, lorevox_lt_draft_{pid}
     Schema version stamp for forward compat.
  ─────────────────────────────────────────────────────────── */

  var DRAFT_SCHEMA_VERSION = 1;
  var _LS_FT_PREFIX = "lorevox_ft_draft_";
  var _LS_LT_PREFIX = "lorevox_lt_draft_";
  var _LS_QQ_PREFIX = "lorevox_qq_draft_";
  var _LS_DRAFT_INDEX = "lorevox_draft_pids";

  function _persistDrafts(pid) {
    if (!pid) return;
    var bb = _bb(); if (!bb) return;
    try {
      var ft = bb.familyTreeDraftsByPerson && bb.familyTreeDraftsByPerson[pid];
      var lt = bb.lifeThreadsDraftsByPerson && bb.lifeThreadsDraftsByPerson[pid];
      if (ft) localStorage.setItem(_LS_FT_PREFIX + pid, JSON.stringify({ v: DRAFT_SCHEMA_VERSION, d: ft }));
      if (lt) localStorage.setItem(_LS_LT_PREFIX + pid, JSON.stringify({ v: DRAFT_SCHEMA_VERSION, d: lt }));
      // v8-fix: persist questionnaire data per narrator (WD-1/WD-2 fix)
      // GUARD: bb.questionnaire belongs to the CURRENT narrator only.
      // FT/LT use per-person containers so any pid is safe, but qq is shared.
      // Only persist qq when pid matches the active narrator to prevent cross-write.
      if (pid === bb.personId) {
        var qq = bb.questionnaire;
        if (qq && Object.keys(qq).length > 0) {
          localStorage.setItem(_LS_QQ_PREFIX + pid, JSON.stringify({ v: DRAFT_SCHEMA_VERSION, d: qq }));
        }
      }
      // Track which pids have drafts
      var idx = _getDraftIndex();
      if (idx.indexOf(pid) < 0) {
        idx.push(pid);
        localStorage.setItem(_LS_DRAFT_INDEX, JSON.stringify(idx));
      }
    } catch (e) {
      // localStorage full or unavailable — degrade silently
    }
  }

  function _loadDrafts(pid) {
    if (!pid) return;
    var bb = _bb(); if (!bb) return;
    if (!bb.familyTreeDraftsByPerson) bb.familyTreeDraftsByPerson = {};
    if (!bb.lifeThreadsDraftsByPerson) bb.lifeThreadsDraftsByPerson = {};
    // v8-fix: load questionnaire BEFORE the FT early-return guard (WD-1/WD-2 fix)
    // FT/LT use per-person containers so the early return is safe for them,
    // but questionnaire uses a single bb.questionnaire object and MUST always load.
    try {
      var qqRaw = localStorage.getItem(_LS_QQ_PREFIX + pid);
      if (qqRaw) {
        var qqObj = JSON.parse(qqRaw);
        var qqD = qqObj && (qqObj.d || qqObj.data);
        if (qqD && typeof qqD === "object") {
          bb.questionnaire = qqD;
        }
      }
    } catch (e) { /* malformed — ignore */ }
    // Don't overwrite FT/LT if already in memory
    if (bb.familyTreeDraftsByPerson[pid] && bb.familyTreeDraftsByPerson[pid].nodes && bb.familyTreeDraftsByPerson[pid].nodes.length) return;
    try {
      var ftRaw = localStorage.getItem(_LS_FT_PREFIX + pid);
      if (ftRaw) {
        var ftObj = JSON.parse(ftRaw);
        var ftD = ftObj && (ftObj.d || ftObj.data);
        if (ftD && Array.isArray(ftD.nodes)) {
          bb.familyTreeDraftsByPerson[pid] = ftD;
        }
      }
      var ltRaw = localStorage.getItem(_LS_LT_PREFIX + pid);
      if (ltRaw) {
        var ltObj = JSON.parse(ltRaw);
        var ltD = ltObj && (ltObj.d || ltObj.data);
        if (ltD && Array.isArray(ltD.nodes)) {
          bb.lifeThreadsDraftsByPerson[pid] = ltD;
        }
      }
    } catch (e) {
      // Malformed data — ignore, let lazy init create fresh
    }
  }

  function _getDraftIndex() {
    try {
      var raw = localStorage.getItem(_LS_DRAFT_INDEX);
      if (raw) { var arr = JSON.parse(raw); if (Array.isArray(arr)) return arr; }
    } catch (e) {}
    return [];
  }

  function _clearDrafts(pid) {
    if (!pid) return;
    try {
      localStorage.removeItem(_LS_FT_PREFIX + pid);
      localStorage.removeItem(_LS_LT_PREFIX + pid);
      localStorage.removeItem(_LS_QQ_PREFIX + pid);
      var idx = _getDraftIndex().filter(function (p) { return p !== pid; });
      localStorage.setItem(_LS_DRAFT_INDEX, JSON.stringify(idx));
    } catch (e) {}
  }

  function _personChanged(newId) {
    var bb = _bb(); if (!bb) return;
    if (bb.personId !== newId) {
      // v8-fix: persist outgoing narrator's questionnaire before clearing
      var outgoingPid = bb.personId;
      if (outgoingPid && bb.questionnaire && Object.keys(bb.questionnaire).length > 0) {
        _persistDrafts(outgoingPid);
      }
      bb.personId      = newId;
      bb.quickItems    = [];
      bb.questionnaire = {};
      bb.sourceCards   = [];
      bb.candidates    = {
        people: [], relationships: [], events: [], memories: [], places: [], documents: []
      };
    }
    // v3: ensure per-person draft containers exist (lazy — never reset on switch)
    if (!bb.familyTreeDraftsByPerson)  bb.familyTreeDraftsByPerson  = {};
    if (!bb.lifeThreadsDraftsByPerson) bb.lifeThreadsDraftsByPerson = {};
    // v4: restore persisted drafts for this narrator
    _loadDrafts(newId);
    // v6-fix: hydrate questionnaire from active profile if empty
    _hydrateQuestionnaireFromProfile(bb);
  }

  /* ── v6-fix: Reverse hydration (profile → questionnaire) ── */
  /* One-way: only fills empty questionnaire sections from profile.
     NEVER overwrites existing Bio Builder questionnaire data.
     This fixes the bug where opening Bio Builder for an existing
     person shows a blank questionnaire even though profile has data. */
  function _hydrateQuestionnaireFromProfile(bb) {
    if (!bb) return;
    try {
      if (typeof state === "undefined" || !state.profile || !state.profile.basics) return;
    } catch (_) { return; }
    var basics = state.profile.basics;

    // ── Personal section hydration ──
    var q = bb.questionnaire.personal;
    var personalEmpty = !q || !_hasAnyValue(q);
    if (personalEmpty) {
      bb.questionnaire.personal = {
        fullName:      basics.fullname              || basics.legalFirstName
                         ? [basics.legalFirstName || "", basics.legalMiddleName || "", basics.legalLastName || ""].filter(Boolean).join(" ").trim()
                         : "",
        preferredName: basics.preferred             || "",
        birthOrder:    basics.birthOrder            || "",
        dateOfBirth:   basics.dob                   || "",
        timeOfBirth:   basics.timeOfBirth           || basics.timeOfBirthDisplay || "",
        placeOfBirth:  basics.placeOfBirthNormalized || basics.pob || basics.placeOfBirthRaw || "",
        zodiacSign:    basics.zodiacSign            || ""
      };
      // Prefer existing fullname if it exists as a single field
      if (basics.fullname && basics.fullname.trim()) {
        bb.questionnaire.personal.fullName = basics.fullname.trim();
      }
      // Auto-derive zodiac from DOB if not already set
      if (bb.questionnaire.personal.dateOfBirth && !bb.questionnaire.personal.zodiacSign) {
        var derived = deriveZodiacFromDob(bb.questionnaire.personal.dateOfBirth);
        if (derived) bb.questionnaire.personal.zodiacSign = derived;
      }
    }

    // ── Parents section hydration from profile kinship ──
    if (state.profile.kinship && Array.isArray(state.profile.kinship.parents)) {
      var existingParents = bb.questionnaire.parents;
      var parentsEmpty = !existingParents || (Array.isArray(existingParents) && existingParents.length === 0)
        || (!Array.isArray(existingParents) && !_hasAnyValue(existingParents));
      if (parentsEmpty && state.profile.kinship.parents.length > 0) {
        bb.questionnaire.parents = state.profile.kinship.parents.map(function (p) {
          return {
            relation:          p.relation           || "",
            firstName:         p.firstName           || "",
            middleName:        p.middleName          || "",
            lastName:          p.lastName             || "",
            maidenName:        p.maidenName           || "",
            birthDate:         p.birthDate            || "",
            birthPlace:        p.birthPlace           || "",
            occupation:        p.occupation           || "",
            notableLifeEvents: p.notableLifeEvents   || "",
            notes:             p.notes                || ""
          };
        });
      }
    }

    // ── Siblings section hydration from profile kinship ──
    if (state.profile.kinship && Array.isArray(state.profile.kinship.siblings)) {
      var existingSiblings = bb.questionnaire.siblings;
      var siblingsEmpty = !existingSiblings || (Array.isArray(existingSiblings) && existingSiblings.length === 0)
        || (!Array.isArray(existingSiblings) && !_hasAnyValue(existingSiblings));
      if (siblingsEmpty && state.profile.kinship.siblings.length > 0) {
        bb.questionnaire.siblings = state.profile.kinship.siblings.map(function (s) {
          return {
            relation:              s.relation              || "",
            firstName:             s.firstName              || "",
            middleName:            s.middleName             || "",
            lastName:              s.lastName                || "",
            birthOrder:            s.birthOrder              || "",
            uniqueCharacteristics: s.uniqueCharacteristics   || "",
            sharedExperiences:     s.sharedExperiences       || "",
            memories:              s.memories                || "",
            notes:                 s.notes                   || ""
          };
        });
      }
    }
  }

  /* Check if an object has any non-empty string values */
  function _hasAnyValue(obj) {
    if (!obj || typeof obj !== "object") return false;
    if (Array.isArray(obj)) return obj.length > 0;
    return Object.keys(obj).some(function (k) {
      var v = obj[k];
      return v && String(v).trim() !== "";
    });
  }

  /* ───────────────────────────────────────────────────────────
     UTILITIES
  ─────────────────────────────────────────────────────────── */

  function _el(id) { return document.getElementById(id); }

  /* ── v7: Inline confirmation dialog (replaces native confirm()) ── */
  function _showInlineConfirm(message, onConfirm) {
    var existing = document.getElementById("bbInlineConfirm");
    if (existing) existing.remove();
    var overlay = document.createElement("div");
    overlay.id = "bbInlineConfirm";
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.3);z-index:99999;display:flex;align-items:center;justify-content:center;";
    var box = document.createElement("div");
    box.style.cssText = "background:#fff;border-radius:8px;padding:20px 24px;max-width:380px;box-shadow:0 8px 32px rgba(0,0,0,0.2);text-align:center;font-family:inherit;";
    box.innerHTML = '<p style="margin:0 0 16px;font-size:14px;color:#1e293b;">' + message + '</p>'
      + '<div style="display:flex;gap:8px;justify-content:center;">'
      + '<button id="bbConfirmCancel" style="padding:6px 16px;border:1px solid #e2e8f0;border-radius:4px;background:#fff;cursor:pointer;font-size:13px;">Cancel</button>'
      + '<button id="bbConfirmOk" style="padding:6px 16px;border:none;border-radius:4px;background:#ef4444;color:#fff;cursor:pointer;font-size:13px;">Delete</button>'
      + '</div>';
    overlay.appendChild(box);
    // Append inside the popover (top layer) so overlay is visible above it
    var popover = document.getElementById("bioBuilderPopover");
    (popover || document.body).appendChild(overlay);
    document.getElementById("bbConfirmCancel").onclick = function () { overlay.remove(); };
    document.getElementById("bbConfirmOk").onclick = function () { overlay.remove(); onConfirm(); };
    overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
  }

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
     NORMALIZATION HELPERS
  ─────────────────────────────────────────────────────────── */

  var _MONTH_NAMES = {
    jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,
    may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,
    oct:10,october:10,nov:11,november:11,dec:12,december:12
  };

  /**
   * Smart DOB parser: accepts 12241962, 12/24/1962, 12-24-1962,
   * Dec 24 1962, December 24, 1962, 1962-12-24 — returns YYYY-MM-DD or original.
   */
  function normalizeDobInput(raw) {
    if (!raw) return "";
    var s = raw.trim();
    // Already ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    var m, mm, dd, yyyy;

    // 8-digit packed: MMDDYYYY
    if (/^\d{8}$/.test(s)) {
      mm = parseInt(s.slice(0, 2), 10);
      dd = parseInt(s.slice(2, 4), 10);
      yyyy = parseInt(s.slice(4), 10);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && yyyy >= 1800 && yyyy <= 2100)
        return yyyy + "-" + String(mm).padStart(2, "0") + "-" + String(dd).padStart(2, "0");
    }

    // MM/DD/YYYY or MM-DD-YYYY
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
      mm = parseInt(m[1], 10); dd = parseInt(m[2], 10); yyyy = parseInt(m[3], 10);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31)
        return yyyy + "-" + String(mm).padStart(2, "0") + "-" + String(dd).padStart(2, "0");
    }

    // "Dec 24 1962" or "December 24, 1962"
    m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})$/);
    if (m) {
      var mon = _MONTH_NAMES[m[1].toLowerCase()];
      if (mon) {
        dd = parseInt(m[2], 10); yyyy = parseInt(m[3], 10);
        return yyyy + "-" + String(mon).padStart(2, "0") + "-" + String(dd).padStart(2, "0");
      }
    }

    // MM DD YYYY (space-separated)
    m = s.match(/^(\d{1,2})\s+(\d{1,2})\s+(\d{4})$/);
    if (m) {
      mm = parseInt(m[1], 10); dd = parseInt(m[2], 10); yyyy = parseInt(m[3], 10);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31)
        return yyyy + "-" + String(mm).padStart(2, "0") + "-" + String(dd).padStart(2, "0");
    }

    return s; // return as-is if unparseable
  }

  /**
   * Smart time-of-birth parser: 1250p → 12:50 PM, 12:50 pm → 12:50 PM,
   * 0830a → 8:30 AM, 14:30 → 2:30 PM.  Returns "HH:MM AM/PM" or original.
   */
  function normalizeTimeOfBirthInput(raw) {
    if (!raw) return "";
    var s = raw.trim().toLowerCase().replace(/\s+/g, "");

    var m, h, min, ampm;

    // Compact: 1250p, 1250pm, 0830a, 0830am
    m = s.match(/^(\d{3,4})(a|am|p|pm)$/);
    if (m) {
      var digits = m[1].padStart(4, "0");
      h = parseInt(digits.slice(0, 2), 10);
      min = parseInt(digits.slice(2), 10);
      ampm = m[2].charAt(0) === "a" ? "AM" : "PM";
      if (h >= 1 && h <= 12 && min >= 0 && min <= 59)
        return h + ":" + String(min).padStart(2, "0") + " " + ampm;
    }

    // HH:MM am/pm
    m = s.match(/^(\d{1,2}):(\d{2})\s*(a|am|p|pm)$/);
    if (m) {
      h = parseInt(m[1], 10); min = parseInt(m[2], 10);
      ampm = m[3].charAt(0) === "a" ? "AM" : "PM";
      if (h >= 1 && h <= 12 && min >= 0 && min <= 59)
        return h + ":" + String(min).padStart(2, "0") + " " + ampm;
    }

    // 24-hour HH:MM → 12-hour
    m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      h = parseInt(m[1], 10); min = parseInt(m[2], 10);
      if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
        ampm = h >= 12 ? "PM" : "AM";
        var h12 = h === 0 ? 12 : (h > 12 ? h - 12 : h);
        return h12 + ":" + String(min).padStart(2, "0") + " " + ampm;
      }
    }

    // Bare 4-digit military/24h: 0915, 0600, 1430 (no am/pm marker)
    m = s.match(/^(\d{4})$/);
    if (m) {
      h = parseInt(s.slice(0, 2), 10); min = parseInt(s.slice(2), 10);
      if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
        ampm = h >= 12 ? "PM" : "AM";
        var h12b = h === 0 ? 12 : (h > 12 ? h - 12 : h);
        return h12b + ":" + String(min).padStart(2, "0") + " " + ampm;
      }
    }

    return raw.trim();
  }

  /**
   * Place-of-birth cleanup: "Williston ND" → "Williston, North Dakota"
   * Also handles "City, ST" format. Leaves non-US or already-clean strings alone.
   */
  // Reverse lookup: full state name → full state name (for validation)
  var _US_STATE_NAMES = {};
  (function () {
    for (var abbr in US_STATES) {
      _US_STATE_NAMES[US_STATES[abbr].toLowerCase()] = US_STATES[abbr];
    }
  })();

  function normalizePlaceInput(raw) {
    if (!raw) return "";
    var s = raw.trim();
    var m, full;

    // "City, ST" — comma-separated two-letter (check first to avoid double-comma)
    m = s.match(/^(.+?),\s*([A-Z]{2})$/i);
    if (m) {
      full = US_STATES[m[2].toUpperCase()];
      if (full) return m[1].trim() + ", " + full;
    }

    // "City ST" (no comma) — two-letter state at end
    m = s.match(/^(.+?)\s+([A-Z]{2})$/i);
    if (m) {
      full = US_STATES[m[2].toUpperCase()];
      if (full) return m[1].trim().replace(/,\s*$/, "") + ", " + full;
    }

    // "City Statename" — full state name at end (e.g., "Boise Idaho")
    // Try progressively longer tail words as state name
    var words = s.split(/\s+/);
    for (var i = words.length - 1; i >= 1; i--) {
      var candidateState = words.slice(i).join(" ").toLowerCase();
      var fullState = _US_STATE_NAMES[candidateState];
      if (fullState) {
        var city = words.slice(0, i).join(" ").replace(/,\s*$/, "");
        return city + ", " + fullState;
      }
    }

    return s;
  }

  /**
   * Derive zodiac sign from YYYY-MM-DD date string.
   * Returns zodiac name or "" if date invalid.
   */
  function deriveZodiacFromDob(isoDate) {
    if (!isoDate) return "";
    var parts = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!parts) return "";
    var mm = parseInt(parts[2], 10), dd = parseInt(parts[3], 10);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return "";

    if ((mm===1 && dd<=19) || (mm===12 && dd>=22)) return "Capricorn";
    if ((mm===1 && dd>=20) || (mm===2 && dd<=18)) return "Aquarius";
    if ((mm===2 && dd>=19) || (mm===3 && dd<=20)) return "Pisces";
    if ((mm===3 && dd>=21) || (mm===4 && dd<=19)) return "Aries";
    if ((mm===4 && dd>=20) || (mm===5 && dd<=20)) return "Taurus";
    if ((mm===5 && dd>=21) || (mm===6 && dd<=20)) return "Gemini";
    if ((mm===6 && dd>=21) || (mm===7 && dd<=22)) return "Cancer";
    if ((mm===7 && dd>=23) || (mm===8 && dd<=22)) return "Leo";
    if ((mm===8 && dd>=23) || (mm===9 && dd<=22)) return "Virgo";
    if ((mm===9 && dd>=23) || (mm===10 && dd<=22)) return "Libra";
    if ((mm===10 && dd>=23) || (mm===11 && dd<=21)) return "Scorpio";
    if ((mm===11 && dd>=22) || (mm===12 && dd<=21)) return "Sagittarius";
    return "";
  }

  /**
   * Build a canonical basics object from Bio Builder questionnaire data,
   * suitable for merging into state.profile.basics.
   * Does NOT auto-write — caller decides when/how to apply.
   */
  /**
   * Split a full name into {first, middle, last} by simple whitespace rules.
   * "Thomas Reed Walker" → {first:"Thomas", middle:"Reed", last:"Walker"}
   * "Madonna" → {first:"Madonna", middle:"", last:""}
   */
  function _splitFullName(full) {
    if (!full) return { first: "", middle: "", last: "" };
    var parts = full.trim().split(/\s+/);
    if (parts.length === 1) return { first: parts[0], middle: "", last: "" };
    if (parts.length === 2) return { first: parts[0], middle: "", last: parts[1] };
    return { first: parts[0], middle: parts.slice(1, -1).join(" "), last: parts[parts.length - 1] };
  }

  function buildCanonicalBasicsFromBioBuilder() {
    var bb = _bb(); if (!bb) return null;
    var q = bb.questionnaire.personal;
    if (!q) return null;

    var dob = normalizeDobInput(q.dateOfBirth || "");
    var zodiac = q.zodiacSign || "";
    if (!zodiac && dob) zodiac = deriveZodiacFromDob(dob);

    var rawPlace = q.placeOfBirth || "";
    var normPlace = normalizePlaceInput(rawPlace);
    var nameParts = _splitFullName(q.fullName || "");

    var birthOrder = q.birthOrder || "";
    var birthOrderCustom = "";
    if (birthOrder === "Other/custom") {
      // In the future a custom text field can be placed beside the select;
      // for now, keep the token so the UI can render a follow-up input.
      birthOrderCustom = "";
    }

    return {
      fullname:               q.fullName      || "",
      preferred:              q.preferredName || "",
      legalFirstName:         nameParts.first,
      legalMiddleName:        nameParts.middle,
      legalLastName:          nameParts.last,
      dob:                    dob,
      timeOfBirth:            normalizeTimeOfBirthInput(q.timeOfBirth || ""),
      timeOfBirthDisplay:     normalizeTimeOfBirthInput(q.timeOfBirth || ""),
      pob:                    normPlace,
      placeOfBirthRaw:        rawPlace,
      placeOfBirthNormalized: normPlace,
      birthOrder:             birthOrder,
      birthOrderCustom:       birthOrderCustom,
      zodiacSign:             zodiac
    };
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

  // v6: Graph mode state — "cards" (default) or "graph"
  var _ftViewMode = "cards";
  var FT_VIEW_MODES = ["cards", "graph", "scaffold"];
  var _ltViewMode = "cards";

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
                  maidenName: parent.maidenName || "",
                  notes: [parent.notableLifeEvents, parent.notes].filter(Boolean).join("\n\n") },
          status: "pending"
        });
        var narratorName = _currentPersonName();
        var relLabel = parent.relation || "parent";
        if (narratorName && name) {
          if (!_relCandidateExists(bb, narratorName, name)) {
            bb.candidates.relationships.push({
              id: _uid(), type: "relationship", source: "questionnaire:parents",
              sourceId: sectionId, sourceFilename: null,
              data: { personA: narratorName, personB: name, relation: relLabel },
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
          data: { name: name, relation: sib.relation || "", birthOrder: sib.birthOrder || "",
                  notes: [sib.uniqueCharacteristics, sib.sharedExperiences, sib.memories, sib.notes].filter(Boolean).join("\n\n") },
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
    if (!host || (!host.hasAttribute("open") && !host.matches(":popover-open"))) return;
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
    ["bbTabCapture","bbTabQuestionnaire","bbTabSources","bbTabCandidates","bbTabFamilyTree","bbTabLifeThreads"].forEach(function (tid) {
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
    else if (_activeTab === "familyTree")    _renderFamilyTreeTab(content, pid);
    else if (_activeTab === "lifeThreads")   _renderLifeThreadsTab(content, pid);
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
      +     '<input id="bbFactInput" class="bb-input" type="text" placeholder="Add a quick fact about the narrator" />'
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
    // Dynamically set placeholder using current narrator profile
    var factInput = _el("bbFactInput");
    try {
      if (factInput && typeof state !== "undefined" && state.profile && state.profile.basics) {
        var name = state.profile.basics.preferred || "the narrator";
        var pob  = state.profile.basics.pob || "their hometown";
        var year = (state.profile.basics.dob || "").substring(0, 4) || "YYYY";
        factInput.placeholder = "Add a quick fact \u2014 e.g. " + name + " was born in " + pob + " in " + year;
      }
    } catch (_) {}
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
    var labelHtml = '<label class="bb-label" for="' + domId + '">' + _esc(field.label) + '</label>';

    if (field.type === "select" && Array.isArray(field.options)) {
      var optsHtml = field.options.map(function (opt) {
        var ov = _esc(opt);
        var sel = (opt === value) ? ' selected' : '';
        return '<option value="' + ov + '"' + sel + '>' + (ov || '— select —') + '</option>';
      }).join("");
      return '<div class="bb-field">' + labelHtml
        + '<select id="' + domId + '" class="bb-select">' + optsHtml + '</select></div>';
    }

    if (field.type === "textarea") {
      return '<div class="bb-field">' + labelHtml
        + '<textarea id="' + domId + '" class="bb-textarea" rows="3" placeholder="' + _esc(field.placeholder || "") + '">' + va + '</textarea></div>';
    }

    // Text input — with optional blur normalizer
    var blurAttr = "";
    if (field.inputHelper === "normalizeDob") {
      blurAttr = ' onblur="window.LorevoxBioBuilder._onNormalizeBlur(this,\'dob\')"';
    } else if (field.inputHelper === "normalizeTime") {
      blurAttr = ' onblur="window.LorevoxBioBuilder._onNormalizeBlur(this,\'time\')"';
    } else if (field.inputHelper === "normalizePlace") {
      blurAttr = ' onblur="window.LorevoxBioBuilder._onNormalizeBlur(this,\'place\')"';
    }

    // Auto-derive zodiac trigger on DOB blur
    var deriveAttr = "";
    if (field.inputHelper === "normalizeDob") {
      deriveAttr = ' data-derive-zodiac="true"';
    }

    return '<div class="bb-field">' + labelHtml
      + '<input id="' + domId + '" class="bb-input" type="text" value="' + va
      + '" placeholder="' + _esc(field.placeholder || "") + '"' + blurAttr + deriveAttr + ' /></div>';
  }

  /**
   * Inline normalization on blur — called from input onblur attributes.
   * Also triggers zodiac auto-derive when DOB is normalized.
   */
  function _onNormalizeBlur(inputEl, kind) {
    if (!inputEl) return;
    var raw = inputEl.value;
    var normalized;
    if (kind === "dob") {
      normalized = normalizeDobInput(raw);
      inputEl.value = normalized;
      // Auto-derive zodiac if a zodiac select exists in same form
      _tryAutoZodiac(normalized);
    } else if (kind === "time") {
      normalized = normalizeTimeOfBirthInput(raw);
      inputEl.value = normalized;
    } else if (kind === "place") {
      normalized = normalizePlaceInput(raw);
      inputEl.value = normalized;
    }
  }

  /**
   * If there's a zodiac select in the current form context, and it's empty,
   * derive from the DOB and set it. User can still override manually.
   */
  function _tryAutoZodiac(isoDob) {
    // Look for the zodiac select — could be bbQ_zodiacSign (personal section)
    var zodiacEl = _el("bbQ_zodiacSign");
    if (!zodiacEl) return;
    // Only auto-fill if empty (don't override manual choice)
    if (zodiacEl.value) return;
    var sign = deriveZodiacFromDob(isoDob);
    if (sign) zodiacEl.value = sign;
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

  /* ═══════════════════════════════════════════════════════════════
     SAFE CANDIDATE ACCESSORS
     Handles both Phase D `data.*` nested shapes and Phase E
     top-level normalized shapes without breaking.
  ═══════════════════════════════════════════════════════════════ */

  function _getCandidateTitle(c) {
    if (!c) return "Untitled";
    var d = c.data || {};
    return c.value || c.label || c.name || c.title || d.name || d.label || d.text || d.title || c.type || "Untitled";
  }

  function _getCandidateText(c) {
    if (!c) return "";
    var d = c.data || {};
    return c.text || c.snippet || c.preview || d.text || d.context || d.notes || d.snippet || "";
  }

  function _getCandidateSnippet(c) {
    var full = _getCandidateText(c);
    return full.length > 120 ? full.slice(0, 117) + "…" : full;
  }

  function _getCandidateType(c) {
    if (!c) return "unknown";
    return c.type || (c.data && c.data.type) || "unknown";
  }

  /* ═══════════════════════════════════════════════════════════════
     FAMILY TREE — Draft staging surface (v3)
     Per-person draft stores under state.bioBuilder.familyTreeDraftsByPerson
     Uses state.person_id for narrator scoping.
     Writes ONLY to Bio Builder state — never to truth layers.
  ═══════════════════════════════════════════════════════════════ */

  var FT_ROLES = ["narrator","parent","sibling","spouse","child","grandparent","grandchild","guardian","chosen_family","other"];
  var FT_REL_TYPES = ["biological","adoptive","step","marriage","partnership","former_marriage","guardian","chosen_family","half","foster","other"];

  // v6: Era-role relevance map — which roles are most relevant to which eras
  var ERA_ROLE_RELEVANCE = {
    early_childhood:  { parent: 1.0, sibling: 0.8, grandparent: 0.9, guardian: 0.9, chosen_family: 0.3, spouse: 0.0, child: 0.0 },
    school_years:     { parent: 0.8, sibling: 0.9, grandparent: 0.6, guardian: 0.7, chosen_family: 0.4, spouse: 0.0, child: 0.0 },
    adolescence:      { parent: 0.6, sibling: 0.8, grandparent: 0.4, guardian: 0.5, chosen_family: 0.5, spouse: 0.1, child: 0.0 },
    early_adulthood:  { parent: 0.4, sibling: 0.5, grandparent: 0.3, guardian: 0.2, chosen_family: 0.6, spouse: 0.9, child: 0.5 },
    midlife:          { parent: 0.3, sibling: 0.4, grandparent: 0.1, guardian: 0.1, chosen_family: 0.5, spouse: 0.9, child: 0.9 },
    later_life:       { parent: 0.2, sibling: 0.3, grandparent: 0.0, guardian: 0.0, chosen_family: 0.5, spouse: 0.7, child: 0.8, grandchild: 0.9 }
  };

  // v6: Era-theme relevance keywords
  var ERA_THEME_KEYWORDS = {
    early_childhood:  ["home","family","childhood","birth","beginning","first","mother","father","house","yard","kitchen","play"],
    school_years:     ["school","education","teacher","class","learn","friend","grade","study","read","sport"],
    adolescence:      ["teen","independence","identity","rebel","music","friendship","dating","high school","growth"],
    early_adulthood:  ["career","college","marriage","wedding","move","job","apartment","independence","travel","ambition"],
    midlife:          ["career","work","responsibility","children","mortgage","promotion","stability","routine","caregiving","community"],
    later_life:       ["retire","legacy","loss","grandchild","health","reflection","wisdom","downsize","memory","faith","grief","gratitude"]
  };

  // v6: Fuzzy name normalization helper
  function _normalizeName(s) {
    if (!s) return "";
    return String(s).toLowerCase()
      .replace(/[''`\u2018\u2019]/g, "'")    // normalize apostrophes
      .replace(/["""\u201C\u201D]/g, '"')    // normalize quotes
      .replace(/\./g, "")                     // strip periods (J.R. → JR)
      .replace(/,/g, "")                      // strip commas
      .replace(/\s+/g, " ")                   // collapse whitespace
      .replace(/\b(jr|sr|ii|iii|iv|dr|mr|mrs|ms|miss)\b/gi, "")  // strip titles/suffixes
      .trim();
  }

  // v6: Token-based fuzzy score (0.0–1.0)
  function _fuzzyNameScore(a, b) {
    var na = _normalizeName(a);
    var nb = _normalizeName(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1.0;

    var tokA = na.split(/\s+/).filter(Boolean);
    var tokB = nb.split(/\s+/).filter(Boolean);
    if (!tokA.length || !tokB.length) return 0;

    // Check first/last name agreement
    var firstMatch = tokA[0] === tokB[0] ? 1 : 0;
    var lastA = tokA[tokA.length - 1], lastB = tokB[tokB.length - 1];
    var lastMatch = lastA === lastB ? 1 : 0;

    // Token overlap (handles middle name presence/absence)
    var setA = {};
    tokA.forEach(function (t) { setA[t] = true; });
    var overlap = 0;
    tokB.forEach(function (t) { if (setA[t]) overlap++; });
    var tokenScore = overlap / Math.max(tokA.length, tokB.length);

    // Initial matching (handles "J" vs "James")
    var initialBonus = 0;
    if (tokA.length !== tokB.length) {
      var shorter = tokA.length < tokB.length ? tokA : tokB;
      var longer  = tokA.length < tokB.length ? tokB : tokA;
      shorter.forEach(function (t) {
        if (t.length === 1) {
          var match = longer.find(function (l) { return l.charAt(0) === t; });
          if (match) initialBonus += 0.15;
        }
      });
    }

    // Weighted composite
    var score = (firstMatch * 0.3) + (lastMatch * 0.35) + (tokenScore * 0.25) + Math.min(initialBonus, 0.1);
    return Math.min(score, 1.0);
  }

  // v6: Fuzzy duplicate confidence tier
  function _fuzzyDuplicateTier(score) {
    if (score >= 1.0)  return "exact";
    if (score >= 0.8)  return "likely";
    if (score >= 0.5)  return "possible";
    return "distinct";
  }

  function _ftDraft(pid) {
    var bb = _bb(); if (!bb) return null;
    if (!bb.familyTreeDraftsByPerson) bb.familyTreeDraftsByPerson = {};
    var id = pid || _currentPersonId() || "default";
    if (!bb.familyTreeDraftsByPerson[id]) {
      bb.familyTreeDraftsByPerson[id] = { nodes: [], edges: [], meta: {} };
    }
    return bb.familyTreeDraftsByPerson[id];
  }

  function _ftMakeNode(role, data) {
    return {
      id: "ftn_" + _uid(),
      type: "person",
      role: role || "other",
      firstName: (data && data.firstName) || "",
      middleName: (data && data.middleName) || "",
      lastName: (data && data.lastName) || "",
      displayName: (data && data.displayName) || "",
      preferredName: (data && data.preferredName) || "",
      deceased: !!(data && data.deceased),
      birthDate: (data && data.birthDate) || "",
      deathDate: (data && data.deathDate) || "",
      deathContext: (data && data.deathContext) || "",
      notes: (data && data.notes) || "",
      uncertainty: (data && data.uncertainty) || "",
      source: (data && data.source) || "manual"
    };
  }

  function _ftMakeEdge(fromId, toId, relType, label, notes) {
    return {
      id: "fte_" + _uid(),
      from: fromId,
      to: toId,
      relationshipType: relType || "other",
      label: label || "",
      notes: notes || ""
    };
  }

  function _ftNodeDisplayName(node) {
    if (node.displayName) return node.displayName;
    if (node.preferredName) return node.preferredName;
    var parts = [node.firstName, node.middleName, node.lastName].filter(Boolean);
    if (parts.length) return parts.join(" ");
    if (node.label) return node.label;
    return node.uncertainty || "Unknown";
  }

  /* ── Family Tree: Add / Edit / Delete ───────────────────── */

  function _ftAddNode(role) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ftDraft(pid);
    var node = _ftMakeNode(role || "other", {});
    draft.nodes.push(node);
    _ftEditNode(node.id);
  }

  function _ftDeleteNode(nodeId, confirmed) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ftDraft(pid);
    // v7 fix: inline confirmation instead of native confirm() dialog
    var edgeCount = draft.edges.filter(function (e) { return e.from === nodeId || e.to === nodeId; }).length;
    if (edgeCount > 0 && !confirmed) {
      _showInlineConfirm(
        "This person has " + edgeCount + " connection(s). Delete anyway?",
        function () { _ftDeleteNode(nodeId, true); }
      );
      return;
    }
    draft.nodes = draft.nodes.filter(function (n) { return n.id !== nodeId; });
    // v7 fix: auto-clean orphan edges when node is deleted (V2-F04)
    draft.edges = draft.edges.filter(function (e) { return e.from !== nodeId && e.to !== nodeId; });
    _persistDrafts(pid);
    _renderActiveTab();
  }

  function _ftEditNode(nodeId) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ftDraft(pid);
    var node = draft.nodes.find(function (n) { return n.id === nodeId; });
    if (!node) return;
    var content = _el("bbTabContent"); if (!content) return;

    var roleOpts = FT_ROLES.map(function (r) {
      return '<option value="' + r + '"' + (r === node.role ? ' selected' : '') + '>' + r.replace(/_/g, ' ') + '</option>';
    }).join("");

    var uncOpts = ["","Unknown","Approximate","Partially known","Not applicable","Can't remember","Fill in later","Family story / unverified"].map(function (u) {
      return '<option value="' + u + '"' + (u === (node.uncertainty || "") ? ' selected' : '') + '>' + (u || '— none —') + '</option>';
    }).join("");

    content.innerHTML =
      '<div class="bb-section-nav"><button class="bb-ghost-btn bb-back-btn" onclick="window.LorevoxBioBuilder._switchTab(\'familyTree\')">← Back to Family Tree</button></div>'
      + '<div class="bb-section-title">Edit Family Member</div>'
      + '<div class="bb-fields-list">'
      + '<div class="bb-field"><label class="bb-label">Role</label><select id="ftEditRole" class="bb-select">' + roleOpts + '</select></div>'
      + '<div class="bb-field"><label class="bb-label">First Name</label><input id="ftEditFirst" class="bb-input" type="text" value="' + _esc(node.firstName) + '" placeholder="First name or leave blank if unknown" /></div>'
      + '<div class="bb-field"><label class="bb-label">Middle Name</label><input id="ftEditMiddle" class="bb-input" type="text" value="' + _esc(node.middleName) + '" /></div>'
      + '<div class="bb-field"><label class="bb-label">Last Name</label><input id="ftEditLast" class="bb-input" type="text" value="' + _esc(node.lastName) + '" /></div>'
      + '<div class="bb-field"><label class="bb-label">Preferred / Display Name</label><input id="ftEditPreferred" class="bb-input" type="text" value="' + _esc(node.preferredName) + '" placeholder="How they were known" /></div>'
      + '<div class="bb-field"><label class="bb-label">Birth Date</label><input id="ftEditBirth" class="bb-input" type="text" value="' + _esc(node.birthDate) + '" placeholder="YYYY-MM-DD or approximate" /></div>'
      + '<div class="bb-field"><label class="bb-label">Deceased</label><select id="ftEditDeceased" class="bb-select"><option value="false"' + (!node.deceased ? ' selected' : '') + '>No</option><option value="true"' + (node.deceased ? ' selected' : '') + '>Yes</option></select></div>'
      + '<div class="bb-field"><label class="bb-label">Death Date</label><input id="ftEditDeath" class="bb-input" type="text" value="' + _esc(node.deathDate) + '" placeholder="YYYY-MM-DD or approximate" /></div>'
      + '<div class="bb-field"><label class="bb-label">Death Context</label><textarea id="ftEditDeathCtx" class="bb-textarea" rows="2" placeholder="Died shortly after birth, Died by suicide, Cause unknown — use the person\'s own words when possible">' + _esc(node.deathContext) + '</textarea></div>'
      + '<div class="bb-field"><label class="bb-label">Uncertainty</label><select id="ftEditUncertain" class="bb-select">' + uncOpts + '</select></div>'
      + '<div class="bb-field"><label class="bb-label">Notes</label><textarea id="ftEditNotes" class="bb-textarea" rows="3" placeholder="Anything the narrator wants to capture">' + _esc(node.notes) + '</textarea></div>'
      + '</div>'
      + '<div class="bb-section-footer">'
      + '<button class="bb-btn-primary" onclick="window.LorevoxBioBuilder._ftSaveNode(\'' + node.id + '\')">Save</button>'
      + '<button class="bb-ghost-btn" style="color:#f87171" onclick="window.LorevoxBioBuilder._ftDeleteNode(\'' + node.id + '\')">Delete</button>'
      + '</div>';
  }

  function _ftSaveNode(nodeId) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ftDraft(pid);
    var node = draft.nodes.find(function (n) { return n.id === nodeId; });
    if (!node) return;
    node.role = (_el("ftEditRole") || {}).value || node.role;
    node.firstName = (_el("ftEditFirst") || {}).value || "";
    node.middleName = (_el("ftEditMiddle") || {}).value || "";
    node.lastName = (_el("ftEditLast") || {}).value || "";
    node.preferredName = (_el("ftEditPreferred") || {}).value || "";
    node.birthDate = (_el("ftEditBirth") || {}).value || "";
    node.deceased = (_el("ftEditDeceased") || {}).value === "true";
    node.deathDate = (_el("ftEditDeath") || {}).value || "";
    node.deathContext = (_el("ftEditDeathCtx") || {}).value || "";
    node.uncertainty = (_el("ftEditUncertain") || {}).value || "";
    node.notes = (_el("ftEditNotes") || {}).value || "";
    node.displayName = ""; // recompute from parts
    _persistDrafts(pid);
    _switchTab("familyTree");
  }

  /* ── Family Tree: Add Edge ──────────────────────────────── */

  function _ftAddEdge(fromId) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ftDraft(pid);
    var content = _el("bbTabContent"); if (!content) return;
    var fromNode = draft.nodes.find(function (n) { return n.id === fromId; });
    if (!fromNode) return;

    var otherNodes = draft.nodes.filter(function (n) { return n.id !== fromId; });
    if (!otherNodes.length) {
      content.innerHTML = _emptyStateHtml("Need more people", "Add at least two family members before connecting them.", [
        { label: "← Back", action: "window.LorevoxBioBuilder._switchTab('familyTree')" }
      ]);
      return;
    }

    var toOpts = otherNodes.map(function (n) {
      return '<option value="' + n.id + '">' + _esc(_ftNodeDisplayName(n)) + '</option>';
    }).join("");
    var relOpts = FT_REL_TYPES.map(function (r) {
      return '<option value="' + r + '">' + r.replace(/_/g, ' ') + '</option>';
    }).join("");

    content.innerHTML =
      '<div class="bb-section-nav"><button class="bb-ghost-btn bb-back-btn" onclick="window.LorevoxBioBuilder._switchTab(\'familyTree\')">← Back</button></div>'
      + '<div class="bb-section-title">Connect ' + _esc(_ftNodeDisplayName(fromNode)) + '</div>'
      + '<div class="bb-fields-list">'
      + '<div class="bb-field"><label class="bb-label">To</label><select id="ftEdgeTo" class="bb-select">' + toOpts + '</select></div>'
      + '<div class="bb-field"><label class="bb-label">Relationship Type</label><select id="ftEdgeRel" class="bb-select">' + relOpts + '</select></div>'
      + '<div class="bb-field"><label class="bb-label">Label</label><input id="ftEdgeLabel" class="bb-input" type="text" placeholder="e.g. biological mother, stepfather" /></div>'
      + '<div class="bb-field"><label class="bb-label">Notes</label><textarea id="ftEdgeNotes" class="bb-textarea" rows="2"></textarea></div>'
      + '</div>'
      + '<div class="bb-section-footer"><button class="bb-btn-primary" onclick="window.LorevoxBioBuilder._ftSaveEdge(\'' + fromId + '\')">Save Connection</button></div>';
  }

  function _ftSaveEdge(fromId) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ftDraft(pid);
    var toId = (_el("ftEdgeTo") || {}).value;
    var relType = (_el("ftEdgeRel") || {}).value || "other";
    var label = (_el("ftEdgeLabel") || {}).value || "";
    var notes = (_el("ftEdgeNotes") || {}).value || "";
    if (toId) {
      draft.edges.push(_ftMakeEdge(fromId, toId, relType, label, notes));
    }
    _persistDrafts(pid);
    _switchTab("familyTree");
  }

  function _ftDeleteEdge(edgeId) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ftDraft(pid);
    draft.edges = draft.edges.filter(function (e) { return e.id !== edgeId; });
    _persistDrafts(pid);
    _renderActiveTab();
  }

  /* ── Family Tree: Seeding ───────────────────────────────── */

  function _ftSeedFromQuestionnaire() {
    var pid = _currentPersonId(); if (!pid) return;
    var bb = _bb(); if (!bb) return;
    var draft = _ftDraft(pid);

    // Ensure narrator root exists — v7 fix: also match by display name to avoid duplicates
    var q = bb.questionnaire.personal || {};
    var narratorFullName = (q.fullName || "").trim();
    var narratorPrefName = (q.preferredName || "").trim();
    var hasNarrator = draft.nodes.some(function (n) {
      if (n.role === "narrator") return true;
      // Also check if any existing node matches the narrator's name (prevents duplicate on re-seed)
      var dn = _ftNodeDisplayName(n);
      if (narratorFullName && dn === narratorFullName) return true;
      if (narratorPrefName && dn === narratorPrefName) return true;
      return false;
    });
    if (!hasNarrator) {
      var narratorNode = _ftMakeNode("narrator", {
        firstName: narratorFullName ? narratorFullName.split(/\s+/)[0] : "",
        lastName: narratorFullName ? narratorFullName.split(/\s+/).slice(-1)[0] : "",
        preferredName: narratorPrefName,
        source: "questionnaire"
      });
      draft.nodes.push(narratorNode);
    }
    // v7 fix: find narrator by role OR type OR display name (handles dual-schema)
    var _narr = draft.nodes.find(function (n) { return n.role === "narrator" || n.type === "narrator"; });
    if (!_narr && narratorFullName) _narr = draft.nodes.find(function (n) { return _ftNodeDisplayName(n) === narratorFullName; });
    if (!_narr && narratorPrefName) _narr = draft.nodes.find(function (n) { return _ftNodeDisplayName(n) === narratorPrefName; });
    if (!_narr) return; // safety
    var narratorId = _narr.id;

    // Seed parents
    var parents = Array.isArray(bb.questionnaire.parents) ? bb.questionnaire.parents : (bb.questionnaire.parents ? [bb.questionnaire.parents] : []);
    parents.forEach(function (p) {
      var name = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
      if (!name) return;
      var exists = draft.nodes.some(function (n) { return _ftNodeDisplayName(n) === name && (n.role === "parent" || n.type === "parent"); });
      if (exists) return;
      var node = _ftMakeNode("parent", {
        firstName: p.firstName || "", middleName: p.middleName || "", lastName: p.lastName || "",
        birthDate: p.birthDate || "", notes: [p.notableLifeEvents, p.notes].filter(Boolean).join("\n"),
        source: "questionnaire"
      });
      draft.nodes.push(node);
      var relType = (p.relation || "").toLowerCase().indexOf("step") >= 0 ? "step" :
                    (p.relation || "").toLowerCase().indexOf("adopt") >= 0 ? "adoptive" : "biological";
      var label = p.relation || "parent";
      draft.edges.push(_ftMakeEdge(narratorId, node.id, relType, label, ""));
    });

    // Seed siblings
    var sibs = Array.isArray(bb.questionnaire.siblings) ? bb.questionnaire.siblings : (bb.questionnaire.siblings ? [bb.questionnaire.siblings] : []);
    sibs.forEach(function (s) {
      var name = [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ");
      if (!name) return;
      var exists = draft.nodes.some(function (n) { return _ftNodeDisplayName(n) === name && (n.role === "sibling" || n.type === "sibling"); });
      if (exists) return;
      var node = _ftMakeNode("sibling", {
        firstName: s.firstName || "", middleName: s.middleName || "", lastName: s.lastName || "",
        notes: [s.uniqueCharacteristics, s.sharedExperiences, s.memories, s.notes].filter(Boolean).join("\n"),
        source: "questionnaire"
      });
      draft.nodes.push(node);
      var relType = (s.relation || "").toLowerCase().indexOf("step") >= 0 ? "step" :
                    (s.relation || "").toLowerCase().indexOf("half") >= 0 ? "half" : "biological";
      draft.edges.push(_ftMakeEdge(narratorId, node.id, relType, s.relation || "sibling", ""));
    });

    // Seed grandparents
    var gps = Array.isArray(bb.questionnaire.grandparents) ? bb.questionnaire.grandparents : (bb.questionnaire.grandparents ? [bb.questionnaire.grandparents] : []);
    gps.forEach(function (g) {
      var name = [g.firstName, g.lastName].filter(Boolean).join(" ");
      if (!name) return;
      var exists = draft.nodes.some(function (n) { return _ftNodeDisplayName(n) === name && (n.role === "grandparent" || n.type === "grandparent"); });
      if (exists) return;
      var node = _ftMakeNode("grandparent", {
        firstName: g.firstName || "", lastName: g.lastName || "",
        notes: g.memorableStories || "", source: "questionnaire"
      });
      draft.nodes.push(node);
      draft.edges.push(_ftMakeEdge(narratorId, node.id, "biological", "grandparent", ""));
    });

    // v7: auto-clean any orphan edges after seeding
    _ftCleanOrphanEdges(pid);
    _persistDrafts(pid);
    _renderActiveTab();
  }

  function _ftSeedFromCandidates() {
    var pid = _currentPersonId(); if (!pid) return;
    var bb = _bb(); if (!bb) return;
    var draft = _ftDraft(pid);

    // v4: infer role from candidate relation field
    var _inferRole = function (c) {
      var d = c.data || {};
      var rel = (d.relation || c.relation || "").toLowerCase();
      if (/mother|father|mom|dad|parent/.test(rel)) return "parent";
      if (/sister|brother|sibling/.test(rel)) return "sibling";
      if (/wife|husband|spouse|partner/.test(rel)) return "spouse";
      if (/son|daughter|child/.test(rel)) return "child";
      if (/grand/.test(rel)) return "grandparent";
      if (/guardian/.test(rel)) return "guardian";
      if (/aunt|uncle|cousin|chosen/.test(rel)) return "chosen_family";
      return "other";
    };
    var _inferRelType = function (c) {
      var d = c.data || {};
      var rel = (d.relation || c.relation || "").toLowerCase();
      if (/step/.test(rel)) return "step";
      if (/adopt/.test(rel)) return "adoptive";
      if (/half/.test(rel)) return "half";
      if (/foster/.test(rel)) return "foster";
      if (/chosen|aunt|uncle|cousin/.test(rel)) return "chosen_family";
      if (/former|ex/.test(rel)) return "former_marriage";
      if (/wife|husband|spouse|partner|marri/.test(rel)) return "marriage";
      return "biological";
    };

    // Ensure narrator root — v7 fix: check both role and type
    var hasNarrator = draft.nodes.some(function (n) { return n.role === "narrator" || n.type === "narrator"; });
    if (!hasNarrator) {
      var pName = _currentPersonName() || "";
      draft.nodes.push(_ftMakeNode("narrator", {
        firstName: pName.split(/\s+/)[0] || "", lastName: pName.split(/\s+/).slice(-1)[0] || "",
        preferredName: pName, source: "candidate"
      }));
    }
    var _narrC = draft.nodes.find(function (n) { return n.role === "narrator" || n.type === "narrator"; });
    if (!_narrC) return;
    var narratorId = _narrC.id;

    var people = (bb.candidates.people || []);
    people.forEach(function (c) {
      var title = _getCandidateTitle(c);
      if (!title || title === "Untitled") return;
      var role = _inferRole(c);
      var exists = draft.nodes.some(function (n) { return _ftNodeDisplayName(n) === title && n.role === role; });
      if (exists) return;
      var d = c.data || {};
      var node = _ftMakeNode(role, {
        firstName: d.name ? d.name.split(/\s+/)[0] : title,
        lastName: d.name ? d.name.split(/\s+/).slice(-1)[0] : "",
        birthDate: d.birthDate || "", notes: d.notes || _getCandidateText(c),
        source: "candidate"
      });
      draft.nodes.push(node);
      // v4: auto-create edge to narrator
      var relType = _inferRelType(c);
      draft.edges.push(_ftMakeEdge(narratorId, node.id, relType, d.relation || role, ""));
    });

    // v4: also seed from relationship candidates
    var rels = (bb.candidates.relationships || []);
    rels.forEach(function (c) {
      var d = c.data || {};
      var personNames = [d.personA, d.personB].filter(Boolean);
      personNames.forEach(function (pn) {
        if (!pn) return;
        var exists = draft.nodes.some(function (n) { return _ftNodeDisplayName(n) === pn; });
        if (exists) return;
        draft.nodes.push(_ftMakeNode("other", {
          firstName: pn.split(/\s+/)[0], lastName: pn.split(/\s+/).slice(-1)[0] || "",
          notes: d.relation || "", source: "candidate"
        }));
      });
    });

    _persistDrafts(pid);
    _renderActiveTab();
  }

  /* ── v4: Draft Quality Utilities ─────────────────────────── */

  function _ftFindDuplicates(pid) {
    var draft = _ftDraft(pid); if (!draft) return [];
    var seen = {};
    var dupes = [];
    draft.nodes.forEach(function (n) {
      var key = _ftNodeDisplayName(n).toLowerCase().trim();
      if (!key || key === "unknown") return;
      if (seen[key]) dupes.push({ existing: seen[key], duplicate: n });
      else seen[key] = n;
    });
    return dupes;
  }

  function _ftFindUnconnected(pid) {
    var draft = _ftDraft(pid); if (!draft) return [];
    var connected = {};
    draft.edges.forEach(function (e) { connected[e.from] = true; connected[e.to] = true; });
    return draft.nodes.filter(function (n) { return n.role !== "narrator" && !connected[n.id]; });
  }

  function _ftFindWeakNodes(pid) {
    var draft = _ftDraft(pid); if (!draft) return [];
    return draft.nodes.filter(function (n) {
      var name = _ftNodeDisplayName(n);
      return !name || name === "Unknown" || name === "Unnamed" || n.uncertainty;
    });
  }

  function _ftFindUnsourced(pid) {
    var draft = _ftDraft(pid); if (!draft) return [];
    return draft.nodes.filter(function (n) { return !n.source || n.source === "manual"; });
  }

  function _ftCleanOrphanEdges(pid) {
    var draft = _ftDraft(pid); if (!draft) return 0;
    var nodeIds = {};
    draft.nodes.forEach(function (n) { nodeIds[n.id] = true; });
    var before = draft.edges.length;
    draft.edges = draft.edges.filter(function (e) { return nodeIds[e.from] && nodeIds[e.to]; });
    var removed = before - draft.edges.length;
    if (removed > 0) { _persistDrafts(pid); _renderActiveTab(); }
    return removed;
  }

  // Collapsed group state (v4 — per-session, not persisted)
  var _collapsedGroups = {};

  function _toggleGroupCollapse(tabType, role) {
    var key = tabType + ":" + role;
    _collapsedGroups[key] = !_collapsedGroups[key];
    _renderActiveTab();
  }

  function _isGroupCollapsed(tabType, role) {
    return !!_collapsedGroups[tabType + ":" + role];
  }

  /* ── v4: Draft Utilities Panel Renderer ──────────────────── */

  function _renderDraftUtilities(container, pid, tabType) {
    var ftDraft = tabType === "familyTree" ? _ftDraft(pid) : null;
    var ltDraftObj = tabType === "lifeThreads" ? _ltDraft(pid) : null;
    var draft = ftDraft || ltDraftObj;
    if (!draft || !draft.nodes.length) return "";

    var issues = [];
    if (tabType === "familyTree") {
      var dupes = _ftFindDuplicates(pid);
      var unconnected = _ftFindUnconnected(pid);
      var weak = _ftFindWeakNodes(pid);
      var unsourced = _ftFindUnsourced(pid);
      if (dupes.length) issues.push('<span class="ft-util-badge ft-util-warn">' + dupes.length + ' possible duplicate(s)</span>');
      if (unconnected.length) issues.push('<span class="ft-util-badge">' + unconnected.length + ' unconnected</span>');
      if (weak.length) issues.push('<span class="ft-util-badge">' + weak.length + ' weak/unlabeled</span>');
      if (unsourced.length) issues.push('<span class="ft-util-badge">' + unsourced.length + ' unsourced</span>');
    }

    // Orphan edge check (both tabs)
    var nodeIds = {};
    draft.nodes.forEach(function (n) { nodeIds[n.id] = true; });
    var orphanEdges = draft.edges.filter(function (e) { return !nodeIds[e.from] || !nodeIds[e.to]; });
    if (orphanEdges.length) {
      issues.push('<span class="ft-util-badge ft-util-warn">' + orphanEdges.length + ' orphan edge(s) '
        + '<button class="bb-btn-xs" onclick="window.LorevoxBioBuilder._ftCleanOrphanEdges()">Clean</button></span>');
    }

    if (!issues.length) return "";
    return '<div class="ft-utilities-bar">' + issues.join(" ") + '</div>';
  }

  /* ── Family Tree: Tab Renderer ──────────────────────────── */

  function _renderFamilyTreeTab(container, pid) {
    if (!pid) {
      container.innerHTML = _emptyStateHtml("No narrator selected", "Select a narrator to start building their family tree.", []);
      return;
    }
    var draft = _ftDraft(pid);
    if (!draft.nodes.length) {
      container.innerHTML = _emptyStateHtml(
        "Family Tree",
        "Build the family structure here as you gather biography details. Add parents, siblings, spouses, children, and chosen family. This is a draft workspace — nothing is promoted automatically.",
        [
          { label: "🌱 Seed from Questionnaire", action: "window.LorevoxBioBuilder._ftSeedFromQuestionnaire()" },
          { label: "👥 Seed from Candidates", action: "window.LorevoxBioBuilder._ftSeedFromCandidates()" },
          { label: "+ Add Person", action: "window.LorevoxBioBuilder._ftAddNode('other')" }
        ]
      );
      return;
    }

    // Group nodes by role
    var groups = {};
    FT_ROLES.forEach(function (r) { groups[r] = []; });
    draft.nodes.forEach(function (n) {
      var g = groups[n.role] || groups.other;
      g.push(n);
    });

    // v4: draft quality utilities bar
    var utilHtml = _renderDraftUtilities(container, pid, "familyTree");

    // v6: fuzzy duplicate bar (augments v4 exact duplicates)
    var fuzzyDupes = NS._ftFindFuzzyDuplicates ? NS._ftFindFuzzyDuplicates(pid) : [];
    var fuzzyNonExact = fuzzyDupes.filter(function (d) { return d.tier !== "exact"; });
    var fuzzyBar = fuzzyNonExact.length > 0
      ? '<div class="ft-utilities-bar"><span class="ft-util-badge ft-util-info">' + fuzzyNonExact.length
        + ' fuzzy match' + (fuzzyNonExact.length > 1 ? 'es' : '') + ': '
        + fuzzyNonExact.slice(0, 3).map(function (d) { return '"' + _esc(d.nameA) + '" ≈ "' + _esc(d.nameB) + '" (' + Math.round(d.score * 100) + '%)'; }).join(', ')
        + (fuzzyNonExact.length > 3 ? '…' : '') + '</span></div>'
      : '';

    var html = utilHtml + fuzzyBar
      + '<div class="ft-toolbar">'
      + '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._ftAddNode(\'other\')">+ Add Person</button>'
      + '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._ftSeedFromQuestionnaire()">🌱 Seed Questionnaire</button>'
      + '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._ftSeedFromCandidates()">👥 Seed Candidates</button>'
      + _viewModeToggle(_ftViewMode, "window.LorevoxBioBuilder._toggleFTViewMode()")
      + '</div>';

    // v6: Graph mode render
    if (_ftViewMode === "graph") {
      html += _renderFTGraph(pid);
      container.innerHTML = html;
      return;
    }

    // v7: Scaffold mode — 4-generation ancestor tree layout
    if (_ftViewMode === "scaffold") {
      html += _renderFTScaffold(pid);
      container.innerHTML = html;
      return;
    }

    FT_ROLES.forEach(function (role) {
      var nodes = groups[role];
      if (!nodes.length) return;
      var collapsed = _isGroupCollapsed("ft", role);
      html += '<div class="ft-group' + (collapsed ? ' ft-group-collapsed' : '') + '">';
      html += '<div class="ft-group-label" onclick="window.LorevoxBioBuilder._toggleGroupCollapse(\'ft\',\'' + role + '\')" style="cursor:pointer">'
        + '<span class="ft-collapse-arrow">' + (collapsed ? '▸' : '▾') + '</span> '
        + role.replace(/_/g, ' ') + ' <span class="ft-group-count">(' + nodes.length + ')</span></div>';
      if (collapsed) { html += '</div>'; return; }
      html += '<div class="ft-cards">';
      nodes.forEach(function (n) {
        var name = _ftNodeDisplayName(n);
        var decLabel = n.deceased ? '<span class="ft-deceased-badge">deceased</span>' : '';
        var uncLabel = n.uncertainty ? '<span class="ft-uncertain-badge">' + _esc(n.uncertainty) + '</span>' : '';
        var deathNote = n.deathContext ? '<div class="ft-card-death">' + _esc(n.deathContext) + '</div>' : '';
        var notesLine = n.notes ? '<div class="ft-card-notes">' + _esc(n.notes.slice(0, 80)) + (n.notes.length > 80 ? '…' : '') + '</div>' : '';

        // Find edges from this node
        var edges = draft.edges.filter(function (e) { return e.from === n.id || e.to === n.id; });
        var edgeHtml = edges.map(function (e) {
          var otherNodeId = e.from === n.id ? e.to : e.from;
          var otherNode = draft.nodes.find(function (on) { return on.id === otherNodeId; });
          var otherName = otherNode ? _ftNodeDisplayName(otherNode) : "?";
          var dir = e.from === n.id ? "→" : "←";
          return '<div class="ft-edge-line">' + dir + ' <span class="ft-edge-label">' + _esc(e.label || e.relationshipType.replace(/_/g, ' ')) + '</span> '
            + _esc(otherName) + ' <button class="ft-edge-del" onclick="window.LorevoxBioBuilder._ftDeleteEdge(\'' + e.id + '\')">✕</button></div>';
        }).join("");

        var srcBadge = n.source ? '<span class="ft-source-badge">' + _esc(n.source) + '</span>' : '';

        html += '<div class="ft-card' + (n.deceased ? ' ft-card-deceased' : '') + '">'
          + '<div class="ft-card-header">'
          + '<strong>' + _esc(name) + '</strong> ' + decLabel + uncLabel + srcBadge
          + '</div>'
          + (n.birthDate ? '<div class="ft-card-detail">b. ' + _esc(n.birthDate) + '</div>' : '')
          + (n.deathDate ? '<div class="ft-card-detail">d. ' + _esc(n.deathDate) + '</div>' : '')
          + deathNote + notesLine
          + (edgeHtml ? '<div class="ft-card-edges">' + edgeHtml + '</div>' : '')
          + '<div class="ft-card-actions">'
          + '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._ftEditNode(\'' + n.id + '\')">Edit</button>'
          + '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._ftAddEdge(\'' + n.id + '\')">Connect</button>'
          + '<button class="bb-btn-sm" style="color:#f87171" onclick="window.LorevoxBioBuilder._ftDeleteNode(\'' + n.id + '\')">Delete</button>'
          + '</div></div>';
      });
      html += '</div></div>';
    });

    container.innerHTML = html;
  }

  /* ═══════════════════════════════════════════════════════════════
     LIFE THREADS — Draft staging surface (v3)
     Per-person draft stores under state.bioBuilder.lifeThreadsDraftsByPerson
     Uses state.person_id for narrator scoping.
     Writes ONLY to Bio Builder state — never to truth layers.
  ═══════════════════════════════════════════════════════════════ */

  var LT_NODE_TYPES = ["person","place","memory","event","theme"];
  var LT_EDGE_TYPES = ["family_of","happened_in","remembered_with","connected_to","influenced_by","theme_of","other"];

  function _ltDraft(pid) {
    var bb = _bb(); if (!bb) return null;
    if (!bb.lifeThreadsDraftsByPerson) bb.lifeThreadsDraftsByPerson = {};
    var id = pid || _currentPersonId() || "default";
    if (!bb.lifeThreadsDraftsByPerson[id]) {
      bb.lifeThreadsDraftsByPerson[id] = { nodes: [], edges: [], meta: {} };
    }
    return bb.lifeThreadsDraftsByPerson[id];
  }

  function _ltMakeNode(type, data) {
    return {
      id: "ltn_" + _uid(),
      type: type || "memory",
      label: (data && data.label) || "",
      text: (data && data.text) || "",
      notes: (data && data.notes) || "",
      source: (data && data.source) || "manual",
      sourceRef: (data && data.sourceRef) || null
    };
  }

  function _ltMakeEdge(fromId, toId, relationship, notes) {
    return {
      id: "lte_" + _uid(),
      from: fromId,
      to: toId,
      relationship: relationship || "connected_to",
      notes: notes || ""
    };
  }

  /* ── Life Threads: Add / Edit / Delete ──────────────────── */

  function _ltAddNode(type) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ltDraft(pid);
    var node = _ltMakeNode(type || "memory", {});
    draft.nodes.push(node);
    _ltEditNode(node.id);
  }

  function _ltDeleteNode(nodeId, confirmed) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ltDraft(pid);
    var edgeCount = draft.edges.filter(function (e) { return e.from === nodeId || e.to === nodeId; }).length;
    if (edgeCount > 0 && !confirmed) {
      _showInlineConfirm(
        "This thread node has " + edgeCount + " link(s). Delete anyway?",
        function () { _ltDeleteNode(nodeId, true); }
      );
      return;
    }
    draft.nodes = draft.nodes.filter(function (n) { return n.id !== nodeId; });
    draft.edges = draft.edges.filter(function (e) { return e.from !== nodeId && e.to !== nodeId; });
    _persistDrafts(pid);
    _renderActiveTab();
  }

  function _ltEditNode(nodeId) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ltDraft(pid);
    var node = draft.nodes.find(function (n) { return n.id === nodeId; });
    if (!node) return;
    var content = _el("bbTabContent"); if (!content) return;

    var typeOpts = LT_NODE_TYPES.map(function (t) {
      return '<option value="' + t + '"' + (t === node.type ? ' selected' : '') + '>' + t + '</option>';
    }).join("");

    content.innerHTML =
      '<div class="bb-section-nav"><button class="bb-ghost-btn bb-back-btn" onclick="window.LorevoxBioBuilder._switchTab(\'lifeThreads\')">← Back to Life Threads</button></div>'
      + '<div class="bb-section-title">Edit Thread Node</div>'
      + '<div class="bb-fields-list">'
      + '<div class="bb-field"><label class="bb-label">Type</label><select id="ltEditType" class="bb-select">' + typeOpts + '</select></div>'
      + '<div class="bb-field"><label class="bb-label">Label</label><input id="ltEditLabel" class="bb-input" type="text" value="' + _esc(node.label) + '" placeholder="Short name: \'Austin years\', \'left church\', \'Shakey\'s Pizza\'" /></div>'
      + '<div class="bb-field"><label class="bb-label">Details</label><textarea id="ltEditText" class="bb-textarea" rows="3" placeholder="What happened, what it meant, or what you want to remember">' + _esc(node.text) + '</textarea></div>'
      + '<div class="bb-field"><label class="bb-label">Notes</label><textarea id="ltEditNotes" class="bb-textarea" rows="2" placeholder="Approximate dates, uncertainty, things to fill in later">' + _esc(node.notes) + '</textarea></div>'
      + '</div>'
      + '<div class="bb-section-footer">'
      + '<button class="bb-btn-primary" onclick="window.LorevoxBioBuilder._ltSaveNode(\'' + node.id + '\')">Save</button>'
      + '<button class="bb-ghost-btn" style="color:#f87171" onclick="window.LorevoxBioBuilder._ltDeleteNode(\'' + node.id + '\')">Delete</button>'
      + '</div>';
  }

  function _ltSaveNode(nodeId) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ltDraft(pid);
    var node = draft.nodes.find(function (n) { return n.id === nodeId; });
    if (!node) return;
    node.type = (_el("ltEditType") || {}).value || node.type;
    node.label = (_el("ltEditLabel") || {}).value || "";
    node.text = (_el("ltEditText") || {}).value || "";
    node.notes = (_el("ltEditNotes") || {}).value || "";
    _persistDrafts(pid);
    _switchTab("lifeThreads");
  }

  /* ── Life Threads: Add Edge ─────────────────────────────── */

  function _ltAddEdge(fromId) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ltDraft(pid);
    var content = _el("bbTabContent"); if (!content) return;
    var fromNode = draft.nodes.find(function (n) { return n.id === fromId; });
    if (!fromNode) return;

    var otherNodes = draft.nodes.filter(function (n) { return n.id !== fromId; });
    if (!otherNodes.length) {
      content.innerHTML = _emptyStateHtml("Need more nodes", "Add at least two thread nodes before connecting them.", [
        { label: "← Back", action: "window.LorevoxBioBuilder._switchTab('lifeThreads')" }
      ]);
      return;
    }

    var toOpts = otherNodes.map(function (n) {
      return '<option value="' + n.id + '">' + _esc(n.label || n.type) + '</option>';
    }).join("");
    var relOpts = LT_EDGE_TYPES.map(function (r) {
      return '<option value="' + r + '">' + r.replace(/_/g, ' ') + '</option>';
    }).join("");

    content.innerHTML =
      '<div class="bb-section-nav"><button class="bb-ghost-btn bb-back-btn" onclick="window.LorevoxBioBuilder._switchTab(\'lifeThreads\')">← Back</button></div>'
      + '<div class="bb-section-title">Connect: ' + _esc(fromNode.label || fromNode.type) + '</div>'
      + '<div class="bb-fields-list">'
      + '<div class="bb-field"><label class="bb-label">To</label><select id="ltEdgeTo" class="bb-select">' + toOpts + '</select></div>'
      + '<div class="bb-field"><label class="bb-label">Relationship</label><select id="ltEdgeRel" class="bb-select">' + relOpts + '</select></div>'
      + '<div class="bb-field"><label class="bb-label">Notes</label><textarea id="ltEdgeNotes" class="bb-textarea" rows="2"></textarea></div>'
      + '</div>'
      + '<div class="bb-section-footer"><button class="bb-btn-primary" onclick="window.LorevoxBioBuilder._ltSaveEdge(\'' + fromId + '\')">Save Link</button></div>';
  }

  function _ltSaveEdge(fromId) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ltDraft(pid);
    var toId = (_el("ltEdgeTo") || {}).value;
    var rel = (_el("ltEdgeRel") || {}).value || "connected_to";
    var notes = (_el("ltEdgeNotes") || {}).value || "";
    if (toId) {
      draft.edges.push(_ltMakeEdge(fromId, toId, rel, notes));
    }
    _persistDrafts(pid);
    _switchTab("lifeThreads");
  }

  function _ltDeleteEdge(edgeId) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ltDraft(pid);
    draft.edges = draft.edges.filter(function (e) { return e.id !== edgeId; });
    _persistDrafts(pid);
    _renderActiveTab();
  }

  /* ── Life Threads: Seeding ──────────────────────────────── */

  function _ltSeedFromCandidates() {
    var pid = _currentPersonId(); if (!pid) return;
    var bb = _bb(); if (!bb) return;
    var draft = _ltDraft(pid);

    // Narrator anchor
    var hasNarrator = draft.nodes.some(function (n) { return n.type === "person" && n.label && n.label.indexOf("narrator") >= 0; });
    if (!hasNarrator) {
      var narratorName = _currentPersonName() || "Narrator";
      draft.nodes.push(_ltMakeNode("person", { label: narratorName + " (narrator)", source: "questionnaire" }));
    }

    var buckets = [
      { key: "people",        type: "person" },
      { key: "places",        type: "place" },
      { key: "memories",      type: "memory" },
      { key: "events",        type: "event" }
    ];
    buckets.forEach(function (bucket) {
      var items = bb.candidates[bucket.key] || [];
      items.forEach(function (c) {
        var title = _getCandidateTitle(c);
        if (!title || title === "Untitled") return;
        var exists = draft.nodes.some(function (n) { return n.label === title; });
        if (exists) return;
        draft.nodes.push(_ltMakeNode(bucket.type, {
          label: title,
          text: _getCandidateText(c),
          source: "candidate",
          sourceRef: c.id || null
        }));
      });
    });
    _persistDrafts(pid);
    _renderActiveTab();
  }

  function _ltSeedThemes() {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ltDraft(pid);
    var bb = _bb(); if (!bb) return;

    var themeSeeds = [];
    var placeSeeds = [];
    var eventSeeds = [];
    var q = bb.questionnaire;

    // v4: expanded theme seeding from all questionnaire sections
    if (q.earlyMemories) {
      if (q.earlyMemories.firstMemory) themeSeeds.push({ label: "First Memory", text: q.earlyMemories.firstMemory });
      if (q.earlyMemories.favoriteToy) themeSeeds.push({ label: "Favorite Childhood Object", text: q.earlyMemories.favoriteToy });
      if (q.earlyMemories.significantEvent) eventSeeds.push({ label: "Significant Early Event", text: q.earlyMemories.significantEvent });
    }
    if (q.education) {
      if (q.education.schooling) placeSeeds.push({ label: "School Years", text: q.education.schooling });
      if (q.education.higherEducation) placeSeeds.push({ label: "Higher Education", text: q.education.higherEducation });
      if (q.education.earlyCareer) themeSeeds.push({ label: "Early Career", text: q.education.earlyCareer });
      if (q.education.careerProgression) themeSeeds.push({ label: "Career Progression", text: q.education.careerProgression });
      if (q.education.communityInvolvement) themeSeeds.push({ label: "Community Involvement", text: q.education.communityInvolvement });
      if (q.education.mentorship) themeSeeds.push({ label: "Mentorship", text: q.education.mentorship });
    }
    if (q.laterYears) {
      if (q.laterYears.lifeLessons) themeSeeds.push({ label: "Life Lessons", text: q.laterYears.lifeLessons });
      if (q.laterYears.retirement) themeSeeds.push({ label: "Retirement", text: q.laterYears.retirement });
      if (q.laterYears.adviceForFutureGenerations) themeSeeds.push({ label: "Advice for Future Generations", text: q.laterYears.adviceForFutureGenerations });
    }
    if (q.hobbies) {
      if (q.hobbies.hobbies) themeSeeds.push({ label: "Hobbies & Interests", text: q.hobbies.hobbies });
      if (q.hobbies.worldEvents) eventSeeds.push({ label: "World Events", text: q.hobbies.worldEvents });
      if (q.hobbies.personalChallenges) themeSeeds.push({ label: "Personal Challenges", text: q.hobbies.personalChallenges });
      if (q.hobbies.travel) placeSeeds.push({ label: "Travel", text: q.hobbies.travel });
    }
    if (q.additionalNotes) {
      if (q.additionalNotes.unfinishedDreams) themeSeeds.push({ label: "Unfinished Dreams", text: q.additionalNotes.unfinishedDreams });
      if (q.additionalNotes.messagesForFutureGenerations) themeSeeds.push({ label: "Messages for Future Generations", text: q.additionalNotes.messagesForFutureGenerations });
    }

    var _seedNode = function (type, t) {
      var exists = draft.nodes.some(function (n) { return n.label === t.label; });
      if (exists) return;
      draft.nodes.push(_ltMakeNode(type, { label: t.label, text: t.text, source: "questionnaire" }));
    };
    themeSeeds.forEach(function (t) { _seedNode("theme", t); });
    placeSeeds.forEach(function (t) { _seedNode("place", t); });
    eventSeeds.forEach(function (t) { _seedNode("event", t); });
    _persistDrafts(pid);
    _renderActiveTab();
  }

  /* ── Life Threads: Tab Renderer ─────────────────────────── */

  function _renderLifeThreadsTab(container, pid) {
    if (!pid) {
      container.innerHTML = _emptyStateHtml("No narrator selected", "Select a narrator to start organizing their story threads.", []);
      return;
    }
    var draft = _ltDraft(pid);
    if (!draft.nodes.length) {
      container.innerHTML = _emptyStateHtml(
        "Life Threads",
        "Use Life Threads to connect memories, people, places, and life themes. This helps reveal story structure before review and memoir drafting. This is a draft workspace — not a final truth layer.",
        [
          { label: "👥 Seed from Candidates", action: "window.LorevoxBioBuilder._ltSeedFromCandidates()" },
          { label: "🎯 Seed Themes", action: "window.LorevoxBioBuilder._ltSeedThemes()" },
          { label: "+ Add Node", action: "window.LorevoxBioBuilder._ltAddNode('memory')" }
        ]
      );
      return;
    }

    // Group by type
    var groups = {};
    LT_NODE_TYPES.forEach(function (t) { groups[t] = []; });
    draft.nodes.forEach(function (n) {
      var g = groups[n.type] || groups.memory;
      g.push(n);
    });

    var typeIcons = { person: "👤", place: "📍", memory: "💭", event: "📅", theme: "🎯" };

    var html = '<div class="lt-toolbar">'
      + LT_NODE_TYPES.map(function (t) {
          return '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._ltAddNode(\'' + t + '\')">'
            + typeIcons[t] + ' + ' + t + '</button>';
        }).join("")
      + '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._ltSeedFromCandidates()">🌱 Seed</button>'
      + '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._ltSeedThemes()">🎯 Themes</button>'
      + _viewModeToggle(_ltViewMode, "window.LorevoxBioBuilder._toggleLTViewMode()")
      + '</div>';

    // v4: utilities bar
    html += _renderDraftUtilities(container, pid, "lifeThreads");

    // v6: Graph mode render
    if (_ltViewMode === "graph") {
      html += _renderLTGraph(pid);
      container.innerHTML = html;
      return;
    }

    LT_NODE_TYPES.forEach(function (type) {
      var nodes = groups[type];
      if (!nodes.length) return;
      var collapsed = _isGroupCollapsed("lt", type);
      html += '<div class="lt-group' + (collapsed ? ' lt-group-collapsed' : '') + '">';
      html += '<div class="lt-group-label" onclick="window.LorevoxBioBuilder._toggleGroupCollapse(\'lt\',\'' + type + '\')" style="cursor:pointer">'
        + '<span class="ft-collapse-arrow">' + (collapsed ? '▸' : '▾') + '</span> '
        + (typeIcons[type] || '') + ' ' + (type === "memory" ? "memories" : type + 's') + ' <span class="ft-group-count">(' + nodes.length + ')</span></div>';
      if (collapsed) { html += '</div>'; return; }
      html += '<div class="lt-cards">';
      nodes.forEach(function (n) {
        var edges = draft.edges.filter(function (e) { return e.from === n.id || e.to === n.id; });
        var edgeHtml = edges.map(function (e) {
          var otherId = e.from === n.id ? e.to : e.from;
          var otherNode = draft.nodes.find(function (on) { return on.id === otherId; });
          var otherLabel = otherNode ? (otherNode.label || otherNode.type) : "?";
          return '<div class="lt-edge-line">'
            + '<span class="lt-edge-rel">' + _esc(e.relationship.replace(/_/g, ' ')) + '</span> → '
            + _esc(otherLabel)
            + ' <button class="lt-edge-del" onclick="window.LorevoxBioBuilder._ltDeleteEdge(\'' + e.id + '\')">✕</button></div>';
        }).join("");

        html += '<div class="lt-card lt-card-' + type + '">'
          + '<div class="lt-card-header"><strong>' + _esc(n.label || "Untitled") + '</strong></div>'
          + (n.text ? '<div class="lt-card-text">' + _esc(n.text.slice(0, 120)) + (n.text.length > 120 ? '…' : '') + '</div>' : '')
          + (n.notes ? '<div class="lt-card-notes">' + _esc(n.notes.slice(0, 80)) + '</div>' : '')
          + (edgeHtml ? '<div class="lt-card-edges">' + edgeHtml + '</div>' : '')
          + '<div class="lt-card-actions">'
          + '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._ltEditNode(\'' + n.id + '\')">Edit</button>'
          + '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._ltAddEdge(\'' + n.id + '\')">Link</button>'
          + '<button class="bb-btn-sm" style="color:#f87171" onclick="window.LorevoxBioBuilder._ltDeleteNode(\'' + n.id + '\')">Delete</button>'
          + '</div></div>';
      });
      html += '</div></div>';
    });

    container.innerHTML = html;
  }

  /* ── v6: Graph Mode — SVG-based relationship graph ──────── */

  var _GRAPH_MAX_NODES = 80; // cap for performance on large profiles

  /* Role cluster positions for FT graph (relative, 0-1 coordinate space) */
  var _FT_ROLE_POSITIONS = {
    narrator:      { cx: 0.50, cy: 0.50 },
    parent:        { cx: 0.50, cy: 0.15 },
    grandparent:   { cx: 0.50, cy: 0.02 },
    sibling:       { cx: 0.15, cy: 0.40 },
    spouse:        { cx: 0.85, cy: 0.50 },
    child:         { cx: 0.50, cy: 0.85 },
    grandchild:    { cx: 0.50, cy: 0.98 },
    guardian:      { cx: 0.20, cy: 0.18 },
    chosen_family: { cx: 0.85, cy: 0.25 },
    other:         { cx: 0.15, cy: 0.75 }
  };

  /* LT type cluster positions */
  var _LT_TYPE_POSITIONS = {
    person: { cx: 0.30, cy: 0.30 },
    place:  { cx: 0.70, cy: 0.30 },
    memory: { cx: 0.30, cy: 0.70 },
    event:  { cx: 0.70, cy: 0.70 },
    theme:  { cx: 0.50, cy: 0.10 }
  };

  /* Color palette for graph nodes */
  var _FT_ROLE_COLORS = {
    narrator: "#818cf8", parent: "#f97316", grandparent: "#fb923c",
    sibling: "#34d399", spouse: "#f472b6", child: "#38bdf8",
    grandchild: "#67e8f9", guardian: "#fbbf24", chosen_family: "#a78bfa", other: "#94a3b8"
  };
  var _LT_TYPE_COLORS = {
    person: "#818cf8", place: "#34d399", memory: "#f97316", event: "#38bdf8", theme: "#a78bfa"
  };

  /* Spread nodes within a cluster to avoid overlap */
  function _clusterSpread(nodes, center, w, h, spread) {
    spread = spread || 0.12;
    var count = nodes.length;
    if (count === 0) return [];
    if (count === 1) return [{ x: center.cx * w, y: center.cy * h }];
    var positions = [];
    var angleStep = (2 * Math.PI) / count;
    var radius = Math.min(w, h) * spread * Math.min(1, count / 4);
    for (var i = 0; i < count; i++) {
      var angle = angleStep * i - Math.PI / 2;
      positions.push({
        x: center.cx * w + Math.cos(angle) * radius,
        y: center.cy * h + Math.sin(angle) * radius
      });
    }
    return positions;
  }

  /* Render FT graph as SVG string */
  function _renderFTGraph(pid) {
    var draft = _ftDraft(pid);
    if (!draft || !draft.nodes.length) return '<div class="ft-graph-empty">No nodes to graph.</div>';

    var nodes = draft.nodes;
    var edges = draft.edges;
    var capped = nodes.length > _GRAPH_MAX_NODES;
    if (capped) nodes = nodes.slice(0, _GRAPH_MAX_NODES);

    var w = 720, h = 480;
    var nodeRadius = 18;

    // Position nodes by role cluster
    var grouped = {};
    FT_ROLES.forEach(function (r) { grouped[r] = []; });
    nodes.forEach(function (n) { (grouped[n.role] || grouped.other).push(n); });

    var posMap = {}; // nodeId → { x, y }
    FT_ROLES.forEach(function (role) {
      var group = grouped[role];
      if (!group.length) return;
      var center = _FT_ROLE_POSITIONS[role] || _FT_ROLE_POSITIONS.other;
      var positions = _clusterSpread(group, center, w, h, 0.10);
      group.forEach(function (n, i) { posMap[n.id] = positions[i]; });
    });

    // Build SVG
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" class="ft-graph-svg" style="width:100%;height:auto;max-height:480px;">';

    // Edges
    edges.forEach(function (e) {
      var from = posMap[e.from], to = posMap[e.to];
      if (!from || !to) return;
      var label = e.label || e.relationshipType || "";
      var mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
      svg += '<line x1="' + from.x + '" y1="' + from.y + '" x2="' + to.x + '" y2="' + to.y + '" stroke="rgba(148,163,184,0.3)" stroke-width="1.5"/>';
      if (label) {
        svg += '<text x="' + mx + '" y="' + (my - 3) + '" text-anchor="middle" fill="#64748b" font-size="8" font-family="sans-serif">' + _esc(label.replace(/_/g, ' ').slice(0, 16)) + '</text>';
      }
    });

    // Nodes
    nodes.forEach(function (n) {
      var pos = posMap[n.id]; if (!pos) return;
      var color = _FT_ROLE_COLORS[n.role] || _FT_ROLE_COLORS.other;
      var name = _ftNodeDisplayName(n);
      var short = name.length > 12 ? name.slice(0, 11) + '…' : name;
      var opacity = n.deceased ? '0.5' : '1';
      var dnp = n.notes && /do\s*not\s*prompt/i.test(n.notes);
      var stroke = dnp ? '#ef4444' : color;
      svg += '<g style="opacity:' + opacity + '">'
        + '<circle cx="' + pos.x + '" cy="' + pos.y + '" r="' + nodeRadius + '" fill="rgba(30,41,59,0.9)" stroke="' + stroke + '" stroke-width="' + (dnp ? 2.5 : 1.5) + '"/>'
        + '<text x="' + pos.x + '" y="' + (pos.y + 4) + '" text-anchor="middle" fill="' + color + '" font-size="9" font-weight="500" font-family="sans-serif">' + _esc(short) + '</text>'
        + '</g>';
    });

    // Role cluster labels (background)
    FT_ROLES.forEach(function (role) {
      if (!grouped[role].length) return;
      var center = _FT_ROLE_POSITIONS[role] || _FT_ROLE_POSITIONS.other;
      svg += '<text x="' + (center.cx * w) + '" y="' + Math.max(center.cy * h - 28, 10) + '" text-anchor="middle" fill="rgba(148,163,184,0.3)" font-size="10" font-family="sans-serif" font-weight="600">'
        + role.replace(/_/g, ' ').toUpperCase() + '</text>';
    });

    svg += '</svg>';

    if (capped) {
      svg += '<div class="ft-graph-cap-notice">Showing first ' + _GRAPH_MAX_NODES + ' of ' + draft.nodes.length + ' nodes for performance.</div>';
    }
    return svg;
  }

  /* Render LT graph as SVG string */
  function _renderLTGraph(pid) {
    var draft = _ltDraft(pid);
    if (!draft || !draft.nodes.length) return '<div class="lt-graph-empty">No nodes to graph.</div>';

    var nodes = draft.nodes;
    var edges = draft.edges;
    var capped = nodes.length > _GRAPH_MAX_NODES;
    if (capped) nodes = nodes.slice(0, _GRAPH_MAX_NODES);

    var w = 720, h = 480;
    var nodeRadius = 16;

    // Position nodes by type cluster
    var grouped = {};
    LT_NODE_TYPES.forEach(function (t) { grouped[t] = []; });
    nodes.forEach(function (n) { (grouped[n.type] || grouped.memory).push(n); });

    var posMap = {};
    LT_NODE_TYPES.forEach(function (type) {
      var group = grouped[type];
      if (!group.length) return;
      var center = _LT_TYPE_POSITIONS[type] || _LT_TYPE_POSITIONS.memory;
      var positions = _clusterSpread(group, center, w, h, 0.12);
      group.forEach(function (n, i) { posMap[n.id] = positions[i]; });
    });

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" class="lt-graph-svg" style="width:100%;height:auto;max-height:480px;">';

    // Edges
    edges.forEach(function (e) {
      var from = posMap[e.from], to = posMap[e.to];
      if (!from || !to) return;
      var label = e.relationship || "";
      var mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
      svg += '<line x1="' + from.x + '" y1="' + from.y + '" x2="' + to.x + '" y2="' + to.y + '" stroke="rgba(148,163,184,0.25)" stroke-width="1" stroke-dasharray="4,3"/>';
      if (label) {
        svg += '<text x="' + mx + '" y="' + (my - 3) + '" text-anchor="middle" fill="#475569" font-size="7" font-family="sans-serif">' + _esc(label.replace(/_/g, ' ').slice(0, 18)) + '</text>';
      }
    });

    // Nodes
    var typeIcons = { person: "👤", place: "📍", memory: "💭", event: "📅", theme: "🎯" };
    nodes.forEach(function (n) {
      var pos = posMap[n.id]; if (!pos) return;
      var color = _LT_TYPE_COLORS[n.type] || _LT_TYPE_COLORS.memory;
      var label = (n.label || "Untitled");
      var short = label.length > 14 ? label.slice(0, 13) + '…' : label;
      svg += '<circle cx="' + pos.x + '" cy="' + pos.y + '" r="' + nodeRadius + '" fill="rgba(30,41,59,0.85)" stroke="' + color + '" stroke-width="1.5"/>'
        + '<text x="' + pos.x + '" y="' + (pos.y + 3) + '" text-anchor="middle" fill="' + color + '" font-size="8" font-weight="500" font-family="sans-serif">' + _esc(short) + '</text>';
    });

    // Type cluster labels
    LT_NODE_TYPES.forEach(function (type) {
      if (!grouped[type].length) return;
      var center = _LT_TYPE_POSITIONS[type] || _LT_TYPE_POSITIONS.memory;
      svg += '<text x="' + (center.cx * w) + '" y="' + Math.max(center.cy * h - 24, 10) + '" text-anchor="middle" fill="rgba(148,163,184,0.3)" font-size="10" font-family="sans-serif" font-weight="600">'
        + (typeIcons[type] || '') + ' ' + type.toUpperCase() + 'S</text>';
    });

    svg += '</svg>';
    if (capped) {
      svg += '<div class="lt-graph-cap-notice">Showing first ' + _GRAPH_MAX_NODES + ' of ' + draft.nodes.length + ' nodes for performance.</div>';
    }
    return svg;
  }

  /* ── v7: 4-Generation Scaffold Renderer ───────────────── */

  var _SCAFFOLD_GEN_COLORS = ["#6366f1","#8b5cf6","#ec4899","#f59e0b"];
  var _SCAFFOLD_GEN_LABELS = ["Narrator","Parents","Grandparents","Great-Grandparents"];

  function _scaffoldFindNodeByRoleAndName(draft, role, name) {
    return draft.nodes.find(function (n) {
      return n.role === role && _ftNodeDisplayName(n) === name;
    });
  }

  function _scaffoldFindParentsOf(draft, nodeId) {
    // Find nodes connected to nodeId via parent_of or biological/step/adoptive edge where nodeId is the child
    var parentIds = [];
    draft.edges.forEach(function (e) {
      if (e.to === nodeId || e.from === nodeId) {
        var otherNodeId = e.from === nodeId ? e.to : e.from;
        var otherNode = draft.nodes.find(function (n) { return n.id === otherNodeId; });
        if (otherNode && (otherNode.role === "parent" || otherNode.role === "grandparent")) {
          parentIds.push(otherNodeId);
        }
      }
    });
    return parentIds;
  }

  // v7: helper to get effective role from either .role or .type field
  function _scaffoldEffectiveRole(n) {
    if (!n) return "other";
    // Prefer .role if it's a known FT role; fall back to .type
    var r = n.role || n.type || "other";
    if (r === "person") r = n.role || "other"; // "person" is generic, use role if available
    return r;
  }

  function _scaffoldBuildTree(draft) {
    // Build a 4-generation ancestor tree: narrator at center, parents, grandparents, great-grandparents
    var narrator = draft.nodes.find(function (n) { return _scaffoldEffectiveRole(n) === "narrator"; });
    if (!narrator) {
      narrator = draft.nodes[0]; // fallback to first node
    }
    if (!narrator) return null;

    // Generation 1: narrator
    var tree = {
      node: narrator,
      gen: 0,
      children: []
    };

    // Find parent-role nodes — first try via edges, then fall back to role matching
    var parentNodes = [];

    // Method 1: find via edges (if edges have valid from/to)
    draft.edges.forEach(function (e) {
      if (!e.from || !e.to) return; // skip orphan edges
      var parentId = null;
      if (e.from === narrator.id) parentId = e.to;
      else if (e.to === narrator.id) parentId = e.from;
      if (parentId) {
        var pn = draft.nodes.find(function (n) { return n.id === parentId && _scaffoldEffectiveRole(n) === "parent"; });
        if (pn && parentNodes.indexOf(pn) < 0) parentNodes.push(pn);
      }
    });

    // Method 2: if no parents found via edges, find all parent-role nodes directly
    if (parentNodes.length === 0) {
      draft.nodes.forEach(function (n) {
        if (n.id !== narrator.id && _scaffoldEffectiveRole(n) === "parent") {
          parentNodes.push(n);
        }
      });
    }

    // Pad to 2 parent slots
    while (parentNodes.length < 2) parentNodes.push(null);

    var _emptyGen2 = function () {
      return { node: null, gen: 2, children: [{ node: null, gen: 3, children: [] }, { node: null, gen: 3, children: [] }] };
    };

    // v7 fix: track grandparent IDs already assigned to prevent duplicate placement
    var _usedGpIds = {};
    parentNodes.forEach(function (p) { if (p) _usedGpIds[p.id] = true; });
    _usedGpIds[narrator.id] = true;

    tree.children = parentNodes.slice(0, 2).map(function (pn) {
      if (!pn) return { node: null, gen: 1, children: [_emptyGen2(), _emptyGen2()] };

      // Find grandparent-role nodes connected to this parent
      var gpNodes = [];
      draft.edges.forEach(function (e) {
        if (!e.from || !e.to) return;
        var gpId = null;
        if (e.from === pn.id) gpId = e.to;
        else if (e.to === pn.id) gpId = e.from;
        if (gpId && gpId !== narrator.id && !_usedGpIds[gpId]) {
          var gn = draft.nodes.find(function (n) { return n.id === gpId && _scaffoldEffectiveRole(n) === "grandparent"; });
          if (gn && gpNodes.indexOf(gn) < 0) gpNodes.push(gn);
        }
      });

      // Fallback: find grandparent-role nodes not yet placed
      if (gpNodes.length === 0) {
        draft.nodes.forEach(function (n) {
          if (!_usedGpIds[n.id] && _scaffoldEffectiveRole(n) === "grandparent" && gpNodes.length < 2) {
            gpNodes.push(n);
          }
        });
      }

      // Mark these grandparents as used so the next parent gets different ones
      gpNodes.forEach(function (gn) { if (gn) _usedGpIds[gn.id] = true; });

      while (gpNodes.length < 2) gpNodes.push(null);

      return {
        node: pn, gen: 1,
        children: gpNodes.slice(0, 2).map(function (gn) {
          return {
            node: gn, gen: 2,
            children: [{ node: null, gen: 3, children: [] }, { node: null, gen: 3, children: [] }]
          };
        })
      };
    });

    return tree;
  }

  function _scaffoldNodeHtml(nodeOrNull, gen) {
    var color = _SCAFFOLD_GEN_COLORS[gen] || "#94a3b8";
    if (!nodeOrNull) {
      return '<div class="scaffold-node scaffold-empty" style="border-color:' + color + ';">'
        + '<div class="scaffold-node-name">Add Ancestor</div>'
        + '<div class="scaffold-node-meta">' + _SCAFFOLD_GEN_LABELS[gen] + '</div>'
        + '</div>';
    }
    var n = nodeOrNull;
    var name = _ftNodeDisplayName(n);
    var meta = [];
    if (n.birthDate) meta.push("b. " + n.birthDate);
    if (n.deceased) meta.push("deceased");
    if (n.uncertainty) meta.push(n.uncertainty);
    var badges = '';
    if (n.source) badges += '<span class="scaffold-badge">' + _esc(n.source) + '</span>';
    if (n.deceased) badges += '<span class="scaffold-badge scaffold-badge-dec">deceased</span>';

    return '<div class="scaffold-node" style="border-color:' + color + ';" onclick="window.LorevoxBioBuilder._ftEditNode(\'' + n.id + '\')">'
      + '<div class="scaffold-node-name">' + _esc(name) + '</div>'
      + (meta.length ? '<div class="scaffold-node-meta">' + _esc(meta.join(" · ")) + '</div>' : '')
      + badges
      + '</div>';
  }

  function _renderFTScaffold(pid) {
    var draft = _ftDraft(pid);
    var tree = _scaffoldBuildTree(draft);
    if (!tree) {
      return '<div class="scaffold-empty-state">No nodes yet. Add a narrator to see the 4-generation scaffold.</div>';
    }

    // Collect additional nodes not in the scaffold (siblings, spouses, children, chosen_family)
    var scaffoldIds = {};
    function _collectIds(t) {
      if (t.node) scaffoldIds[t.node.id] = true;
      (t.children || []).forEach(_collectIds);
    }
    _collectIds(tree);
    var otherNodes = draft.nodes.filter(function (n) { return !scaffoldIds[n.id]; });

    // Use effective role for grouping other nodes
    var _eRole = _scaffoldEffectiveRole;

    // Render CSS + HTML
    var css = '<style>'
      + '.scaffold-wrap { font-family:inherit; }'
      + '.scaffold-gen { display:flex; justify-content:center; gap:12px; margin-bottom:4px; flex-wrap:wrap; }'
      + '.scaffold-connector { text-align:center; color:#cbd5e1; font-size:18px; margin:2px 0; }'
      + '.scaffold-node { width:140px; padding:10px; border-radius:8px; background:#fff; border-top:4px solid #ccc;'
      + '  text-align:center; box-shadow:0 2px 8px rgba(0,0,0,0.08); cursor:pointer; transition:transform 0.15s; }'
      + '.scaffold-node:hover { transform:translateY(-3px); box-shadow:0 4px 12px rgba(0,0,0,0.12); }'
      + '.scaffold-empty { border-style:dashed; border-width:2px; opacity:0.5; background:transparent; cursor:default; }'
      + '.scaffold-node-name { font-size:0.85rem; font-weight:600; margin-bottom:2px; }'
      + '.scaffold-node-meta { font-size:0.7rem; color:#64748b; }'
      + '.scaffold-badge { display:inline-block; font-size:0.6rem; padding:1px 5px; border-radius:8px; background:#e2e8f0; color:#475569; margin-top:4px; }'
      + '.scaffold-badge-dec { background:#fecaca; color:#991b1b; }'
      + '.scaffold-gen-label { text-align:center; font-size:0.7rem; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px; }'
      + '.scaffold-others { margin-top:16px; padding-top:12px; border-top:1px dashed #e2e8f0; }'
      + '.scaffold-others-label { font-size:0.75rem; color:#94a3b8; margin-bottom:8px; text-transform:uppercase; }'
      + '.scaffold-others-row { display:flex; flex-wrap:wrap; gap:8px; }'
      + '</style>';

    var html = css + '<div class="scaffold-wrap">';

    // Gen 4: Great-grandparents (8 slots)
    html += '<div class="scaffold-gen-label">' + _SCAFFOLD_GEN_LABELS[3] + '</div>';
    html += '<div class="scaffold-gen">';
    tree.children.forEach(function (p) {
      (p.children || []).forEach(function (gp) {
        (gp.children || []).forEach(function (ggp) {
          html += _scaffoldNodeHtml(ggp.node, 3);
        });
      });
    });
    html += '</div>';
    html += '<div class="scaffold-connector">│</div>';

    // Gen 3: Grandparents (4 slots)
    html += '<div class="scaffold-gen-label">' + _SCAFFOLD_GEN_LABELS[2] + '</div>';
    html += '<div class="scaffold-gen">';
    tree.children.forEach(function (p) {
      (p.children || []).forEach(function (gp) {
        html += _scaffoldNodeHtml(gp.node, 2);
      });
    });
    html += '</div>';
    html += '<div class="scaffold-connector">│</div>';

    // Gen 2: Parents (2 slots)
    html += '<div class="scaffold-gen-label">' + _SCAFFOLD_GEN_LABELS[1] + '</div>';
    html += '<div class="scaffold-gen">';
    tree.children.forEach(function (p) {
      html += _scaffoldNodeHtml(p.node, 1);
    });
    html += '</div>';
    html += '<div class="scaffold-connector">│</div>';

    // Gen 1: Narrator
    html += '<div class="scaffold-gen-label">' + _SCAFFOLD_GEN_LABELS[0] + '</div>';
    html += '<div class="scaffold-gen">';
    html += _scaffoldNodeHtml(tree.node, 0);
    html += '</div>';

    // Other nodes (siblings, spouses, children, chosen family) below scaffold
    if (otherNodes.length > 0) {
      var otherGroups = {};
      otherNodes.forEach(function (n) {
        var r = _eRole(n);
        if (!otherGroups[r]) otherGroups[r] = [];
        otherGroups[r].push(n);
      });
      html += '<div class="scaffold-others">';
      html += '<div class="scaffold-others-label">Other family members</div>';
      Object.keys(otherGroups).forEach(function (role) {
        html += '<div style="margin-bottom:4px;font-size:0.7rem;color:#64748b;text-transform:uppercase;">' + role.replace(/_/g, ' ') + '</div>';
        html += '<div class="scaffold-others-row">';
        otherGroups[role].forEach(function (n) {
          var name = _ftNodeDisplayName(n);
          html += '<div class="scaffold-node" style="width:120px;border-color:#94a3b8;" onclick="window.LorevoxBioBuilder._ftEditNode(\'' + n.id + '\')">'
            + '<div class="scaffold-node-name">' + _esc(name) + '</div>'
            + (n.birthDate ? '<div class="scaffold-node-meta">b. ' + _esc(n.birthDate) + '</div>' : '')
            + '</div>';
        });
        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  /* View mode toggle */
  function _toggleFTViewMode() {
    var idx = FT_VIEW_MODES.indexOf(_ftViewMode);
    _ftViewMode = FT_VIEW_MODES[(idx + 1) % FT_VIEW_MODES.length];
    _renderActiveTab();
  }
  function _toggleLTViewMode() {
    _ltViewMode = _ltViewMode === "cards" ? "graph" : "cards";
    _renderActiveTab();
  }

  /* ── v6: Build toggle button HTML ─────────────────────── */
  function _viewModeToggle(mode, toggleFn) {
    var modes = mode === _ftViewMode
      ? [["cards","📋 Cards"],["graph","🔗 Graph"],["scaffold","🌳 Scaffold"]]
      : [["cards","📋 Cards"],["graph","🔗 Graph"]];
    return '<div class="ft-view-toggle">'
      + modes.map(function (m) {
          return '<button class="bb-btn-sm' + (mode === m[0] ? ' bb-btn-active' : '') + '" onclick="' + toggleFn + '"'
            + (mode === m[0] ? ' disabled' : '') + '>' + m[1] + '</button>';
        }).join("")
      + '</div>';
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
    // v8-fix: persist questionnaire to localStorage immediately on save (WD-2 fix)
    var pid = _currentPersonId();
    if (pid) _persistDrafts(pid);
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
    if (!host || (!host.hasAttribute("open") && !host.matches(":popover-open"))) return;
    render();
  }

  var NS = {};
  NS.render              = render;
  NS.refresh             = refresh;
  NS.onNarratorSwitch    = _onNarratorSwitch;
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

  // Normalization helpers (public for profile sync bridge)
  NS.normalizeDobInput          = normalizeDobInput;
  NS.normalizeTimeOfBirthInput  = normalizeTimeOfBirthInput;
  NS.normalizePlaceInput        = normalizePlaceInput;
  NS.deriveZodiacFromDob        = deriveZodiacFromDob;
  NS.buildCanonicalBasicsFromBioBuilder = buildCanonicalBasicsFromBioBuilder;
  NS._onNormalizeBlur           = _onNormalizeBlur;

  // Safe candidate accessors
  NS._getCandidateTitle   = _getCandidateTitle;
  NS._getCandidateText    = _getCandidateText;
  NS._getCandidateSnippet = _getCandidateSnippet;

  // Family Tree tab (v3)
  NS._ftAddNode              = _ftAddNode;
  NS._ftDeleteNode           = _ftDeleteNode;
  NS._ftEditNode             = _ftEditNode;
  NS._ftSaveNode             = _ftSaveNode;
  NS._ftAddEdge              = _ftAddEdge;
  NS._ftSaveEdge             = _ftSaveEdge;
  NS._ftDeleteEdge           = _ftDeleteEdge;
  NS._ftSeedFromQuestionnaire = _ftSeedFromQuestionnaire;
  NS._ftSeedFromCandidates   = _ftSeedFromCandidates;

  // Life Threads tab (v3)
  NS._ltAddNode              = _ltAddNode;
  NS._ltDeleteNode           = _ltDeleteNode;
  NS._ltEditNode             = _ltEditNode;
  NS._ltSaveNode             = _ltSaveNode;
  NS._ltAddEdge              = _ltAddEdge;
  NS._ltSaveEdge             = _ltSaveEdge;
  NS._ltDeleteEdge           = _ltDeleteEdge;
  NS._ltSeedFromCandidates   = _ltSeedFromCandidates;
  NS._ltSeedThemes           = _ltSeedThemes;

  // v4: Persistence
  NS._persistDrafts          = _persistDrafts;
  NS._loadDrafts             = _loadDrafts;
  NS._clearDrafts            = _clearDrafts;
  NS._getDraftIndex          = _getDraftIndex;

  // v4: Draft quality utilities
  NS._ftFindDuplicates       = _ftFindDuplicates;
  NS._ftFindUnconnected      = _ftFindUnconnected;
  NS._ftFindWeakNodes        = _ftFindWeakNodes;
  NS._ftFindUnsourced        = _ftFindUnsourced;
  NS._ftCleanOrphanEdges     = function () {
    var pid = _currentPersonId(); if (!pid) return;
    var removed = _ftCleanOrphanEdges(pid);
    if (removed) alert("Cleaned " + removed + " orphan edge(s).");
  };

  // v4: Collapse/expand
  NS._toggleGroupCollapse    = _toggleGroupCollapse;

  // v6: Graph mode toggle
  NS._toggleFTViewMode       = _toggleFTViewMode;
  NS._toggleLTViewMode       = _toggleLTViewMode;

  // v4: Draft context accessors (for integration — Passes 4-6)
  NS._getDraftFamilyContext   = function (pid) {
    pid = pid || _currentPersonId();
    if (!pid) return null;
    var ft = _ftDraft(pid);
    var lt = _ltDraft(pid);
    return {
      familyTree: ft ? { nodes: ft.nodes, edges: ft.edges } : null,
      lifeThreads: lt ? { nodes: lt.nodes, edges: lt.edges } : null
    };
  };

  // v6: Era-aware draft context accessor
  NS._getDraftFamilyContextForEra = function (pid, era) {
    pid = pid || _currentPersonId();
    if (!pid) return null;
    var base = NS._getDraftFamilyContext(pid);
    if (!base) return null;

    // If no era specified, fall back to global (same as v5)
    if (!era) return { primary: [], secondary: [], global: _flattenContext(base), era: null };

    var primary = [];
    var secondary = [];
    var global = [];
    var roleWeights = ERA_ROLE_RELEVANCE[era] || {};
    var themeKeywords = ERA_THEME_KEYWORDS[era] || [];

    // Score and rank FT nodes
    if (base.familyTree && base.familyTree.nodes) {
      base.familyTree.nodes.forEach(function (n) {
        if (n.role === "narrator") return;
        var item = { type: "ft_person", node: n, label: n.displayName || n.preferredName || n.label || "", role: n.role || "other" };

        // Check explicit era metadata first
        if (n.eraRelevance && n.eraRelevance.length > 0) {
          if (n.eraRelevance.indexOf(era) >= 0) { item.score = n.eraWeight || 0.9; primary.push(item); return; }
        }

        // Infer from role-era map
        var roleScore = roleWeights[n.role] != null ? roleWeights[n.role] : 0.3;
        item.score = roleScore;
        if (roleScore >= 0.7) primary.push(item);
        else if (roleScore >= 0.3) secondary.push(item);
        else global.push(item);
      });
    }

    // Score and rank LT nodes
    if (base.lifeThreads && base.lifeThreads.nodes) {
      base.lifeThreads.nodes.forEach(function (n) {
        var label = n.label || n.displayName || "";
        var item = { type: "lt_" + (n.type || "other"), node: n, label: label, nodeType: n.type || "other" };

        // Check explicit era metadata
        if (n.eraRelevance && n.eraRelevance.length > 0) {
          if (n.eraRelevance.indexOf(era) >= 0) { item.score = n.eraWeight || 0.9; primary.push(item); return; }
        }

        // Infer from keyword overlap
        var lower = label.toLowerCase();
        var keywordHits = 0;
        themeKeywords.forEach(function (kw) { if (lower.indexOf(kw) >= 0) keywordHits++; });
        var kwScore = Math.min(keywordHits * 0.25, 0.9);

        // Themes with keyword hits rank higher
        if (n.type === "theme" && kwScore >= 0.25) { item.score = kwScore; primary.push(item); }
        else if (n.type === "place" && kwScore >= 0.25) { item.score = kwScore; primary.push(item); }
        else if (kwScore > 0) { item.score = kwScore; secondary.push(item); }
        else { item.score = 0.1; global.push(item); }
      });
    }

    // Sort each tier by score descending
    var byScore = function (a, b) { return (b.score || 0) - (a.score || 0); };
    primary.sort(byScore);
    secondary.sort(byScore);

    // Safety: never return completely empty if draft has data
    if (primary.length === 0 && secondary.length === 0 && global.length === 0) {
      return { primary: [], secondary: [], global: _flattenContext(base), era: era };
    }

    return { primary: primary, secondary: secondary, global: global, era: era };
  };

  function _flattenContext(base) {
    var items = [];
    if (base.familyTree && base.familyTree.nodes) {
      base.familyTree.nodes.forEach(function (n) {
        if (n.role === "narrator") return;
        items.push({ type: "ft_person", node: n, label: n.displayName || n.preferredName || n.label || "", role: n.role || "other", score: 0.5 });
      });
    }
    if (base.lifeThreads && base.lifeThreads.nodes) {
      base.lifeThreads.nodes.forEach(function (n) {
        items.push({ type: "lt_" + (n.type || "other"), node: n, label: n.label || n.displayName || "", nodeType: n.type || "other", score: 0.5 });
      });
    }
    return items;
  }

  // v6: Fuzzy matching — exposed for review, dedupe, and seeding
  NS._normalizeName     = _normalizeName;
  NS._fuzzyNameScore    = _fuzzyNameScore;
  NS._fuzzyDuplicateTier = _fuzzyDuplicateTier;

  // v6: Fuzzy duplicate finder (returns { node, match, score, tier } pairs)
  NS._ftFindFuzzyDuplicates = function (pid) {
    pid = pid || _currentPersonId();
    var draft = _ftDraft(pid); if (!draft) return [];
    var results = [];
    for (var i = 0; i < draft.nodes.length; i++) {
      for (var j = i + 1; j < draft.nodes.length; j++) {
        var a = draft.nodes[i], b = draft.nodes[j];
        var nameA = _ftNodeDisplayName(a), nameB = _ftNodeDisplayName(b);
        var score = _fuzzyNameScore(nameA, nameB);
        var tier = _fuzzyDuplicateTier(score);
        if (tier !== "distinct") {
          results.push({ nodeA: a, nodeB: b, nameA: nameA, nameB: nameB, score: score, tier: tier });
        }
      }
    }
    return results;
  };

  // Exposed for tests
  NS._parseTextItems     = _parseTextItems;

  window.LorevoxBioBuilder = NS;

})();
