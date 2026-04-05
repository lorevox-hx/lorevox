/* ═══════════════════════════════════════════════════════════════
   bio-builder-questionnaire.js — Structured questionnaire intake
   Lorevox 9.0 — Phase 2 module split

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
  var _bb                  = _core._bb;
  var _el                  = _core._el;
  var _uid                 = _core._uid;
  var _esc                 = _core._esc;
  var _currentPersonId     = _core._currentPersonId;
  var _currentPersonName   = _core._currentPersonName;
  var _persistDrafts       = _core._persistDrafts;
  var _hasAnyValue         = _core._hasAnyValue;
  var _emptyStateHtml      = _core._emptyStateHtml;
  var _restoreQuestionnaire = _core._restoreQuestionnaire;
  var _qqDebugSnapshot     = _core._qqDebugSnapshot;

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

  var CHILD_RELATION_OPTIONS = [
    "", "Son", "Daughter", "Stepson", "Stepdaughter",
    "Adoptive son", "Adoptive daughter", "Foster child", "Other"
  ];

  /* Phase Q+: Unified relationship type options for spouse/partner section */
  var RELATIONSHIP_TYPE_OPTIONS = [
    "", "Spouse", "Partner", "Former Spouse", "Domestic Partner",
    "Life Partner", "Common-Law Spouse", "Chosen Family", "Other"
  ];

  /* ── Birth-order normalization map ──────────────────────────
     Maps numeric template values to the UI select labels.
     Also handles ordinals like "1st", "2nd", etc.
     Pass-through if the value already matches a known label.
  ──────────────────────────────────────────────────────────── */
  var _BIRTH_ORDER_MAP = {
    "1": "First child",   "1st": "First child",   "first": "First child",
    "2": "Second child",  "2nd": "Second child",  "second": "Second child",
    "3": "Third child",   "3rd": "Third child",   "third": "Third child",
    "4": "Fourth child",  "4th": "Fourth child",  "fourth": "Fourth child",
    "5": "Fifth child",   "5th": "Fifth child",   "fifth": "Fifth child",
    "6": "Sixth child",   "6th": "Sixth child",   "sixth": "Sixth child",
    "7": "Seventh child", "7th": "Seventh child", "seventh": "Seventh child",
    "8": "Eighth child",  "8th": "Eighth child",  "eighth": "Eighth child",
    "9": "Ninth child",   "9th": "Ninth child",   "ninth": "Ninth child",
    "10": "Tenth child",  "10th": "Tenth child",  "tenth": "Tenth child",
    "only": "Only child", "twin": "Twin", "triplet": "Triplet"
  };

  // Phase L: ordinal-word → digit map for descriptive string extraction
  var _ORDINAL_WORD_MAP = {
    "first":"1","second":"2","third":"3","fourth":"4","fifth":"5",
    "sixth":"6","seventh":"7","eighth":"8","ninth":"9","tenth":"10"
  };

  function normalizeBirthOrder(raw) {
    if (!raw) return "";
    var s = String(raw).trim();
    if (!s) return "";
    // Already a valid label? Pass through.
    if (BIRTH_ORDER_OPTIONS.indexOf(s) >= 0) return s;
    // Look up in map (case-insensitive)
    var mapped = _BIRTH_ORDER_MAP[s.toLowerCase()];
    if (mapped) return mapped;

    // Phase L: extract leading digit from descriptive strings
    // e.g., "2 (middle of three children)" → "2" → "Second child"
    var leadDigit = s.match(/^(\d{1,2})\b/);
    if (leadDigit) {
      var digitMapped = _BIRTH_ORDER_MAP[leadDigit[1]];
      if (digitMapped) return digitMapped;
    }

    // Phase L: extract ordinal word from strings like "sixth of eleven children"
    var firstWord = s.toLowerCase().split(/[\s,]+/)[0];
    var ordNum = _ORDINAL_WORD_MAP[firstWord];
    if (ordNum) {
      var ordMapped = _BIRTH_ORDER_MAP[ordNum];
      if (ordMapped) return ordMapped;
    }

    // Unknown value — preserve as-is so nothing is silently lost.
    // The UI select will fall back to default display, but the value is stored.
    return s;
  }

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
        { id: "fullName",      label: "Full Name",      type: "text",     placeholder: "Enter full name" },
        { id: "preferredName", label: "Preferred Name", type: "text",     placeholder: "Enter preferred name" },
        { id: "birthOrder",    label: "Birth Order",    type: "select",   options: BIRTH_ORDER_OPTIONS },
        { id: "dateOfBirth",   label: "Date of Birth",  type: "text",     placeholder: "Enter date of birth", helperText: "Use YYYY-MM-DD when known. Common formats are normalized automatically.", inputHelper: "normalizeDob" },
        { id: "timeOfBirth",   label: "Time of Birth",  type: "text",     placeholder: "Enter time of birth", helperText: "Common shorthand like 1250p is normalized automatically.", inputHelper: "normalizeTime" },
        { id: "placeOfBirth",  label: "Place of Birth", type: "text",     placeholder: "Enter place of birth", helperText: "Short place names like abbreviations are normalized automatically.", inputHelper: "normalizePlace" },
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
        { id: "birthDate",         label: "Birth Date",                    type: "text",     placeholder: "Enter birth date", helperText: "Use YYYY-MM-DD when known.", inputHelper: "normalizeDob" },
        { id: "birthPlace",        label: "Birth Place",                   type: "text",     inputHelper: "normalizePlace" },
        { id: "occupation",        label: "Occupation",                    type: "text" },
        { id: "deceased",          label: "Deceased",                      type: "select",   options: ["No","Yes"] },
        { id: "notableLifeEvents", label: "Notable Life Events / Stories", type: "textarea" },
        { id: "notes",             label: "Additional Notes",              type: "textarea" }
      ]
    },
    {
      id: "grandparents", label: "Grandparents", icon: "\u{1F333}",
      hint: "Ancestry, cultural background, memorable stories",
      repeatable: true, repeatLabel: "grandparent",
      fields: [
        { id: "side",                label: "Side",                type: "select",   options: ["Paternal","Maternal","Paternal-maternal","Paternal-paternal","Maternal-maternal","Maternal-paternal","Unknown"] },
        { id: "firstName",           label: "First Name",          type: "text" },
        { id: "middleName",          label: "Middle Name",         type: "text" },
        { id: "lastName",            label: "Last Name",           type: "text" },
        { id: "maidenName",          label: "Maiden / Birth Name", type: "text",     placeholder: "if different from last name" },
        { id: "birthDate",           label: "Birth Date",          type: "text",     placeholder: "Enter birth date", helperText: "Use YYYY-MM-DD when known.", inputHelper: "normalizeDob" },
        { id: "birthPlace",          label: "Birth Place",         type: "text",     inputHelper: "normalizePlace" },
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
        { id: "maidenName",            label: "Maiden / Birth Name",    type: "text",     placeholder: "if different from last name" },
        { id: "birthOrder",            label: "Birth Order",            type: "select",   options: BIRTH_ORDER_OPTIONS },
        { id: "uniqueCharacteristics", label: "Unique Characteristics", type: "textarea" },
        { id: "sharedExperiences",     label: "Shared Experiences",     type: "textarea" },
        { id: "memories",              label: "Memories",               type: "textarea" },
        { id: "notes",                 label: "Additional Notes",       type: "textarea" }
      ]
    },
    {
      id: "children", label: "Children", icon: "\u{1F476}",
      hint: "Sons and daughters \u2014 names, dates, notes",
      repeatable: true, repeatLabel: "child",
      fields: [
        { id: "relation",   label: "Relation",    type: "select",   options: CHILD_RELATION_OPTIONS },
        { id: "firstName",  label: "First Name",  type: "text" },
        { id: "middleName", label: "Middle Name",  type: "text" },
        { id: "lastName",   label: "Last Name",    type: "text" },
        { id: "birthDate",  label: "Birth Date",   type: "text",     placeholder: "Enter birth date", helperText: "Use YYYY-MM-DD when known.", inputHelper: "normalizeDob" },
        { id: "birthPlace", label: "Birth Place",  type: "text",     inputHelper: "normalizePlace" },
        { id: "narrative",  label: "Notes / Narrative", type: "textarea" }
      ]
    },
    /* ── Phase Q+: New sections ─── spouse, marriage, familyTraditions, pets, health, technology ─── */
    {
      id: "spouse", label: "Spouse / Partner", icon: "\u{1F491}",
      hint: "Spouses, partners, and significant relationships",
      repeatable: true, repeatLabel: "partner",
      fields: [
        { id: "relationshipType", label: "Relationship Type",    type: "select",   options: RELATIONSHIP_TYPE_OPTIONS },
        { id: "firstName",        label: "First Name",           type: "text" },
        { id: "middleName",       label: "Middle Name",          type: "text" },
        { id: "lastName",         label: "Last Name",            type: "text" },
        { id: "maidenName",       label: "Maiden / Birth Name",  type: "text",     placeholder: "if different from last name" },
        { id: "birthDate",        label: "Birth Date",           type: "text",     placeholder: "Exact or approximate (e.g. around 1945)", helperText: "Exact dates normalized to YYYY-MM-DD. Approximate dates preserved as-is.", inputHelper: "normalizeDateSafe" },
        { id: "birthPlace",       label: "Birth Place",          type: "text",     inputHelper: "normalizePlace" },
        { id: "occupation",       label: "Occupation",           type: "text" },
        { id: "deceased",         label: "Deceased",             type: "select",   options: ["","No","Yes"] },
        { id: "narrative",        label: "Narrative / Notes",    type: "textarea" }
      ]
    },
    {
      id: "marriage", label: "Marriage & Union Details", icon: "\u{1F48D}",
      hint: "Proposal stories, wedding details, partnership milestones",
      repeatable: true, repeatLabel: "marriage/union",
      fields: [
        { id: "spouseReference",  label: "Spouse / Partner Name", type: "text",    placeholder: "Who is this marriage/union with?" },
        { id: "marriageDate",     label: "Date",                  type: "text",    placeholder: "Exact or approximate", inputHelper: "normalizeDateSafe" },
        { id: "proposalStory",    label: "Proposal Story",        type: "textarea" },
        { id: "weddingDetails",   label: "Wedding / Union Details", type: "textarea" }
      ]
    },
    {
      id: "familyTraditions", label: "Family Traditions", icon: "\u{1F38A}",
      hint: "Holiday customs, recipes, cultural practices, family rituals",
      repeatable: true, repeatLabel: "tradition",
      fields: [
        { id: "description",  label: "Tradition Description",  type: "textarea" },
        { id: "occasion",     label: "Occasion / Context",     type: "text" }
      ]
    },
    {
      id: "pets", label: "Pets & Animals", icon: "\u{1F43E}",
      hint: "Beloved animals throughout life",
      repeatable: true, repeatLabel: "pet",
      fields: [
        { id: "name",         label: "Name",          type: "text" },
        { id: "species",      label: "Species",       type: "text",     placeholder: "Dog, Cat, Horse, etc." },
        { id: "breed",        label: "Breed",         type: "text" },
        { id: "birthDate",    label: "Birth Date",    type: "text",     inputHelper: "normalizeDateSafe" },
        { id: "adoptionDate", label: "Adoption Date", type: "text",     inputHelper: "normalizeDateSafe" },
        { id: "notes",        label: "Notes / Memories", type: "textarea" }
      ]
    },
    {
      id: "health", label: "Health & Wellness", icon: "\u{1FA7A}",
      hint: "Health milestones, lifestyle changes, wellness reflections",
      fields: [
        { id: "healthMilestones", label: "Health Milestones",   type: "textarea" },
        { id: "lifestyleChanges", label: "Lifestyle Changes",   type: "textarea" },
        { id: "wellnessTips",     label: "Wellness Tips",       type: "textarea" }
      ]
    },
    {
      id: "technology", label: "Technology & Beliefs", icon: "\u{1F4F1}",
      hint: "Tech experiences, gadgets, cultural practices, beliefs",
      fields: [
        { id: "firstTechExperience", label: "First Tech Experience",  type: "textarea" },
        { id: "favoriteGadgets",     label: "Favorite Gadgets",       type: "textarea" },
        { id: "culturalPractices",   label: "Cultural Practices",     type: "textarea" }
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

  /* Phase Q+: Uncertainty-safe date normalizer
     Normalizes exact dates (YYYY-MM-DD, MM/DD/YYYY etc.) but preserves
     approximate/uncertain dates like "around 1945", "early 1960s",
     "approximately 1914", "mid-1970s", year-only values like "1966" etc.
  */
  function normalizeDateSafe(raw) {
    if (!raw) return "";
    var s = raw.trim();
    if (!s) return "";
    // Already ISO? pass through
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // Approximate markers — preserve as-is
    if (/^(around|about|approximately|approx\.?|circa|ca\.?|c\.?|early|mid|late|before|after)\s/i.test(s)) return s;
    // Decade references — preserve as-is
    if (/\d{4}s/.test(s)) return s;
    // Year-only — preserve as-is (don't force to YYYY-01-01)
    if (/^\d{4}$/.test(s)) return s;
    // Try exact normalization
    var normalized = normalizeDobInput(s);
    return normalized;
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

  // Phase 3.3: Track whether hydration has already run for this narrator
  var _lastHydratedPid = null;

  function _hydrateQuestionnaireFromProfile(bb) {
    if (!bb) return;
    try {
      if (typeof state === "undefined" || !state.profile || !state.profile.basics) return;
    } catch (_) { return; }
    var basics = state.profile.basics;

    // Phase 3.3: Make hydration idempotent — skip if already hydrated for this narrator
    var currentPid = bb.personId || null;
    if (currentPid && currentPid === _lastHydratedPid) {
      // Already hydrated this narrator — don't re-run (protects manual edits)
      return;
    }

    var q = bb.questionnaire.personal;
    var personalEmpty = !q || !_hasAnyValue(q);
    if (personalEmpty) {
      // Phase 3.1: Fix full-name hydration — prefer display name, then composed full name
      var fullName = "";
      if (basics.fullname && basics.fullname.trim()) {
        fullName = basics.fullname.trim();
      } else {
        // Compose from parts: first + middle + last
        var parts = [basics.legalFirstName, basics.legalMiddleName, basics.legalLastName].filter(Boolean);
        if (parts.length > 0) {
          fullName = parts.join(" ").trim();
        } else if (basics.preferred && basics.preferred.trim()) {
          // Fallback to preferred name only if nothing else exists
          fullName = basics.preferred.trim();
        }
      }

      bb.questionnaire.personal = {
        fullName:      fullName,
        preferredName: basics.preferred             || "",
        birthOrder:    normalizeBirthOrder(basics.birthOrder),
        dateOfBirth:   basics.dob                   || "",
        timeOfBirth:   basics.timeOfBirth           || basics.timeOfBirthDisplay || "",
        placeOfBirth:  basics.placeOfBirthNormalized || basics.pob || basics.placeOfBirthRaw || "",
        zodiacSign:    basics.zodiacSign            || ""
      };
      if (bb.questionnaire.personal.dateOfBirth && !bb.questionnaire.personal.zodiacSign) {
        var derived = deriveZodiacFromDob(bb.questionnaire.personal.dateOfBirth);
        if (derived) bb.questionnaire.personal.zodiacSign = derived;
      }
    }

    // v8-fix LV-009: profile.kinship is a flat array [{name, relation, ...}],
    // not an object with .parents/.siblings sub-arrays.  Filter by relation.
    var kinArr = Array.isArray(state.profile.kinship) ? state.profile.kinship : [];
    var _PARENT_RELS = /^(father|mother|parent|dad|mom|step.?father|step.?mother|adoptive.?father|adoptive.?mother)$/i;
    var _SIBLING_RELS = /^(brother|sister|sibling|half.?brother|half.?sister|step.?brother|step.?sister)$/i;

    if (kinArr.length) {
      // --- Parents from flat kinship ---
      // Phase 3.2: only hydrate if section is truly empty (no manual content)
      var kinParents = kinArr.filter(function (k) { return _PARENT_RELS.test(k.relation || ""); });
      if (kinParents.length) {
        var existingParents = bb.questionnaire.parents;
        var parentsEmpty = !existingParents || (Array.isArray(existingParents) && existingParents.length === 0)
          || (!Array.isArray(existingParents) && !_hasAnyValue(existingParents));
        if (parentsEmpty) {
          bb.questionnaire.parents = kinParents.map(function (p) {
            var parts = (p.name || "").split(/\s+/);
            return {
              relation: p.relation || "", firstName: parts[0] || "",
              middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : "",
              lastName: parts.length > 1 ? parts[parts.length - 1] : "",
              maidenName: "", birthDate: p.dob || "", birthPlace: p.pob || "",
              occupation: p.occupation || "", notableLifeEvents: "", notes: ""
            };
          });
        }
      }

      // --- Siblings from flat kinship ---
      // Phase 3.2: only hydrate if section is truly empty
      var kinSiblings = kinArr.filter(function (k) { return _SIBLING_RELS.test(k.relation || ""); });
      if (kinSiblings.length) {
        var existingSiblings = bb.questionnaire.siblings;
        var siblingsEmpty = !existingSiblings || (Array.isArray(existingSiblings) && existingSiblings.length === 0)
          || (!Array.isArray(existingSiblings) && !_hasAnyValue(existingSiblings));
        if (siblingsEmpty) {
          bb.questionnaire.siblings = kinSiblings.map(function (s) {
            var parts = (s.name || "").split(/\s+/);
            return {
              relation: s.relation || "", firstName: parts[0] || "",
              middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : "",
              lastName: parts.length > 1 ? parts[parts.length - 1] : "",
              birthOrder: "", uniqueCharacteristics: "", sharedExperiences: "",
              memories: "", notes: ""
            };
          });
        }
      }
    }

    // Phase 3.3: Mark this narrator as hydrated so reopens don't re-run
    _lastHydratedPid = currentPid;
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
        // Phase P: include middleName in candidate name, add enriched fields
        var name = [gp.firstName, gp.middleName, gp.lastName].filter(Boolean).join(" ");
        if (!name) return;
        if (_candidateExists(bb, "people", name, "questionnaire:grandparents")) return;
        bb.candidates.people.push({
          id: _uid(), type: "person", source: "questionnaire:grandparents",
          sourceId: sectionId, sourceFilename: null,
          data: { name: name, side: gp.side || "", maidenName: gp.maidenName || "",
                  birthDate: gp.birthDate || "", birthPlace: gp.birthPlace || "",
                  ancestry: gp.ancestry || "",
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

    // Phase K: children candidate extraction
    if (sectionId === "children") {
      var kids = Array.isArray(q) ? q : [q];
      kids.forEach(function (ch) {
        var name = [ch.firstName, ch.middleName, ch.lastName].filter(Boolean).join(" ");
        if (!name) return;
        if (_candidateExists(bb, "people", name, "questionnaire:children")) return;
        bb.candidates.people.push({
          id: _uid(), type: "person", source: "questionnaire:children",
          sourceId: sectionId, sourceFilename: null,
          data: { name: name, relation: ch.relation || "Child", birthDate: ch.birthDate || "",
                  birthPlace: ch.birthPlace || "",
                  notes: ch.narrative || "" },
          status: "pending"
        });
        var narratorName = _currentPersonName();
        if (narratorName && name) {
          if (!_relCandidateExists(bb, narratorName, name)) {
            bb.candidates.relationships.push({
              id: _uid(), type: "relationship", source: "questionnaire:children",
              sourceId: sectionId, sourceFilename: null,
              data: { personA: narratorName, personB: name, relation: ch.relation || "Child" },
              status: "pending"
            });
          }
        }
      });
    }

    // Phase Q+: Spouse/Partner candidate extraction
    if (sectionId === "spouse") {
      var spouses = Array.isArray(q) ? q : [q];
      spouses.forEach(function (sp) {
        var name = [sp.firstName, sp.middleName, sp.lastName].filter(Boolean).join(" ");
        if (!name) return;
        if (_candidateExists(bb, "people", name, "questionnaire:spouse")) return;
        bb.candidates.people.push({
          id: _uid(), type: "person", source: "questionnaire:spouse",
          sourceId: sectionId, sourceFilename: null,
          data: { name: name, relationshipType: sp.relationshipType || "Spouse",
                  maidenName: sp.maidenName || "",
                  birthDate: sp.birthDate || "", birthPlace: sp.birthPlace || "",
                  occupation: sp.occupation || "", notes: sp.narrative || "" },
          status: "pending"
        });
        var narratorName = _currentPersonName();
        if (narratorName && name) {
          if (!_relCandidateExists(bb, narratorName, name)) {
            bb.candidates.relationships.push({
              id: _uid(), type: "relationship", source: "questionnaire:spouse",
              sourceId: sectionId, sourceFilename: null,
              data: { personA: narratorName, personB: name, relation: sp.relationshipType || "Spouse" },
              status: "pending"
            });
          }
        }
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
    // Phase 1.2: ensure canonical state is current before counting
    var pid = _currentPersonId();
    if (pid && (!bb.questionnaire || Object.keys(bb.questionnaire).length === 0)) {
      _restoreQuestionnaire(pid);
    }
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
    // Phase 1.2: ensure canonical questionnaire state is loaded before any render
    var bb = _bb();
    if (bb && (!bb.questionnaire || Object.keys(bb.questionnaire).length === 0)) {
      _restoreQuestionnaire(pid);
    }
    _qqDebugSnapshot("tab_render", pid);
    if (activeSection) { _renderSectionDetail(container, activeSection, renderActiveTab); return; }

    var sectionCards = SECTIONS.map(function (s) {
      var fillCount = _sectionFillCount(s);
      // Phase Q+: sparse-safe rendering — "No information yet" instead of hidden/broken
      var progressHtml = s.repeatable
        ? (fillCount > 0 ? '<span class="bb-pill bb-pill--has">' + fillCount + ' entr' + (fillCount === 1 ? "y" : "ies") + '</span>' : '<span class="bb-pill bb-pill--empty">No information yet</span>')
        : (fillCount > 0 ? '<span class="bb-pill bb-pill--has">' + fillCount + " / " + s.fields.length + ' filled</span>' : '<span class="bb-pill bb-pill--empty">No information yet</span>');
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
    // Phase 1.2: ensure canonical state before rendering detail
    var pid = _currentPersonId();
    if (pid && (!bb.questionnaire || Object.keys(bb.questionnaire).length === 0)) {
      _restoreQuestionnaire(pid);
    }
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
      + '<button class="bb-ghost-btn bb-add-entry-btn" onclick="event.stopPropagation();event.preventDefault();window.LorevoxBioBuilder._addRepeatEntry(\'' + section.id + '\')">'
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
    } else if (field.inputHelper === "normalizeDateSafe") {
      blurAttr = ' onblur="window.LorevoxBioBuilder._onNormalizeBlur(this,\'dateSafe\')"';
    }

    var deriveAttr = "";
    if (field.inputHelper === "normalizeDob") {
      deriveAttr = ' data-derive-zodiac="true"';
    }

    var helperHtml = "";
    if (field.helperText) {
      helperHtml = '<div class="bb-helper-text">\u24D8 ' + _esc(field.helperText) + '</div>';
    }

    return '<div class="bb-field">' + labelHtml
      + '<input id="' + domId + '" class="bb-input" type="text" value="' + va
      + '" placeholder="' + _esc(field.placeholder || "") + '"' + blurAttr + deriveAttr + ' />'
      + helperHtml + '</div>';
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
    } else if (kind === "dateSafe") {
      // Phase Q+: uncertainty-safe date normalization
      normalized = normalizeDateSafe(raw);
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

    // Phase 1.3: Step 1 — read DOM values; Step 2 — write into canonical bb.questionnaire
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

    // Phase 1.3: Step 3 — persist narrator-scoped state to localStorage AFTER in-memory update
    var pid = _currentPersonId();
    if (pid) _persistDrafts(pid);

    // Phase 2.5: debug snapshot after save
    _qqDebugSnapshot("save_section:" + sectionId, pid, bb);

    _extractQuestionnaireCandidates(sectionId);

    // v8: mark saved fields as human-edited in projection layer
    if (window.LorevoxProjectionSync && window.LorevoxProjectionMap) {
      if (section.repeatable) {
        var entries = bb.questionnaire[sectionId] || [];
        entries.forEach(function (entry, idx) {
          section.fields.forEach(function (f) {
            var val = entry[f.id];
            if (val && String(val).trim() !== "") {
              var path = window.LorevoxProjectionMap.buildRepeatablePath(sectionId, idx, f.id);
              window.LorevoxProjectionSync.markHumanEdit(path, val);
            }
          });
        });
      } else {
        var data = bb.questionnaire[sectionId] || {};
        section.fields.forEach(function (f) {
          var val = data[f.id];
          if (val && String(val).trim() !== "") {
            window.LorevoxProjectionSync.markHumanEdit(sectionId + "." + f.id, val);
          }
        });
      }
    }

    // Phase Q.1: Sync graph from questionnaire after save
    var graphMod = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.graph;
    if (graphMod && typeof graphMod.fullSync === "function") {
      graphMod.fullSync();
    }

    // Phase 1.3: Step 4 — rerender/update badges from canonical state (via closeCallback)
    if (closeCallback) closeCallback();
  }

  function _addRepeatEntry(sectionId, renderCallback) {
    var bb = _bb(); if (!bb) return;
    var pid = _currentPersonId();
    var section = SECTIONS.find(function (s) { return s.id === sectionId; });

    // Phase 2.2 Step 1: restore canonical questionnaire state
    if (pid) _restoreQuestionnaire(pid);

    // Phase 2.3: guard — ensure repeatable array exists
    if (!Array.isArray(bb.questionnaire[sectionId])) {
      bb.questionnaire[sectionId] = bb.questionnaire[sectionId] ? [bb.questionnaire[sectionId]] : [{}];
    }

    // Phase 2.2 Step 2: commit current DOM edits into canonical state
    if (section) {
      var entries = bb.questionnaire[sectionId];
      entries.forEach(function (_, idx) {
        section.fields.forEach(function (f) {
          var el = _el("bbQ_" + idx + "_" + f.id);
          if (el) {
            if (!entries[idx]) entries[idx] = {};
            entries[idx][f.id] = el.value || "";
          }
        });
      });
    }

    // Phase 2.2 Step 3: persist canonical state (with committed DOM edits)
    if (pid) _persistDrafts(pid);

    // Phase 2.2 Step 4: append empty repeatable entry to canonical state
    bb.questionnaire[sectionId].push({});

    // Phase 2.2 Step 5: persist again (with new entry)
    if (pid) _persistDrafts(pid);

    // Phase 2.5: debug snapshot after add
    _qqDebugSnapshot("add_repeat:" + sectionId, pid, bb);

    // Phase 2.2 Step 6: rerender from canonical state
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
    normalizeDateSafe:             normalizeDateSafe,
    normalizeBirthOrder:           normalizeBirthOrder,
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
