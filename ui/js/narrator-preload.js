/* ═══════════════════════════════════════════════════════════════
   narrator-preload.js — Lorevox 8.0 Narrator Preload Utility

   Loads a narrator template JSON file and populates:
   1. API person record (display_name, date_of_birth, place_of_birth)
   2. Profile basics + kinship + pets (state.profile)
   3. Bio Builder questionnaire (localStorage bb_qq_<pid>)

   Usage:
     lv80PreloadNarrator(templateObj)     — creates person + loads data
     lv80PreloadIntoExisting(pid, tpl)    — loads data into existing person

   Template format: see narrator-template.json
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

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
      birthOrder:    p.birthOrder    || "",
      zodiacSign:    p.zodiacSign    || ""
    };

    // Parents (repeatable)
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
        notableLifeEvents: pr.notableLifeEvents || "",
        notes:             pr.notes             || ""
      };
    });

    // Grandparents (repeatable)
    qq.d.grandparents = (tpl.grandparents || []).map(function (gp) {
      return {
        firstName:          gp.firstName          || "",
        lastName:           gp.lastName           || "",
        ancestry:           gp.ancestry           || "",
        culturalBackground: gp.culturalBackground || "",
        memorableStories:   gp.memorableStories   || ""
      };
    });

    // Siblings (repeatable)
    qq.d.siblings = (tpl.siblings || []).map(function (sb) {
      return {
        relation:              sb.relation              || "",
        firstName:             sb.firstName             || "",
        middleName:            sb.middleName            || "",
        lastName:              sb.lastName              || "",
        birthOrder:            sb.birthOrder            || "",
        uniqueCharacteristics: sb.uniqueCharacteristics || "",
        sharedExperiences:     sb.sharedExperiences     || "",
        memories:              sb.memories              || "",
        notes:                 sb.notes                 || ""
      };
    });

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
    var kinship = [];
    (tpl.parents || []).forEach(function (pr) {
      var rel = pr.relation || "Parent";
      if (rel.toLowerCase() === "mother" || rel.toLowerCase() === "father") {
        // keep as-is
      } else {
        rel = "Parent";
      }
      kinship.push({
        name:       [pr.firstName, pr.middleName, pr.lastName].filter(Boolean).join(" "),
        relation:   rel,
        pob:        pr.birthPlace  || "",
        occupation: pr.occupation  || "",
        deceased:   !!pr.deceased
      });
    });
    (tpl.siblings || []).forEach(function (sb) {
      kinship.push({
        name:       [sb.firstName, sb.middleName, sb.lastName].filter(Boolean).join(" "),
        relation:   sb.relation || "Sibling",
        pob:        sb.birthPlace || "",
        occupation: "",
        deceased:   !!sb.deceased
      });
    });

    // Spouse
    var sp = tpl.spouse || {};
    if (sp.firstName) {
      kinship.push({
        name:       [sp.firstName, sp.middleName, sp.lastName].filter(Boolean).join(" "),
        relation:   "Spouse",
        pob:        sp.birthPlace || "",
        occupation: sp.occupation || "",
        deceased:   !!sp.deceased
      });
    }

    // Pets
    var pets = (tpl.pets || []).map(function (pt) {
      return {
        name:     pt.name    || "",
        species:  pt.species || "",
        breed:    pt.breed   || "",
        born:     pt.birthDate    || "",
        adopted:  pt.adoptionDate || ""
      };
    });

    return { basics: basics, kinship: kinship, pets: pets };
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

      // 3. Populate profile
      var prof = _buildProfile(tpl);
      state.profile.basics  = prof.basics;
      state.profile.kinship = prof.kinship;
      state.profile.pets    = prof.pets;

      // Hydrate form fields
      if (typeof hydrateProfileForm === "function") hydrateProfileForm();
      if (typeof saveProfile === "function") saveProfile();

      // 4. Save questionnaire to localStorage
      var qq = _buildQuestionnaire(tpl);
      localStorage.setItem("bb_qq_" + pid, JSON.stringify(qq));

      // 5. Update UI
      if (typeof lv80UpdateActiveNarratorCard === "function") lv80UpdateActiveNarratorCard();
      if (typeof refreshPeople === "function") await refreshPeople();

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
      if (typeof saveProfile === "function") saveProfile();

      var qq = _buildQuestionnaire(tpl);
      localStorage.setItem("bb_qq_" + pid, JSON.stringify(qq));

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

  /* ── Expose globally ──────────────────────────────────────── */

  window.lv80PreloadNarrator      = lv80PreloadNarrator;
  window.lv80PreloadIntoExisting  = lv80PreloadIntoExisting;
  window.lv80PreloadFromFile      = lv80PreloadFromFile;

  console.log("[Lorevox] Narrator preload utility loaded.");

})();
