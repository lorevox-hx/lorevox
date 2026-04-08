/* ═══════════════════════════════════════════════════════════════
   bio-promotion-adapters.js — Lorevox Phase E → F bridge

   Purpose
   ───────
   Take approved Bio Builder items from Phase E (which land in
   state.bioBuilder.review.promoted[type]) and normalise them into
   state.structuredBio — the clean intermediate store that Phase F
   (Life Map, Timeline, Peek at Memoir) reads from.

   Layering contract
   ─────────────────
   Phase D   →  source intake + candidates  (state.bioBuilder.candidates)
   Phase E   →  human review + approval     (state.bioBuilder.review.promoted)
   Adapters  →  normalisation + dedup       (state.structuredBio)
   Phase F   →  derived views               (buildLifeMapFeed etc.)

   Truth rules
   ───────────
   - Only approved items may pass through here (_phaseFPromoted guard)
   - Adapters do NOT write directly to state.archive / state.facts
     / state.timeline
   - Every structured item retains full provenance
   - Duplicate items (same value, same type) are merge-skipped, not added twice
   - syncPhaseFFeedsToState() writes only to state.phaseFFeeds (derived)

   Load order: after bio-review.js
   Exposes: window.LorevoxPromotionAdapters
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  if (window.LorevoxPromotionAdapters) return;

  var NS = {};

  /* ── State bootstrap ──────────────────────────────────────── */

  function _ensureState() {
    if (!window.state) window.state = {};

    if (!state.bioBuilder) state.bioBuilder = {};
    if (!state.bioBuilder.review) state.bioBuilder.review = {};
    if (!state.bioBuilder.review.promoted) {
      state.bioBuilder.review.promoted = {
        people: [], relationships: [], memories: [],
        events: [], places: [], documents: []
      };
    }

    /* Structured store — normalised, approved biography data.
       This is the only store Phase F should read from. */
    if (!state.structuredBio) {
      state.structuredBio = {
        people:        [],
        relationships: [],
        memories:      [],
        events:        [],
        places:        [],
        documents:     [],
        promotionLog:  []
      };
    }
  }

  /* ── Utilities ────────────────────────────────────────────── */

  function _now()  { return new Date().toISOString(); }
  function _safe(v) { return String(v == null ? "" : v).trim(); }
  function _slug(v) {
    return _safe(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
  }

  function _makeId(prefix, item) {
    var base = _safe(item.value || item.label || item.name || item.title || "item");
    return prefix + "_" + _slug(base) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function _provenance(item) {
    return {
      sourceType:  item.sourceType  || "source_inbox",
      sourceId:    item.sourceId    || null,
      sourceLabel: item.sourceFilename || item.sourceLabel || null,
      snippet:     item.snippet     || "",
      confidence:  item.confidence  || "low",
      approvedAt:  item.approvedAt  || _now()
    };
  }

  function _log(entry) {
    _ensureState();
    state.structuredBio.promotionLog.push(Object.assign({ at: _now() }, entry));
  }

  /* Find an existing structured item by value (case-insensitive). */
  function _findByValue(bucket, value) {
    var v = _safe(value).toLowerCase();
    if (!v) return null;
    return bucket.find(function (item) {
      return _safe(item.value || item.name || item.title || item.label).toLowerCase() === v;
    }) || null;
  }

  /* ── Type adapters ────────────────────────────────────────── */

  /* Helper: extract any extra data Phase D stored in the nested data object */
  function _d(item, key) {
    return (item.data && item.data[key]) ? _safe(item.data[key]) : "";
  }

  function _adaptPerson(item) {
    _ensureState();
    var existing = _findByValue(state.structuredBio.people, item.value);
    if (existing) {
      _log({ action: "merge-skip", type: "person", promotedId: existing.id, sourceId: item.sourceId, note: "Duplicate by value." });
      return existing;
    }
    var s = {
      id:       _makeId("person", item),
      type:     "person",
      value:    _safe(item.value),
      name:     _safe(item.value || item.label),
      label:    _safe(item.label),
      relation: _safe(item.relation || _d(item, "relation")),
      aliases:  [],
      notes:    _safe(item.note || _d(item, "notes")),
      provenance: [_provenance(item)],
      verified: true,
      createdFrom: "bio_builder_phase_e"
    };
    state.structuredBio.people.push(s);
    _log({ action: "promote", type: "person", promotedId: s.id, sourceId: item.sourceId });
    return s;
  }

  function _adaptRelationship(item) {
    _ensureState();
    var s = {
      id:               _makeId("rel", item),
      type:             "relationship",
      value:            _safe(item.value),
      label:            _safe(item.label || item.value),
      relationshipType: _safe(item.relationshipType || _d(item, "relation")),
      personA:          _safe(item.personA || _d(item, "personA")),
      personB:          _safe(item.personB || _d(item, "personB")),
      notes:            _safe(item.note),
      provenance:       [_provenance(item)],
      verified:         true,
      createdFrom:      "bio_builder_phase_e"
    };
    state.structuredBio.relationships.push(s);
    _log({ action: "promote", type: "relationship", promotedId: s.id, sourceId: item.sourceId });
    return s;
  }

  function _adaptMemory(item) {
    _ensureState();
    var s = {
      id:              _makeId("memory", item),
      type:            "memory",
      value:           _safe(item.value),
      title:           _safe(item.label || item.value),
      summary:         _safe(item.note || item.snippet || _d(item, "text") || item.value),
      snippet:         _safe(item.snippet || _d(item, "context")),
      year:            item.year || null,
      place:           _safe(item.place || ""),
      peopleMentioned: Array.isArray(item.peopleMentioned) ? item.peopleMentioned : [],
      themes:          Array.isArray(item.themes)          ? item.themes          : [],
      provenance:      [_provenance(item)],
      verified:        true,
      createdFrom:     "bio_builder_phase_e"
    };
    state.structuredBio.memories.push(s);
    _log({ action: "promote", type: "memory", promotedId: s.id, sourceId: item.sourceId });
    return s;
  }

  function _adaptEvent(item) {
    _ensureState();
    var s = {
      id:          _makeId("event", item),
      type:        "event",
      value:       _safe(item.value),
      title:       _safe(item.label || item.value),
      eventType:   _safe(item.eventType || ""),
      year:        item.year || null,
      displayDate: _safe(item.displayDate || item.year || _d(item, "text") || ""),
      place:       _safe(item.place || ""),
      summary:     _safe(item.note || item.snippet || _d(item, "context") || item.value),
      provenance:  [_provenance(item)],
      verified:    true,
      createdFrom: "bio_builder_phase_e"
    };
    state.structuredBio.events.push(s);
    _log({ action: "promote", type: "event", promotedId: s.id, sourceId: item.sourceId });
    return s;
  }

  function _adaptPlace(item) {
    _ensureState();
    var existing = _findByValue(state.structuredBio.places, item.value);
    if (existing) {
      _log({ action: "merge-skip", type: "place", promotedId: existing.id, sourceId: item.sourceId, note: "Duplicate by value." });
      return existing;
    }
    var s = {
      id:          _makeId("place", item),
      type:        "place",
      value:       _safe(item.value),
      name:        _safe(item.value || item.label),
      label:       _safe(item.label),
      notes:       _safe(item.note || _d(item, "context")),
      provenance:  [_provenance(item)],
      verified:    true,
      createdFrom: "bio_builder_phase_e"
    };
    state.structuredBio.places.push(s);
    _log({ action: "promote", type: "place", promotedId: s.id, sourceId: item.sourceId });
    return s;
  }

  function _adaptDocument(item) {
    _ensureState();
    var s = {
      id:          _makeId("doc", item),
      type:        "document",
      value:       _safe(item.value),
      title:       _safe(item.label || item.value || item.sourceFilename),
      filename:    _safe(item.sourceFilename || item.label || ""),
      summary:     _safe(item.note || item.snippet || ""),
      provenance:  [_provenance(item)],
      verified:    true,
      createdFrom: "bio_builder_phase_e"
    };
    state.structuredBio.documents.push(s);
    _log({ action: "promote", type: "document", promotedId: s.id, sourceId: item.sourceId });
    return s;
  }

  /* ── Dispatch ─────────────────────────────────────────────── */

  function _adaptItem(type, item) {
    switch (type) {
      case "people":        return _adaptPerson(item);
      case "relationships": return _adaptRelationship(item);
      case "memories":      return _adaptMemory(item);
      case "events":        return _adaptEvent(item);
      case "places":        return _adaptPlace(item);
      case "documents":     return _adaptDocument(item);
      default: throw new Error("bio-promotion-adapters: unknown type: " + type);
    }
  }

  /* ── Bucket promoter ──────────────────────────────────────── */

  /* Promote all un-promoted items in one type bucket.
     Returns the array of newly structured items. */
  function promoteApprovedBucket(type) {
    _ensureState();
    var bucket = state.bioBuilder.review.promoted[type];
    if (!Array.isArray(bucket)) return [];
    var results = [];
    bucket.forEach(function (item) {
      if (item._phaseFPromoted) return;   // idempotent guard
      var structured        = _adaptItem(type, item);
      item._phaseFPromoted  = true;
      item._structuredId    = structured.id;
      results.push(structured);
    });
    return results;
  }

  /* Promote all approved buckets in one call. */
  function promoteAllApproved() {
    _ensureState();
    var result = {};
    ["people","relationships","memories","events","places","documents"].forEach(function (t) {
      result[t] = promoteApprovedBucket(t);
    });
    return result;
  }

  /* ── Phase F feed builders ────────────────────────────────── */

  /* Life Map: people, memories, events, places as flat arrays of
     { id, label, type, year?, summary?, provenance }.
     Does NOT mutate life-map.js state — caller decides when to use it. */
  function buildLifeMapFeed() {
    _ensureState();
    var b = state.structuredBio;
    return {
      people:   b.people.map(function (p)   { return { id: p.id, label: p.name  || p.value, type: "person",   provenance: p.provenance }; }),
      memories: b.memories.map(function (m) { return { id: m.id, label: m.title || m.value, type: "memory",   year: m.year, summary: m.summary, provenance: m.provenance }; }),
      events:   b.events.map(function (e)   { return { id: e.id, label: e.title || e.value, type: "event",    year: e.year, place: e.place, provenance: e.provenance }; }),
      places:   b.places.map(function (pl)  { return { id: pl.id, label: pl.name || pl.value, type: "place",  provenance: pl.provenance }; })
    };
  }

  /* Timeline: events and memories sorted by year asc.
     Items without a year sort to the end. */
  function buildTimelineFeed() {
    _ensureState();
    var b   = state.structuredBio;
    var rows = [];
    b.events.forEach(function (e) {
      rows.push({ id: e.id, kind: "event",  title: e.title || e.value, year: e.year, displayDate: e.displayDate, place: e.place, summary: e.summary, provenance: e.provenance });
    });
    b.memories.forEach(function (m) {
      rows.push({ id: m.id, kind: "memory", title: m.title || m.value, year: m.year, place: m.place, summary: m.summary, provenance: m.provenance });
    });
    rows.sort(function (a, b) {
      var ay = Number(a.year || 99999);
      var by = Number(b.year || 99999);
      return ay - by;
    });
    return rows;
  }

  /* Memoir preview: memories and events as scene/theme stubs.
     These are seeds, not final memoir paragraphs. */
  function buildMemoirPreviewFeed() {
    _ensureState();
    var b = state.structuredBio;
    return {
      memories: b.memories.map(function (m) { return { id: m.id, title: m.title || m.value, summary: m.summary, year: m.year, theme: (m.themes && m.themes[0]) || null, provenance: m.provenance }; }),
      events:   b.events.map(function (e)   { return { id: e.id, title: e.title || e.value, summary: e.summary, year: e.year, provenance: e.provenance }; })
    };
  }

  /* Persist all three derived feeds into state.phaseFFeeds.
     Phase F consumers can call this after bulk-promoting. */
  function syncPhaseFFeedsToState() {
    _ensureState();
    if (!state.phaseFFeeds) {
      state.phaseFFeeds = { lifeMap: null, timeline: null, memoirPreview: null, lastSyncedAt: null };
    }
    state.phaseFFeeds.lifeMap       = buildLifeMapFeed();
    state.phaseFFeeds.timeline      = buildTimelineFeed();
    state.phaseFFeeds.memoirPreview = buildMemoirPreviewFeed();
    state.phaseFFeeds.lastSyncedAt  = _now();
    return state.phaseFFeeds;
  }

  /* ── v5/v6 — Draft-enriched memoir context ───────────────── */
  /* Returns supplementary relationship and theme context from the
     Bio Builder draft surfaces, suitable for enriching memoir narrative
     prompts WITHOUT writing to truth layers.
     v6: When `era` is provided and the era-aware accessor exists,
     returns only items relevant to that era (chapter-scoped context).
     Falls back to global v5 path when no era or accessor unavailable. */
  function buildDraftMemoirContext(era) {
    var BB = window.LorevoxBioBuilder;
    if (typeof BB === "undefined" || !BB._getDraftFamilyContext) return null;

    var people = [];
    var themes = [];
    var places = [];
    var isEraScoped = false;

    // v6 path: era-aware accessor for chapter-scoped context
    if (era && typeof BB._getDraftFamilyContextForEra === "function") {
      var eraCtx = BB._getDraftFamilyContextForEra(null, era);
      if (eraCtx) {
        isEraScoped = true;
        var items = (eraCtx.primary || []).concat(eraCtx.secondary || []);
        items.forEach(function (it) {
          if (!it) return;
          // Respect "Do Not Prompt"
          if (it.notes && /do\s*not\s*prompt/i.test(it.notes)) return;
          var label = _safe(it.displayName || it.preferredName || it.label);
          if (!label) return;
          if (it.role && it.role !== "narrator") {
            people.push({ label: label, role: it.role, source: "family_tree_draft", eraRelevance: it.score || null });
          } else if (it.type === "theme") {
            themes.push({ label: label, source: "life_threads_draft", eraRelevance: it.score || null });
          } else if (it.type === "place") {
            places.push({ label: label, source: "life_threads_draft", eraRelevance: it.score || null });
          }
        });
      }
    }

    // v5 fallback: global context (no era filtering)
    if (!isEraScoped) {
      var ctx = BB._getDraftFamilyContext();
      if (!ctx) return null;

      // Extract FT people (skip narrator, respect "Do Not Prompt")
      if (ctx.familyTree && Array.isArray(ctx.familyTree.nodes)) {
        ctx.familyTree.nodes.forEach(function (n) {
          if (n.role === "narrator") return;
          if (n.notes && /do\s*not\s*prompt/i.test(n.notes)) return;
          var label = _safe(n.displayName || n.preferredName || n.label);
          if (label) people.push({ label: label, role: n.role || "other", source: "family_tree_draft" });
        });
      }

      // Extract LT themes and places
      if (ctx.lifeThreads && Array.isArray(ctx.lifeThreads.nodes)) {
        ctx.lifeThreads.nodes.forEach(function (n) {
          var label = _safe(n.label || n.displayName);
          if (!label) return;
          if (n.type === "theme") themes.push({ label: label, source: "life_threads_draft" });
          else if (n.type === "place") places.push({ label: label, source: "life_threads_draft" });
        });
      }
    }

    if (people.length === 0 && themes.length === 0 && places.length === 0) return null;

    return {
      people:      people,
      themes:      themes,
      places:      places,
      isDraft:     true,
      isEraScoped: isEraScoped,
      era:         era || null,
      note:        isEraScoped
        ? "Era-scoped draft context from Bio Builder for " + era + " — not yet approved or promoted."
        : "Draft context from Bio Builder — not yet approved or promoted."
    };
  }

  /* ── Public API ───────────────────────────────────────────── */

  NS.promoteApprovedBucket   = promoteApprovedBucket;
  NS.promoteAllApproved      = promoteAllApproved;

  NS.adaptPerson       = _adaptPerson;
  NS.adaptRelationship = _adaptRelationship;
  NS.adaptMemory       = _adaptMemory;
  NS.adaptEvent        = _adaptEvent;
  NS.adaptPlace        = _adaptPlace;
  NS.adaptDocument     = _adaptDocument;

  NS.buildLifeMapFeed           = buildLifeMapFeed;
  NS.buildTimelineFeed         = buildTimelineFeed;
  NS.buildMemoirPreviewFeed    = buildMemoirPreviewFeed;
  NS.buildDraftMemoirContext   = buildDraftMemoirContext;  // v5
  NS.syncPhaseFFeedsToState    = syncPhaseFFeedsToState;

  window.LorevoxPromotionAdapters = NS;

})();
