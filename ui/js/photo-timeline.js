/* ═══════════════════════════════════════════════════════════════
   photo-timeline.js — WO-LORI-PHOTO-SHARED-01 §14

   Shared, read-only view. Talks to:
     GET /api/people
     GET /api/photos?narrator_id=...
     GET /api/photos/{photo_id}    (hydrate when group-by needs memories)

   No editing, no session controls. Groups photos by decade → year,
   with an `Undated` bucket for photos lacking `date_value`.
═══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var ORIGIN = window.LOREVOX_API || "http://localhost:8000";
  var LS_NARRATOR = "pi_narrator_id_v1"; // reuse intake's key so the two pages share a selection

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    narrator: $("ptNarrator"),
    body:     $("ptBody"),
    empty:    $("ptEmpty"),
    modal:    $("ptModal"),
    modalImg: $("ptModalImg"),
  };

  // ── Narrator picker ──────────────────────────────────────────
  function loadNarrators() {
    return fetch(ORIGIN + "/api/people")
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (people) {
        var items = Array.isArray(people) ? people
                   : (people && Array.isArray(people.people) ? people.people : []);
        el.narrator.innerHTML = "";
        if (!items.length) {
          el.narrator.innerHTML = '<option value="">— no narrators —</option>';
          return;
        }
        items.forEach(function (p) {
          var opt = document.createElement("option");
          opt.value = p.id || p.person_id || "";
          opt.textContent = p.display_name || p.name || opt.value;
          el.narrator.appendChild(opt);
        });
        var saved = localStorage.getItem(LS_NARRATOR);
        if (saved) {
          var opts = Array.from(el.narrator.options).map(function(o){return o.value;});
          if (opts.indexOf(saved) >= 0) el.narrator.value = saved;
        }
      })
      .catch(function () {
        el.narrator.innerHTML = '<option value="">— /api/people unavailable —</option>';
      });
  }

  el.narrator.addEventListener("change", function () {
    localStorage.setItem(LS_NARRATOR, el.narrator.value);
    refreshTimeline();
  });

  // ── Decade / year grouping ───────────────────────────────────
  function extractYear(photo) {
    var dv = photo.date_value;
    if (!dv || typeof dv !== "string") return null;
    var m = dv.match(/^(\d{4})/);
    return m ? parseInt(m[1], 10) : null;
  }

  function decadeFor(year) {
    if (year == null) return "Undated";
    return (Math.floor(year / 10) * 10) + "s";
  }

  function groupPhotos(photos) {
    // decades: { "1960s": { "1967": [...], "1968": [...], "Unknown year": [...] }, ..., "Undated": { ... } }
    var decades = {};
    photos.forEach(function (p) {
      var y = extractYear(p);
      var d = decadeFor(y);
      var yearKey = y ? String(y) : "Unknown year";
      if (!decades[d]) decades[d] = {};
      if (!decades[d][yearKey]) decades[d][yearKey] = [];
      decades[d][yearKey].push(p);
    });
    return decades;
  }

  function orderedDecadeKeys(decades) {
    var keys = Object.keys(decades);
    // Put "Undated" last, otherwise descending chronological.
    var dated = keys.filter(function (k) { return k !== "Undated"; });
    dated.sort(function (a, b) { return parseInt(b, 10) - parseInt(a, 10); });
    if (keys.indexOf("Undated") >= 0) dated.push("Undated");
    return dated;
  }

  function orderedYearKeys(yearMap) {
    var keys = Object.keys(yearMap);
    var known = keys.filter(function (k) { return k !== "Unknown year"; });
    known.sort(function (a, b) { return parseInt(b, 10) - parseInt(a, 10); });
    if (keys.indexOf("Unknown year") >= 0) known.push("Unknown year");
    return known;
  }

  // ── Render ───────────────────────────────────────────────────
  function refreshTimeline() {
    var narratorId = el.narrator.value;
    el.body.innerHTML = "";
    if (!narratorId) {
      el.body.innerHTML = '<div class="pt-empty">Pick a narrator to see their timeline.</div>';
      return;
    }
    el.body.innerHTML = '<div class="pt-empty">Loading…</div>';
    fetch(ORIGIN + "/api/photos?narrator_id=" + encodeURIComponent(narratorId))
      .then(function (r) { return r.ok ? r.json() : { photos: [] }; })
      .then(function (body) {
        var photos = Array.isArray(body) ? body : (body.photos || []);
        if (!photos.length) {
          el.body.innerHTML = '<div class="pt-empty">No photos saved yet.</div>';
          return;
        }
        renderTimeline(photos);
      })
      .catch(function () {
        el.body.innerHTML = '<div class="pt-empty">Could not load photos.</div>';
      });
  }

  function renderTimeline(photos) {
    var decades = groupPhotos(photos);
    el.body.innerHTML = "";
    orderedDecadeKeys(decades).forEach(function (decKey) {
      var decWrap = document.createElement("div");
      decWrap.className = "pt-decade";
      var h = document.createElement("div");
      h.className = "pt-decade-header";
      h.textContent = decKey;
      decWrap.appendChild(h);

      var yearMap = decades[decKey];
      orderedYearKeys(yearMap).forEach(function (yearKey) {
        var yearWrap = document.createElement("div");
        yearWrap.className = "pt-year";
        var yh = document.createElement("div");
        yh.className = "pt-year-header";
        yh.textContent = yearKey;
        yearWrap.appendChild(yh);

        var grid = document.createElement("div");
        grid.className = "pt-grid";
        (yearMap[yearKey] || []).forEach(function (p) { grid.appendChild(renderCard(p)); });
        yearWrap.appendChild(grid);
        decWrap.appendChild(yearWrap);
      });

      el.body.appendChild(decWrap);
    });
  }

  function renderCard(photo) {
    var card = document.createElement("div");
    card.className = "pt-card";

    var img = document.createElement("img");
    img.className = "pt-thumb";
    img.alt = "";
    img.src = photo.thumbnail_url || photo.media_url || "";
    img.addEventListener("click", function () { openModal(photo.media_url || photo.thumbnail_url); });
    card.appendChild(img);

    var title = document.createElement("div");
    title.className = "pt-title";
    title.textContent = (photo.description || "(no description)").slice(0, 80);
    card.appendChild(title);

    var metaBits = [];
    if (photo.date_value) {
      metaBits.push(photo.date_value + (photo.date_precision && photo.date_precision !== "unknown"
        ? " (" + photo.date_precision + ")" : ""));
    }
    if (photo.location_label) metaBits.push(photo.location_label);
    if (metaBits.length) {
      var meta = document.createElement("div");
      meta.className = "pt-meta";
      meta.textContent = metaBits.join(" · ");
      card.appendChild(meta);
    }

    var pills = document.createElement("div");
    pills.className = "pt-pills";

    // People count pill
    var peopleCount = Array.isArray(photo.people) ? photo.people.length
                     : (typeof photo.people_count === "number" ? photo.people_count : 0);
    if (peopleCount) {
      var pp = document.createElement("span");
      pp.className = "pt-pill";
      pp.textContent = peopleCount + " " + (peopleCount === 1 ? "person" : "people");
      pills.appendChild(pp);
    }

    // Memory-transcript count pill (hydrate from the detail endpoint).
    var memoryCount = (typeof photo.memory_count === "number") ? photo.memory_count : null;
    if (memoryCount == null) {
      // Best-effort hydration — swap the pill when the fetch lands.
      var placeholder = document.createElement("span");
      placeholder.className = "pt-pill memory";
      placeholder.textContent = "…";
      pills.appendChild(placeholder);
      fetch(ORIGIN + "/api/photos/" + encodeURIComponent(photo.id))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (body) {
          if (!body) return;
          var mem = Array.isArray(body.memories) ? body.memories
                   : (typeof body.memory_count === "number" ? body.memory_count : 0);
          var n = typeof mem === "number" ? mem : mem.length;
          if (n > 0) {
            placeholder.textContent = n + " " + (n === 1 ? "story" : "stories");
          } else {
            placeholder.remove();
          }
        })
        .catch(function () { placeholder.remove(); });
    } else if (memoryCount > 0) {
      var mp = document.createElement("span");
      mp.className = "pt-pill memory";
      mp.textContent = memoryCount + " " + (memoryCount === 1 ? "story" : "stories");
      pills.appendChild(mp);
    }

    if (pills.childNodes.length) card.appendChild(pills);
    return card;
  }

  // ── Preview modal ────────────────────────────────────────────
  function openModal(src) {
    if (!src) return;
    el.modalImg.src = src;
    el.modal.style.display = "flex";
  }
  el.modal.addEventListener("click", function () {
    el.modal.style.display = "none";
    el.modalImg.src = "";
  });

  // ── Bootstrap ────────────────────────────────────────────────
  loadNarrators().then(refreshTimeline);
})();
