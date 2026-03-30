/* ═══════════════════════════════════════════════════════════════
   bio-builder-questionnaire.js — Structured questionnaire intake
   Lorevox 8.0 — Phase 2 module split

   Owns:
     - SECTIONS definitions and option constants
     - questionnaire section rendering
     - repeatable entry handling
     - save / load logic
     - profile → questionnaire hydration
     - normalization helpers (DOB, time, place, zodiac)
     - canonical basics builder
     - questionnaire → candidate extraction

   Depends on:
     - bio-builder-core.js (_bb, _el, _uid, _esc, _currentPersonId,
       _currentPersonName, _persistDrafts, _hasAnyValue, _emptyStateHtml,
       _registerPostSwitchHook)

   Exposes: window.LorevoxBioBuilderModules.questionnaire
   Load order: after bio-builder-core.js, before bio-builder.js
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  var _core = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.core;
  if (!_core) throw new Error("bio-builder-core.js must load before bio-builder-questionnaire.js");

  // Pull core aliases
  var _bb               = _core._bb;
  var _el               = _core._el;
  var _uid              = _core._uid;
  var _esc              = _core._esc;
  var _currentPersonId  = _core._currentPersonId;
  var _currentPersonName = _core._currentPersonName;
  var _persistDrafts    = _core._persistDrafts;
  var _hasAnyValue      = _core._hasAnyValue;
  var _emptyStateHtml   = _core._emptyStateHtml;

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
      id: "personal", label: "Personal Information", icon: "\u{1F464}",
      hint: "Full name, preferred name, birth date, birth place",
      fields: [
        { id: "fullName",      label: "Full Name",      type: "text" },
        { id: "preferredName", label: "Preferred Name", type: "text" },
        { id: "birthOrder",    label: "Birth Order",    type: "select",   options: BIRTH_ORDER_OPTIONS },
        { id: "dateOfBirth",   label: "Date of Birth",  type: "text",     placeholder: "12241962, 12/24/1962, Dec 24 1962 \u2192 auto-parsed", inputHelper: "normalizeDob" },
        { id: "timeOfBirth",   label: "Time of Birth",  type: "text",     placeholder: "1250p, 12:50 pm \u2192 auto-parsed", inputHelper: "normalizeTime" },
        { id: "placeOfBirth",  label: "Place of Birth", type: "text",     placeholder: "Williston ND \u2192 Williston, North Dakota", inputHelper: "normalizePlace" },
        { id: "zodiacSign",    label: "Zodiac Sign",    type: "select",   options: ZODIAC_OPTIONS, autoDerive: "zodiacFromDob" }
      ]
    },
    {
      id: "parents", label: "Parents", icon: "\u{1F331}",
      hint: "Mother and father \u2014 names, dates, occupation, notable life events",
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
      id: "grandparents", label: "Grandparents", icon: "\u{1F333}",
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
      id: "siblings", label: "Siblings", icon: "\u{1F46B}",
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
      id: "earlyMemories", label: "Early Memories", icon: "\u{1F319}",
      hint: "First memory, favorite toy, significant early events",
      fields: [
        { id: "firstMemory",      label: "First Memory",            type: "textarea" },
        { id: "favoriteToy",      label: "Favorite Toy / Object",   type: "textarea" },
        { id: "significantEvent", label: "Significant Early Event", type: "textarea" }
      ]
    },
    {
      id: "education", label: "Education & Career", icon: "\u{1F393}",
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
      id: "laterYears", label: "Later Years", icon: "\u{1F305}",
      hint: "Retirement, life lessons, advice for future generations",
      fields: [
        { id: "retirement",                     label: "Retirement",                      type: "textarea" },
        { id: "lifeLessons",                    label: "Life Lessons",                    type: "textarea" },
        { id: "adviceForFutureGenerations",     label: "Advice for Future Generations",   type: "textarea" }
      ]
    },
    {
      id: "hobbies", label: "Hobbies & Interests", icon: "\u{1F3A8}",
      hint: "Hobbies, world events, personal challenges, travel",
      fields: [
        { id: "hobbies",             label: "Hobbies",             type: "textarea" },
        { id: "worldEvents",         label: "World Events",        type: "textarea" },
        { id: "personalChallenges",  label: "Personal Challenges", type: "textarea" },
        { id: "travel",              label: "Travel",              type: "textarea" }
      ]
    },
    {
      id: "additionalNotes", label: "Additional Notes", icon: "\u{1F4DD}",
      hint: "Unfinished dreams, messages for future generations",
      fields: [
        { id: "unfinishedDreams",              label: "Unfinished Dreams",                type: "textarea" },
        { id: "messagesForFutureGenerations",  label: "Messages for Future Generations",  type: "textarea" }
      ]
    }
  ];

  /* ───────────────────────────────────────────────────────────
     NORMALIZATION HELPERS
  ─────────────────────────────────────────────────────────── */

  var _MONTH_NAMES = {
    jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,
    may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,
    oct:10,october:10,nov:11,november:11,dec:12,december:12
  };

  function normalizeDobInput(raw) {
    if (!raw) return "";
    var s = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var m, mm, dd, yyyy;
    if (/^\d{8}$/.test(s)) {
      mm = parseInt(s.slice(0, 2), 10); dd = parseInt(s.slice(2, 4), 10); yyyy = parseInt(s.slice(4), 10);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && yyyy >= 1800 && yyyy <= 2100)
        return yyyy + "-" + String(mm).padStart(2, "0") + "-" + String(dd).padStart(2, "0");
    }
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
      mm = parseInt(m[1], 10); dd = parseInt(m[2], 10); yyyy = parseInt(m[3], 10);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31)
        return yyyy + "-" + String(mm).padStart(2, "0") + "-" + String(dd).padStart(2, "0");
    }
    m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})$/);
    if (m) {
      var mon = _MONTH_NAMES[m[1].toLowerCase()];
      if (mon) {
        dd = parseInt(m[2], 10); yyyy = parseInt(m[3], 10);
        return yyyy + "-" + String(mon).padStart(2, "0") + "-" + String(dd).padStart(2, "0");
      }
    }
    m = s.match(/^(\d{1,2})\s+(\d{1,2})\s+(\d{4})$/);
    if (m) {
      mm = parseInt(m[1], 10); dd = parseInt(m[2], 10); yyyy = parseInt(m[3], 10);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31)
        return yyyy + "-" + String(mm).padStart(2, "0") + "-" + String(dd).padStart(2, "0");
    }
    return s;
  }

  function normalizeTimeOfBirthInput(raw) {
    if (!raw) return "";
    var s = raw.trim().toLowerCase().replace(/\s+/g, "");
    var m, h, min, ampm;
    m = s.match(/^(\d{3,4})(a|am|p|pm)$/);
    if (m) {
      var digits = m[1].padStart(4, "0");
      h = parseInt(digits.slice(0, 2), 10); min = parseInt(digits.slice(2), 10);
      ampm = m[2].charAt(0) === "a" ? "AM" : "PM";
      if (h >= 1 && h <= 12 && min >= 0 && min <= 59)
        return h + ":" + String(min).padStart(2, "0") + " " + ampm;
    }
    m = s.match(/^(\d{1,2}):(\d{2})\s*(a|am|p|pm)$/);
    if (m) {
      h = parseInt(m[1], 10); min = parseInt(m[2], 10);
      ampm = m[3].charAt(0) === "a" ? "AM" : "PM";
      if (h >= 1 && h <= 12 && min >= 0 && min <= 59)
        return h + ":" + String(min).padStart(2, "0") + " " + ampm;
    }
    m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      h = parseInt(m[1], 10); min = parseInt(m[2], 10);
      if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
        ampm = h >= 12 ? "PM" : "AM";
        var h12 = h === 0 ? 12 : (h > 12 ? h - 12 : h);
        return h12 + ":" + String(min).padStart(2, "0") + " " + ampm;
      }
    }
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
    m = s.match(/^(.+?),\s*([A-Z]{2})$/i);
    if (m) { full = US_STATES[m[2].toUpperCase()]; if (full) return m[1].trim() + ", " + full; }
    m = s.match(/^(.+?)\s+([A-Z]{2})$/i);
    if (m) { full = US_STATES[m[2].toUpperCase()]; if (full) return m[1].trim().replace(/,\s*$/, "") + ", " + full; }
    var words = s.split(/\s+/);
    for (var i = words.length - 1; i >= 1; i--) {
      var candidateState = words.slice(i).join(" ").toLowerCase();
      var fullState = _US_STATE_NAMES[candidateState];
      if (fullState) { return words.slice(0, i).join(" ").replace(/,\s*$/, "") + ", " + fullState; }
    }
    return s;
  }

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
    if (birthOrder === "Other/custom") { birthOrderCustom = ""; }
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
     PROFILE → QUESTIONNAIRE HYDRATION (v6-fix)
     One-way: only fills empty questionnaire sections from profile.
     NEVER overwrites existing Bio Builder questionnaire data.
  ─────────────────────────────────────────────────────────── */

  function _hydrateQuestionnaireFromProfile(bb) {
    if (!bb) return;
    try {
      if (typeof state === "undefined" || !state.profile || !state.profile.basics) return;
    } catch (_) { return; }
    var basics = state.profile.basics;

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
      if (basics.fullname && basics.fullname.trim()) {
        bb.questionnaire.personal.fullName = basics.fullname.trim();
      }
      if (bb.questionnaire.personal.dateOfBirth && !bb.questionnaire.personal.zodiacSign) {
        var derived = deriveZodiacFromDob(bb.questionnaire.personal.dateOfBirth);
        if (derived) bb.questionnaire.personal.zodiacSign = derived;
      }
    }

    if (state.profile.kinship && Array.isArray(state.profile.kinship.parents)) {
      var existingParents = bb.questionnaire.parents;
      var parentsEmpty = !existingParents || (Array.isArray(existingParents) && existingParents.length === 0)
        || (!Array.isArray(existingParents) && !_hasAnyValue(existingParents));
      if (parentsEmpty && state.profile.kinship.parents.length > 0) {
        bb.questionnaire.parents = state.profile.kinship.parents.map(function (p) {
          return {
            relation: p.relation || "", firstName: p.firstName || "", middleName: p.middleName || "",
            lastName: p.lastName || "", maidenName: p.maidenName || "", birthDate: p.birthDate || "",
            birthPlace: p.birthPlace || "", occupation: p.occupation || "",
            notableLifeEvents: p.notableLifeEvents || "", notes: p.notes || ""
          };
        });
      }
    }

    if (state.profile.kinship && Array.isArray(state.profile.kinship.siblings)) {
      var existingSiblings = bb.questionnaire.siblings;
      var siblingsEmpty = !existingSiblings || (Array.isArray(existingSiblings) && existingSiblings.length === 0)
        || (!Array.isArray(existingSiblings) && !_hasAnyValue(existingSiblings));
      if (siblingsEmpty && state.profile.kinship.siblings.length > 0) {
        bb.questionnaire.siblings = state.profile.kinship.siblings.map(function (s) {
          return {
            relation: s.relation || "", firstName: s.firstName || "", middleName: s.middleName || "",
            lastName: s.lastName || "", birthOrder: s.birthOrder || "",
            uniqueCharacteristics: s.uniqueCharacteristics || "", sharedExperiences: s.sharedExperiences || "",
            memories: s.memories || "", notes: s.notes || ""
          };
        });
      }
    }
  }

  // Register hydration as a post-switch hook in core
  _core._registerPostSwitchHook(_hydrateQuestionnaireFromProfile);

  /* ───────────────────────────────────────────────────────────
     CANDIDATE EXTRACTION FROM QUESTIONNAIRE
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
     SECTION FILL PROGRESS
  ─────────────────────────────────────────────────────────── */

  function _sectionFillCount(section) {
    var bb = _bb(); if (!bb) return 0;
    var q  = bb.questionnaire[section.id]; if (!q) return 0;
    if (section.repeatable) { return (Array.isArray(q) ? q : [q]).length; }
    return section.fields.filter(function (f) { return q[f.id] && String(q[f.id]).trim(); }).length;
  }

  /* ───────────────────────────────────────────────────────────
     QUESTIONNAIRE TAB RENDERING
  ─────────────────────────────────────────────────────────── */

  // _activeSection is managed by the caller (bio-builder.js) and passed in
  // via the render functions.  These functions receive a renderCallback to
  // trigger re-renders through the parent's _renderActiveTab.

  function _renderQuestionnaireTab(container, pid, activeSection, renderActiveTab) {
    if (!pid) {
      container.innerHTML = _emptyStateHtml("No narrator selected", "Select a narrator to start the structured questionnaire.", []);
      return;
    }
    if (activeSection) { _renderSectionDetail(container, activeSection, renderActiveTab); return; }

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

  function _renderSectionDetail(container, activeSection, renderActiveTab) {
    var section = SECTIONS.find(function (s) { return s.id === activeSection; });
    if (!section) { return; }
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
      '<div class="bb-section-nav"><button class="bb-ghost-btn bb-back-btn" onclick="window.LorevoxBioBuilder._closeSection()">\u2190 Back to Sections</button></div>'
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
        return '<option value="' + ov + '"' + sel + '>' + (ov || '\u2014 select \u2014') + '</option>';
      }).join("");
      return '<div class="bb-field">' + labelHtml
        + '<select id="' + domId + '" class="bb-select">' + optsHtml + '</select></div>';
    }

    if (field.type === "textarea") {
      return '<div class="bb-field">' + labelHtml
        + '<textarea id="' + domId + '" class="bb-textarea" rows="3" placeholder="' + _esc(field.placeholder || "") + '">' + va + '</textarea></div>';
    }

    var blurAttr = "";
    if (field.inputHelper === "normalizeDob") {
      blurAttr = ' onblur="window.LorevoxBioBuilder._onNormalizeBlur(this,\'dob\')"';
    } else if (field.inputHelper === "normalizeTime") {
      blurAttr = ' onblur="window.LorevoxBioBuilder._onNormalizeBlur(this,\'time\')"';
    } else if (field.inputHelper === "normalizePlace") {
      blurAttr = ' onblur="window.LorevoxBioBuilder._onNormalizeBlur(this,\'place\')"';
    }

    var deriveAttr = "";
    if (field.inputHelper === "normalizeDob") {
      deriveAttr = ' data-derive-zodiac="true"';
    }

    return '<div class="bb-field">' + labelHtml
      + '<input id="' + domId + '" class="bb-input" type="text" value="' + va
      + '" placeholder="' + _esc(field.placeholder || "") + '"' + blurAttr + deriveAttr + ' /></div>';
  }

  function _onNormalizeBlur(inputEl, kind) {
    if (!inputEl) return;
    var raw = inputEl.value;
    var normalized;
    if (kind === "dob") {
      normalized = normalizeDobInput(raw);
      inputEl.value = normalized;
      _tryAutoZodiac(normalized);
    } else if (kind === "time") {
      normalized = normalizeTimeOfBirthInput(raw);
      inputEl.value = normalized;
    } else if (kind === "place") {
      normalized = normalizePlaceInput(raw);
      inputEl.value = normalized;
    }
  }

  function _tryAutoZodiac(isoDob) {
    var zodiacEl = _el("bbQ_zodiacSign");
    if (!zodiacEl) return;
    if (zodiacEl.value) return;
    var sign = deriveZodiacFromDob(isoDob);
    if (sign) zodiacEl.value = sign;
  }

  /* ───────────────────────────────────────────────────────────
     QUESTIONNAIRE ACTION HANDLERS
     These are called from bio-builder.js (which owns _activeSection
     and _renderActiveTab).  They receive callbacks for re-rendering.
  ─────────────────────────────────────────────────────────── */

  function _saveSection(sectionId, closeCallback) {
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
    var pid = _currentPersonId();
    if (pid) _persistDrafts(pid);
    if (closeCallback) closeCallback();
  }

  function _addRepeatEntry(sectionId, renderCallback) {
    var bb = _bb(); if (!bb) return;
    if (!Array.isArray(bb.questionnaire[sectionId])) {
      bb.questionnaire[sectionId] = bb.questionnaire[sectionId] ? [bb.questionnaire[sectionId]] : [];
    }
    bb.questionnaire[sectionId].push({});
    if (renderCallback) renderCallback();
  }

  /* ───────────────────────────────────────────────────────────
     EXPORT MODULE
  ─────────────────────────────────────────────────────────── */

  window.LorevoxBioBuilderModules.questionnaire = {
    // Section definitions
    SECTIONS:                      SECTIONS,

    // Rendering
    _renderQuestionnaireTab:       _renderQuestionnaireTab,
    _renderSectionDetail:          _renderSectionDetail,
    _fieldHtml:                    _fieldHtml,
    _sectionFillCount:             _sectionFillCount,

    // Actions
    _saveSection:                  _saveSection,
    _addRepeatEntry:               _addRepeatEntry,
    _extractQuestionnaireCandidates: _extractQuestionnaireCandidates,

    // Normalization
    normalizeDobInput:             normalizeDobInput,
    normalizeTimeOfBirthInput:     normalizeTimeOfBirthInput,
    normalizePlaceInput:           normalizePlaceInput,
    deriveZodiacFromDob:           deriveZodiacFromDob,
    buildCanonicalBasicsFromBioBuilder: buildCanonicalBasicsFromBioBuilder,
    _onNormalizeBlur:              _onNormalizeBlur,

    // Hydration
    _hydrateQuestionnaireFromProfile: _hydrateQuestionnaireFromProfile,

    // Candidate helpers (used by questionnaire extraction)
    _candidateExists:              _candidateExists,
    _relCandidateExists:           _relCandidateExists,
    _memCandidateExists:           _memCandidateExists
  };

})();
