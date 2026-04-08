/* ═══════════════════════════════════════════════════════════════
   bio-builder-qc-pipeline.js — Quick Capture processing pipeline
   Lorevox 9.0 — Phase M

   Owns:
     - Atomic splitting of compound Quick Capture text (M2)
     - Duplicate / overlap comparison against QQ + candidates (M3)
     - Family relationship qualifier detection + preservation (M4)
     - Provenance labeling for review readiness (M5)
     - QC candidate rehydration from persisted quickItems (M1 hook)

   Does NOT own:
     - Quick Capture UI rendering (bio-builder.js)
     - Candidate display / review UI (bio-builder-candidates.js, bio-review.js)
     - QC persistence to localStorage (bio-builder-core.js)

   Exposes: window.LorevoxBioBuilderModules._qcPipeline
   Load order: After bio-builder-core.js, before bio-builder.js
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  var _core = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.core;
  if (!_core) throw new Error("bio-builder-core.js must load before bio-builder-qc-pipeline.js");

  var _bb  = _core._bb;
  var _uid = _core._uid;

  /* ═══════════════════════════════════════════════════════════════
     M4 — RELATIONSHIP QUALIFIER DETECTION
     Detects family relation phrases and preserves both the
     normalized class and the age/type qualifier.
  ═══════════════════════════════════════════════════════════════ */

  var RELATION_PATTERNS = [
    // Pattern: "my/his/her {qualifier} {relation} {name}"
    // Also: "{name} was my/his/her {qualifier} {relation}"
    { regex: /\b(?:my|his|her|their)\s+(older|younger|twin|eldest|youngest|little|big|baby|middle)\s+(brother|sister|half-brother|half-sister|stepbrother|stepsister)\s+(\w[\w\s]*?)(?:[,.\s]|$)/i,
      groups: { qualifier: 1, relation: 2, name: 3 } },
    // Pattern: "{qualifier} {relation} {name}" without possessive
    { regex: /\b(older|younger|twin|eldest|youngest|little|big|baby|middle)\s+(brother|sister|half-brother|half-sister|stepbrother|stepsister)\s+(\w[\w\s]*?)(?:[,.\s]|$)/i,
      groups: { qualifier: 1, relation: 2, name: 3 } },
    // Pattern: "{name} is/was {possessive} {qualifier} {relation}"
    { regex: /(\w[\w\s]*?)\s+(?:is|was)\s+(?:my|his|her|their)\s+(older|younger|twin|eldest|youngest|little|big|baby|middle)\s+(brother|sister|half-brother|half-sister|stepbrother|stepsister)/i,
      groups: { name: 1, qualifier: 2, relation: 3 } }
  ];

  var RELATION_CLASS_MAP = {
    "brother": "Brother", "sister": "Sister",
    "half-brother": "Half-brother", "half-sister": "Half-sister",
    "stepbrother": "Stepbrother", "stepsister": "Stepsister"
  };

  /**
   * Detect family relation qualifiers in text.
   * Returns array of { name, relationType, relationQualifier, matchSpan } or empty array.
   */
  function detectRelationQualifiers(text) {
    if (!text) return [];
    var results = [];
    var seenNames = {};

    for (var i = 0; i < RELATION_PATTERNS.length; i++) {
      var pattern = RELATION_PATTERNS[i];
      var m = text.match(pattern.regex);
      if (m) {
        var name = (m[pattern.groups.name] || "").trim();
        var qualifier = (m[pattern.groups.qualifier] || "").trim().toLowerCase();
        var relation = (m[pattern.groups.relation] || "").trim().toLowerCase();
        var relationType = RELATION_CLASS_MAP[relation] || relation;

        if (name && !seenNames[name.toLowerCase()]) {
          seenNames[name.toLowerCase()] = true;
          results.push({
            name: name,
            relationType: relationType,
            relationQualifier: qualifier,
            matchSpan: m[0].trim()
          });
        }
      }
    }
    return results;
  }

  /* ═══════════════════════════════════════════════════════════════
     M2 — ATOMIC SPLIT PIPELINE
     First-pass rule-based splitter for compound Quick Capture text.
     Splits on sentence boundaries and strong conjunctions.
     Each atom keeps the original full text as provenance.
  ═══════════════════════════════════════════════════════════════ */

  /**
   * Split compound text into atomic claim units.
   * Returns array of { text: string, spanStart: number, spanEnd: number }
   */
  function atomicSplit(text) {
    if (!text || typeof text !== "string") return [];
    text = text.trim();
    if (!text) return [];

    // Step 1: Split on sentence boundaries (period/exclamation/question + space + capital)
    var sentences = [];
    var current = "";
    var chars = text.split("");

    for (var i = 0; i < chars.length; i++) {
      current += chars[i];
      // Check for sentence-ending punctuation followed by space + uppercase or end
      if ((chars[i] === "." || chars[i] === "!" || chars[i] === "?") &&
          (i === chars.length - 1 || (chars[i + 1] === " " && i + 2 < chars.length && chars[i + 2] === chars[i + 2].toUpperCase() && /[A-Z]/.test(chars[i + 2])))) {
        sentences.push(current.trim());
        current = "";
      }
    }
    if (current.trim()) sentences.push(current.trim());

    // Step 2: For each sentence, try to split on strong conjunctions
    var atoms = [];
    sentences.forEach(function (sentence) {
      var subAtoms = splitOnConjunctions(sentence);
      subAtoms.forEach(function (a) {
        var trimmed = a.trim();
        // Only keep atoms that have meaningful content (> 3 words)
        if (trimmed && trimmed.split(/\s+/).length >= 3) {
          atoms.push(trimmed);
        } else if (trimmed && atoms.length > 0) {
          // Too short — append to previous atom
          atoms[atoms.length - 1] += ", " + trimmed;
        } else if (trimmed) {
          atoms.push(trimmed);
        }
      });
    });

    // If we only got 1 atom and it's the original text, return it as-is
    if (atoms.length === 0) atoms.push(text);

    return atoms.map(function (a, idx) {
      return { text: a, index: idx };
    });
  }

  /**
   * Split a single sentence on strong conjunctions where both halves
   * are claimable independent clauses.
   */
  function splitOnConjunctions(sentence) {
    // Pattern: ", and " between two independent clauses (each with a verb-like word)
    var conjPatterns = [
      /,\s+and\s+(?:his|her|their|the|she|he|they|[A-Z])/,
      /,\s+and\s+then\s+/,
      /;\s+/,
      /,\s+while\s+/,
      /,\s+but\s+/
    ];

    for (var i = 0; i < conjPatterns.length; i++) {
      var parts = sentence.split(conjPatterns[i]);
      if (parts.length >= 2) {
        // Verify both halves are meaningful (>= 3 words each)
        var allLong = parts.every(function (p) { return p.trim().split(/\s+/).length >= 3; });
        if (allLong) {
          // Capitalize each part properly
          return parts.map(function (p) {
            p = p.trim();
            // Remove trailing comma if present
            if (p.endsWith(",")) p = p.slice(0, -1).trim();
            // Capitalize first letter
            return p.charAt(0).toUpperCase() + p.slice(1);
          });
        }
      }
    }
    return [sentence];
  }

  /* ═══════════════════════════════════════════════════════════════
     M3 — DUPLICATE / OVERLAP COMPARE
     Compares new candidate text against existing questionnaire data,
     existing candidates, and promoted facts.
     Returns an overlap state object.
  ═══════════════════════════════════════════════════════════════ */

  var OVERLAP_STATES = {
    NONE:             "none",
    OVERLAPS_QQ:      "overlaps_questionnaire",
    ADDS_NEW_DETAIL:  "adds_new_detail",
    POSSIBLE_DUP:     "possible_duplicate",
    POSSIBLE_CONFLICT: "possible_conflict"
  };

  /**
   * Compare a candidate text against existing data.
   * Returns { state: string, details: string, matchedField?: string }
   */
  function compareOverlap(text, bb) {
    if (!text || !bb) return { state: OVERLAP_STATES.NONE, details: "" };

    var lowerText = text.toLowerCase();
    var result = { state: OVERLAP_STATES.NONE, details: "" };

    // 1. Compare against questionnaire fields
    if (bb.questionnaire) {
      var qqOverlap = _compareAgainstQuestionnaire(lowerText, bb.questionnaire);
      if (qqOverlap.matched) {
        // Determine if it adds new info beyond the QQ match
        if (qqOverlap.fullOverlap) {
          result = { state: OVERLAP_STATES.POSSIBLE_DUP, details: "Matches " + qqOverlap.field, matchedField: qqOverlap.field };
        } else {
          result = { state: OVERLAP_STATES.ADDS_NEW_DETAIL, details: "Overlaps " + qqOverlap.field + " but adds new information", matchedField: qqOverlap.field };
        }
        return result;
      }
    }

    // 2. Compare against existing candidates
    if (bb.candidates) {
      var candOverlap = _compareAgainstCandidates(lowerText, bb.candidates);
      if (candOverlap.matched) {
        return { state: OVERLAP_STATES.POSSIBLE_DUP, details: "Similar to existing candidate: " + candOverlap.matchText.slice(0, 60) };
      }
    }

    return result;
  }

  function _compareAgainstQuestionnaire(lowerText, qq) {
    // Check personal section — skip name fields (narrator's name appears
    // in almost every QC entry, so matching on it is noise, not signal).
    // Focus on substantive biographical data fields.
    var personal = qq.personal || {};
    var fieldsToCheck = [
      { key: "dateOfBirth", label: "date of birth", minLen: 4 },
      { key: "placeOfBirth", label: "place of birth", minLen: 4 },
      { key: "occupation", label: "occupation", minLen: 4 }
    ];

    for (var i = 0; i < fieldsToCheck.length; i++) {
      var val = (personal[fieldsToCheck[i].key] || "").toLowerCase();
      if (val && val.length >= fieldsToCheck[i].minLen && lowerText.indexOf(val) >= 0) {
        // Check if the input is mostly just the matched value (full overlap)
        var fullOverlap = lowerText.replace(val, "").trim().split(/\s+/).filter(function (w) {
          return w.length > 2 && ["was", "born", "in", "the", "her", "his", "my", "is", "at", "on", "and", "who", "she", "he"].indexOf(w) < 0;
        }).length <= 2;
        return { matched: true, field: "questionnaire: " + fieldsToCheck[i].label, fullOverlap: fullOverlap };
      }
    }

    // Check family sections: parents, siblings, etc.
    var familySections = ["parents", "grandparents", "siblings", "children"];
    for (var s = 0; s < familySections.length; s++) {
      var section = qq[familySections[s]];
      if (!Array.isArray(section)) continue;
      for (var j = 0; j < section.length; j++) {
        var entry = section[j];
        var entryName = (entry.fullName || entry.name || "").toLowerCase();
        if (entryName && entryName.length >= 3 && lowerText.indexOf(entryName) >= 0) {
          // Check if there's new info beyond just the name
          var nameRemoved = lowerText.replace(entryName, "").trim();
          var meaningfulWords = nameRemoved.split(/\s+/).filter(function (w) {
            return w.length > 2 && ["was", "born", "in", "the", "her", "his", "my", "is", "at", "on", "and", "who"].indexOf(w) < 0;
          });
          return {
            matched: true,
            field: "questionnaire: " + familySections[s] + " (" + (entry.fullName || entry.name) + ")",
            fullOverlap: meaningfulWords.length <= 1
          };
        }
      }
    }

    return { matched: false };
  }

  function _compareAgainstCandidates(lowerText, candidates) {
    var allCands = []
      .concat(candidates.people || [])
      .concat(candidates.memories || [])
      .concat(candidates.relationships || []);

    for (var i = 0; i < allCands.length; i++) {
      var c = allCands[i];
      var cText = ((c.data && c.data.text) || c.value || c.text || "").toLowerCase();
      if (!cText || cText.length < 5) continue;

      // Jaccard-like word overlap check
      var inputWords = lowerText.split(/\s+/).filter(function (w) { return w.length > 2; });
      var candWords = cText.split(/\s+/).filter(function (w) { return w.length > 2; });
      if (inputWords.length === 0 || candWords.length === 0) continue;

      var overlap = 0;
      var inputSet = {};
      inputWords.forEach(function (w) { inputSet[w] = true; });
      candWords.forEach(function (w) { if (inputSet[w]) overlap++; });

      var similarity = overlap / Math.max(inputWords.length, candWords.length);
      if (similarity > 0.6) {
        return { matched: true, matchText: cText };
      }
    }
    return { matched: false };
  }

  /* ═══════════════════════════════════════════════════════════════
     M5 — PROVENANCE LABELS
     Creates properly labeled candidate objects with full provenance.
  ═══════════════════════════════════════════════════════════════ */

  function _overlapLabel(overlapState) {
    switch (overlapState) {
      case OVERLAP_STATES.POSSIBLE_DUP:     return "Possible Duplicate";
      case OVERLAP_STATES.ADDS_NEW_DETAIL:  return "Adds New Detail";
      case OVERLAP_STATES.POSSIBLE_CONFLICT: return "Possible Conflict";
      case OVERLAP_STATES.OVERLAPS_QQ:      return "Overlaps Questionnaire";
      default: return "";
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     MAIN PIPELINE — processQuickCapture()
     Entry point called from _addFact() / _addNote() in bio-builder.js.
     Runs: atomic split → relation detection → overlap compare → create candidates.
     Returns array of created candidate objects.
  ═══════════════════════════════════════════════════════════════ */

  function processQuickCapture(bb, text, sourceType) {
    if (!bb || !text) return [];
    if (!bb.candidates) return [];
    if (!bb.candidates.memories) bb.candidates.memories = [];
    if (!bb.candidates.people) bb.candidates.people = [];
    if (!bb.candidates.relationships) bb.candidates.relationships = [];

    var originalText = text;
    var created = [];

    // M2: Atomic split
    var atoms = atomicSplit(text);

    atoms.forEach(function (atom) {
      var atomText = atom.text;

      // M4: Detect relationship qualifiers
      var relQualifiers = detectRelationQualifiers(atomText);

      // M3: Overlap compare
      var overlap = compareOverlap(atomText, bb);

      // Duplicate check — skip if exact text already exists as candidate
      var isDupe = bb.candidates.memories.some(function (c) {
        return c.data && c.data.text === atomText;
      });
      if (isDupe) {
        console.log("[qc-pipeline] Duplicate atom skipped: " + atomText.substring(0, 40));
        return;
      }

      // Create the memory candidate (the primary claim)
      var label = sourceType === "fact" ? "Quick Fact" : "Quick Note";
      var overlapLbl = _overlapLabel(overlap.state);

      var candidate = {
        id:       _uid(),
        type:     "memory",
        source:   "quickCapture:" + sourceType,
        sourceId: null,
        value:    atomText,
        snippet:  originalText !== atomText ? originalText : "",
        data: {
          label:          label,
          text:           atomText,
          originalText:   originalText,
          overlapState:   overlap.state,
          overlapDetails: overlap.details,
          overlapNote:    overlap.details,
          displayTag:     overlapLbl || label
        },
        status: "pending"
      };

      bb.candidates.memories.push(candidate);
      created.push(candidate);

      // M4: Create relationship candidates for detected qualifier phrases
      relQualifiers.forEach(function (rq) {
        // Check if this relationship candidate already exists
        var relDupe = bb.candidates.relationships.some(function (r) {
          return r.data && r.data.name === rq.name && r.data.relationType === rq.relationType;
        });
        if (relDupe) return;

        var relCandidate = {
          id:       _uid(),
          type:     "relationship",
          source:   "quickCapture:" + sourceType,
          value:    rq.name + " (" + rq.relationQualifier + " " + rq.relationType.toLowerCase() + ")",
          snippet:  atomText,
          data: {
            name:               rq.name,
            relationType:       rq.relationType,
            relationQualifier:  rq.relationQualifier,
            label:              "Quick Fact — Relationship",
            text:               atomText,
            originalText:       originalText,
            matchSpan:          rq.matchSpan,
            displayTag:         "Relationship"
          },
          status: "pending"
        };

        bb.candidates.relationships.push(relCandidate);
        created.push(relCandidate);
      });
    });

    if (created.length > 0) {
      console.log("[qc-pipeline] Created " + created.length + " candidate(s) from " + sourceType +
        (atoms.length > 1 ? " (" + atoms.length + " atoms)" : ""));
    }

    return created;
  }

  /* ═══════════════════════════════════════════════════════════════
     M1 HOOK — rehydrateQCCandidates()
     Called from _rehydrateCandidates() in bio-builder-core.js after
     narrator switch restores quickItems. Re-creates candidates
     from the persisted QC items.
  ═══════════════════════════════════════════════════════════════ */

  function rehydrateQCCandidates(bb) {
    if (!bb || !bb.quickItems || bb.quickItems.length === 0) return;

    if (!bb.candidates) {
      bb.candidates = {
        people: [], relationships: [], events: [],
        memories: [], places: [], documents: []
      };
    }

    var before = bb.candidates.memories.length + bb.candidates.relationships.length;

    bb.quickItems.forEach(function (item) {
      if (!item.text) return;
      processQuickCapture(bb, item.text, item.type || "fact");
    });

    var after = bb.candidates.memories.length + bb.candidates.relationships.length;
    if (after > before) {
      console.log("[qc-pipeline] ✅ Rehydrated " + (after - before) + " QC candidates");
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     MODULE EXPORT
  ═══════════════════════════════════════════════════════════════ */

  window.LorevoxBioBuilderModules._qcPipeline = {
    // M2: Atomic split
    atomicSplit:              atomicSplit,

    // M3: Overlap compare
    compareOverlap:           compareOverlap,
    OVERLAP_STATES:           OVERLAP_STATES,

    // M4: Relationship qualifiers
    detectRelationQualifiers: detectRelationQualifiers,

    // M5: Labels
    _overlapLabel:            _overlapLabel,

    // Main pipeline
    processQuickCapture:      processQuickCapture,

    // M1 hook: rehydrate from persisted QC items
    rehydrateQCCandidates:    rehydrateQCCandidates
  };

})();
