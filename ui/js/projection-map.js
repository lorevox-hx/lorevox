/* ═══════════════════════════════════════════════════════════════
   projection-map.js — Lorevox 8.0 Interview Projection Map

   Maps each Bio Builder questionnaire field to:
     - projectionPath : key in state.interviewProjection.fields
     - bbTarget       : { section, field } in bb.questionnaire
     - writeMode      : "prefill_if_blank" | "candidate_only" | "suggest_only"
     - conversational : question text Lori uses during interview
     - priority       : 1 (identity-critical) → 5 (supplementary)
     - eraTags        : which life eras this question fits naturally
     - candidateType  : for candidate_only mode — "people"|"memories"|"places"|etc.

   Design principles:
     1. Reuses the SECTIONS schema from bio-builder-questionnaire.js
        — no parallel schema.
     2. Identity fields (name, DOB, birthplace) are prefill_if_blank
        because they're captured during onboarding.
     3. People fields (parents, grandparents, siblings) are
        candidate_only — they create candidate entries for review.
     4. Narrative/memory fields are suggest_only — user must accept.

   Load order: AFTER state.js, BEFORE projection-sync.js
   Exposes: window.LorevoxProjectionMap
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ───────────────────────────────────────────────────────────
     FIELD MAP — Non-repeatable sections
     Key: "section.field"
  ─────────────────────────────────────────────────────────── */

  var FIELD_MAP = {

    /* ── Personal Information ──────────────────────────────── */
    "personal.fullName": {
      writeMode: "prefill_if_blank",
      priority: 1,
      eraTags: [],
      conversational: "What is your full name — first, middle, and last?",
      followUp: "Is there a name you prefer to go by?"
    },
    "personal.preferredName": {
      writeMode: "prefill_if_blank",
      priority: 1,
      eraTags: [],
      conversational: "What name do you prefer to go by?",
    },
    "personal.dateOfBirth": {
      writeMode: "prefill_if_blank",
      priority: 1,
      eraTags: [],
      conversational: "When were you born?",
      inputHelper: "normalizeDob"
    },
    "personal.timeOfBirth": {
      writeMode: "suggest_only",
      priority: 4,
      eraTags: ["early_childhood"],
      conversational: "Do you happen to know what time of day you were born?",
    },
    "personal.placeOfBirth": {
      writeMode: "prefill_if_blank",
      priority: 1,
      eraTags: ["early_childhood"],
      conversational: "Where were you born — what city and state, or country?",
      inputHelper: "normalizePlace"
    },
    "personal.birthOrder": {
      writeMode: "prefill_if_blank",
      priority: 2,
      eraTags: ["early_childhood"],
      conversational: "Were you the first child, or did you have older siblings?",
    },
    "personal.zodiacSign": {
      writeMode: "prefill_if_blank",
      priority: 5,
      eraTags: [],
      conversational: null,  // auto-derived from DOB, never asked directly
      autoDerive: "zodiacFromDob"
    },

    /* ── Early Memories ────────────────────────────────────── */
    "earlyMemories.firstMemory": {
      writeMode: "suggest_only",
      priority: 3,
      eraTags: ["early_childhood"],
      conversational: "What is the earliest memory you can recall? Even a small fragment — a place, a sound, a feeling?",
    },
    "earlyMemories.favoriteToy": {
      writeMode: "suggest_only",
      priority: 4,
      eraTags: ["early_childhood"],
      conversational: "Was there a favorite toy, blanket, or object you were attached to as a young child?",
    },
    "earlyMemories.significantEvent": {
      writeMode: "suggest_only",
      priority: 3,
      eraTags: ["early_childhood"],
      conversational: "Was there a significant event from your early childhood — something the family talked about, or that you remember feeling strongly?",
    },

    /* ── Education & Career ────────────────────────────────── */
    "education.schooling": {
      writeMode: "suggest_only",
      priority: 3,
      eraTags: ["school_years"],
      conversational: "Tell me about your schooling — where did you go to school, and what was it like?",
    },
    "education.higherEducation": {
      writeMode: "suggest_only",
      priority: 3,
      eraTags: ["school_years", "early_adulthood"],
      conversational: "Did you go on to college or any other education after high school? What was that experience like?",
    },
    "education.earlyCareer": {
      writeMode: "suggest_only",
      priority: 3,
      eraTags: ["early_adulthood"],
      conversational: "What was your first real job or the beginning of your career?",
    },
    "education.careerProgression": {
      writeMode: "suggest_only",
      priority: 3,
      eraTags: ["early_adulthood", "midlife"],
      conversational: "How did your career develop over the years? Were there turning points or big changes?",
    },
    "education.communityInvolvement": {
      writeMode: "suggest_only",
      priority: 4,
      eraTags: ["midlife", "later_life"],
      conversational: "Were you involved in your community — church, volunteering, clubs, or organizations?",
    },
    "education.mentorship": {
      writeMode: "suggest_only",
      priority: 4,
      eraTags: ["midlife", "later_life"],
      conversational: "Was there someone who mentored you, or someone you mentored?",
    },

    /* ── Later Years ───────────────────────────────────────── */
    "laterYears.retirement": {
      writeMode: "suggest_only",
      priority: 3,
      eraTags: ["later_life"],
      conversational: "What was retirement like for you? Was it a welcome change or a difficult transition?",
    },
    "laterYears.lifeLessons": {
      writeMode: "suggest_only",
      priority: 3,
      eraTags: ["later_life"],
      conversational: "Looking back, what are the most important lessons life has taught you?",
    },
    "laterYears.adviceForFutureGenerations": {
      writeMode: "suggest_only",
      priority: 3,
      eraTags: ["later_life"],
      conversational: "If you could pass along one piece of advice to future generations, what would it be?",
    },

    /* ── Hobbies & Interests ───────────────────────────────── */
    "hobbies.hobbies": {
      writeMode: "suggest_only",
      priority: 4,
      eraTags: ["school_years", "adolescence", "early_adulthood", "midlife", "later_life"],
      conversational: "What hobbies or interests have been important to you over the years?",
    },
    "hobbies.worldEvents": {
      writeMode: "suggest_only",
      priority: 4,
      eraTags: ["school_years", "adolescence", "early_adulthood", "midlife"],
      conversational: "Were there world events — a war, a political moment, a cultural shift — that shaped your life in some way?",
    },
    "hobbies.personalChallenges": {
      writeMode: "suggest_only",
      priority: 3,
      eraTags: ["adolescence", "early_adulthood", "midlife", "later_life"],
      conversational: "What personal challenges or hardships have you faced? How did you get through them?",
    },
    "hobbies.travel": {
      writeMode: "suggest_only",
      priority: 4,
      eraTags: ["early_adulthood", "midlife", "later_life"],
      conversational: "Have you traveled to places that left a strong impression on you?",
    },

    /* ── Additional Notes ──────────────────────────────────── */
    "additionalNotes.unfinishedDreams": {
      writeMode: "suggest_only",
      priority: 5,
      eraTags: ["later_life"],
      conversational: "Is there a dream or goal you still carry with you — something unfinished?",
    },
    "additionalNotes.messagesForFutureGenerations": {
      writeMode: "suggest_only",
      priority: 5,
      eraTags: ["later_life"],
      conversational: "Is there a message you'd like to leave for the people who come after you?",
    }
  };

  /* ───────────────────────────────────────────────────────────
     REPEATABLE SECTION TEMPLATES — Parents, Grandparents, Siblings
     These are candidate_only: interview answers create candidate
     entries in state.bioBuilder.candidates.people (and .relationships).
     Conversational questions are templates with {ordinal} placeholders.
  ─────────────────────────────────────────────────────────── */

  var REPEATABLE_TEMPLATES = {
    parents: {
      writeMode: "candidate_only",
      candidateType: "people",
      priority: 2,
      eraTags: ["early_childhood", "school_years"],
      fields: {
        relation:          { conversational: "Was {ref} your mother, father, stepparent, or another role?" },
        firstName:         { conversational: "What was {ref}'s first name?" },
        middleName:        { conversational: "Did {ref} have a middle name?" },
        lastName:          { conversational: "What was {ref}'s last name?" },
        maidenName:        { conversational: "Did {ref} have a maiden name or birth name?" },
        birthDate:         { conversational: "Do you know when {ref} was born?", inputHelper: "normalizeDob" },
        birthPlace:        { conversational: "Where was {ref} born?", inputHelper: "normalizePlace" },
        occupation:        { conversational: "What did {ref} do for work?" },
        notableLifeEvents: { conversational: "Were there notable events or stories from {ref}'s life that stand out?" },
        notes:             { conversational: null }
      },
      entryPrompt: "Tell me about your {ordinal} parent — your mother or father. What was their name?",
      naturalTransition: "Did you want to tell me about another parent or parental figure?"
    },

    grandparents: {
      writeMode: "candidate_only",
      candidateType: "people",
      priority: 3,
      eraTags: ["early_childhood"],
      fields: {
        firstName:          { conversational: "What was your {ordinal} grandparent's first name?" },
        lastName:           { conversational: "What was their last name?" },
        ancestry:           { conversational: "Do you know anything about their ancestry or where their family came from?" },
        culturalBackground: { conversational: "Was there a cultural background — traditions, language, food — that came from that side of the family?" },
        memorableStories:   { conversational: "Are there any memorable stories about this grandparent?" }
      },
      entryPrompt: "Let's talk about your grandparents. Can you tell me about one of them?",
      naturalTransition: "Would you like to tell me about another grandparent?"
    },

    siblings: {
      writeMode: "candidate_only",
      candidateType: "people",
      priority: 2,
      eraTags: ["early_childhood", "school_years", "adolescence"],
      fields: {
        relation:              { conversational: "Was this a brother, sister, or another kind of sibling?" },
        firstName:             { conversational: "What was their first name?" },
        middleName:            { conversational: "Did they have a middle name?" },
        lastName:              { conversational: "What was their last name?" },
        birthOrder:            { conversational: "Were they older, younger, or the same age as you?" },
        uniqueCharacteristics: { conversational: "What was unique about them — personality, appearance, or temperament?" },
        sharedExperiences:     { conversational: "What experiences did you share growing up?" },
        memories:              { conversational: "Is there a particular memory with this sibling that comes to mind?" },
        notes:                 { conversational: null }
      },
      entryPrompt: "Did you have brothers or sisters? Tell me about one of them.",
      naturalTransition: "Would you like to tell me about another sibling?"
    }
  };

  /* ───────────────────────────────────────────────────────────
     PROJECTION PATH HELPERS
  ─────────────────────────────────────────────────────────── */

  /**
   * Build the projection path for a repeatable entry field.
   * E.g., buildRepeatablePath("parents", 0, "firstName") → "parents[0].firstName"
   */
  function buildRepeatablePath(section, index, field) {
    return section + "[" + index + "]." + field;
  }

  /**
   * Parse a projection path into { section, index (null for non-repeatable), field }.
   * "personal.fullName"       → { section: "personal", index: null, field: "fullName" }
   * "parents[0].firstName"    → { section: "parents",  index: 0,    field: "firstName" }
   */
  function parsePath(path) {
    var m = path.match(/^(\w+)\[(\d+)\]\.(\w+)$/);
    if (m) return { section: m[1], index: parseInt(m[2], 10), field: m[3] };
    var parts = path.split(".");
    if (parts.length === 2) return { section: parts[0], index: null, field: parts[1] };
    return null;
  }

  /**
   * Get the write mode for a given projection path.
   */
  function getWriteMode(path) {
    // Direct lookup for non-repeatable fields
    if (FIELD_MAP[path]) return FIELD_MAP[path].writeMode;
    // Parse for repeatable
    var parsed = parsePath(path);
    if (parsed && parsed.index !== null && REPEATABLE_TEMPLATES[parsed.section]) {
      return REPEATABLE_TEMPLATES[parsed.section].writeMode;
    }
    return "suggest_only"; // safe default
  }

  /**
   * Get the field config for a projection path.
   * Returns { writeMode, priority, eraTags, conversational, ... }
   */
  function getFieldConfig(path) {
    if (FIELD_MAP[path]) return FIELD_MAP[path];
    var parsed = parsePath(path);
    if (parsed && parsed.index !== null && REPEATABLE_TEMPLATES[parsed.section]) {
      var tpl = REPEATABLE_TEMPLATES[parsed.section];
      var fieldConf = tpl.fields[parsed.field] || {};
      return {
        writeMode: tpl.writeMode,
        candidateType: tpl.candidateType,
        priority: tpl.priority,
        eraTags: tpl.eraTags,
        conversational: fieldConf.conversational || null,
        inputHelper: fieldConf.inputHelper || null
      };
    }
    return null;
  }

  /* ───────────────────────────────────────────────────────────
     QUESTION SELECTION — Choose next unasked question for era
  ─────────────────────────────────────────────────────────── */

  /**
   * Get unanswered questions relevant to the current era, sorted by priority.
   * Skips fields that are already filled (in projection or BB questionnaire).
   * Returns array of { path, config } objects.
   *
   * @param {string} era - Current life era (e.g. "early_childhood")
   * @param {object} projectionFields - state.interviewProjection.fields
   * @param {object} bbQuestionnaire - state.bioBuilder.questionnaire
   * @param {object} [opts] - { limit: number, includeIdentity: bool }
   */
  function getUnansweredForEra(era, projectionFields, bbQuestionnaire, opts) {
    opts = opts || {};
    var limit = opts.limit || 5;
    var includeIdentity = opts.includeIdentity !== false;
    var results = [];

    // Non-repeatable fields
    Object.keys(FIELD_MAP).forEach(function (path) {
      var config = FIELD_MAP[path];

      // Skip identity fields if already captured via onboarding
      if (!includeIdentity && config.priority === 1) return;

      // Skip auto-derived fields
      if (config.autoDerive) return;

      // Skip if no conversational text (not askable)
      if (!config.conversational) return;

      // Check era relevance (empty eraTags = always relevant)
      if (config.eraTags.length > 0 && era && config.eraTags.indexOf(era) < 0) return;

      // Skip if already answered in projection
      if (projectionFields[path] && projectionFields[path].value) return;

      // Skip if already filled in BB questionnaire
      var parsed = parsePath(path);
      if (parsed && bbQuestionnaire[parsed.section]) {
        var existingVal = bbQuestionnaire[parsed.section][parsed.field];
        if (existingVal && String(existingVal).trim() !== "") return;
      }

      results.push({ path: path, config: config });
    });

    // Sort by priority (lower = more important)
    results.sort(function (a, b) { return a.config.priority - b.config.priority; });

    return results.slice(0, limit);
  }

  /**
   * Get the next repeatable section entry prompt, if the section hasn't been
   * explored yet during this interview.
   */
  function getRepeatablePrompt(section, alreadyAsked) {
    var tpl = REPEATABLE_TEMPLATES[section];
    if (!tpl) return null;
    if (alreadyAsked) return tpl.naturalTransition || null;
    return tpl.entryPrompt || null;
  }

  /**
   * Get all repeatable field templates for a section.
   */
  function getRepeatableFields(section) {
    var tpl = REPEATABLE_TEMPLATES[section];
    return tpl ? tpl.fields : null;
  }

  /* ───────────────────────────────────────────────────────────
     COMPLETENESS SCORING
  ─────────────────────────────────────────────────────────── */

  /**
   * Calculate completeness of a section based on projection + BB data.
   * Returns { filled, total, pct }
   */
  function sectionCompleteness(sectionId, projectionFields, bbQuestionnaire) {
    var sectionData = bbQuestionnaire[sectionId] || {};
    var filled = 0;
    var total = 0;

    // Non-repeatable sections
    Object.keys(FIELD_MAP).forEach(function (path) {
      var parsed = parsePath(path);
      if (!parsed || parsed.section !== sectionId) return;
      if (FIELD_MAP[path].autoDerive) return;  // skip auto-derived
      total++;
      // Check projection
      if (projectionFields[path] && projectionFields[path].value) { filled++; return; }
      // Check BB
      if (sectionData[parsed.field] && String(sectionData[parsed.field]).trim() !== "") { filled++; }
    });

    // For repeatable sections, count entries
    if (REPEATABLE_TEMPLATES[sectionId]) {
      var entries = Array.isArray(sectionData) ? sectionData : [];
      var tpl = REPEATABLE_TEMPLATES[sectionId];
      var reqFields = Object.keys(tpl.fields).filter(function (f) {
        return tpl.fields[f].conversational !== null;
      });
      entries.forEach(function (entry, idx) {
        reqFields.forEach(function (f) {
          total++;
          var projPath = buildRepeatablePath(sectionId, idx, f);
          if (projectionFields[projPath] && projectionFields[projPath].value) { filled++; return; }
          if (entry[f] && String(entry[f]).trim() !== "") { filled++; }
        });
      });
      // If no entries at all, count as 1 missing
      if (entries.length === 0) { total += 1; }
    }

    return {
      filled: filled,
      total: total,
      pct: total > 0 ? Math.round((filled / total) * 100) : 0
    };
  }

  /* ───────────────────────────────────────────────────────────
     EXPORT
  ─────────────────────────────────────────────────────────── */

  window.LorevoxProjectionMap = {
    FIELD_MAP:              FIELD_MAP,
    REPEATABLE_TEMPLATES:   REPEATABLE_TEMPLATES,

    // Path helpers
    buildRepeatablePath:    buildRepeatablePath,
    parsePath:              parsePath,
    getWriteMode:           getWriteMode,
    getFieldConfig:         getFieldConfig,

    // Question selection
    getUnansweredForEra:    getUnansweredForEra,
    getRepeatablePrompt:    getRepeatablePrompt,
    getRepeatableFields:    getRepeatableFields,

    // Completeness
    sectionCompleteness:    sectionCompleteness
  };

  console.log("[Lorevox] Projection map loaded — " + Object.keys(FIELD_MAP).length + " direct fields, " +
    Object.keys(REPEATABLE_TEMPLATES).length + " repeatable sections.");

})();
