/* ═══════════════════════════════════════════════════════════════
   bio-builder-graph.js — Phase Q.1: Relationship Graph Layer
   Lorevox 9.0

   The canonical relationship graph that sits UNDER the questionnaire
   and family tree.  The questionnaire is an input/editor surface;
   this graph is the truth model.

   Owns:
     - In-memory graph state: bb.graph = { persons: {}, relationships: {} }
     - Questionnaire → graph sync (writes graph records from QQ sections)
     - Profile kinship → graph sync
     - Graph → backend persistence (backend-first, same pattern as QQ)
     - Graph → family tree seeding bridge

   Relationship types:
     parent, child, sibling, spouse, partner, former_spouse,
     grandparent, grandchild, guardian, chosen_family, other

   Subtypes:
     biological, adoptive, step, half, foster, legal_guardian,
     spouse, former_spouse, partner, chosen_family, domestic_partner,
     life_partner, common_law

   Exposes: window.LorevoxBioBuilderModules.graph
   Load order: AFTER bio-builder-core.js, BEFORE bio-builder-family-tree.js
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  var coreMod = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.core;
  if (!coreMod) {
    console.error("[bb-graph] core module not loaded — graph layer disabled");
    return;
  }

  var _bb   = coreMod._bb;
  var _uid  = coreMod._uid;

  /* ───────────────────────────────────────────────────────────
     CONSTANTS
  ─────────────────────────────────────────────────────────── */

  var RELATIONSHIP_TYPES = [
    "parent", "child", "sibling", "spouse", "partner",
    "former_spouse", "grandparent", "grandchild",
    "guardian", "chosen_family", "other"
  ];

  var SUBTYPES = [
    "biological", "adoptive", "step", "half", "foster",
    "legal_guardian", "spouse", "former_spouse", "partner",
    "chosen_family", "domestic_partner", "life_partner", "common_law"
  ];

  // Map questionnaire relationshipType labels → graph subtypes
  var _LABEL_TO_SUBTYPE = {
    "Spouse":           "spouse",
    "Partner":          "partner",
    "Former Spouse":    "former_spouse",
    "Domestic Partner": "domestic_partner",
    "Life Partner":     "life_partner",
    "Common-Law Spouse":"common_law",
    "Chosen Family":    "chosen_family",
    "Other":            ""
  };

  // Map questionnaire parent/sibling relation labels → subtypes
  var _RELATION_TO_SUBTYPE = {
    "Father":           "biological",
    "Mother":           "biological",
    "Parent":           "biological",
    "Stepfather":       "step",
    "Stepmother":       "step",
    "Step-Parent":      "step",
    "Adoptive Father":  "adoptive",
    "Adoptive Mother":  "adoptive",
    "Foster Father":    "foster",
    "Foster Mother":    "foster",
    "Legal Guardian":   "legal_guardian",
    "Brother":          "biological",
    "Sister":           "biological",
    "Sibling":          "biological",
    "Half-Brother":     "half",
    "Half-Sister":      "half",
    "Stepbrother":      "step",
    "Stepsister":       "step",
    "Adopted Brother":  "adoptive",
    "Adopted Sister":   "adoptive"
  };

  /* ───────────────────────────────────────────────────────────
     GRAPH STATE HELPERS
  ─────────────────────────────────────────────────────────── */

  /** Ensure bb.graph exists with proper structure */
  function _ensureGraph() {
    var bb = _bb(); if (!bb) return null;
    if (!bb.graph) {
      bb.graph = { persons: {}, relationships: {} };
    }
    return bb.graph;
  }

  /** Generate a stable ID for a person based on narrator + name */
  function _stablePersonId(narratorId, name) {
    // Simple hash: narrator prefix + name lowercase
    var key = (narratorId || "").slice(0, 8) + ":" + (name || "").toLowerCase().trim();
    // Use a deterministic approach for idempotent upserts
    var hash = 0;
    for (var i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    }
    return "gp_" + Math.abs(hash).toString(36) + "_" + key.replace(/[^a-z0-9]/g, "").slice(0, 16);
  }

  /** Generate a stable ID for a relationship */
  function _stableRelId(fromId, toId, relType) {
    return "gr_" + (fromId || "").slice(0, 12) + "_" + (toId || "").slice(0, 12) + "_" + (relType || "");
  }

  /* ───────────────────────────────────────────────────────────
     GRAPH PERSON OPERATIONS
  ─────────────────────────────────────────────────────────── */

  function upsertPerson(opts) {
    var g = _ensureGraph(); if (!g) return null;
    var name = [opts.firstName, opts.middleName, opts.lastName].filter(Boolean).join(" ");
    var id = opts.id || _stablePersonId(opts.narratorId, name);

    var existing = g.persons[id] || {};
    g.persons[id] = {
      id:           id,
      narratorId:   opts.narratorId || existing.narratorId || "",
      displayName:  name || opts.displayName || existing.displayName || "",
      firstName:    opts.firstName   || existing.firstName   || "",
      middleName:   opts.middleName  || existing.middleName  || "",
      lastName:     opts.lastName    || existing.lastName     || "",
      maidenName:   opts.maidenName  || existing.maidenName   || "",
      birthDate:    opts.birthDate   || existing.birthDate    || "",
      birthPlace:   opts.birthPlace  || existing.birthPlace   || "",
      occupation:   opts.occupation  || existing.occupation   || "",
      deceased:     opts.deceased !== undefined ? !!opts.deceased : (existing.deceased || false),
      isNarrator:   opts.isNarrator !== undefined ? !!opts.isNarrator : (existing.isNarrator || false),
      source:       opts.source      || existing.source       || "manual",
      provenance:   opts.provenance  || existing.provenance   || "",
      confidence:   opts.confidence !== undefined ? opts.confidence : (existing.confidence || 1.0),
      meta:         opts.meta        || existing.meta         || {}
    };
    return g.persons[id];
  }

  function removePerson(personId) {
    var g = _ensureGraph(); if (!g) return;
    delete g.persons[personId];
    // Remove any edges referencing this person
    Object.keys(g.relationships).forEach(function (rid) {
      var r = g.relationships[rid];
      if (r.fromPersonId === personId || r.toPersonId === personId) {
        delete g.relationships[rid];
      }
    });
  }

  function findPersonByName(name) {
    var g = _ensureGraph(); if (!g) return null;
    var needle = (name || "").toLowerCase().trim();
    if (!needle) return null;
    var persons = Object.values(g.persons);
    for (var i = 0; i < persons.length; i++) {
      if ((persons[i].displayName || "").toLowerCase().trim() === needle) return persons[i];
    }
    return null;
  }

  /* ───────────────────────────────────────────────────────────
     GRAPH RELATIONSHIP OPERATIONS
  ─────────────────────────────────────────────────────────── */

  /**
   * Phase Q.2: Detect impossible lineage cycles.
   * Returns true if adding an edge of relType from→to would create
   * a direct parent-child cycle (A is both parent and child of B).
   */
  function _wouldCreateCycle(g, fromId, toId, relType) {
    if (!g || !fromId || !toId) return false;
    // Self-loop: a person cannot be their own parent or child
    if (fromId === toId && (relType === "parent" || relType === "child")) return true;
    // Only check lineage-sensitive types
    if (relType !== "parent" && relType !== "child") return false;

    var rels = Object.values(g.relationships);
    if (relType === "parent") {
      // Adding fromId as parent of toId — check if toId is already a parent of fromId
      var reverse = rels.some(function (r) {
        return r.relationshipType === "parent" && r.fromPersonId === toId && r.toPersonId === fromId;
      });
      if (reverse) return true;
      // Also check child direction: is fromId already a child of toId?
      var childReverse = rels.some(function (r) {
        return r.relationshipType === "child" && r.fromPersonId === toId && r.toPersonId === fromId;
      });
      if (childReverse) return true;
    }
    if (relType === "child") {
      // Adding fromId as parent-of-child toId — check reverse
      var reverse = rels.some(function (r) {
        return r.relationshipType === "child" && r.fromPersonId === toId && r.toPersonId === fromId;
      });
      if (reverse) return true;
      var parentReverse = rels.some(function (r) {
        return r.relationshipType === "parent" && r.fromPersonId === toId && r.toPersonId === fromId;
      });
      if (parentReverse) return true;
    }
    return false;
  }

  function upsertRelationship(opts) {
    var g = _ensureGraph(); if (!g) return null;
    var id = opts.id || _stableRelId(opts.fromPersonId, opts.toPersonId, opts.relationshipType);

    // Phase Q.2: Block impossible lineage cycles
    if (_wouldCreateCycle(g, opts.fromPersonId, opts.toPersonId, opts.relationshipType)) {
      console.warn("[bb-graph] ⚠ BLOCKED: impossible cycle detected — " +
        opts.fromPersonId + " → " + opts.toPersonId + " as " + opts.relationshipType +
        ". A direct parent-child cycle is not allowed.");
      return null;
    }

    var existing = g.relationships[id] || {};
    g.relationships[id] = {
      id:               id,
      narratorId:       opts.narratorId       || existing.narratorId       || "",
      fromPersonId:     opts.fromPersonId     || existing.fromPersonId     || "",
      toPersonId:       opts.toPersonId       || existing.toPersonId       || "",
      relationshipType: opts.relationshipType || existing.relationshipType || "",
      subtype:          opts.subtype          || existing.subtype          || "",
      label:            opts.label            || existing.label            || "",
      status:           opts.status           || existing.status           || "active",
      notes:            opts.notes !== undefined ? opts.notes : (existing.notes || ""),
      source:           opts.source           || existing.source           || "manual",
      provenance:       opts.provenance       || existing.provenance       || "",
      confidence:       opts.confidence !== undefined ? opts.confidence : (existing.confidence || 1.0),
      startDate:        opts.startDate        || existing.startDate        || "",
      endDate:          opts.endDate          || existing.endDate          || "",
      meta:             opts.meta             || existing.meta             || {}
    };
    return g.relationships[id];
  }

  function removeRelationship(relId) {
    var g = _ensureGraph(); if (!g) return;
    delete g.relationships[relId];
  }

  /** Find relationships involving a person */
  function getRelationshipsFor(personId) {
    var g = _ensureGraph(); if (!g) return [];
    return Object.values(g.relationships).filter(function (r) {
      return r.fromPersonId === personId || r.toPersonId === personId;
    });
  }

  /* ───────────────────────────────────────────────────────────
     QUESTIONNAIRE → GRAPH SYNC
     Reads questionnaire sections and writes graph records.
     This is the canonical mapping from editor surface → truth model.
  ─────────────────────────────────────────────────────────── */

  function syncFromQuestionnaire() {
    var bb = _bb(); if (!bb) return;
    var qq = bb.questionnaire; if (!qq) return;
    var pid = bb.personId; if (!pid) return;
    var g = _ensureGraph();

    // Clear previous questionnaire-sourced records
    _clearBySource(g, "questionnaire");

    // 1. Create narrator person node
    var narratorName = "";
    if (qq.personal) {
      narratorName = qq.personal.fullName || qq.personal.preferredName || "";
    }
    if (!narratorName && typeof state !== "undefined" && state.profile && state.profile.basics) {
      narratorName = state.profile.basics.fullname || state.profile.basics.preferred || "";
    }
    var narratorNode = upsertPerson({
      id: "gp_narrator_" + pid.slice(0, 8),
      narratorId: pid,
      firstName: (qq.personal && qq.personal.fullName) ? qq.personal.fullName.split(" ")[0] : "",
      lastName: (qq.personal && qq.personal.fullName) ? qq.personal.fullName.split(" ").slice(-1)[0] : "",
      displayName: narratorName,
      isNarrator: true,
      source: "questionnaire",
      provenance: "questionnaire:personal"
    });

    // 2. Parents
    if (qq.parents && Array.isArray(qq.parents)) {
      qq.parents.forEach(function (p) {
        var name = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
        if (!name) return;
        var parentNode = upsertPerson({
          narratorId: pid,
          firstName: p.firstName || "",
          middleName: p.middleName || "",
          lastName: p.lastName || "",
          maidenName: p.maidenName || "",
          birthDate: p.birthDate || "",
          birthPlace: p.birthPlace || "",
          occupation: p.occupation || "",
          deceased: p.deceased === "Yes" || p.deceased === true,
          source: "questionnaire",
          provenance: "questionnaire:parents"
        });
        var subtype = _RELATION_TO_SUBTYPE[p.relation] || "biological";
        upsertRelationship({
          narratorId: pid,
          fromPersonId: parentNode.id,
          toPersonId: narratorNode.id,
          relationshipType: "parent",
          subtype: subtype,
          label: p.relation || "Parent",
          source: "questionnaire",
          provenance: "questionnaire:parents"
        });
      });
    }

    // 3. Grandparents
    if (qq.grandparents && Array.isArray(qq.grandparents)) {
      qq.grandparents.forEach(function (gp) {
        var name = [gp.firstName, gp.middleName, gp.lastName].filter(Boolean).join(" ");
        if (!name) return;
        var gpNode = upsertPerson({
          narratorId: pid,
          firstName: gp.firstName || "",
          middleName: gp.middleName || "",
          lastName: gp.lastName || "",
          maidenName: gp.maidenName || "",
          birthDate: gp.birthDate || "",
          birthPlace: gp.birthPlace || "",
          source: "questionnaire",
          provenance: "questionnaire:grandparents"
        });
        upsertRelationship({
          narratorId: pid,
          fromPersonId: gpNode.id,
          toPersonId: narratorNode.id,
          relationshipType: "grandparent",
          subtype: "biological",
          label: (gp.side || "") + " Grandparent",
          source: "questionnaire",
          provenance: "questionnaire:grandparents",
          meta: { side: gp.side || "", ancestry: gp.ancestry || "", culturalBackground: gp.culturalBackground || "" }
        });
      });
    }

    // 4. Siblings
    if (qq.siblings && Array.isArray(qq.siblings)) {
      qq.siblings.forEach(function (s) {
        var name = [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ");
        if (!name) return;
        var sibNode = upsertPerson({
          narratorId: pid,
          firstName: s.firstName || "",
          middleName: s.middleName || "",
          lastName: s.lastName || "",
          maidenName: s.maidenName || "",
          source: "questionnaire",
          provenance: "questionnaire:siblings"
        });
        var subtype = _RELATION_TO_SUBTYPE[s.relation] || "biological";
        upsertRelationship({
          narratorId: pid,
          fromPersonId: narratorNode.id,
          toPersonId: sibNode.id,
          relationshipType: "sibling",
          subtype: subtype,
          label: s.relation || "Sibling",
          source: "questionnaire",
          provenance: "questionnaire:siblings"
        });
      });
    }

    // 5. Children
    if (qq.children && Array.isArray(qq.children)) {
      qq.children.forEach(function (c) {
        var name = [c.firstName, c.middleName, c.lastName].filter(Boolean).join(" ");
        if (!name) return;
        var childNode = upsertPerson({
          narratorId: pid,
          firstName: c.firstName || "",
          middleName: c.middleName || "",
          lastName: c.lastName || "",
          birthDate: c.birthDate || "",
          birthPlace: c.birthPlace || "",
          source: "questionnaire",
          provenance: "questionnaire:children"
        });
        upsertRelationship({
          narratorId: pid,
          fromPersonId: narratorNode.id,
          toPersonId: childNode.id,
          relationshipType: "child",
          subtype: _RELATION_TO_SUBTYPE[c.relation] || "biological",
          label: c.relation || "Child",
          source: "questionnaire",
          provenance: "questionnaire:children"
        });
      });
    }

    // 6. Spouse / Partner (array-first)
    if (qq.spouse) {
      var spouseArr = Array.isArray(qq.spouse) ? qq.spouse : [qq.spouse];
      spouseArr.forEach(function (sp) {
        var name = [sp.firstName, sp.middleName, sp.lastName].filter(Boolean).join(" ");
        if (!name) return;
        var relLabel = sp.relationshipType || "Spouse";
        var relType = (relLabel === "Former Spouse") ? "former_spouse"
                    : (relLabel === "Partner" || relLabel === "Life Partner" || relLabel === "Domestic Partner") ? "partner"
                    : (relLabel === "Chosen Family") ? "chosen_family"
                    : "spouse";
        var subtype = _LABEL_TO_SUBTYPE[relLabel] || "spouse";

        var spNode = upsertPerson({
          narratorId: pid,
          firstName: sp.firstName || "",
          middleName: sp.middleName || "",
          lastName: sp.lastName || "",
          maidenName: sp.maidenName || "",
          birthDate: sp.birthDate || "",
          birthPlace: sp.birthPlace || "",
          occupation: sp.occupation || "",
          deceased: sp.deceased === "Yes" || sp.deceased === true,
          source: "questionnaire",
          provenance: "questionnaire:spouse"
        });
        upsertRelationship({
          narratorId: pid,
          fromPersonId: narratorNode.id,
          toPersonId: spNode.id,
          relationshipType: relType,
          subtype: subtype,
          label: relLabel,
          notes: sp.narrative || "",
          source: "questionnaire",
          provenance: "questionnaire:spouse"
        });
      });
    }

    // 7. Marriage (event overlay on spouse relationships)
    if (qq.marriage) {
      var marriageArr = Array.isArray(qq.marriage) ? qq.marriage : [qq.marriage];
      marriageArr.forEach(function (m) {
        if (!m.spouseReference && !m.marriageDate && !m.proposalStory && !m.weddingDetails) return;
        // Find the spouse person node by reference
        var spRef = m.spouseReference || "";
        var spNode = spRef ? findPersonByName(spRef) : null;
        if (spNode) {
          // Find the existing relationship and add marriage metadata
          var rels = getRelationshipsFor(spNode.id);
          rels.forEach(function (r) {
            if (r.fromPersonId === narratorNode.id || r.toPersonId === narratorNode.id) {
              r.startDate = m.marriageDate || r.startDate || "";
              r.meta = r.meta || {};
              r.meta.proposalStory = m.proposalStory || "";
              r.meta.weddingDetails = m.weddingDetails || "";
            }
          });
        }
      });
    }

    var personCount = Object.keys(g.persons).length;
    var relCount = Object.keys(g.relationships).length;
    console.log("[bb-graph] Synced from questionnaire: " + personCount + " persons, " + relCount + " relationships");

    return g;
  }

  /** Clear all graph records from a specific source */
  function _clearBySource(g, source) {
    Object.keys(g.relationships).forEach(function (id) {
      if (g.relationships[id].source === source) delete g.relationships[id];
    });
    Object.keys(g.persons).forEach(function (id) {
      // Don't remove narrator node on re-sync
      if (g.persons[id].source === source && !g.persons[id].isNarrator) delete g.persons[id];
    });
  }

  /* ───────────────────────────────────────────────────────────
     PROFILE KINSHIP → GRAPH SYNC
     Reads profile.kinship and writes graph records.
     Used as a secondary source alongside questionnaire.
  ─────────────────────────────────────────────────────────── */

  function syncFromProfile() {
    var bb = _bb(); if (!bb) return;
    if (typeof state === "undefined" || !state.profile) return;
    var pid = bb.personId; if (!pid) return;
    var g = _ensureGraph();

    var kinship = state.profile.kinship || [];
    if (!kinship.length) return;

    // Ensure narrator node exists
    var narratorId = "gp_narrator_" + pid.slice(0, 8);
    if (!g.persons[narratorId]) {
      var basics = state.profile.basics || {};
      upsertPerson({
        id: narratorId,
        narratorId: pid,
        displayName: basics.fullname || basics.preferred || "",
        isNarrator: true,
        source: "profile",
        provenance: "profile:basics"
      });
    }

    kinship.forEach(function (k) {
      if (!k.name) return;
      var rel = (k.relation || k.relationshipType || "").toLowerCase();
      var relType = "other";
      var subtype = "";
      var label = k.relation || k.relationshipType || "";

      // Map relation string to graph type + subtype
      if (/father|mother|parent/i.test(rel)) {
        relType = "parent";
        subtype = /step/i.test(rel) ? "step" : /adopt/i.test(rel) ? "adoptive" : /foster/i.test(rel) ? "foster" : "biological";
      } else if (/brother|sister|sibling/i.test(rel)) {
        relType = "sibling";
        subtype = /half/i.test(rel) ? "half" : /step/i.test(rel) ? "step" : /adopt/i.test(rel) ? "adoptive" : "biological";
      } else if (/spouse|wife|husband/i.test(rel)) {
        relType = /former/i.test(rel) ? "former_spouse" : "spouse";
        subtype = /former/i.test(rel) ? "former_spouse" : "spouse";
      } else if (/partner/i.test(rel)) {
        relType = "partner";
        subtype = /domestic/i.test(rel) ? "domestic_partner" : /life/i.test(rel) ? "life_partner" : /common/i.test(rel) ? "common_law" : "partner";
      } else if (/child|son|daughter/i.test(rel)) {
        relType = "child";
        subtype = /step/i.test(rel) ? "step" : /adopt/i.test(rel) ? "adoptive" : "biological";
      } else if (/grandparent|grandfather|grandmother/i.test(rel)) {
        relType = "grandparent";
        subtype = "biological";
      } else if (/grandchild|grandson|granddaughter/i.test(rel)) {
        relType = "grandchild";
        subtype = "biological";
      } else if (/guardian/i.test(rel)) {
        relType = "guardian";
        subtype = "legal_guardian";
      } else if (/chosen|intentional/i.test(rel)) {
        relType = "chosen_family";
        subtype = "chosen_family";
      }

      var parts = (k.name || "").trim().split(/\s+/);
      var personNode = upsertPerson({
        narratorId: pid,
        firstName: parts[0] || "",
        lastName: parts.length > 1 ? parts[parts.length - 1] : "",
        middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : "",
        maidenName: k.maidenName || "",
        displayName: k.name || "",
        birthDate: k.birthDate || "",
        birthPlace: k.pob || "",
        occupation: k.occupation || "",
        deceased: !!k.deceased,
        source: "profile",
        provenance: "profile:kinship"
      });

      // For parent/grandparent: from=person to=narrator
      // For child/grandchild: from=narrator to=person
      // For sibling/spouse/partner: from=narrator to=person
      var fromId, toId;
      if (relType === "parent" || relType === "grandparent" || relType === "guardian") {
        fromId = personNode.id;
        toId = narratorId;
      } else {
        fromId = narratorId;
        toId = personNode.id;
      }

      upsertRelationship({
        narratorId: pid,
        fromPersonId: fromId,
        toPersonId: toId,
        relationshipType: relType,
        subtype: subtype,
        label: label,
        notes: k.narrative || k.notes || "",
        source: "profile",
        provenance: "profile:kinship"
      });
    });

    // Also sync pets if present
    var pets = state.profile.pets || [];
    pets.forEach(function (pet) {
      if (!pet.name) return;
      upsertPerson({
        narratorId: pid,
        displayName: pet.name,
        firstName: pet.name,
        source: "profile",
        provenance: "profile:pets",
        meta: { species: pet.species || "", breed: pet.breed || "", isPet: true }
      });
    });

    console.log("[bb-graph] Synced from profile kinship: " + Object.keys(g.persons).length + " persons, " + Object.keys(g.relationships).length + " relationships");
  }

  /* ───────────────────────────────────────────────────────────
     BACKEND PERSISTENCE
     Backend is the truth authority. Graph is persisted as a
     full replace (PUT) and restored on narrator switch.
  ─────────────────────────────────────────────────────────── */

  function persistToBackend() {
    var bb = _bb(); if (!bb) return;
    var pid = bb.personId; if (!pid) return;
    var g = _ensureGraph();

    // Convert in-memory maps to arrays for API
    var persons = Object.values(g.persons).map(function (p) {
      return {
        id: p.id,
        display_name: p.displayName || "",
        first_name: p.firstName || "",
        middle_name: p.middleName || "",
        last_name: p.lastName || "",
        maiden_name: p.maidenName || "",
        birth_date: p.birthDate || "",
        birth_place: p.birthPlace || "",
        occupation: p.occupation || "",
        deceased: !!p.deceased,
        is_narrator: !!p.isNarrator,
        source: p.source || "manual",
        provenance: p.provenance || "",
        confidence: p.confidence || 1.0,
        meta: p.meta || {}
      };
    });

    var relationships = Object.values(g.relationships).map(function (r) {
      return {
        id: r.id,
        from_person_id: r.fromPersonId || "",
        to_person_id: r.toPersonId || "",
        relationship_type: r.relationshipType || "",
        subtype: r.subtype || "",
        label: r.label || "",
        status: r.status || "active",
        notes: r.notes || "",
        source: r.source || "manual",
        provenance: r.provenance || "",
        confidence: r.confidence || 1.0,
        start_date: r.startDate || "",
        end_date: r.endDate || "",
        meta: r.meta || {}
      };
    });

    fetch(API.GRAPH_PUT(pid), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persons: persons, relationships: relationships })
    })
    .then(function (r) {
      if (r.ok) console.log("[bb-graph] Graph persisted to backend for " + pid.slice(0, 8));
      else console.warn("[bb-graph] Backend persist failed: " + r.status);
    })
    .catch(function (e) {
      console.warn("[bb-graph] Backend persist error", e);
    });
  }

  function restoreFromBackend(pid) {
    if (!pid || typeof API === "undefined" || !API.GRAPH_GET) return;
    var bb = _bb(); if (!bb) return;

    return fetch(API.GRAPH_GET(pid))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) return;
        var g = _ensureGraph();

        // Restore persons
        if (j.persons && Array.isArray(j.persons)) {
          j.persons.forEach(function (p) {
            g.persons[p.id] = {
              id:           p.id,
              narratorId:   p.narrator_id || pid,
              displayName:  p.display_name || "",
              firstName:    p.first_name || "",
              middleName:   p.middle_name || "",
              lastName:     p.last_name || "",
              maidenName:   p.maiden_name || "",
              birthDate:    p.birth_date || "",
              birthPlace:   p.birth_place || "",
              occupation:   p.occupation || "",
              deceased:     !!p.deceased,
              isNarrator:   !!p.is_narrator,
              source:       p.source || "manual",
              provenance:   p.provenance || "",
              confidence:   p.confidence || 1.0,
              meta:         p.meta || {}
            };
          });
        }

        // Restore relationships
        if (j.relationships && Array.isArray(j.relationships)) {
          j.relationships.forEach(function (r) {
            g.relationships[r.id] = {
              id:               r.id,
              narratorId:       r.narrator_id || pid,
              fromPersonId:     r.from_person_id || "",
              toPersonId:       r.to_person_id || "",
              relationshipType: r.relationship_type || "",
              subtype:          r.subtype || "",
              label:            r.label || "",
              status:           r.status || "active",
              notes:            r.notes || "",
              source:           r.source || "manual",
              provenance:       r.provenance || "",
              confidence:       r.confidence || 1.0,
              startDate:        r.start_date || "",
              endDate:          r.end_date || "",
              meta:             r.meta || {}
            };
          });
        }

        var pc = Object.keys(g.persons).length;
        var rc = Object.keys(g.relationships).length;
        if (pc > 0 || rc > 0) {
          console.log("[bb-graph] ✅ Graph restored from backend: " + pc + " persons, " + rc + " relationships for " + pid.slice(0, 8));
        }
      })
      .catch(function (e) {
        console.warn("[bb-graph] Backend graph restore failed", e);
      });
  }

  /* ───────────────────────────────────────────────────────────
     GRAPH → FAMILY TREE BRIDGE
     Provides graph data in the format family tree seeding expects.
  ─────────────────────────────────────────────────────────── */

  function getGraphForFamilyTree() {
    var g = _ensureGraph(); if (!g) return { nodes: [], edges: [] };

    var nodes = Object.values(g.persons).map(function (p) {
      var role = "other";
      if (p.isNarrator) role = "narrator";
      else {
        // Determine role from relationships
        var rels = getRelationshipsFor(p.id);
        for (var i = 0; i < rels.length; i++) {
          var r = rels[i];
          if (r.relationshipType === "parent" && r.fromPersonId === p.id) { role = "parent"; break; }
          if (r.relationshipType === "child" && r.toPersonId === p.id) { role = "child"; break; }
          if (r.relationshipType === "sibling") { role = "sibling"; break; }
          if (r.relationshipType === "spouse" || r.relationshipType === "partner") { role = "spouse"; break; }
          if (r.relationshipType === "former_spouse") { role = "spouse"; break; }
          if (r.relationshipType === "grandparent" && r.fromPersonId === p.id) { role = "grandparent"; break; }
          if (r.relationshipType === "grandchild" && r.toPersonId === p.id) { role = "grandchild"; break; }
          if (r.relationshipType === "guardian") { role = "guardian"; break; }
          if (r.relationshipType === "chosen_family") { role = "chosen_family"; break; }
        }
      }

      // Extract birth year from birthDate
      var birthYear = "";
      if (p.birthDate) {
        var m = p.birthDate.match(/\d{4}/);
        if (m) birthYear = m[0];
      }

      return {
        id: "ft_" + p.id,
        graphPersonId: p.id,
        role: role,
        displayName: p.displayName || "",
        preferredName: "",
        birthYear: birthYear,
        deathYear: "",
        notes: "",
        source: "graph",
        sourceRef: p.id,
        deceased: p.deceased || false
      };
    });

    var edges = Object.values(g.relationships).map(function (r) {
      return {
        id: "fte_" + r.id,
        graphRelId: r.id,
        from: "ft_" + r.fromPersonId,
        to: "ft_" + r.toPersonId,
        relType: _mapRelTypeToFT(r.relationshipType, r.subtype),
        label: r.label || r.relationshipType || "",
        notes: r.notes || "",
        source: "graph"
      };
    });

    return { nodes: nodes, edges: edges };
  }

  /** Map graph relationship types to family tree edge types */
  function _mapRelTypeToFT(relType, subtype) {
    if (relType === "parent" || relType === "child" || relType === "grandparent" || relType === "grandchild") {
      if (subtype === "adoptive") return "adoptive";
      if (subtype === "step") return "step";
      if (subtype === "half") return "half";
      if (subtype === "foster") return "foster";
      return "biological";
    }
    if (relType === "spouse") return "marriage";
    if (relType === "former_spouse") return "former_marriage";
    if (relType === "partner") return "partnership";
    if (relType === "guardian") return "guardian";
    if (relType === "chosen_family") return "chosen_family";
    if (relType === "sibling") {
      if (subtype === "half") return "half";
      if (subtype === "step") return "step";
      return "biological";
    }
    return "other";
  }

  /* ───────────────────────────────────────────────────────────
     FULL SYNC PIPELINE
     Orchestrates a complete sync: questionnaire + profile → graph → backend
  ─────────────────────────────────────────────────────────── */

  function fullSync() {
    var bb = _bb(); if (!bb || !bb.personId) return;
    _ensureGraph();
    syncFromQuestionnaire();
    syncFromProfile();
    persistToBackend();
    console.log("[bb-graph] Full sync complete for " + bb.personId.slice(0, 8));
  }

  /* ───────────────────────────────────────────────────────────
     NARRATOR SWITCH INTEGRATION
     Register as a post-switch hook so graph restores on narrator change.
  ─────────────────────────────────────────────────────────── */

  function onNarratorSwitch(bb) {
    if (!bb || !bb.personId) return;
    // Clear graph for new narrator
    bb.graph = { persons: {}, relationships: {} };
    // Restore from backend (async, overwrites when data arrives)
    restoreFromBackend(bb.personId);
  }

  // Register hook
  if (coreMod._registerPostSwitchHook) {
    coreMod._registerPostSwitchHook(onNarratorSwitch);
  }

  /* ───────────────────────────────────────────────────────────
     GRAPH STATISTICS (for debug/verification)
  ─────────────────────────────────────────────────────────── */

  function getStats() {
    var g = _ensureGraph(); if (!g) return {};
    var persons = Object.values(g.persons);
    var rels = Object.values(g.relationships);

    var typeCounts = {};
    rels.forEach(function (r) {
      typeCounts[r.relationshipType] = (typeCounts[r.relationshipType] || 0) + 1;
    });

    var sourceCounts = {};
    persons.forEach(function (p) {
      sourceCounts[p.source] = (sourceCounts[p.source] || 0) + 1;
    });

    return {
      personCount: persons.length,
      relationshipCount: rels.length,
      typeCounts: typeCounts,
      sourceCounts: sourceCounts,
      narratorNode: persons.find(function (p) { return p.isNarrator; }) || null
    };
  }

  /* ───────────────────────────────────────────────────────────
     EXPORT MODULE
  ─────────────────────────────────────────────────────────── */

  window.LorevoxBioBuilderModules.graph = {
    // State
    _ensureGraph:           _ensureGraph,

    // Person CRUD
    upsertPerson:           upsertPerson,
    removePerson:           removePerson,
    findPersonByName:       findPersonByName,

    // Relationship CRUD
    upsertRelationship:     upsertRelationship,
    removeRelationship:     removeRelationship,
    getRelationshipsFor:    getRelationshipsFor,

    // Sync pipelines
    syncFromQuestionnaire:  syncFromQuestionnaire,
    syncFromProfile:        syncFromProfile,
    fullSync:               fullSync,

    // Backend persistence
    persistToBackend:       persistToBackend,
    restoreFromBackend:     restoreFromBackend,

    // Family tree bridge
    getGraphForFamilyTree:  getGraphForFamilyTree,

    // Debug
    getStats:               getStats,

    // Constants
    RELATIONSHIP_TYPES:     RELATIONSHIP_TYPES,
    SUBTYPES:               SUBTYPES
  };

  console.log("[bb-graph] Phase Q.1 Relationship Graph Layer loaded");

})();
