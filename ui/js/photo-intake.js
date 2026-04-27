/* ═══════════════════════════════════════════════════════════════
   photo-intake.js — WO-LORI-PHOTO-SHARED-01 §14

   Curator-only page. Talks to:
     POST   /api/photos           (multipart)
     GET    /api/photos?narrator_id=...
     PATCH  /api/photos/{id}      (narrator_ready toggle)
     DELETE /api/photos/{id}      (soft delete)
     GET    /api/people           (narrator picker)

   No WO-10C timers here. No narrator session controls.
═══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var ORIGIN = window.LOREVOX_API || "http://localhost:8000";
  var LS_NARRATOR   = "pi_narrator_id_v1";
  var LS_CURATOR    = "pi_curator_user_id_v1";

  // BUG-PHOTO-URL-RELATIVE-RESOLVES-TO-UI-PORT (2026-04-26 morning):
  // backend synthesizes /api/photos/{id}/thumb and /image as RELATIVE
  // paths. The page is served from port 8082 (lorevox-serve.py) but
  // the API lives on port 8000 (FastAPI). Without origin prefix the
  // browser hits :8082 which 404s. Prepend ORIGIN when URL starts
  // with / and isn't already absolute.
  function _resolveApiUrl(u) {
    if (!u) return "";
    var s = String(u);
    if (s.indexOf("http://") === 0 || s.indexOf("https://") === 0 || s.indexOf("data:") === 0 || s.indexOf("blob:") === 0) return s;
    if (s.charAt(0) === "/") return ORIGIN + s;
    return s;
  }

  var $  = function (id) { return document.getElementById(id); };
  var el = {
    narrator:        $("piNarrator"),
    file:            $("piFile"),
    description:     $("piDescription"),
    dateValue:       $("piDateValue"),
    datePrecision:   $("piDatePrecision"),
    locationLabel:   $("piLocationLabel"),
    locationSource:  $("piLocationSource"),
    peopleList:      $("piPeopleList"),
    addPerson:       $("piAddPersonBtn"),
    eventsList:      $("piEventsList"),
    addEvent:        $("piAddEventBtn"),
    narratorReady:   $("piNarratorReady"),
    save:            $("piSaveBtn"),
    reset:           $("piResetBtn"),
    status:          $("piStatus"),
    list:            $("piList"),
    listStatus:      $("piListStatus"),

    // Review File Info preview (visualschedulebot pattern)
    thumbPreview:        $("piThumbPreview"),
    thumbPreviewImg:     $("piThumbPreviewImg"),
    reviewBtn:           $("piReviewBtn"),
    reviewStatus:        $("piReviewStatus"),
    descriptionSource:   $("piDescriptionSource"),
    dateSource:          $("piDateSource"),
    locationSourcePill:  $("piLocationSourcePill"),

    // Batch upload (multi-file + EXIF auto-fill)
    batchNarrator:      $("piBatchNarrator"),
    batchNarratorReady: $("piBatchNarratorReady"),
    batchFile:          $("piBatchFile"),
    dropzone:           $("piDropzone"),
    batchStart:         $("piBatchStartBtn"),
    batchClear:         $("piBatchClearBtn"),
    batchStatus:        $("piBatchStatus"),
    batchQueue:         $("piBatchQueue"),

    // View / Edit modal (BUG-239)
    modalBackdrop:        $("piModalBackdrop"),
    modalTitle:           $("piModalTitle"),
    modalImage:           $("piModalImage"),
    modalSourceAttr:      $("piModalSourceAttr"),
    modalDescription:     $("piModalDescription"),
    modalDateValue:       $("piModalDateValue"),
    modalDateHint:        $("piModalDateHint"),
    modalDatePrecision:   $("piModalDatePrecision"),
    modalLocationLabel:   $("piModalLocationLabel"),
    modalLocationHint:    $("piModalLocationHint"),
    modalLocationSource:  $("piModalLocationSource"),
    modalGpsField:        $("piModalGpsField"),
    modalGpsValue:        $("piModalGpsValue"),
    modalNarratorReady:   $("piModalNarratorReady"),
    modalExifPre:         $("piModalExifPre"),
    modalCompleteness:    $("piModalCompleteness"),
    modalCloseBtn:        $("piModalCloseBtn"),
    modalCancelBtn:       $("piModalCancelBtn"),
    modalSaveBtn:         $("piModalSaveBtn"),
    modalDeleteBtn:       $("piModalDeleteBtn"),
    modalStatus:          $("piModalStatus"),

    // WO-PHOTO-PEOPLE-EDIT-01: people + events editing in modal
    modalPeopleList:      $("piModalPeopleList"),
    modalEventsList:      $("piModalEventsList"),
    modalAddPersonBtn:    $("piModalAddPersonBtn"),
    modalAddEventBtn:     $("piModalAddEventBtn"),
  };

  function setStatus(msg, level) {
    el.status.textContent = msg || "";
    el.status.className = "pi-status" + (level ? " " + level : "");
  }

  function setListStatus(msg, level) {
    el.listStatus.textContent = msg || "";
    el.listStatus.className = "pi-status" + (level ? " " + level : "");
  }

  // ── Narrator picker ─────────────────────────────────────────
  function _populateNarratorSelect(selectEl, items, savedKey) {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    if (!items.length) {
      selectEl.innerHTML = '<option value="">— no narrators —</option>';
      return;
    }
    items.forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p.id || p.person_id || "";
      opt.textContent = p.display_name || p.name || opt.value;
      selectEl.appendChild(opt);
    });
    var saved = savedKey ? localStorage.getItem(savedKey) : null;
    if (saved) {
      var opts = Array.from(selectEl.options).map(function(o){return o.value;});
      if (opts.indexOf(saved) >= 0) selectEl.value = saved;
    }
  }

  function loadNarrators() {
    return fetch(ORIGIN + "/api/people")
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (people) {
        var items = Array.isArray(people) ? people
                   : (people && Array.isArray(people.people) ? people.people : []);
        // Single-photo dropdown (legacy LS key, untouched on the wire).
        _populateNarratorSelect(el.narrator,      items, LS_NARRATOR);
        // Batch dropdown shares the same saved selection.
        _populateNarratorSelect(el.batchNarrator, items, LS_NARRATOR);
      })
      .catch(function () {
        if (el.narrator)      el.narrator.innerHTML      = '<option value="">— /api/people unavailable —</option>';
        if (el.batchNarrator) el.batchNarrator.innerHTML = '<option value="">— /api/people unavailable —</option>';
      });
  }

  // P1.2 (code review 2026-04-26 night): when narrator changes, reset
  // BOTH narrator_ready checkboxes. Curator must re-affirm "ready"
  // for the new narrator. Without this, a checkbox state from
  // narrator A could silently apply to narrator B's next upload.
  function _resetReadyCheckboxesForNarratorSwitch() {
    if (el.narratorReady) el.narratorReady.checked = false;
    if (el.batchNarratorReady) el.batchNarratorReady.checked = false;
  }

  el && el.narrator && el.narrator.addEventListener("change", function () {
    localStorage.setItem(LS_NARRATOR, el.narrator.value);
    if (el.batchNarrator && el.batchNarrator.value !== el.narrator.value) {
      el.batchNarrator.value = el.narrator.value;
    }
    _resetReadyCheckboxesForNarratorSwitch();
    refreshList();
  });

  el && el.batchNarrator && el.batchNarrator.addEventListener("change", function () {
    localStorage.setItem(LS_NARRATOR, el.batchNarrator.value);
    if (el.narrator && el.narrator.value !== el.batchNarrator.value) {
      el.narrator.value = el.batchNarrator.value;
    }
    _resetReadyCheckboxesForNarratorSwitch();
    refreshList();
  });

  // ── Dynamic person / event rows ─────────────────────────────
  function makePersonRow(initial) {
    initial = initial || { person_label: "", person_id: "" };
    var row = document.createElement("div");
    row.className = "pi-people-row";
    var inp = document.createElement("input");
    inp.type = "text";
    inp.className = "pi-person-label";
    inp.placeholder = "person_label (how the curator refers to them)";
    inp.value = initial.person_label || "";
    var rm = document.createElement("button");
    rm.type = "button";
    rm.className = "pi-chip-btn";
    rm.textContent = "Remove";
    rm.addEventListener("click", function () { row.remove(); });
    row.appendChild(inp);
    row.appendChild(rm);
    return row;
  }

  function makeEventRow(initial) {
    initial = initial || { event_label: "", event_id: "" };
    var row = document.createElement("div");
    row.className = "pi-events-row";
    var inp = document.createElement("input");
    inp.type = "text";
    inp.className = "pi-event-label";
    inp.placeholder = "event_label (e.g. July 4 cookout)";
    inp.value = initial.event_label || "";
    var rm = document.createElement("button");
    rm.type = "button";
    rm.className = "pi-chip-btn";
    rm.textContent = "Remove";
    rm.addEventListener("click", function () { row.remove(); });
    row.appendChild(inp);
    row.appendChild(rm);
    return row;
  }

  el.addPerson.addEventListener("click", function () {
    el.peopleList.appendChild(makePersonRow());
  });

  el.addEvent.addEventListener("click", function () {
    el.eventsList.appendChild(makeEventRow());
  });

  function collectPeople() {
    var rows = el.peopleList.querySelectorAll(".pi-person-label");
    var out = [];
    rows.forEach(function (inp) {
      var v = (inp.value || "").trim();
      if (v) out.push({ person_label: v });
    });
    return out;
  }

  function collectEvents() {
    var rows = el.eventsList.querySelectorAll(".pi-event-label");
    var out = [];
    rows.forEach(function (inp) {
      var v = (inp.value || "").trim();
      if (v) out.push({ event_label: v });
    });
    return out;
  }

  // ── Curator identity (uploaded_by_user_id) ──────────────────
  function getCuratorId() {
    var id = localStorage.getItem(LS_CURATOR);
    if (!id) {
      id = "curator_" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(LS_CURATOR, id);
    }
    return id;
  }

  // ── Submit ──────────────────────────────────────────────────
  el.save.addEventListener("click", function () {
    var narratorId = (el.narrator.value || "").trim();
    if (!narratorId) { setStatus("Please pick a narrator first.", "warn"); return; }
    var file = el.file.files && el.file.files[0];
    if (!file)       { setStatus("Please choose an image file.", "warn"); return; }

    var fd = new FormData();
    fd.append("file", file);
    fd.append("narrator_id", narratorId);
    fd.append("uploaded_by_user_id", getCuratorId());
    if (el.description.value.trim())   fd.append("description",    el.description.value.trim());
    if (el.dateValue.value.trim())     fd.append("date_value",     el.dateValue.value.trim());
    fd.append("date_precision", el.datePrecision.value || "unknown");
    if (el.locationLabel.value.trim()) fd.append("location_label", el.locationLabel.value.trim());
    fd.append("location_source", el.locationSource.value || "unknown");
    fd.append("narrator_ready", el.narratorReady.checked ? "true" : "false");

    // people and events are single form fields, each carrying a JSON
    // array (photos.py: `people: Optional[str] = Form(None)` → parsed
    // via _parse_json_list into a Python list). Only send the field
    // when there's at least one row so the empty-array case stays
    // byte-identical to "no field" on the wire.
    var peopleRows = collectPeople();
    var eventRows  = collectEvents();
    if (peopleRows.length) fd.append("people", JSON.stringify(peopleRows));
    if (eventRows.length)  fd.append("events", JSON.stringify(eventRows));

    el.save.disabled = true;
    setStatus("Uploading…");
    fetch(ORIGIN + "/api/photos", { method: "POST", body: fd })
      .then(function (r) {
        if (r.status === 409) {
          return r.json().then(function (body) {
            setStatus("This photo is already saved for this narrator.", "warn");
            throw new Error("duplicate");
          });
        }
        if (!r.ok) {
          return r.text().then(function (t) { throw new Error(t || ("HTTP " + r.status)); });
        }
        return r.json();
      })
      .then(function (_photo) {
        setStatus("Saved.", "ok");
        clearForm();
        refreshList();
      })
      .catch(function (e) {
        if (String(e && e.message) !== "duplicate") {
          setStatus("Upload failed: " + (e && e.message ? e.message : "unknown"), "err");
        }
      })
      .finally(function () { el.save.disabled = false; });
  });

  el.reset.addEventListener("click", function () { clearForm(); setStatus(""); });

  function clearForm() {
    el.file.value = "";
    el.description.value = "";
    el.dateValue.value = "";
    el.datePrecision.value = "unknown";
    el.locationLabel.value = "";
    el.locationSource.value = "unknown";
    el.peopleList.innerHTML = "";
    el.eventsList.innerHTML = "";
    el.narratorReady.checked = false;
  }

  // ── Saved list ──────────────────────────────────────────────
  function refreshList() {
    var narratorId = el.narrator.value;
    if (!narratorId) { el.list.innerHTML = ""; setListStatus("Pick a narrator to see saved photos."); return; }
    setListStatus("Loading…");
    fetch(ORIGIN + "/api/photos?narrator_id=" + encodeURIComponent(narratorId))
      .then(function (r) { return r.ok ? r.json() : { photos: [] }; })
      .then(function (body) {
        var photos = Array.isArray(body) ? body : (body.photos || []);
        renderList(photos);
        setListStatus(photos.length ? (photos.length + " saved") : "No photos yet.");
        // BUG-PHOTO-BATCH-STALE-AFTER-DELETE (2026-04-26): when the
        // operator soft-deletes a saved photo from the Saved Photos
        // panel (or from the View/Edit modal), the batch queue still
        // shows the corresponding card with status="saved". Without
        // a refresh signal the operator can't tell if the delete
        // actually landed. Walk the batch items and mark any saved
        // item whose photoId is no longer in the live list as
        // "deleted-server-side" — visually fades the card + flips
        // the pill so the operator gets feedback.
        _pruneStaleBatchItems(photos);
      })
      .catch(function () { setListStatus("Could not load list.", "err"); });
  }

  function _pruneStaleBatchItems(livePhotos) {
    if (!batchItems || !batchItems.length) return;
    var liveIds = {};
    (livePhotos || []).forEach(function (p) { if (p && p.id) liveIds[p.id] = true; });
    var pruned = 0;
    batchItems.forEach(function (item) {
      if (item.status === "saved" && item.photoId && !liveIds[item.photoId]) {
        // Server-side row is gone — mark as such, don't auto-remove
        // from the queue (operator might want to see what was
        // deleted). The Clear Queue button removes them in bulk.
        item.status = "deleted_server";
        if (item._pill) {
          item._pill.className = "pi-batch-pill warn";
          item._pill.textContent = "deleted";
        }
        if (item._meta) {
          item._meta.textContent = "Photo was deleted from the saved list.";
          item._meta.className = "pi-batch-meta warn";
        }
        if (item._row) {
          item._row.style.opacity = "0.55";
        }
        pruned += 1;
      }
    });
    if (pruned > 0) {
      console.log("[photo-intake] pruned " + pruned +
        " stale batch items (saved photos no longer in DB)");
    }
  }

  function renderList(photos) {
    el.list.innerHTML = "";
    photos.forEach(function (p) {
      var row = document.createElement("div");
      row.className = "pi-list-row";

      var img = document.createElement("img");
      img.className = "pi-thumb pi-thumb-clickable";
      img.alt = "";
      img.title = "Click to view or edit";
      // BUG-PHOTO-URL-RELATIVE-RESOLVES-TO-UI-PORT: backend synthesizes
      // image URLs as /api/photos/{id}/thumb (relative). Browser resolves
      // against the page origin (port 8082, UI server) instead of the
      // API origin (port 8000). _resolveApiUrl prepends ORIGIN when the
      // URL is relative. Same fix needed in 3 other spots (modal +
      // narrator-room x 2).
      img.src = _resolveApiUrl(p.thumbnail_url || p.media_url || "");
      img.addEventListener("click", function () { openPhotoModal(p); });
      row.appendChild(img);

      var meta = document.createElement("div");
      meta.className = "pi-list-meta";
      var title = document.createElement("div");
      title.className = "pi-list-title";
      title.textContent = (p.description || "(no description)").slice(0, 140);
      var sub = document.createElement("div");
      sub.className = "pi-list-sub";
      var subBits = [];
      if (p.date_value)     subBits.push(p.date_value + (p.date_precision && p.date_precision !== "unknown" ? " (" + p.date_precision + ")" : ""));
      if (p.location_label) subBits.push(p.location_label);
      sub.textContent = subBits.join(" · ");
      meta.appendChild(title);
      meta.appendChild(sub);

      if (p.narrator_ready) {
        var pill = document.createElement("span");
        pill.className = "pi-pill ready";
        pill.textContent = "ready";
        title.appendChild(pill);
      }
      if (p.needs_confirmation) {
        var warn = document.createElement("span");
        warn.className = "pi-pill needs-review";
        warn.textContent = "needs review";
        title.appendChild(warn);
      }

      row.appendChild(meta);

      var actions = document.createElement("div");
      actions.className = "pi-list-actions";

      var view = document.createElement("button");
      view.type = "button";
      view.className = "pi-chip-btn";
      view.textContent = "View / Edit";
      view.addEventListener("click", function () { openPhotoModal(p); });
      actions.appendChild(view);

      var toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "pi-chip-btn";
      toggle.textContent = p.narrator_ready ? "Mark not ready" : "Mark ready";
      toggle.addEventListener("click", function () { patchReady(p, !p.narrator_ready); });
      actions.appendChild(toggle);

      row.appendChild(actions);
      el.list.appendChild(row);
    });
  }

  function patchReady(photo, ready) {
    fetch(ORIGIN + "/api/photos/" + encodeURIComponent(photo.id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        narrator_ready: !!ready,
        last_edited_by_user_id: getCuratorId(),
      })
    })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      refreshList();
    })
    .catch(function (e) { setListStatus("Update failed: " + e.message, "err"); });
  }

  function deletePhoto(photo) {
    if (!confirm("Soft-delete this photo? You can restore it manually later.")) return;
    // BUG-PHOTO-DELETE-ACTOR (overnight 2026-04-26): the backend
    // DELETE endpoint requires ?actor_id=... — without it the
    // request 422s. Pass the curator id from localStorage same as
    // every other PATCH/POST in this file.
    var url = ORIGIN + "/api/photos/" + encodeURIComponent(photo.id) +
              "?actor_id=" + encodeURIComponent(getCuratorId());
    fetch(url, { method: "DELETE" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        refreshList();
      })
      .catch(function (e) { setListStatus("Delete failed: " + e.message, "err"); });
  }

  // ═══════════════════════════════════════════════════════════════
  // BATCH UPLOAD (multi-file + EXIF auto-fill)
  //
  // Sequential upload (NOT parallel): the backend chains thumbnail
  // generation, dedupe hash, and DB write per file. Hammering the
  // server with 50 parallel uploads would melt the LLM context if
  // anything else is in flight. Sequential is also easier to reason
  // about for status display.
  //
  // EXIF auto-fill is server-side (LOREVOX_PHOTO_INTAKE flag). The
  // browser just sends the file; the response carries the populated
  // date_value / location_source / latitude / longitude back. We
  // surface those on the queue card so the operator sees what stuck.
  // ═══════════════════════════════════════════════════════════════

  var BATCH_MAX = 50;
  var batchItems = [];   // [{ id, file, status, photoId, date, loc, error }]
  var batchInFlight = false;
  var _batchUid = 0;
  function _nextBatchId() { _batchUid += 1; return "b" + _batchUid; }

  function _bytesPretty(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(0) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  }

  function _isImageFile(f) {
    if (!f) return false;
    var t = (f.type || "").toLowerCase();
    if (t.indexOf("image/") === 0) return true;
    // Some browsers don't tag HEIC mime; fall back to extension.
    var name = (f.name || "").toLowerCase();
    return /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/.test(name);
  }

  function _setBatchStatus(msg, level) {
    if (!el.batchStatus) return;
    el.batchStatus.textContent = msg || "";
    el.batchStatus.className = "pi-status" + (level ? " " + level : "");
  }

  function _updateBatchButtons() {
    var hasQueued = batchItems.some(function (i) { return i.status === "queued"; });
    var hasAny = batchItems.length > 0;
    if (el.batchStart) el.batchStart.disabled = !hasQueued || batchInFlight;
    if (el.batchClear) el.batchClear.disabled = !hasAny || batchInFlight;
  }

  function _renderBatchItem(item) {
    var row = document.createElement("div");
    row.className = "pi-batch-row";
    row.dataset.id = item.id;

    // Thumbnail (client-side preview via URL.createObjectURL).
    //
    // BUG-PHOTO-BATCH-THUMB (2026-04-26): switched from FileReader
    // (readAsDataURL) to URL.createObjectURL because:
    //   - FileReader generates a 7-13MB base64 string for typical
    //     phone JPEGs (5-10MB); some browsers throttle data: URLs
    //     that long, leaving thumb.src empty.
    //   - createObjectURL hands the browser a blob: URL it can load
    //     directly without base64 conversion. Faster, lower memory,
    //     more reliable.
    // We don't revoke the URL here — the browser garbage-collects on
    // document unload, and our queue is short-lived (single batch).
    var thumb = document.createElement("img");
    thumb.className = "pi-batch-thumb pi-batch-thumb--clickable";
    thumb.alt = item.file.name || "queued photo";
    thumb.title = "Click to enlarge";
    try { thumb.src = URL.createObjectURL(item.file); } catch (e) {
      console.warn("[photo-intake] createObjectURL failed for " + item.file.name + ":", e);
    }
    // BUG-240 sibling for batch items: click thumb opens an overlay
    // showing the full-size local preview. If the item has been
    // uploaded (status==="saved" + photoId set), open the View/Edit
    // modal instead so the curator can edit metadata.
    thumb.addEventListener("click", function () {
      if (item.status === "saved" && item.photoId) {
        _openSavedPhotoModalById(item.photoId);
      } else {
        _openBatchPreviewLightbox(item);
      }
    });
    row.appendChild(thumb);

    // Body
    var body = document.createElement("div");
    body.className = "pi-batch-body";

    var name = document.createElement("div");
    name.className = "pi-batch-name";
    name.textContent = item.file.name + "  ·  " + _bytesPretty(item.file.size);
    body.appendChild(name);

    var meta = document.createElement("div");
    meta.className = "pi-batch-meta";
    meta.textContent = "Queued — EXIF date / GPS will be auto-filled by the server if present.";
    body.appendChild(meta);

    row.appendChild(body);

    // Status pill
    var pill = document.createElement("span");
    pill.className = "pi-batch-pill queued";
    pill.textContent = "queued";
    row.appendChild(pill);

    // Remove button (only meaningful for queued items)
    var rm = document.createElement("button");
    rm.type = "button";
    rm.className = "pi-chip-btn";
    rm.textContent = "Remove";
    rm.addEventListener("click", function () {
      if (item.status === "uploading") return;
      batchItems = batchItems.filter(function (i) { return i.id !== item.id; });
      row.remove();
      _updateBatchButtons();
    });
    row.appendChild(rm);

    // Stash refs on the item so update fns can mutate without re-render
    item._row = row;
    item._meta = meta;
    item._pill = pill;
    item._rm = rm;

    return row;
  }

  function _updateBatchItem(item) {
    if (!item._pill) return;
    item._pill.className = "pi-batch-pill " + item.status;
    item._pill.textContent = item.status;
    if (item.status === "saved") {
      var bits = [];
      if (item.date) bits.push(item.date);
      if (item.loc)  bits.push(item.loc);
      item._meta.textContent = bits.length ? ("Saved — " + bits.join(" · ")) : "Saved.";
      item._meta.className = "pi-batch-meta ok";
      if (item._rm) item._rm.style.display = "none";
    } else if (item.status === "uploading") {
      item._meta.textContent = "Uploading…";
      item._meta.className = "pi-batch-meta";
    } else if (item.status === "duplicate") {
      item._meta.textContent = "Already saved for this narrator (dedup match by file hash).";
      item._meta.className = "pi-batch-meta warn";
      item._pill.className = "pi-batch-pill warn";
      item._pill.textContent = "duplicate";
    } else if (item.status === "error") {
      item._meta.textContent = "Failed: " + (item.error || "unknown error");
      item._meta.className = "pi-batch-meta err";
      item._pill.className = "pi-batch-pill err";
      item._pill.textContent = "error";
    }
  }

  function _addFiles(fileList) {
    if (!fileList || !fileList.length) return;
    var added = 0;
    var skipped_nonimage = 0;
    // P1.4 (code review 2026-04-26 night): capture narrator_id +
    // ready_flag at queue-add time, NOT at upload time. Without this,
    // operator could drop 5 photos as Narrator A, switch the dropdown
    // to Narrator B, click Upload All, and have all 5 photos land on
    // B's row. Snapshotting at queue-add freezes the intent at the
    // moment the file was added.
    var snapshot_narrator_id = (el.batchNarrator && el.batchNarrator.value || "").trim();
    var snapshot_ready_flag  = !!(el.batchNarratorReady && el.batchNarratorReady.checked);
    for (var i = 0; i < fileList.length; i++) {
      if (batchItems.length >= BATCH_MAX) {
        _setBatchStatus("Queue full (" + BATCH_MAX + " max). Upload some first.", "warn");
        break;
      }
      var f = fileList[i];
      if (!_isImageFile(f)) { skipped_nonimage += 1; continue; }
      var item = {
        id: _nextBatchId(),
        file: f,
        status: "queued",
        photoId: null,
        date: null,
        loc: null,
        error: null,
        // Frozen snapshots (P1.4): used at upload time, not the live dropdown
        narrator_id_snapshot: snapshot_narrator_id,
        ready_flag_snapshot:  snapshot_ready_flag,
      };
      batchItems.push(item);
      el.batchQueue.appendChild(_renderBatchItem(item));
      added += 1;
    }
    var msg = added + " queued";
    if (skipped_nonimage) msg += " · " + skipped_nonimage + " non-image skipped";
    _setBatchStatus(msg, added ? "ok" : "warn");
    _updateBatchButtons();
  }

  function _clearQueue() {
    if (batchInFlight) return;
    batchItems = [];
    if (el.batchQueue) el.batchQueue.innerHTML = "";
    _setBatchStatus("");
    _updateBatchButtons();
  }

  function _uploadOne(item, narratorId, readyFlag) {
    var fd = new FormData();
    fd.append("file", item.file);
    fd.append("narrator_id", narratorId);
    fd.append("uploaded_by_user_id", getCuratorId());
    // No description / date / location from form — server fills via EXIF
    // (LOREVOX_PHOTO_INTAKE=1) when blank. date_precision / location_source
    // both default to 'unknown' so the EXIF block can override them.
    fd.append("date_precision", "unknown");
    fd.append("location_source", "unknown");
    fd.append("narrator_ready", readyFlag ? "true" : "false");

    return fetch(ORIGIN + "/api/photos", { method: "POST", body: fd })
      .then(function (r) {
        if (r.status === 409) {
          return r.json().then(function (body) {
            return { _duplicate: true, photo: body && body.photo };
          });
        }
        if (!r.ok) {
          return r.text().then(function (t) {
            throw new Error(t || ("HTTP " + r.status));
          });
        }
        return r.json();
      });
  }

  function _runBatchSerially() {
    // P1.4: each item carries its own narrator snapshot from queue-add
    // time. We still validate that at least the first queued item has
    // a non-empty narrator -- if the operator never picked one, the
    // snapshot would be empty across the board.
    var firstQueued = batchItems.find(function (i) { return i.status === "queued"; });
    if (!firstQueued || !firstQueued.narrator_id_snapshot) {
      _setBatchStatus("Pick a narrator first, then re-add the files.", "warn");
      return Promise.resolve();
    }

    batchInFlight = true;
    _updateBatchButtons();
    _setBatchStatus("Uploading… 0/" + batchItems.filter(function(i){return i.status==="queued";}).length, "");

    var todo = batchItems.filter(function (i) { return i.status === "queued"; });
    var idx = 0;
    var ok = 0, dup = 0, err = 0;

    function step() {
      if (idx >= todo.length) {
        batchInFlight = false;
        _setBatchStatus(
          "Done. " + ok + " saved" + (dup ? " · " + dup + " duplicate" : "")
                                   + (err ? " · " + err + " failed" : ""),
          err ? "warn" : "ok"
        );
        _updateBatchButtons();
        refreshList();
        return Promise.resolve();
      }
      var item = todo[idx];
      item.status = "uploading";
      _updateBatchItem(item);
      _setBatchStatus("Uploading… " + (idx + 1) + "/" + todo.length, "");

      // Read narrator + ready from the item's own snapshot, not the
      // live dropdown -- protects against narrator-switch races.
      return _uploadOne(item, item.narrator_id_snapshot, item.ready_flag_snapshot)
        .then(function (resp) {
          if (resp && resp._duplicate) {
            item.status = "duplicate";
            dup += 1;
          } else {
            item.status = "saved";
            item.photoId = resp && resp.id;
            item.date = resp && resp.date_value;
            // Show location label if curator/EXIF reverse-geo provided one,
            // else show the raw lat/lng from EXIF (Phase 2 reverse-geocoder
            // not wired yet). location_source tells us where it came from.
            if (resp && resp.location_label) {
              item.loc = resp.location_label;
            } else if (resp && resp.latitude != null && resp.longitude != null) {
              item.loc = "GPS " + resp.latitude.toFixed(4) + ", " + resp.longitude.toFixed(4);
            }
            ok += 1;
          }
        })
        .catch(function (e) {
          item.status = "error";
          item.error = (e && e.message) || String(e);
          err += 1;
        })
        .then(function () {
          _updateBatchItem(item);
          idx += 1;
          return step();
        });
    }

    return step();
  }

  // ── Wire batch controls ─────────────────────────────────────
  if (el.batchFile) {
    el.batchFile.addEventListener("change", function (ev) {
      _addFiles(ev.target.files);
      // Reset value so re-picking the same file fires "change" again.
      try { ev.target.value = ""; } catch (e) {}
    });
  }

  if (el.dropzone) {
    ["dragenter", "dragover"].forEach(function (evt) {
      el.dropzone.addEventListener(evt, function (e) {
        e.preventDefault();
        e.stopPropagation();
        el.dropzone.classList.add("drag");
      });
    });
    ["dragleave", "drop"].forEach(function (evt) {
      el.dropzone.addEventListener(evt, function (e) {
        e.preventDefault();
        e.stopPropagation();
        el.dropzone.classList.remove("drag");
      });
    });
    el.dropzone.addEventListener("drop", function (e) {
      var dt = e.dataTransfer;
      if (!dt || !dt.files) return;
      _addFiles(dt.files);
    });
  }

  if (el.batchStart) {
    el.batchStart.addEventListener("click", function () {
      _runBatchSerially();
    });
  }

  if (el.batchClear) {
    el.batchClear.addEventListener("click", _clearQueue);
  }

  // ═══════════════════════════════════════════════════════════════
  // BATCH PREVIEW LIGHTBOX + SAVED-PHOTO MODAL HELPER
  //
  // Click a batch-queue thumbnail → if uploaded (status=saved),
  // open the View/Edit modal for the saved row. If still queued,
  // show a quick fullscreen preview of the local file.
  // ═══════════════════════════════════════════════════════════════

  function _openBatchPreviewLightbox(item) {
    var overlay = document.getElementById("piBatchPreviewLightbox");
    if (!overlay || !item || !item.file) return;
    var img = overlay.querySelector(".pi-batch-preview-img");
    var cap = overlay.querySelector(".pi-batch-preview-caption");
    try {
      if (img) img.src = URL.createObjectURL(item.file);
    } catch (e) {
      console.warn("[batch-preview] createObjectURL failed:", e);
      return;
    }
    if (cap) {
      cap.textContent = (item.file.name || "queued photo") +
        " · " + _bytesPretty(item.file.size) +
        " · status: " + item.status;
    }
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function _closeBatchPreviewLightbox() {
    var overlay = document.getElementById("piBatchPreviewLightbox");
    if (!overlay) return;
    overlay.hidden = true;
    var img = overlay.querySelector(".pi-batch-preview-img");
    if (img) img.src = "";  // free blob URL ref
    document.body.style.overflow = "";
  }
  // Expose for inline onclick handlers in the HTML overlay
  window._closeBatchPreviewLightbox = _closeBatchPreviewLightbox;

  // Fetch a single photo by id and open the View/Edit modal with it.
  // Used by batch-queue click-to-enlarge when the item is already
  // uploaded — operator gets the full edit surface, not just a
  // preview, on the row they just saved.
  function _openSavedPhotoModalById(photoId) {
    if (!photoId) return;
    fetch(ORIGIN + "/api/photos/" + encodeURIComponent(photoId))
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (photo) {
        if (photo && photo.id) {
          openPhotoModal(photo);
        } else {
          alert("Photo not found server-side. It may have been deleted.");
        }
      })
      .catch(function (e) {
        alert("Could not load photo: " + (e.message || e));
      });
  }

  // ═══════════════════════════════════════════════════════════════
  // VIEW / EDIT MODAL (BUG-239)
  //
  // Opens on click of a saved-photo thumbnail or its "View / Edit"
  // button. Shows the full image + all metadata, distinguishes
  // EXIF-derived fields from curator-typed ones, lets the curator add
  // missing info post-upload (critical for old scanned prints with no
  // EXIF date or GPS).
  //
  // Save → PATCH /api/photos/{id} with all editable fields.
  // Delete → DELETE /api/photos/{id} (soft delete on the backend).
  // ═══════════════════════════════════════════════════════════════

  var _modalPhoto = null;   // currently-open photo row (full object as returned by GET /api/photos)

  function _setModalStatus(msg, level) {
    if (!el.modalStatus) return;
    el.modalStatus.textContent = msg || "";
    el.modalStatus.className = "pi-status" + (level ? " " + level : "");
  }

  function _renderSourceAttribution(photo) {
    // The metadata_json blob carries `exif` + `exif_captured_at` +
    // `exif_gps`. Use those to label which fields came from EXIF vs
    // were typed by the curator. Helps the operator see at a glance
    // what they need to fill in for old scanned photos.
    if (!el.modalSourceAttr) return;
    var meta = (photo && photo.metadata_json) || {};
    var bits = [];
    if (meta.exif_captured_at) {
      bits.push('<span class="pi-source-pill exif">date · from EXIF</span>');
    } else if (photo && photo.date_value) {
      bits.push('<span class="pi-source-pill curator">date · typed by curator</span>');
    } else {
      bits.push('<span class="pi-source-pill missing">date · MISSING</span>');
    }
    var loc_src = photo && photo.location_source;
    // P1.1: distinguish "GPS missing" from "GPS present but corrupted/
    // unreadable" — the second case wastes operator time looking for
    // metadata that's actually there but unparseable. Pill surfaces it.
    var exif_gps_meta = (meta && meta.exif_gps) || {};
    var gps_unparseable = !!exif_gps_meta.present_unparseable;
    if (loc_src === "exif_gps") {
      bits.push('<span class="pi-source-pill exif">location · GPS from EXIF</span>');
    } else if (photo && (photo.location_label || loc_src && loc_src !== "unknown")) {
      bits.push('<span class="pi-source-pill curator">location · typed by curator</span>');
    } else if (gps_unparseable) {
      bits.push('<span class="pi-source-pill missing" title="GPS metadata block was present in the EXIF but could not be parsed (zero-denominator DMS, partial triple, or out-of-range coords). The photo did record location data but it is unreadable. Type the location manually.">location · GPS UNREADABLE</span>');
    } else {
      bits.push('<span class="pi-source-pill missing">location · MISSING</span>');
    }
    el.modalSourceAttr.innerHTML = bits.join(" ");
  }

  function _renderCompleteness(photo) {
    if (!el.modalCompleteness) return;
    var checks = [
      { label: "description", ok: !!(photo && photo.description && photo.description.trim()) },
      { label: "date",        ok: !!(photo && photo.date_value && photo.date_value.trim()) },
      { label: "location",    ok: !!(photo && photo.location_label && photo.location_label.trim()) },
      { label: "ready",       ok: !!(photo && photo.narrator_ready) },
    ];
    var missing = checks.filter(function (c) { return !c.ok; });
    var html = '<div class="pi-completeness-row">';
    checks.forEach(function (c) {
      html += '<span class="pi-completeness-pill ' + (c.ok ? 'ok' : 'gap') + '">' + c.label + '</span>';
    });
    html += '</div>';
    if (missing.length) {
      var nm = missing.map(function (c) { return c.label; }).join(", ");
      html += '<div class="pi-completeness-note">Still missing: ' + nm + '</div>';
    } else {
      html += '<div class="pi-completeness-note ok">All fields filled. Ready for the narrator.</div>';
    }
    el.modalCompleteness.innerHTML = html;
  }

  // WO-PHOTO-PEOPLE-EDIT-01: build a removable row in the modal's
  // people/events list. Mirrors the makePersonRow / makeEventRow
  // pattern from the single-photo upload form so the UX is consistent.
  function _makeModalPersonRow(initial) {
    initial = initial || {};
    var row = document.createElement("div");
    row.className = "pi-people-row";
    var inp = document.createElement("input");
    inp.type = "text";
    inp.className = "pi-modal-person-label";
    inp.placeholder = "person name (e.g. Mom, Grandma Lou)";
    inp.value = initial.person_label || initial.label || "";
    var rm = document.createElement("button");
    rm.type = "button";
    rm.className = "pi-chip-btn";
    rm.textContent = "Remove";
    rm.addEventListener("click", function () { row.remove(); });
    row.appendChild(inp);
    row.appendChild(rm);
    return row;
  }
  function _makeModalEventRow(initial) {
    initial = initial || {};
    var row = document.createElement("div");
    row.className = "pi-events-row";
    var inp = document.createElement("input");
    inp.type = "text";
    inp.className = "pi-modal-event-label";
    inp.placeholder = "event (e.g. Easter 2026, hike at Watrous)";
    inp.value = initial.event_label || initial.label || "";
    var rm = document.createElement("button");
    rm.type = "button";
    rm.className = "pi-chip-btn";
    rm.textContent = "Remove";
    rm.addEventListener("click", function () { row.remove(); });
    row.appendChild(inp);
    row.appendChild(rm);
    return row;
  }
  function _collectModalPeople() {
    if (!el.modalPeopleList) return [];
    var rows = el.modalPeopleList.querySelectorAll(".pi-modal-person-label");
    var out = [];
    rows.forEach(function (inp) {
      var v = (inp.value || "").trim();
      if (v) out.push({ person_label: v });
    });
    return out;
  }
  function _collectModalEvents() {
    if (!el.modalEventsList) return [];
    var rows = el.modalEventsList.querySelectorAll(".pi-modal-event-label");
    var out = [];
    rows.forEach(function (inp) {
      var v = (inp.value || "").trim();
      if (v) out.push({ event_label: v });
    });
    return out;
  }

  function openPhotoModal(photo) {
    if (!el.modalBackdrop) return;
    _modalPhoto = photo;

    // Populate fields
    if (el.modalImage)         el.modalImage.src = _resolveApiUrl(photo.media_url || photo.thumbnail_url || "");
    if (el.modalDescription)   el.modalDescription.value   = photo.description    || "";
    if (el.modalDateValue)     el.modalDateValue.value     = photo.date_value     || "";
    if (el.modalDatePrecision) el.modalDatePrecision.value = photo.date_precision || "unknown";
    if (el.modalLocationLabel) el.modalLocationLabel.value = photo.location_label || "";
    if (el.modalLocationSource) el.modalLocationSource.value = photo.location_source || "unknown";
    if (el.modalNarratorReady) el.modalNarratorReady.checked = !!photo.narrator_ready;

    // WO-PHOTO-PEOPLE-EDIT-01: populate people + events lists from the
    // photo row. The list endpoint includes these as `people` and
    // `events` arrays per get_photo's response shape.
    if (el.modalPeopleList) {
      el.modalPeopleList.innerHTML = "";
      var people = (photo.people && Array.isArray(photo.people)) ? photo.people : [];
      people.forEach(function (p) {
        el.modalPeopleList.appendChild(_makeModalPersonRow(p));
      });
    }
    if (el.modalEventsList) {
      el.modalEventsList.innerHTML = "";
      var events = (photo.events && Array.isArray(photo.events)) ? photo.events : [];
      events.forEach(function (e) {
        el.modalEventsList.appendChild(_makeModalEventRow(e));
      });
    }

    // Hints next to date/location labels — say where the value came from
    var meta = photo.metadata_json || {};
    if (el.modalDateHint) {
      el.modalDateHint.textContent = meta.exif_captured_at
        ? "(EXIF: " + meta.exif_captured_at + ")"
        : "";
    }
    if (el.modalLocationHint) {
      el.modalLocationHint.textContent = (photo.location_source === "exif_gps")
        ? "(from phone GPS)"
        : "";
    }

    // GPS coords (read-only)
    if (el.modalGpsField && el.modalGpsValue) {
      if (photo.latitude != null && photo.longitude != null) {
        el.modalGpsField.hidden = false;
        var url = "https://www.openstreetmap.org/?mlat=" + photo.latitude + "&mlon=" + photo.longitude + "#map=12/" + photo.latitude + "/" + photo.longitude;
        el.modalGpsValue.innerHTML =
          photo.latitude.toFixed(6) + ", " + photo.longitude.toFixed(6) +
          ' &nbsp;<a href="' + url + '" target="_blank" rel="noopener">view on map</a>';
      } else {
        el.modalGpsField.hidden = true;
        el.modalGpsValue.textContent = "";
      }
    }

    // Raw EXIF (forensic)
    if (el.modalExifPre) {
      var raw = meta.exif || {};
      var keys = Object.keys(raw);
      if (keys.length) {
        el.modalExifPre.textContent = JSON.stringify(raw, null, 2);
      } else {
        el.modalExifPre.textContent = "(no EXIF metadata in this file — typical for scanned prints, screenshots, or photos with EXIF stripped by social media uploads)";
      }
    }

    _renderSourceAttribution(photo);
    _renderCompleteness(photo);
    _setModalStatus("");

    el.modalBackdrop.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closePhotoModal() {
    if (!el.modalBackdrop) return;
    el.modalBackdrop.hidden = true;
    document.body.style.overflow = "";
    _modalPhoto = null;
    _setModalStatus("");
  }

  function savePhotoModal() {
    if (!_modalPhoto || !el.modalSaveBtn) return;
    var photoId = _modalPhoto.id;
    var body = {
      description:     (el.modalDescription.value     || "").trim() || null,
      date_value:      (el.modalDateValue.value       || "").trim() || null,
      date_precision:  el.modalDatePrecision.value    || "unknown",
      location_label:  (el.modalLocationLabel.value   || "").trim() || null,
      location_source: el.modalLocationSource.value   || "unknown",
      narrator_ready:  !!el.modalNarratorReady.checked,
      // WO-PHOTO-PEOPLE-EDIT-01: server uses replace-all semantics on
      // these arrays. Empty array = wipe all. Always send so curator
      // edits (add OR remove) round-trip correctly.
      people:          _collectModalPeople(),
      events:          _collectModalEvents(),
      last_edited_by_user_id: getCuratorId(),
    };

    el.modalSaveBtn.disabled = true;
    _setModalStatus("Saving…");
    fetch(ORIGIN + "/api/photos/" + encodeURIComponent(photoId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    .then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) { throw new Error(t || ("HTTP " + r.status)); });
      }
      return r.json();
    })
    .then(function (updated) {
      // Repopulate the modal in-place so source-attribution / completeness
      // pills reflect the new state without closing.
      if (updated && updated.id) {
        _modalPhoto = updated;
        _renderSourceAttribution(updated);
        _renderCompleteness(updated);
      }
      _setModalStatus("Saved.", "ok");
      refreshList();
    })
    .catch(function (e) {
      _setModalStatus("Save failed: " + (e.message || e), "err");
    })
    .finally(function () { el.modalSaveBtn.disabled = false; });
  }

  function deletePhotoFromModal() {
    if (!_modalPhoto) return;
    if (!confirm("Soft-delete this photo? You can restore it from the database later, but the narrator will not see it.")) return;
    var photoId = _modalPhoto.id;
    if (el.modalDeleteBtn) el.modalDeleteBtn.disabled = true;
    _setModalStatus("Deleting…");
    // BUG-PHOTO-DELETE-ACTOR: backend requires ?actor_id=... query.
    var deleteUrl = ORIGIN + "/api/photos/" + encodeURIComponent(photoId) +
                    "?actor_id=" + encodeURIComponent(getCuratorId());
    fetch(deleteUrl, { method: "DELETE" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        closePhotoModal();
        refreshList();
      })
      .catch(function (e) {
        _setModalStatus("Delete failed: " + (e.message || e), "err");
      })
      .finally(function () { if (el.modalDeleteBtn) el.modalDeleteBtn.disabled = false; });
  }

  // ── Wire modal controls ─────────────────────────────────────
  if (el.modalCloseBtn)  el.modalCloseBtn.addEventListener("click", closePhotoModal);
  if (el.modalCancelBtn) el.modalCancelBtn.addEventListener("click", closePhotoModal);
  if (el.modalSaveBtn)   el.modalSaveBtn.addEventListener("click", savePhotoModal);
  if (el.modalDeleteBtn) el.modalDeleteBtn.addEventListener("click", deletePhotoFromModal);
  if (el.modalAddPersonBtn) {
    el.modalAddPersonBtn.addEventListener("click", function () {
      if (el.modalPeopleList) el.modalPeopleList.appendChild(_makeModalPersonRow());
    });
  }
  if (el.modalAddEventBtn) {
    el.modalAddEventBtn.addEventListener("click", function () {
      if (el.modalEventsList) el.modalEventsList.appendChild(_makeModalEventRow());
    });
  }

  // Close on backdrop click (but not when clicking inside the modal panel)
  if (el.modalBackdrop) {
    el.modalBackdrop.addEventListener("click", function (ev) {
      if (ev.target === el.modalBackdrop) closePhotoModal();
    });
  }

  // ESC closes modal
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && el.modalBackdrop && !el.modalBackdrop.hidden) {
      closePhotoModal();
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // REVIEW FILE INFO (visualschedulebot pattern)
  //
  // Pick file -> thumbnail preview appears -> click "Review File Info"
  // -> server reads EXIF + reverse-geocodes -> populates description,
  // date, location_label fields with what was found, plus "from EXIF"
  // pills next to each label so the curator sees provenance at a
  // glance.
  //
  // Curator can then edit any field and click "Save Photo" to commit
  // (existing flow). Or skip Review entirely and type from scratch.
  // Or pick file + leave fields blank -> upload-time EXIF auto-fill
  // still runs server-side. Three paths, same destination.
  // ═══════════════════════════════════════════════════════════════

  function _setReviewStatus(msg, level) {
    if (!el.reviewStatus) return;
    el.reviewStatus.textContent = msg || "";
    el.reviewStatus.className = "pi-status" + (level ? " " + level : "");
  }

  function _setSourcePill(pillEl, label, kind) {
    // kind: "exif" | "gps" | "curator" | "" (hide)
    if (!pillEl) return;
    if (!label || !kind) {
      pillEl.hidden = true;
      pillEl.textContent = "";
      pillEl.className = "pi-source-pill";
      return;
    }
    pillEl.hidden = false;
    pillEl.textContent = label;
    pillEl.className = "pi-source-pill " + kind;
  }

  function _previewThumbnailFromFile(file) {
    if (!file || !el.thumbPreview || !el.thumbPreviewImg) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      el.thumbPreviewImg.src = ev.target.result;
      el.thumbPreview.hidden = false;
    };
    reader.onerror = function () {
      el.thumbPreview.hidden = true;
    };
    try { reader.readAsDataURL(file); } catch (e) { /* ignore */ }
  }

  // File picker change -> show thumbnail + enable Review button
  if (el.file) {
    el.file.addEventListener("change", function (ev) {
      var f = ev.target.files && ev.target.files[0];
      if (!f) {
        if (el.thumbPreview) el.thumbPreview.hidden = true;
        if (el.reviewBtn) el.reviewBtn.disabled = true;
        return;
      }
      _previewThumbnailFromFile(f);
      if (el.reviewBtn) el.reviewBtn.disabled = false;
      _setReviewStatus("");
    });
  }

  // Review File Info button: POST file to /api/photos/preview, autofill
  if (el.reviewBtn) {
    el.reviewBtn.addEventListener("click", function () {
      var f = el.file && el.file.files && el.file.files[0];
      if (!f) {
        _setReviewStatus("Pick a file first.", "warn");
        return;
      }

      var fd = new FormData();
      fd.append("file", f);

      el.reviewBtn.disabled = true;
      _setReviewStatus("Reading EXIF + reverse-geocoding...");

      fetch(ORIGIN + "/api/photos/preview", { method: "POST", body: fd })
        .then(function (r) {
          if (!r.ok) {
            return r.text().then(function (t) {
              throw new Error(t || ("HTTP " + r.status));
            });
          }
          return r.json();
        })
        .then(function (data) {
          // Description: only fill if the curator hasn't typed anything
          if (data.description && !(el.description.value || "").trim()) {
            el.description.value = data.description;
            _setSourcePill(el.descriptionSource, "auto-generated", "exif");
          } else if (data.description) {
            // curator already wrote something — keep theirs, don't pill
            _setSourcePill(el.descriptionSource, "", "");
          }

          // Date: full ISO date if available
          if (data.captured_at && !(el.dateValue.value || "").trim()) {
            el.dateValue.value = data.captured_at;
            el.datePrecision.value = data.captured_at_precision || "exact";
            _setSourcePill(el.dateSource, "from EXIF", "exif");
          }

          // Location: composed address if reverse-geocoder returned anything,
          // OR Plus Code + city if address parts present.
          var addr = data.address || {};
          var bits = [];
          if (data.plus_code) bits.push(data.plus_code);
          var addrPart = "";
          if (addr.city) addrPart = addr.city;
          if (addr.state_abbrev) addrPart += (addrPart ? ", " : "") + addr.state_abbrev;
          else if (addr.state) addrPart += (addrPart ? ", " : "") + addr.state;
          if (addr.country) addrPart += (addrPart ? ", " : "") + addr.country;
          if (addrPart) bits.push(addrPart);
          var composedLocation = bits.join(" ");

          if (composedLocation && !(el.locationLabel.value || "").trim()) {
            el.locationLabel.value = composedLocation;
            // GPS-derived location is high-confidence; mark source.
            if (data.gps && data.gps.source === "exif_gps") {
              el.locationSource.value = "exif_gps";
              _setSourcePill(el.locationSourcePill, "from phone GPS", "gps");
            } else {
              el.locationSource.value = "description_geocode";
              _setSourcePill(el.locationSourcePill, "geocoded", "exif");
            }
          }

          // Status readout
          var summary_bits = [];
          if (data.captured_at) summary_bits.push("date");
          if (data.gps && data.gps.latitude != null) summary_bits.push("GPS");
          if (addr.city) summary_bits.push("city");
          if (data.plus_code) summary_bits.push("Plus Code");
          summary_bits.push(data.raw_exif_keys + " EXIF tags");

          _setReviewStatus("Found: " + summary_bits.join(", "), "ok");
        })
        .catch(function (e) {
          _setReviewStatus("Review failed: " + (e.message || e), "err");
        })
        .finally(function () {
          el.reviewBtn.disabled = !(el.file && el.file.files && el.file.files[0]);
        });
    });
  }

  // Reset button should also clear the thumbnail + pills
  if (el.reset) {
    var origReset = el.reset.onclick;
    el.reset.addEventListener("click", function () {
      if (el.thumbPreview) el.thumbPreview.hidden = true;
      if (el.reviewBtn) el.reviewBtn.disabled = true;
      _setReviewStatus("");
      _setSourcePill(el.descriptionSource, "", "");
      _setSourcePill(el.dateSource, "", "");
      _setSourcePill(el.locationSourcePill, "", "");
    });
  }

  // ── Bootstrap ────────────────────────────────────────────────
  loadNarrators().then(refreshList);
})();
