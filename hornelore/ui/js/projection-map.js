/* ═══════════════════════════════════════════════════════════════
   projection-map.js — Lorevox 9.0 Interview Projection Map

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

  /* ── Memoir Question Strategy metadata ─────────────────────
     memoirClass:  "background" — known, skip if preloaded
                   "hook"       — known fact that anchors deeper questions
                   "thin_zone"  — structural but likely lacking narrative depth
     questionKind: "fact" | "sensory" | "meaning" | "reflection" |
                   "relationship" | "turning_point"
     memoirWeight: 1–10 — higher = better memoir question
     hookPrompt:   richer follow-up when preload already has the base fact
     skipIfPreloaded:      skip this question entirely if preload covers it
     confirmOnlyIfMissing: only ask if truly blank; never re-ask confirmed data
  ───────────────────────────────────────────────────────────── */

  var FIELD_MAP = {

    /* ── Personal Information ──────────────────────────────── */
    "personal.fullName": {
      writeMode: "prefill_if_blank",
      protectedIdentity: true,
      priority: 1,
      eraTags: [],
      conversational: "What is your full name — first, middle, and last?",
      followUp: "Is there a name you prefer to go by?",
      memoirClass: "background", questionKind: "fact", memoirWeight: 1,
      skipIfPreloaded: true, confirmOnlyIfMissing: true
    },
    "personal.preferredName": {
      writeMode: "prefill_if_blank",
      protectedIdentity: true,
      priority: 1,
      eraTags: [],
      conversational: "What name do you prefer to go by?",
      memoirClass: "background", questionKind: "fact", memoirWeight: 1,
      skipIfPreloaded: true, confirmOnlyIfMissing: true
    },
    "personal.dateOfBirth": {
      writeMode: "prefill_if_blank",
      protectedIdentity: true,
      priority: 1,
      eraTags: [],
      conversational: "When were you born?",
      inputHelper: "normalizeDob",
      memoirClass: "background", questionKind: "fact", memoirWeight: 1,
      skipIfPreloaded: true, confirmOnlyIfMissing: true
    },
    "personal.timeOfBirth": {
      writeMode: "suggest_only",
      priority: 4,
      eraTags: ["early_childhood"],
      conversational: "Do you happen to know what time of day you were born?",
      memoirClass: "background", questionKind: "fact", memoirWeight: 2,
      skipIfPreloaded: true
    },
    "personal.placeOfBirth": {
      writeMode: "prefill_if_blank",
      protectedIdentity: true,
      priority: 1,
      eraTags: ["early_childhood"],
      conversational: "Where were you born — what city and state, or country?",
      inputHelper: "normalizePlace",
      memoirClass: "background", questionKind: "fact", memoirWeight: 1,
      skipIfPreloaded: true, confirmOnlyIfMissing: true,
      hookPrompt: "You were born in {value}. What do you remember hearing about that place from your family — the feel of the town, or why your parents were there?"
    },
    "personal.birthOrder": {
      writeMode: "prefill_if_blank",
      protectedIdentity: true,
      priority: 2,
      eraTags: ["early_childhood"],
      conversational: "Were you the first child, or did you have older siblings?",
      memoirClass: "background", questionKind: "fact", memoirWeight: 2,
      skipIfPreloaded: true, confirmOnlyIfMissing: true,
      hookPrompt: "You were the {value}. What was that like — did your position in the family shape how you saw yourself?"
    },
    "personal.zodiacSign": {
      writeMode: "prefill_if_blank",
      priority: 5,
      eraTags: [],
      conversational: null,
      autoDerive: "zodiacFromDob",
      memoirClass: "background", questionKind: "fact", memoirWeight: 0,
      skipIfPreloaded: true
    },

    /* ── Early Memories ────────────────────────────────────── */
    "earlyMemories.firstMemory": {
      writeMode: "suggest_only",
      priority: 3,
      eraTags: ["early_childhood"],
      conversational: "What is the earliest memory you can recall? Even a small fragment — a place, a sound, a feeling?",
      memoirClass: "hook", questionKind: "sensory", memoirWeight: 9,
      hookPrompt: "You mentioned your earliest memory: \"{value}\". Can you close your eyes and go back there for a moment — what do you see, smell, or hear?"
    },
    "earlyMemories.favoriteToy": {
      writeMode: "suggest_only",
      priority: 4,
      eraTags: ["early_childhood"],
      conversational: "Was there a favorite toy, blanket, or object you were attached to as a young child?",
      memoirClass: "hook", questionKind: "sensory", memoirWeight: 6,
      hookPrompt: "You mentioned {value}. What made it special — can you picture it? Where would you keep it?"
    },
    "earlyMemories.significantEvent": {
      writeMode: "suggest_only",
      priority: 3,
      eraTags: ["early_childhood"],
      conversational: "Was there a significant event from your early childhood — something the family talked about, or that you remember feeling strongly?",
      memoirClass: "hook", questionKind: "turning_point", memoirWeight: 8,
      hookPrompt: "You mentioned: \"{value}\". What do you think that event meant for you — did it change something, or does it just stay with you?"
    },

    /* ── Education & Career ────────────────────────────────── */
    "education.schooling": {
      writeMode: "suggest_only",
      priority: 3,
      eraTags: ["school_years"],
      conversational: "Tell me about your schooling — where did you go to school, and what was it like?",
      memoirClass: "hook", questionKind: "sensory", memoirWeight: 7,
      hookPrompt: "You went to school at {value}. What do you remember most about it — a teacher, a friend, the walk to school, the feeling of the place?"
    },
    "education.higherEducation": {
      writeMode: "suggest_only",
      priority: 3,
      eraTags: ["school_years", "early_adulthood"],
      conversational: "Did you go on to college or any other education after high school? What was that experience like?",
      memoirClass: "hook", questionKind: "turning_point", memoirWeight: 7,
      hookPrompt: "You studied at {value}. Was there a moment during that time that opened a door for you — or closed one?"
    },
    "education.earlyCareer": {
      writeMode: "suggest_only",
      priority: 3,
      eraTags: ["early_adulthood"],
      conversational: "What was your first real job or the beginning of your career?",
      memoirClass: "hook", questionKind: "turning_point", memoirWeight: 8,
      hookPrompt: "Your early career was in {value}. What was that first day like — or the moment you realized this was going to be your path?"
    },
    "education.careerProgression": {
      writeMode: "suggest_only",
      priority: 3,
      eraTags: ["early_adulthood", "midlife"],
      conversational: "How did your career develop over the years? Were there turning points or big changes?",
      memoirClass: "hook", questionKind: "turning_point", memoirWeight: 8,
      hookPrompt: "Your career involved {value}. Was there a moment when things shifted — a decision, a risk, a change you didn't expect?"
    },
    "education.communityInvolvement": {
      writeMode: "suggest_only",
      priority: 4,
      eraTags: ["midlife", "later_life"],
      conversational: "Were you involved in your community — church, volunteering, clubs, or organizations?",
      memoirClass: "thin_zone", questionKind: "meaning", memoirWeight: 5,
      hookPrompt: "You were involved in {value}. What drew you to that — and what did it give you?"
    },
    "education.mentorship": {
      writeMode: "suggest_only",
      priority: 4,
      eraTags: ["midlife", "later_life"],
      conversational: "Was there someone who mentored you, or someone you mentored?",
      memoirClass: "hook", questionKind: "relationship", memoirWeight: 7,
      hookPrompt: "You mentioned a mentor: {value}. What did they teach you that you still carry — not just skills, but something about how to live?"
    },

    /* ── Later Years ───────────────────────────────────────── */
    "laterYears.retirement": {
      writeMode: "suggest_only",
      priority: 3,
      eraTags: ["later_life"],
      conversational: "What was retirement like for you? Was it a welcome change or a difficult transition?",
      memoirClass: "hook", questionKind: "turning_point", memoirWeight: 9,
      hookPrompt: "You retired from {value}. What was the first morning like when you realized you didn't have to go? What did you feel?"
    },
    "laterYears.lifeLessons": {
      writeMode: "suggest_only",
      priority: 3,
      eraTags: ["later_life"],
      conversational: "Looking back, what are the most important lessons life has taught you?",
      memoirClass: "hook", questionKind: "reflection", memoirWeight: 9,
      hookPrompt: "You've said: \"{value}\". Was there a single moment when that lesson became real — not just words, but felt?"
    },
    "laterYears.adviceForFutureGenerations": {
      writeMode: "suggest_only",
      priority: 3,
      eraTags: ["later_life"],
      conversational: "If you could pass along one piece of advice to future generations, what would it be?",
      memoirClass: "hook", questionKind: "reflection", memoirWeight: 8,
      hookPrompt: "You've shared: \"{value}\". What in your life taught you that — was there a moment that made it clear?"
    },

    /* ── Hobbies & Interests ───────────────────────────────── */
    "hobbies.hobbies": {
      writeMode: "suggest_only",
      priority: 4,
      eraTags: ["school_years", "adolescence", "early_adulthood", "midlife", "later_life"],
      conversational: "What hobbies or interests have been important to you over the years?",
      memoirClass: "thin_zone", questionKind: "sensory", memoirWeight: 5,
      hookPrompt: "You enjoy {value}. When did that start — and what does it feel like when you're doing it?"
    },
    "hobbies.worldEvents": {
      writeMode: "suggest_only",
      priority: 4,
      eraTags: ["school_years", "adolescence", "early_adulthood", "midlife"],
      conversational: "Were there world events — a war, a political moment, a cultural shift — that shaped your life in some way?",
      memoirClass: "hook", questionKind: "meaning", memoirWeight: 7,
      hookPrompt: "You mentioned {value}. Where were you when that happened — and how did it change the way you saw things?"
    },
    "hobbies.personalChallenges": {
      writeMode: "suggest_only",
      priority: 3,
      eraTags: ["adolescence", "early_adulthood", "midlife", "later_life"],
      conversational: "What personal challenges or hardships have you faced? How did you get through them?",
      memoirClass: "hook", questionKind: "turning_point", memoirWeight: 9,
      hookPrompt: "You've faced: {value}. What got you through — was there a moment when you knew you'd make it?"
    },
    "hobbies.travel": {
      writeMode: "suggest_only",
      priority: 4,
      eraTags: ["early_adulthood", "midlife", "later_life"],
      conversational: "Have you traveled to places that left a strong impression on you?",
      memoirClass: "hook", questionKind: "sensory", memoirWeight: 6,
      hookPrompt: "You traveled to {value}. What do you still see when you think of that place — a view, a meal, a feeling?"
    },

    /* ── Additional Notes ──────────────────────────────────── */
    "additionalNotes.unfinishedDreams": {
      writeMode: "suggest_only",
      priority: 5,
      eraTags: ["later_life"],
      conversational: "Is there a dream or goal you still carry with you — something unfinished?",
      memoirClass: "hook", questionKind: "reflection", memoirWeight: 8,
      hookPrompt: "You mentioned: \"{value}\". What would it mean to you if that could still happen?"
    },
    "additionalNotes.messagesForFutureGenerations": {
      writeMode: "suggest_only",
      priority: 5,
      eraTags: ["later_life"],
      conversational: "Is there a message you'd like to leave for the people who come after you?",
      memoirClass: "hook", questionKind: "reflection", memoirWeight: 8,
      hookPrompt: "You've shared: \"{value}\". Who do you most hope hears that — and why them?"
    }
  };

  /* ───────────────────────────────────────────────────────────
     REPEATABLE SECTION TEMPLATES — Parents, Grandparents, Siblings

     Generic Lorevox behavior:
     - interview-derived answers create candidates for review

     Hornelore behavior:
     - projection-sync.js applies a source-aware trust override
     - trusted sources (preload, human_edit, profile_hydrate)
       may write these sections directly into bb.questionnaire
     - interview / backend_extract still route to candidates

     Conversational questions are templates with {ordinal} placeholders.
  ─────────────────────────────────────────────────────────── */

  var REPEATABLE_TEMPLATES = {
    parents: {
      writeMode: "candidate_only",
      candidateType: "people",
      priority: 2,
      eraTags: ["early_childhood", "school_years"],
      fields: {
        relation:          { conversational: "Was {ref} your mother, father, stepparent, or another role?", memoirClass: "background", memoirWeight: 1, skipIfPreloaded: true },
        firstName:         { conversational: "What was {ref}'s first name?", memoirClass: "background", memoirWeight: 1, skipIfPreloaded: true },
        middleName:        { conversational: "Did {ref} have a middle name?", memoirClass: "background", memoirWeight: 1, skipIfPreloaded: true },
        lastName:          { conversational: "What was {ref}'s last name?", memoirClass: "background", memoirWeight: 1, skipIfPreloaded: true },
        maidenName:        { conversational: "Did {ref} have a maiden name or birth name?", memoirClass: "background", memoirWeight: 2, skipIfPreloaded: true },
        birthDate:         { conversational: "Do you know when {ref} was born?", inputHelper: "normalizeDob", memoirClass: "background", memoirWeight: 1, skipIfPreloaded: true },
        birthPlace:        { conversational: "Where was {ref} born?", inputHelper: "normalizePlace", memoirClass: "background", memoirWeight: 2, skipIfPreloaded: true },
        occupation:        { conversational: "What did {ref} do for work?", memoirClass: "hook", questionKind: "relationship", memoirWeight: 6, hookPrompt: "Your {ref} worked as {value}. What do you remember about their work — the hours, the tools, how they carried it?" },
        notableLifeEvents: { conversational: "Were there notable events or stories from {ref}'s life that stand out?", memoirClass: "hook", questionKind: "turning_point", memoirWeight: 8, hookPrompt: "You mentioned that {ref} experienced: \"{value}\". How did that affect your family — and you?" },
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
        firstName:          { conversational: "What was your {ordinal} grandparent's first name?", memoirClass: "background", memoirWeight: 1, skipIfPreloaded: true },
        lastName:           { conversational: "What was their last name?", memoirClass: "background", memoirWeight: 1, skipIfPreloaded: true },
        ancestry:           { conversational: "Do you know anything about their ancestry or where their family came from?", memoirClass: "hook", questionKind: "meaning", memoirWeight: 6, hookPrompt: "Your family ancestry includes {value}. Were there traditions, stories, or a sense of where you came from that shaped your identity?" },
        culturalBackground: { conversational: "Was there a cultural background — traditions, language, food — that came from that side of the family?", memoirClass: "hook", questionKind: "sensory", memoirWeight: 7, hookPrompt: "You mentioned a cultural background of {value}. What do you remember most vividly — a holiday, a dish, a phrase that still stays with you?" },
        memorableStories:   { conversational: "Are there any memorable stories about this grandparent?", memoirClass: "hook", questionKind: "relationship", memoirWeight: 8, hookPrompt: "You shared a story about your grandparent: \"{value}\". What made that story stick — was it told often, or is it yours alone?" }
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
        relation:              { conversational: "Was this a brother, sister, or another kind of sibling?", memoirClass: "background", memoirWeight: 1, skipIfPreloaded: true },
        firstName:             { conversational: "What was their first name?", memoirClass: "background", memoirWeight: 1, skipIfPreloaded: true },
        middleName:            { conversational: "Did they have a middle name?", memoirClass: "background", memoirWeight: 1, skipIfPreloaded: true },
        lastName:              { conversational: "What was their last name?", memoirClass: "background", memoirWeight: 1, skipIfPreloaded: true },
        birthOrder:            { conversational: "Were they older, younger, or the same age as you?", memoirClass: "background", memoirWeight: 2, skipIfPreloaded: true },
        uniqueCharacteristics: { conversational: "What was unique about them — personality, appearance, or temperament?", memoirClass: "hook", questionKind: "relationship", memoirWeight: 7, hookPrompt: "You described your sibling as: \"{value}\". What made you see them that way — is there a moment that captures who they were?" },
        sharedExperiences:     { conversational: "What experiences did you share growing up?", memoirClass: "hook", questionKind: "sensory", memoirWeight: 8, hookPrompt: "You shared experiences: \"{value}\". Which one comes back most vividly — what do you still feel when you think of it?" },
        memories:              { conversational: "Is there a particular memory with this sibling that comes to mind?", memoirClass: "hook", questionKind: "sensory", memoirWeight: 9, hookPrompt: "You recalled: \"{value}\". Take me there — where were you, what time of year, what was the feeling?" },
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

  /**
   * Phase G: Check if a field path is a protected identity field.
   * Protected fields cannot be overwritten by chat extraction.
   */
  function isProtectedIdentity(path) {
    var conf = FIELD_MAP[path];
    return !!(conf && conf.protectedIdentity);
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
    sectionCompleteness:    sectionCompleteness,

    // Phase G: Protected identity
    isProtectedIdentity:    isProtectedIdentity
  };

  console.log("[Lorevox] Projection map loaded — " + Object.keys(FIELD_MAP).length + " direct fields, " +
    Object.keys(REPEATABLE_TEMPLATES).length + " repeatable sections.");

})();
