/* ═══════════════════════════════════════════════════════════════
   narrator-preload.js — Lorevox 9.0 Narrator Preload Utility

   Loads a narrator template JSON file and populates:
   1. API person record (display_name, date_of_birth, place_of_birth)
   2. Profile basics + kinship + pets (state.profile)
   3. Bio Builder questionnaire (localStorage lorevox_qq_draft_<pid>)

   Usage:
     lv80PreloadNarrator(templateObj)     — creates person + loads data
     lv80PreloadIntoExisting(pid, tpl)    — loads data into existing person

   Template format: see narrator-template.json
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ── One-time migration: bb_qq_<pid> → lorevox_qq_draft_<pid> ─
     Runs once on load.  Finds any legacy keys, migrates them to
     the unified key (wrapping in { v, d } if needed), then deletes
     the legacy key so no dual storage paths remain.
  ──────────────────────────────────────────────────────────── */
  (function _migrateLegacyQQ() {
    try {
      var keys = Object.keys(localStorage);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k.indexOf("bb_qq_") !== 0) continue;
        var pid = k.slice(6); // strip "bb_qq_"
        var newKey = "lorevox_qq_draft_" + pid;
        // Only migrate if the new key does not already exist
        if (!localStorage.getItem(newKey)) {
          var raw = localStorage.getItem(k);
          if (raw) {
            var parsed = JSON.parse(raw);
            // Ensure { v, d } wrapper — legacy may or may not have it
            if (parsed && parsed.d && typeof parsed.d === "object") {
              // Already wrapped
              localStorage.setItem(newKey, raw);
            } else if (parsed && typeof parsed === "object") {
              // Raw questionnaire object — wrap it
              localStorage.setItem(newKey, JSON.stringify({ v: 1, d: parsed }));
            }
            console.log("[preload] Migrated legacy bb_qq_" + pid + " → lorevox_qq_draft_" + pid);
          }
        }
        localStorage.removeItem(k);
      }
    } catch (e) {
      // localStorage unavailable — skip silently
    }
  })();

  /* ── Birth-order normalization helper ───────────────────────
     Maps numeric template values ("1", "2", etc.) to the UI
     select labels ("First child", "Second child", etc.).
     Delegates to bio-builder-questionnaire.normalizeBirthOrder
     if available, otherwise uses a local fallback map.

     Phase L: Also handles descriptive free-text strings like
     "2 (middle of three children)" → extracts leading digit → "Second child"
     "sixth of eleven children" → extracts ordinal word → "Sixth child"
  ──────────────────────────────────────────────────────────── */
  var _BIRTH_ORDER_FALLBACK = {
    "1":"First child","2":"Second child","3":"Third child","4":"Fourth child",
    "5":"Fifth child","6":"Sixth child","7":"Seventh child","8":"Eighth child",
    "9":"Ninth child","10":"Tenth child","only":"Only child","twin":"Twin","triplet":"Triplet"
  };

  // Phase L: ordinal-word → digit map for descriptive string extraction
  var _ORDINAL_WORDS = {
    "first":"1","second":"2","third":"3","fourth":"4","fifth":"5",
    "sixth":"6","seventh":"7","eighth":"8","ninth":"9","tenth":"10"
  };

  function _normBirthOrder(raw) {
    if (!raw) return "";
    var s = String(raw).trim();
    if (!s) return "";
    // Use questionnaire module helper if loaded
    var qqMod = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.questionnaire;
    if (qqMod && typeof qqMod.normalizeBirthOrder === "function") {
      return qqMod.normalizeBirthOrder(s);
    }
    // Fallback (preload may run before questionnaire module loads)
    var mapped = _BIRTH_ORDER_FALLBACK[s.toLowerCase()];
    if (mapped) return mapped;

    // Phase L: extract leading digit from descriptive strings like "2 (middle of three children)"
    var leadDigit = s.match(/^(\d{1,2})\b/);
    if (leadDigit) {
      var digitMapped = _BIRTH_ORDER_FALLBACK[leadDigit[1]];
      if (digitMapped) return digitMapped;
    }

    // Phase L: extract ordinal word from strings like "sixth of eleven children"
    var firstWord = s.toLowerCase().split(/[\s,]+/)[0];
    var ordNum = _ORDINAL_WORDS[firstWord];
    if (ordNum) {
      var ordMapped = _BIRTH_ORDER_FALLBACK[ordNum];
      if (ordMapped) return ordMapped;
    }

    // Unknown value — preserve as-is so nothing is silently lost
    return s;
  }

  /* ── Template → Questionnaire mapping ─────────────────────── */

  function _buildQuestionnaire(tpl) {
    var p = tpl.personal || {};
    var qq = { v: 1, d: {} };

    // Personal
    qq.d.personal = {
      fullName:      p.fullName      || "",
      preferredName: p.preferredName || "",
      dateOfBirth:   p.dateOfBirth   || "",
      timeOfBirth:   p.timeOfBirth   || "",
      placeOfBirth:  p.placeOfBirth  || "",
      birthOrder:    _normBirthOrder(p.birthOrder),
      zodiacSign:    p.zodiacSign    || ""
    };

    // Parents (repeatable) — Phase P: added deceased
    qq.d.parents = (tpl.parents || []).map(function (pr) {
      return {
        relation:          pr.relation          || "",
        firstName:         pr.firstName         || "",
        middleName:        pr.middleName        || "",
        lastName:          pr.lastName           || "",
        maidenName:        pr.maidenName        || "",
        birthDate:         pr.birthDate         || "",
        birthPlace:        pr.birthPlace        || "",
        occupation:        pr.occupation        || "",
        deceased:          pr.deceased ? "Yes" : "No",
        notableLifeEvents: pr.notableLifeEvents || "",
        notes:             pr.notes             || ""
      };
    });

    // Grandparents (repeatable) — Phase P: added side, middleName, maidenName, birthDate, birthPlace
    qq.d.grandparents = (tpl.grandparents || []).map(function (gp) {
      // Normalize side to title case (e.g. "maternal-maternal" → "Maternal-maternal")
      var rawSide = (gp.side || "").trim();
      var normSide = rawSide ? rawSide.charAt(0).toUpperCase() + rawSide.slice(1) : "";
      return {
        side:               normSide,
        firstName:          gp.firstName          || "",
        middleName:         gp.middleName         || "",
        lastName:           gp.lastName           || "",
        maidenName:         gp.maidenName         || "",
        birthDate:          gp.birthDate          || "",
        birthPlace:         gp.birthPlace         || "",
        ancestry:           gp.ancestry           || "",
        culturalBackground: gp.culturalBackground || "",
        memorableStories:   gp.memorableStories   || ""
      };
    });

    // Siblings (repeatable) — Phase P: added maidenName
    qq.d.siblings = (tpl.siblings || []).map(function (sb) {
      return {
        relation:              sb.relation              || "",
        firstName:             sb.firstName             || "",
        middleName:            sb.middleName            || "",
        lastName:              sb.lastName              || "",
        maidenName:            sb.maidenName            || "",
        birthOrder:            _normBirthOrder(sb.birthOrder),
        uniqueCharacteristics: sb.uniqueCharacteristics || "",
        sharedExperiences:     sb.sharedExperiences     || "",
        memories:              sb.memories              || "",
        notes:                 sb.notes                 || ""
      };
    });

    // Children (repeatable) — Phase K
    qq.d.children = (tpl.children || []).map(function (ch) {
      return {
        relation:   ch.relation  || "",
        firstName:  ch.firstName || "",
        middleName: ch.middleName || "",
        lastName:   ch.lastName  || "",
        birthDate:  ch.birthDate || "",
        birthPlace: ch.birthPlace || "",
        narrative:  ch.narrative || ch.notes || ""
      };
    });

    // Phase Q+: Spouse/Partner (repeatable, array-first)
    // Normalize to array form: tpl.spouse may be object (single) or array (multiple)
    var spouseArr = Array.isArray(tpl.spouse) ? tpl.spouse : (tpl.spouse ? [tpl.spouse] : []);
    qq.d.spouse = spouseArr.filter(function (sp) {
      // Skip entirely empty spouse objects (sparse narrators)
      return sp.firstName || sp.lastName || sp.narrative;
    }).map(function (sp) {
      return {
        relationshipType: sp.relationshipType || "Spouse",
        firstName:        sp.firstName        || "",
        middleName:       sp.middleName       || "",
        lastName:         sp.lastName          || "",
        maidenName:       sp.maidenName        || "",
        birthDate:        sp.birthDate         || "",
        birthPlace:       sp.birthPlace        || "",
        occupation:       sp.occupation        || "",
        deceased:         sp.deceased ? "Yes" : (sp.deceased === false ? "No" : ""),
        narrative:        sp.narrative          || ""
      };
    });

    // Phase Q+: Marriage / Union Details (repeatable, array-first)
    // Normalize: tpl.marriage may be object (single) or array (multiple)
    var marriageArr = Array.isArray(tpl.marriage) ? tpl.marriage : (tpl.marriage ? [tpl.marriage] : []);
    qq.d.marriage = marriageArr.filter(function (m) {
      return m.proposalStory || m.weddingDetails;
    }).map(function (m, idx) {
      // Try to derive spouseReference from the corresponding spouse entry
      var spRef = "";
      if (spouseArr[idx]) {
        spRef = [spouseArr[idx].firstName, spouseArr[idx].lastName].filter(Boolean).join(" ");
      }
      return {
        spouseReference: m.spouseReference || spRef || "",
        marriageDate:    m.marriageDate    || "",
        proposalStory:   m.proposalStory   || "",
        weddingDetails:  m.weddingDetails  || ""
      };
    });

    // Phase Q+: Family Traditions (repeatable)
    qq.d.familyTraditions = (tpl.familyTraditions || []).filter(function (ft) {
      return ft.description || ft.occasion;
    }).map(function (ft) {
      return {
        description: ft.description || "",
        occasion:    ft.occasion    || ""
      };
    });

    // Phase Q+: Pets (repeatable) — also goes into questionnaire for editing
    qq.d.pets = (tpl.pets || []).filter(function (pt) {
      return pt.name || pt.species || pt.notes;
    }).map(function (pt) {
      return {
        name:         pt.name         || "",
        species:      pt.species      || "",
        breed:        pt.breed        || "",
        birthDate:    pt.birthDate    || "",
        adoptionDate: pt.adoptionDate || "",
        notes:        pt.notes        || ""
      };
    });

    // Phase Q+: Health & Wellness
    var hl = tpl.health || {};
    qq.d.health = {
      healthMilestones: hl.healthMilestones || "",
      lifestyleChanges: hl.lifestyleChanges || "",
      wellnessTips:     hl.wellnessTips     || ""
    };

    // Phase Q+: Technology & Beliefs
    var tech = tpl.technology || {};
    qq.d.technology = {
      firstTechExperience: tech.firstTechExperience || "",
      favoriteGadgets:     tech.favoriteGadgets     || "",
      culturalPractices:   tech.culturalPractices   || ""
    };

    // Early Memories
    var em = tpl.earlyMemories || {};
    qq.d.earlyMemories = {
      firstMemory:      em.firstMemory      || "",
      favoriteToy:      em.favoriteToy      || "",
      significantEvent: em.significantEvent || ""
    };

    // Education & Career
    var ed = tpl.education || {};
    qq.d.education = {
      schooling:            ed.schooling            || "",
      higherEducation:      ed.higherEducation      || "",
      earlyCareer:          ed.earlyCareer          || "",
      careerProgression:    ed.careerProgression    || "",
      communityInvolvement: ed.communityInvolvement || "",
      mentorship:           ed.mentorship           || ""
    };

    // Later Years
    var ly = tpl.laterYears || {};
    qq.d.laterYears = {
      retirement:                  ly.retirement                  || "",
      lifeLessons:                 ly.lifeLessons                 || "",
      adviceForFutureGenerations:  ly.adviceForFutureGenerations  || ""
    };

    // Hobbies & Interests
    var hb = tpl.hobbies || {};
    qq.d.hobbies = {
      hobbies:            hb.hobbies            || "",
      worldEvents:        hb.worldEvents        || "",
      personalChallenges: hb.personalChallenges || "",
      travel:             hb.travel             || ""
    };

    // Additional Notes
    var an = tpl.additionalNotes || {};
    qq.d.additionalNotes = {
      unfinishedDreams:             an.unfinishedDreams             || "",
      messagesForFutureGenerations: an.messagesForFutureGenerations || ""
    };

    return qq;
  }

  /* ── Template → Profile mapping ───────────────────────────── */

  function _buildProfile(tpl) {
    var p = tpl.personal || {};
    var basics = {
      fullname:                p.fullName      || "",
      preferred:               p.preferredName || "",
      dob:                     p.dateOfBirth   || "",
      pob:                     p.placeOfBirth  || "",
      culture:                 p.culture       || "",
      country:                 p.country       || "US",
      pronouns:                p.pronouns      || "",
      phonetic:                p.phonetic      || "",
      language:                p.language      || "",
      legalFirstName:          p.legalFirstName  || (p.fullName || "").split(" ")[0] || "",
      legalMiddleName:         p.legalMiddleName || "",
      legalLastName:           p.legalLastName   || (p.fullName || "").split(" ").slice(-1)[0] || "",
      timeOfBirth:             p.timeOfBirth     || "",
      timeOfBirthDisplay:      p.timeOfBirth     || "",
      birthOrder:              p.birthOrder      || "",
      birthOrderCustom:        "",
      zodiacSign:              p.zodiacSign      || "",
      placeOfBirthRaw:         p.placeOfBirth    || "",
      placeOfBirthNormalized:  p.placeOfBirth    || ""
    };

    // Kinship — parents + siblings + spouse
    // Recognized parent-role relations (case-insensitive).
    // Anything not recognized defaults to "Parent" with the original label preserved in notes.
    var PARENT_RELATIONS = {
      "mother": "Mother", "father": "Father",
      "stepmother": "Stepmother", "stepfather": "Stepfather",
      "guardian": "Guardian", "grandparent-guardian": "Grandparent-guardian"
    };

    // Recognized sibling-role relations (case-insensitive).
    // Phase M: SIBLING_RELATIONS returns { rel, qualifier } objects
    // to preserve age/type qualifiers while normalizing the base class.
    var SIBLING_RELATIONS = {
      "brother": { rel: "Brother", qualifier: "" },
      "sister": { rel: "Sister", qualifier: "" },
      "half-brother": { rel: "Half-brother", qualifier: "" },
      "half-sister": { rel: "Half-sister", qualifier: "" },
      "stepbrother": { rel: "Stepbrother", qualifier: "" },
      "stepsister": { rel: "Stepsister", qualifier: "" },
      "adoptive brother": { rel: "Adoptive brother", qualifier: "" },
      "adoptive sister": { rel: "Adoptive sister", qualifier: "" },
      "older brother": { rel: "Brother", qualifier: "older" },
      "younger brother": { rel: "Brother", qualifier: "younger" },
      "older sister": { rel: "Sister", qualifier: "older" },
      "younger sister": { rel: "Sister", qualifier: "younger" },
      "twin brother": { rel: "Brother", qualifier: "twin" },
      "twin sister": { rel: "Sister", qualifier: "twin" },
      "eldest brother": { rel: "Brother", qualifier: "eldest" },
      "eldest sister": { rel: "Sister", qualifier: "eldest" },
      "youngest brother": { rel: "Brother", qualifier: "youngest" },
      "youngest sister": { rel: "Sister", qualifier: "youngest" },
      "baby brother": { rel: "Brother", qualifier: "baby" },
      "baby sister": { rel: "Sister", qualifier: "baby" }
    };

    var kinship = [];
    (tpl.parents || []).forEach(function (pr) {
      var raw = (pr.relation || "Parent").trim();
      var rel = PARENT_RELATIONS[raw.toLowerCase()] || raw;
      kinship.push({
        name:       [pr.firstName, pr.middleName, pr.lastName].filter(Boolean).join(" "),
        relation:   rel,
        pob:        pr.birthPlace  || "",
        occupation: pr.occupation  || "",
        deceased:   !!pr.deceased
      });
    });
    (tpl.siblings || []).forEach(function (sb) {
      var raw = (sb.relation || "Sibling").trim();
      var lookup = SIBLING_RELATIONS[raw.toLowerCase()];
      var rel = lookup ? lookup.rel : raw;
      var qualifier = lookup ? lookup.qualifier : "";
      var entry = {
        name:       [sb.firstName, sb.middleName, sb.lastName].filter(Boolean).join(" "),
        relation:   rel,
        pob:        sb.birthPlace || "",
        occupation: "",
        deceased:   !!sb.deceased
      };
      // Phase M: preserve qualifier as structured metadata
      if (qualifier) {
        entry.relationType = rel;
        entry.relationQualifier = qualifier;
      }
      kinship.push(entry);
    });

    // Spouse — Phase Q+: unified relationship model with type support
    var spouseArr = Array.isArray(tpl.spouse) ? tpl.spouse : (tpl.spouse ? [tpl.spouse] : []);
    spouseArr.forEach(function (sp) {
      if (!sp.firstName && !sp.lastName && !sp.narrative) return;
      kinship.push({
        name:             [sp.firstName, sp.middleName, sp.lastName].filter(Boolean).join(" "),
        relation:         sp.relationshipType || "Spouse",
        relationshipType: sp.relationshipType || "Spouse",
        pob:              sp.birthPlace  || "",
        occupation:       sp.occupation  || "",
        deceased:         !!sp.deceased,
        birthDate:        sp.birthDate   || "",
        maidenName:       sp.maidenName  || "",
        narrative:        sp.narrative   || ""
      });
    });

    // Children — Phase K: mirror into kinship for downstream family-data use
    // Phase L: validate child relation so parent labels never leak through
    var VALID_CHILD_RELATIONS = {
      "son": "Son", "daughter": "Daughter",
      "stepson": "Stepson", "stepdaughter": "Stepdaughter",
      "adoptive son": "Adoptive son", "adoptive daughter": "Adoptive daughter",
      "adopted son": "Adoptive son", "adopted daughter": "Adoptive daughter",
      "foster child": "Foster child", "child": "Child"
    };
    (tpl.children || []).forEach(function (ch) {
      var name = [ch.firstName, ch.middleName, ch.lastName].filter(Boolean).join(" ");
      if (!name) return;
      // Phase L: normalize relation, block parent labels
      var rawRel = (ch.relation || "Child").trim();
      var normRel = VALID_CHILD_RELATIONS[rawRel.toLowerCase()];
      if (!normRel) {
        // If the value looks like a parent relation, force to "Child"
        var lower = rawRel.toLowerCase();
        if (lower === "mother" || lower === "father" || lower === "parent"
            || lower === "stepmother" || lower === "stepfather" || lower === "guardian") {
          console.warn("[preload] Blocked invalid child relation '" + rawRel + "' for " + name + " — defaulting to Child");
          normRel = "Child";
        } else {
          normRel = rawRel; // pass through unknown but non-parent values
        }
      }
      kinship.push({
        name:       name,
        relation:   normRel,
        pob:        ch.birthPlace || "",
        occupation: "",
        deceased:   !!ch.deceased
      });
    });

    // Pets — Phase P: added notes
    var pets = (tpl.pets || []).map(function (pt) {
      return {
        name:     pt.name    || "",
        species:  pt.species || "",
        breed:    pt.breed   || "",
        born:     pt.birthDate    || "",
        adopted:  pt.adoptionDate || "",
        notes:    pt.notes        || ""
      };
    });

    return { basics: basics, kinship: kinship, pets: pets };
  }

  /* ── Phase L: Post-preload candidate extraction ─────────────
     Calls the Bio Builder questionnaire extraction pipeline for
     each populated section, so preloaded narrators have candidates
     available immediately without requiring manual form saves.
     Idempotent — deduplication is handled by the extraction functions.
  ──────────────────────────────────────────────────────────── */
  function _postPreloadExtractCandidates(pid, qqSections) {
    try {
      var qqMod = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.questionnaire;
      if (!qqMod || typeof qqMod._extractQuestionnaireCandidates !== "function") {
        console.log("[preload] Questionnaire module not loaded — skipping candidate extraction");
        return;
      }

      // Ensure bb.questionnaire is populated for the extraction to read
      var coreMod = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.core;
      if (coreMod && typeof coreMod._bb === "function") {
        var bb = coreMod._bb();
        if (bb) {
          // Hydrate bb.questionnaire from the just-saved sections
          if (!bb.questionnaire) bb.questionnaire = {};
          // Phase Q+: added spouse to candidate extraction pipeline
          var sectionsToExtract = ["parents", "grandparents", "siblings", "children", "spouse", "earlyMemories"];
          sectionsToExtract.forEach(function (sectionId) {
            if (qqSections[sectionId]) {
              bb.questionnaire[sectionId] = qqSections[sectionId];
            }
          });

          // Initialize candidates container if not present
          if (!bb.candidates) {
            bb.candidates = {
              people: [], relationships: [], events: [],
              memories: [], places: [], documents: []
            };
          }

          // Run extraction for each populated section
          var totalBefore = bb.candidates.people.length + bb.candidates.relationships.length + bb.candidates.memories.length;
          sectionsToExtract.forEach(function (sectionId) {
            if (qqSections[sectionId]) {
              qqMod._extractQuestionnaireCandidates(sectionId);
            }
          });
          var totalAfter = bb.candidates.people.length + bb.candidates.relationships.length + bb.candidates.memories.length;
          console.log("[preload] ✅ Post-preload extraction: " + (totalAfter - totalBefore) + " candidates created for " + pid);
        }
      }
    } catch (err) {
      console.warn("[preload] ⚠ Post-preload candidate extraction failed:", err);
    }
  }

  /* ── Main preload — create person + populate everything ───── */

  async function lv80PreloadNarrator(tpl) {
    var p = tpl.personal || {};
    var displayName = p.fullName || p.preferredName || "Unnamed";

    // 1. Create person via API
    try {
      var resp = await fetch(API.PEOPLE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName,
          role: "subject",
          date_of_birth: p.dateOfBirth || null,
          place_of_birth: p.placeOfBirth || null
        })
      });
      var json = await resp.json();
      var pid = json.person_id || json.id || (json.person && json.person.id);
      if (!pid) throw new Error("No person_id in response");

      console.log("[preload] Created person: " + displayName + " → " + pid);

      // 2. Load the person
      await loadPerson(pid);

      // WO-11B: trainer launch is UI-only and does not bind through narrator preload.

      // 3. Populate profile
      var prof = _buildProfile(tpl);
      state.profile.basics  = prof.basics;
      state.profile.kinship = prof.kinship;
      state.profile.pets    = prof.pets;

      // Phase L: validate kinship was built correctly before save
      if (prof.kinship.length === 0 && ((tpl.parents || []).length > 0 || (tpl.siblings || []).length > 0)) {
        console.warn("[preload] ⚠ Kinship is empty but template has parents/siblings — possible bug");
      }
      console.log("[preload] Profile kinship built: " + prof.kinship.length + " entries for " + displayName);

      // Hydrate form fields
      if (typeof hydrateProfileForm === "function") hydrateProfileForm();

      // Phase L: explicitly persist profile to backend via PUT,
      // then also call saveProfile() for any secondary storage.
      // The old code called saveProfile() fire-and-forget which raced
      // with subsequent loadPerson() calls during batch preload.
      try {
        var profilePayload = {
          person_id: pid,
          basics: prof.basics,
          kinship: prof.kinship,
          pets: prof.pets
        };
        var profEndpoint = (typeof API !== "undefined" && API.PROFILE_PUT)
          ? API.PROFILE_PUT
          : ((typeof ORIGIN !== "undefined" ? ORIGIN : "http://localhost:8000") + "/api/person/" + pid + "/profile");
        await fetch(profEndpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profilePayload)
        });
        console.log("[preload] ✅ Profile persisted to backend for " + pid + " (kinship: " + prof.kinship.length + ")");
      } catch (profErr) {
        console.warn("[preload] ⚠ Backend profile save failed, trying saveProfile() fallback", profErr);
      }
      // Also persist to localStorage as offline fallback
      localStorage.setItem("lorevox_offline_profile_" + pid, JSON.stringify({
        basics: prof.basics,
        kinship: prof.kinship,
        pets: prof.pets
      }));
      // Call saveProfile() for any additional side effects (form state, etc.)
      if (typeof saveProfile === "function") saveProfile();

      // 4. Save questionnaire to backend (Phase G: backend authority) + localStorage transient draft
      var qq = _buildQuestionnaire(tpl);
      // qq = { v:1, d:{sections} } — extract flat sections for storage
      var qqSections = qq.d || qq;
      try {
        await fetch(API.BB_QQ_PUT, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ person_id: pid, questionnaire: qqSections, source: "preload", version: 1 })
        });
        console.log("[preload] ✅ Questionnaire saved to backend for " + pid);
      } catch (e) {
        console.warn("[preload] ⚠ Backend QQ save failed, falling back to localStorage", e);
      }
      // Keep transient localStorage draft as convenience fallback
      // localStorage format: { v:1, d:{flat sections} }
      localStorage.setItem("lorevox_qq_draft_" + pid, JSON.stringify({ v: 1, d: qqSections }));

      // Phase Q+: hydrate in-memory bb.questionnaire so UI reflects new data immediately
      // Phase Q.2 FIX: also set bb.personId so syncFromQuestionnaire() can generate stable IDs
      var coreMod = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.core;
      if (coreMod && typeof coreMod._bb === "function") {
        var bb = coreMod._bb();
        if (bb) {
          bb.personId = pid;  // Q.2: required for graph sync — was missing, causing silent no-op
          bb.questionnaire = qqSections;
          console.log("[preload] ✅ In-memory bb.personId + bb.questionnaire hydrated with " + Object.keys(qqSections).length + " sections");
        }
      }

      // Phase L: Post-preload candidate extraction —
      // Run the same extraction pipeline that manual section save uses,
      // so preloaded narrators have usable candidates immediately.
      // Hornelore: skip if preload is treated as baseline truth.
      if (!window.HORNELORE_TRUST_PRELOAD_AS_TRUTH) {
        _postPreloadExtractCandidates(pid, qqSections);
      }

      // Phase Q.1: Build relationship graph from preloaded data
      // Phase Q.2 FIX: clear graph before fullSync to prevent cross-narrator accumulation
      var graphMod = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.graph;
      if (graphMod && typeof graphMod.fullSync === "function") {
        var _bb2 = coreMod && typeof coreMod._bb === "function" ? coreMod._bb() : null;
        if (_bb2) _bb2.graph = { persons: {}, relationships: {} };
        graphMod.fullSync();
      }

      // 5. Update UI
      if (typeof lv80UpdateActiveNarratorCard === "function") lv80UpdateActiveNarratorCard();
      if (typeof refreshPeople === "function") await refreshPeople();

      // v8: initialize interview projection for the newly created person
      if (typeof _ivResetProjectionForNarrator === "function") {
        _ivResetProjectionForNarrator(pid);
      }

      console.log("[preload] ✅ " + displayName + " fully loaded — PID: " + pid);
      if (typeof sysBubble === "function") sysBubble("✅ Preloaded: " + displayName);

      return pid;

    } catch (err) {
      console.error("[preload] ❌ Failed:", err);
      if (typeof sysBubble === "function") sysBubble("⚠ Preload failed: " + err.message);
      return null;
    }
  }

  /* ── Preload into an existing person ──────────────────────── */

  async function lv80PreloadIntoExisting(pid, tpl) {
    try {
      await loadPerson(pid);

      var prof = _buildProfile(tpl);
      state.profile.basics  = prof.basics;
      state.profile.kinship = prof.kinship;
      state.profile.pets    = prof.pets;

      if (typeof hydrateProfileForm === "function") hydrateProfileForm();

      // Phase L: explicit profile persistence (same fix as lv80PreloadNarrator)
      try {
        var profilePayload = { person_id: pid, basics: prof.basics, kinship: prof.kinship, pets: prof.pets };
        var profEndpoint = (typeof API !== "undefined" && API.PROFILE_PUT)
          ? API.PROFILE_PUT
          : ((typeof ORIGIN !== "undefined" ? ORIGIN : "http://localhost:8000") + "/api/person/" + pid + "/profile");
        await fetch(profEndpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profilePayload)
        });
      } catch (profErr) {
        console.warn("[preload] ⚠ Backend profile save failed (existing)", profErr);
      }
      localStorage.setItem("lorevox_offline_profile_" + pid, JSON.stringify({
        basics: prof.basics, kinship: prof.kinship, pets: prof.pets
      }));
      if (typeof saveProfile === "function") saveProfile();

      var qq = _buildQuestionnaire(tpl);
      var qqSections = qq.d || qq;
      try {
        await fetch(API.BB_QQ_PUT, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ person_id: pid, questionnaire: qqSections, source: "preload", version: 1 })
        });
      } catch (e) {
        console.warn("[preload] ⚠ Backend QQ save failed (existing)", e);
      }
      localStorage.setItem("lorevox_qq_draft_" + pid, JSON.stringify({ v: 1, d: qqSections }));

      // Phase Q+: hydrate in-memory bb.questionnaire so UI reflects new data immediately
      // Without this, the stale backend data from loadPerson() would remain in memory.
      // Phase Q.2 FIX: also set bb.personId so syncFromQuestionnaire() can generate stable IDs
      var coreMod = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.core;
      if (coreMod && typeof coreMod._bb === "function") {
        var bb = coreMod._bb();
        if (bb) {
          bb.personId = pid;  // Q.2: required for graph sync — was missing, causing silent no-op
          bb.questionnaire = qqSections;
          console.log("[preload] ✅ In-memory bb.personId + bb.questionnaire hydrated with " + Object.keys(qqSections).length + " sections");
        }
      }

      // Phase L: post-preload candidate extraction
      // Hornelore: skip if preload is treated as baseline truth.
      if (!window.HORNELORE_TRUST_PRELOAD_AS_TRUTH) {
        _postPreloadExtractCandidates(pid, qqSections);
      }

      // Phase Q.1: Build relationship graph from preloaded data
      // Phase Q.2 FIX: clear graph before fullSync to prevent cross-narrator accumulation
      var graphMod = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.graph;
      if (graphMod && typeof graphMod.fullSync === "function") {
        var _bb2 = coreMod && typeof coreMod._bb === "function" ? coreMod._bb() : null;
        if (_bb2) _bb2.graph = { persons: {}, relationships: {} };
        graphMod.fullSync();
      }

      if (typeof lv80UpdateActiveNarratorCard === "function") lv80UpdateActiveNarratorCard();

      console.log("[preload] ✅ Updated existing person: " + pid);
      if (typeof sysBubble === "function") sysBubble("✅ Updated: " + (prof.basics.preferred || prof.basics.fullname));

      return pid;
    } catch (err) {
      console.error("[preload] ❌ Failed:", err);
      return null;
    }
  }

  /* ── File loader — reads a .json file and preloads it ────── */

  function lv80PreloadFromFile(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var tpl = JSON.parse(e.target.result);
        lv80PreloadNarrator(tpl);
      } catch (err) {
        console.error("[preload] Invalid JSON:", err);
        if (typeof sysBubble === "function") sysBubble("⚠ Invalid template file");
      }
    };
    reader.readAsText(file);
  }

  /* ── Import-or-update: match by name, update existing or create new ── */

  async function lv80ImportNarratorTemplate(tpl) {
    var p = tpl && tpl.personal ? tpl.personal : {};
    var fullName = (p.fullName || "").trim();
    var preferredName = (p.preferredName || "").trim();

    var people = (typeof state !== "undefined" && state.narratorUi && state.narratorUi.peopleCache)
      ? state.narratorUi.peopleCache
      : [];

    // Match against display_name, name, AND Hornelore altNames for robustness
    var hnConfig = window.HORNELORE_NARRATORS || [];
    var altNames = [];
    for (var h = 0; h < hnConfig.length; h++) {
      var hn = hnConfig[h];
      if (hn.displayName && hn.displayName.toLowerCase() === fullName.toLowerCase()) {
        altNames = (hn.altNames || []).map(function(n) { return n.toLowerCase(); });
        break;
      }
    }

    var match = people.find(function(person) {
      var label = ((person.display_name || person.name || "") + "").trim().toLowerCase();
      if (label === fullName.toLowerCase() || label === preferredName.toLowerCase()) return true;
      // Check altNames from Hornelore config
      for (var a = 0; a < altNames.length; a++) {
        if (label === altNames[a]) return true;
      }
      return false;
    });

    if (match) {
      var pid = match.id || match.person_id || match.uuid;
      return await lv80PreloadIntoExisting(pid, tpl);
    }

    return await lv80PreloadNarrator(tpl);
  }

  /* ── Expose globally ──────────────────────────────────────── */

  window.lv80PreloadNarrator          = lv80PreloadNarrator;
  window.lv80PreloadIntoExisting      = lv80PreloadIntoExisting;
  window.lv80PreloadFromFile          = lv80PreloadFromFile;
  window.lv80ImportNarratorTemplate   = lv80ImportNarratorTemplate;

  console.log("[Lorevox] Narrator preload utility loaded.");

})();
