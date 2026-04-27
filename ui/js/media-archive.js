/* ═══════════════════════════════════════════════════════════════
   media-archive.js — WO-MEDIA-ARCHIVE-01

   Curator-only Document Archive page. Talks to:
     POST   /api/media-archive          (multipart upload)
     GET    /api/media-archive          (list with filters)
     GET    /api/media-archive/{id}     (detail)
     PATCH  /api/media-archive/{id}     (edit)
     DELETE /api/media-archive/{id}     (soft delete; ?actor_id required)
     GET    /api/media-archive/{id}/file   (serve original)
     GET    /api/media-archive/{id}/thumb  (serve thumbnail)
     GET    /api/people                 (narrator picker)

   Locked product rule (spec §1):
     Preserve first. Tag second. Transcribe / OCR third.
     Extract candidates only after that. NEVER auto-promote to truth.

   This page intentionally does NOT call Bio Builder. The
   `candidate_ready` flag is operator-set; future
   WO-MEDIA-ARCHIVE-CANDIDATES-01 lane will harvest from there.
═══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var ORIGIN = window.LOREVOX_API || "http://localhost:8000";
  var LS_NARRATOR = "ma_narrator_id_v1";
  var LS_FAMILY   = "ma_family_line_v1";
  var LS_CURATOR  = "ma_curator_user_id_v1";

  // Mirror photo-intake.js _resolveApiUrl: backend synthesizes
  // /api/media-archive/{id}/thumb and /file as RELATIVE paths. Page is
  // served from port 8082 (lorevox-serve.py); API lives on port 8000.
  // Without origin prefix the browser hits :8082 which 404s.
  function _resolveApiUrl(u) {
    if (!u) return "";
    var s = String(u);
    if (s.indexOf("http://") === 0 || s.indexOf("https://") === 0 ||
        s.indexOf("data:")  === 0 || s.indexOf("blob:")    === 0) return s;
    if (s.charAt(0) === "/") return ORIGIN + s;
    return s;
  }

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    // Upload form
    narrator:       $("maNarrator"),
    familyLine:     $("maFamilyLine"),
    file:           $("maFile"),
    title:          $("maTitle"),
    documentType:   $("maDocumentType"),
    description:    $("maDescription"),
    dateValue:      $("maDateValue"),
    datePrecision:  $("maDatePrecision"),
    locationLabel:  $("maLocationLabel"),
    locationSource: $("maLocationSource"),
    timelineYear:   $("maTimelineYear"),
    lifeMapEra:     $("maLifeMapEra"),
    lifeMapSection: $("maLifeMapSection"),
    peopleList:     $("maPeopleList"),
    addPerson:      $("maAddPersonBtn"),
    familyLinesList:$("maFamilyLinesList"),
    addFamilyLine:  $("maAddFamilyLineBtn"),
    manualTrans:    $("maManualTranscription"),
    operatorNotes:  $("maOperatorNotes"),
    archiveOnly:    $("maArchiveOnly"),
    candidateReady: $("maCandidateReady"),
    save:           $("maSaveBtn"),
    reset:          $("maResetBtn"),
    status:         $("maStatus"),

    // Saved list
    list:           $("maList"),
    listStatus:     $("maListStatus"),

    // View / Edit modal
    modalBackdrop:        $("maModalBackdrop"),
    modalTitle:           $("maModalTitle"),
    modalThumb:           $("maModalThumb"),
    modalMetaReadonly:    $("maModalMetaReadonly"),
    modalOpenOriginal:    $("maModalOpenOriginal"),
    modalTitleInput:      $("maModalTitleInput"),
    modalDocumentType:    $("maModalDocumentType"),
    modalDescription:     $("maModalDescription"),
    modalDateValue:       $("maModalDateValue"),
    modalDatePrecision:   $("maModalDatePrecision"),
    modalLocationLabel:   $("maModalLocationLabel"),
    modalTimelineYear:    $("maModalTimelineYear"),
    modalLifeMapEra:      $("maModalLifeMapEra"),
    modalLifeMapSection:  $("maModalLifeMapSection"),
    modalPeopleList:      $("maModalPeopleList"),
    modalAddPersonBtn:    $("maModalAddPersonBtn"),
    modalFamilyLinesList: $("maModalFamilyLinesList"),
    modalAddFamilyLineBtn:$("maModalAddFamilyLineBtn"),
    modalManualTrans:     $("maModalManualTranscription"),
    modalOperatorNotes:   $("maModalOperatorNotes"),
    modalArchiveOnly:     $("maModalArchiveOnly"),
    modalCandidateReady:  $("maModalCandidateReady"),
    modalCloseBtn:        $("maModalCloseBtn"),
    modalCancelBtn:       $("maModalCancelBtn"),
    modalSaveBtn:         $("maModalSaveBtn"),
    modalDeleteBtn:       $("maModalDeleteBtn"),
    modalStatus:          $("maModalStatus"),
  };

  // ── Status helpers ──────────────────────────────────────────
  function setStatus(msg, level) {
    if (!el.status) return;
    el.status.textContent = msg || "";
    el.status.className = "ma-status" + (level ? " " + level : "");
  }
  function setListStatus(msg, level) {
    if (!el.listStatus) return;
    el.listStatus.textContent = msg || "";
    el.listStatus.className = "ma-status" + (level ? " " + level : "");
  }
  function setModalStatus(msg, level) {
    if (!el.modalStatus) return;
    el.modalStatus.textContent = msg || "";
    el.modalStatus.className = "ma-status" + (level ? " " + level : "");
  }

  // ── Curator identity ────────────────────────────────────────
  function getCuratorId() {
    var id = localStorage.getItem(LS_CURATOR);
    if (!id) {
      id = "curator_" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(LS_CURATOR, id);
    }
    return id;
  }

  // ── Narrator picker ─────────────────────────────────────────
  function loadNarrators() {
    return fetch(ORIGIN + "/api/people")
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (people) {
        var items = Array.isArray(people) ? people
                   : (people && Array.isArray(people.people) ? people.people : []);
        if (!el.narrator) return;
        el.narrator.innerHTML = '<option value="">— no narrator —</option>';
        items.forEach(function (p) {
          var opt = document.createElement("option");
          opt.value = p.id || p.person_id || "";
          opt.textContent = p.display_name || p.name || opt.value;
          el.narrator.appendChild(opt);
        });
        var saved = localStorage.getItem(LS_NARRATOR);
        if (saved) {
          var opts = Array.from(el.narrator.options).map(function (o) { return o.value; });
          if (opts.indexOf(saved) >= 0) el.narrator.value = saved;
        }
      })
      .catch(function () {
        if (el.narrator) {
          el.narrator.innerHTML = '<option value="">— /api/people unavailable —</option>';
        }
      });
  }

  if (el.narrator) {
    el.narrator.addEventListener("change", function () {
      localStorage.setItem(LS_NARRATOR, el.narrator.value);
      refreshList();
    });
  }
  if (el.familyLine) {
    el.familyLine.addEventListener("change", function () {
      var v = (el.familyLine.value || "").trim();
      if (v) localStorage.setItem(LS_FAMILY, v);
      else   localStorage.removeItem(LS_FAMILY);
    });
    var savedFam = localStorage.getItem(LS_FAMILY);
    if (savedFam) el.familyLine.value = savedFam;
  }

  // ── Dynamic person / family-line rows (upload form) ─────────
  function makePersonRow(initial) {
    initial = initial || {};
    var row = document.createElement("div");
    row.className = "ma-people-row";
    var inp = document.createElement("input");
    inp.type = "text";
    inp.className = "ma-person-label";
    inp.placeholder = "person name (e.g. Charlotte Graichen, Grandma Minnie)";
    inp.value = initial.person_label || initial.label || "";
    var rm = document.createElement("button");
    rm.type = "button";
    rm.className = "ma-chip-btn";
    rm.textContent = "Remove";
    rm.addEventListener("click", function () { row.remove(); });
    row.appendChild(inp);
    row.appendChild(rm);
    return row;
  }
  function makeFamilyLineRow(initial) {
    initial = initial || {};
    var row = document.createElement("div");
    row.className = "ma-family-line-row";
    var inp = document.createElement("input");
    inp.type = "text";
    inp.className = "ma-family-line-input";
    inp.placeholder = "family line (e.g. Shong, Horne, Graichen)";
    inp.value = initial.family_line || initial.label || "";
    var rm = document.createElement("button");
    rm.type = "button";
    rm.className = "ma-chip-btn";
    rm.textContent = "Remove";
    rm.addEventListener("click", function () { row.remove(); });
    row.appendChild(inp);
    row.appendChild(rm);
    return row;
  }

  if (el.addPerson) {
    el.addPerson.addEventListener("click", function () {
      el.peopleList.appendChild(makePersonRow());
    });
  }
  if (el.addFamilyLine) {
    el.addFamilyLine.addEventListener("click", function () {
      el.familyLinesList.appendChild(makeFamilyLineRow());
    });
  }

  function collectPeople(listEl, sel) {
    if (!listEl) return [];
    var rows = listEl.querySelectorAll(sel);
    var out = [];
    rows.forEach(function (inp) {
      var v = (inp.value || "").trim();
      if (v) out.push({ person_label: v });
    });
    return out;
  }
  function collectFamilyLines(listEl, sel) {
    if (!listEl) return [];
    var rows = listEl.querySelectorAll(sel);
    var out = [];
    rows.forEach(function (inp) {
      var v = (inp.value || "").trim();
      if (v) out.push({ family_line: v });
    });
    return out;
  }

  // ── Submit (POST /api/media-archive) ────────────────────────
  if (el.save) {
    el.save.addEventListener("click", function () {
      var file = el.file && el.file.files && el.file.files[0];
      if (!file) { setStatus("Please choose a file (PDF, image, or text).", "warn"); return; }

      var title = (el.title.value || "").trim();
      if (!title) { setStatus("Please enter a title.", "warn"); return; }

      var docType = (el.documentType.value || "unknown");

      var fd = new FormData();
      fd.append("file", file);
      fd.append("title", title);
      fd.append("document_type", docType);
      fd.append("uploaded_by_user_id", getCuratorId());

      // Optional context
      var personId = (el.narrator.value || "").trim();
      if (personId) fd.append("person_id", personId);

      var fam = (el.familyLine.value || "").trim();
      if (fam) fd.append("family_line", fam);

      if (el.description && el.description.value.trim()) {
        fd.append("description", el.description.value.trim());
      }
      if (el.dateValue && el.dateValue.value.trim()) {
        fd.append("date_value", el.dateValue.value.trim());
      }
      fd.append("date_precision", (el.datePrecision && el.datePrecision.value) || "unknown");

      if (el.locationLabel && el.locationLabel.value.trim()) {
        fd.append("location_label", el.locationLabel.value.trim());
      }
      fd.append("location_source", (el.locationSource && el.locationSource.value) || "unknown");

      if (el.timelineYear && el.timelineYear.value !== "") {
        fd.append("timeline_year", String(parseInt(el.timelineYear.value, 10)));
      }
      if (el.lifeMapEra && el.lifeMapEra.value.trim()) {
        fd.append("life_map_era", el.lifeMapEra.value.trim());
      }
      if (el.lifeMapSection && el.lifeMapSection.value.trim()) {
        fd.append("life_map_section", el.lifeMapSection.value.trim());
      }

      if (el.manualTrans && el.manualTrans.value.trim()) {
        fd.append("manual_transcription", el.manualTrans.value.trim());
      }
      if (el.operatorNotes && el.operatorNotes.value.trim()) {
        fd.append("operator_notes", el.operatorNotes.value.trim());
      }

      // Locked product rule: archive_only defaults to TRUE (preserve first).
      // candidate_ready stays opt-in.
      fd.append("archive_only",   (el.archiveOnly    && el.archiveOnly.checked)    ? "true" : "false");
      fd.append("candidate_ready",(el.candidateReady && el.candidateReady.checked) ? "true" : "false");

      var peopleRows = collectPeople(el.peopleList, ".ma-person-label");
      if (peopleRows.length) fd.append("people", JSON.stringify(peopleRows));

      var familyLineRows = collectFamilyLines(el.familyLinesList, ".ma-family-line-input");
      if (familyLineRows.length) fd.append("family_lines", JSON.stringify(familyLineRows));

      el.save.disabled = true;
      setStatus("Uploading + probing document…");

      fetch(ORIGIN + "/api/media-archive", { method: "POST", body: fd })
        .then(function (r) {
          if (r.status === 415) {
            return r.text().then(function (t) {
              throw new Error("Unsupported file type: " + (t || "415"));
            });
          }
          if (r.status === 404) {
            throw new Error(
              "Document Archive surface is disabled. " +
              "Set LOREVOX_MEDIA_ARCHIVE_ENABLED=1 in .env and cycle the stack."
            );
          }
          if (!r.ok) {
            return r.text().then(function (t) { throw new Error(t || ("HTTP " + r.status)); });
          }
          return r.json();
        })
        .then(function (resp) {
          var item = resp && resp.item;
          var pages = item && item.page_count;
          var textStatus = item && item.text_status;
          var bits = ["Saved."];
          if (pages != null) bits.push(pages + (pages === 1 ? " page" : " pages"));
          if (textStatus) bits.push("text: " + textStatus);
          setStatus(bits.join(" · "), "ok");
          clearForm();
          refreshList();
        })
        .catch(function (e) {
          setStatus("Upload failed: " + (e && e.message ? e.message : "unknown"), "err");
        })
        .finally(function () { el.save.disabled = false; });
    });
  }

  if (el.reset) {
    el.reset.addEventListener("click", function () {
      clearForm();
      setStatus("");
    });
  }

  function clearForm() {
    if (el.file)            el.file.value = "";
    if (el.title)           el.title.value = "";
    if (el.documentType)    el.documentType.value = "unknown";
    if (el.description)     el.description.value = "";
    if (el.dateValue)       el.dateValue.value = "";
    if (el.datePrecision)   el.datePrecision.value = "unknown";
    if (el.locationLabel)   el.locationLabel.value = "";
    if (el.locationSource)  el.locationSource.value = "unknown";
    if (el.timelineYear)    el.timelineYear.value = "";
    if (el.lifeMapEra)      el.lifeMapEra.value = "";
    if (el.lifeMapSection)  el.lifeMapSection.value = "";
    if (el.peopleList)      el.peopleList.innerHTML = "";
    if (el.familyLinesList) el.familyLinesList.innerHTML = "";
    if (el.manualTrans)     el.manualTrans.value = "";
    if (el.operatorNotes)   el.operatorNotes.value = "";
    if (el.archiveOnly)     el.archiveOnly.checked = true;
    if (el.candidateReady)  el.candidateReady.checked = false;
  }

  // ── Saved list (GET /api/media-archive) ─────────────────────
  function refreshList() {
    if (!el.list) return;
    setListStatus("Loading…");

    // Filters: narrator (person_id) + family_line. If both blank,
    // show ALL items (curators often need to triage unsorted scans).
    var qs = [];
    var personId = el.narrator && el.narrator.value;
    if (personId) qs.push("person_id=" + encodeURIComponent(personId));
    var fam = el.familyLine && (el.familyLine.value || "").trim();
    if (fam) qs.push("family_line=" + encodeURIComponent(fam));
    var url = ORIGIN + "/api/media-archive" + (qs.length ? "?" + qs.join("&") : "");

    fetch(url)
      .then(function (r) {
        if (r.status === 404) {
          throw new Error("Archive surface disabled (LOREVOX_MEDIA_ARCHIVE_ENABLED=0).");
        }
        return r.ok ? r.json() : { items: [] };
      })
      .then(function (body) {
        var items = (body && body.items) ? body.items : [];
        renderList(items);
        var note = items.length + " saved";
        if (personId || fam) {
          var filterBits = [];
          if (personId && el.narrator.selectedOptions[0]) {
            filterBits.push("narrator=" + el.narrator.selectedOptions[0].textContent);
          }
          if (fam) filterBits.push("family=" + fam);
          note += " (filter: " + filterBits.join(", ") + ")";
        }
        setListStatus(items.length ? note : "No archive items yet.");
      })
      .catch(function (e) { setListStatus("Could not load list: " + e.message, "err"); });
  }

  function renderList(items) {
    el.list.innerHTML = "";
    items.forEach(function (it) {
      var row = document.createElement("div");
      row.className = "ma-list-row";

      // Thumb
      var img = document.createElement("img");
      img.className = "ma-thumb ma-thumb-clickable";
      img.alt = "";
      img.title = "Click to view or edit";
      img.src = _resolveApiUrl(it.thumbnail_url || it.media_url || "");
      img.addEventListener("error", function () {
        // Fallback: render a generic file-icon placeholder for items
        // whose thumbnail step couldn't run (e.g. PDF without poppler,
        // or text/markdown). Keep the click handler intact.
        img.src = _placeholderDataUri(it.document_type, it.mime_type);
      });
      img.addEventListener("click", function () { openItemModal(it); });
      row.appendChild(img);

      // Meta
      var meta = document.createElement("div");
      meta.className = "ma-list-meta";

      var title = document.createElement("div");
      title.className = "ma-list-title";
      title.textContent = it.title || "(untitled)";
      meta.appendChild(title);

      var sub = document.createElement("div");
      sub.className = "ma-list-sub";
      var subBits = [];
      if (it.document_type && it.document_type !== "unknown") {
        subBits.push(it.document_type.replace(/_/g, " "));
      }
      if (it.page_count != null) subBits.push(it.page_count + (it.page_count === 1 ? " pg" : " pgs"));
      if (it.date_value) {
        var dv = it.date_value;
        if (it.date_precision && it.date_precision !== "unknown") dv += " (" + it.date_precision + ")";
        subBits.push(dv);
      }
      if (it.location_label) subBits.push(it.location_label);
      sub.textContent = subBits.join(" · ");
      meta.appendChild(sub);

      // Pills row (family line, candidate-ready, archive-only, text status)
      var pills = document.createElement("div");
      pills.className = "ma-list-pills";

      if (it.family_line) {
        var fp = document.createElement("span");
        fp.className = "ma-pill family";
        fp.textContent = "family: " + it.family_line;
        pills.appendChild(fp);
      }
      if (it.candidate_ready) {
        var cp = document.createElement("span");
        cp.className = "ma-pill ready";
        cp.textContent = "candidate ready";
        pills.appendChild(cp);
      }
      if (it.archive_only) {
        var ap = document.createElement("span");
        ap.className = "ma-pill archive";
        ap.textContent = "archive only";
        pills.appendChild(ap);
      }
      if (it.text_status && it.text_status !== "not_started") {
        var tp = document.createElement("span");
        tp.className = "ma-pill text";
        tp.textContent = "text: " + it.text_status.replace(/_/g, " ");
        pills.appendChild(tp);
      }
      if (pills.childNodes.length) meta.appendChild(pills);

      row.appendChild(meta);

      // Actions
      var actions = document.createElement("div");
      actions.className = "ma-list-actions";

      var view = document.createElement("button");
      view.type = "button";
      view.className = "ma-chip-btn";
      view.textContent = "View / Edit";
      view.addEventListener("click", function () { openItemModal(it); });
      actions.appendChild(view);

      var openOrig = document.createElement("a");
      openOrig.className = "ma-chip-btn";
      openOrig.style.textDecoration = "none";
      openOrig.style.display = "inline-block";
      openOrig.target = "_blank";
      openOrig.rel = "noopener";
      openOrig.href = _resolveApiUrl(it.media_url || ("/api/media-archive/" + it.id + "/file"));
      openOrig.textContent = "Open Original";
      actions.appendChild(openOrig);

      row.appendChild(actions);
      el.list.appendChild(row);
    });
  }

  // Inline SVG placeholder for items without a real thumbnail.
  // Keeps the list visually consistent and tells the operator at a
  // glance what KIND of file they're looking at.
  function _placeholderDataUri(docType, mimeType) {
    var label = (docType || "document").replace(/_/g, " ").slice(0, 18);
    var icon = "DOC";
    var m = (mimeType || "").toLowerCase();
    if (m.indexOf("pdf") >= 0) icon = "PDF";
    else if (m.indexOf("image/") === 0) icon = "IMG";
    else if (m.indexOf("text/") === 0) icon = "TXT";
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">' +
        '<rect width="80" height="80" fill="#1e293b" stroke="#334155" stroke-width="2"/>' +
        '<text x="40" y="38" fill="#94a3b8" font-family="Inter, sans-serif" ' +
              'font-size="16" font-weight="600" text-anchor="middle">' + icon + '</text>' +
        '<text x="40" y="58" fill="#64748b" font-family="Inter, sans-serif" ' +
              'font-size="7" text-anchor="middle">' + _xmlEsc(label) + '</text>' +
      '</svg>';
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }
  function _xmlEsc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ═══════════════════════════════════════════════════════════════
  // VIEW / EDIT MODAL
  // ═══════════════════════════════════════════════════════════════
  var _modalItem = null;

  function _makeModalPersonRow(initial) {
    initial = initial || {};
    var row = document.createElement("div");
    row.className = "ma-people-row";
    var inp = document.createElement("input");
    inp.type = "text";
    inp.className = "ma-modal-person-label";
    inp.placeholder = "person name";
    inp.value = initial.person_label || initial.label || "";
    var rm = document.createElement("button");
    rm.type = "button";
    rm.className = "ma-chip-btn";
    rm.textContent = "Remove";
    rm.addEventListener("click", function () { row.remove(); });
    row.appendChild(inp);
    row.appendChild(rm);
    return row;
  }
  function _makeModalFamilyLineRow(initial) {
    initial = initial || {};
    var row = document.createElement("div");
    row.className = "ma-family-line-row";
    var inp = document.createElement("input");
    inp.type = "text";
    inp.className = "ma-modal-family-line-input";
    inp.placeholder = "family line";
    inp.value = initial.family_line || initial.label || "";
    var rm = document.createElement("button");
    rm.type = "button";
    rm.className = "ma-chip-btn";
    rm.textContent = "Remove";
    rm.addEventListener("click", function () { row.remove(); });
    row.appendChild(inp);
    row.appendChild(rm);
    return row;
  }
  function _collectModalPeople() {
    return collectPeople(el.modalPeopleList, ".ma-modal-person-label");
  }
  function _collectModalFamilyLines() {
    return collectFamilyLines(el.modalFamilyLinesList, ".ma-modal-family-line-input");
  }

  function openItemModal(item) {
    if (!el.modalBackdrop) return;
    _modalItem = item;

    if (el.modalTitle) {
      el.modalTitle.textContent = item.title || "Archive Item";
    }
    if (el.modalThumb) {
      el.modalThumb.src = _resolveApiUrl(item.thumbnail_url || item.media_url || "");
      el.modalThumb.onerror = function () {
        el.modalThumb.src = _placeholderDataUri(item.document_type, item.mime_type);
      };
    }
    if (el.modalOpenOriginal) {
      el.modalOpenOriginal.href = _resolveApiUrl(
        item.media_url || ("/api/media-archive/" + item.id + "/file")
      );
    }

    // Read-only meta block (file info, hashes, statuses)
    if (el.modalMetaReadonly) {
      var bits = [];
      if (item.original_filename) bits.push("file: " + item.original_filename);
      if (item.mime_type)         bits.push("mime: " + item.mime_type);
      if (item.file_size_bytes != null) {
        bits.push("size: " + _bytesPretty(item.file_size_bytes));
      }
      if (item.page_count != null) bits.push("pages: " + item.page_count);
      if (item.text_status)        bits.push("text: " + item.text_status);
      if (item.transcription_status && item.transcription_status !== "not_started") {
        bits.push("transcription: " + item.transcription_status);
      }
      if (item.extraction_status && item.extraction_status !== "none") {
        bits.push("extraction: " + item.extraction_status);
      }
      if (item.uploaded_at) bits.push("uploaded: " + item.uploaded_at);
      el.modalMetaReadonly.innerHTML = bits
        .map(function (b) { return '<div class="ma-modal-meta-row">' + _xmlEsc(b) + '</div>'; })
        .join("");
    }

    // Editable fields
    if (el.modalTitleInput)     el.modalTitleInput.value     = item.title || "";
    if (el.modalDocumentType)   el.modalDocumentType.value   = item.document_type || "unknown";
    if (el.modalDescription)    el.modalDescription.value    = item.description || "";
    if (el.modalDateValue)      el.modalDateValue.value      = item.date_value || "";
    if (el.modalDatePrecision)  el.modalDatePrecision.value  = item.date_precision || "unknown";
    if (el.modalLocationLabel)  el.modalLocationLabel.value  = item.location_label || "";
    if (el.modalTimelineYear)   el.modalTimelineYear.value   = item.timeline_year != null ? item.timeline_year : "";
    if (el.modalLifeMapEra)     el.modalLifeMapEra.value     = item.life_map_era || "";
    if (el.modalLifeMapSection) el.modalLifeMapSection.value = item.life_map_section || "";
    if (el.modalManualTrans)    el.modalManualTrans.value    = item.manual_transcription || "";
    if (el.modalOperatorNotes)  el.modalOperatorNotes.value  = item.operator_notes || "";
    if (el.modalArchiveOnly)    el.modalArchiveOnly.checked  = !!item.archive_only;
    if (el.modalCandidateReady) el.modalCandidateReady.checked = !!item.candidate_ready;

    // People list
    if (el.modalPeopleList) {
      el.modalPeopleList.innerHTML = "";
      var people = (item.people && Array.isArray(item.people)) ? item.people : [];
      people.forEach(function (p) {
        el.modalPeopleList.appendChild(_makeModalPersonRow(p));
      });
    }
    // Family lines list
    if (el.modalFamilyLinesList) {
      el.modalFamilyLinesList.innerHTML = "";
      var fams = (item.family_lines && Array.isArray(item.family_lines)) ? item.family_lines : [];
      fams.forEach(function (f) {
        el.modalFamilyLinesList.appendChild(_makeModalFamilyLineRow(f));
      });
    }

    setModalStatus("");
    el.modalBackdrop.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeItemModal() {
    if (!el.modalBackdrop) return;
    el.modalBackdrop.hidden = true;
    document.body.style.overflow = "";
    _modalItem = null;
    setModalStatus("");
  }

  function saveItemModal() {
    if (!_modalItem || !el.modalSaveBtn) return;
    var itemId = _modalItem.id;

    // PATCH body. Always send last_edited_by_user_id (required). Use
    // null for cleared fields so the backend records the wipe.
    var body = {
      title:                (el.modalTitleInput.value     || "").trim() || null,
      document_type:        el.modalDocumentType.value    || "unknown",
      description:          (el.modalDescription.value    || "").trim() || null,
      date_value:           (el.modalDateValue.value      || "").trim() || null,
      date_precision:       el.modalDatePrecision.value   || "unknown",
      location_label:       (el.modalLocationLabel.value  || "").trim() || null,
      timeline_year:        el.modalTimelineYear.value !== ""
                              ? parseInt(el.modalTimelineYear.value, 10)
                              : null,
      life_map_era:         (el.modalLifeMapEra.value     || "").trim() || null,
      life_map_section:     (el.modalLifeMapSection.value || "").trim() || null,
      manual_transcription: (el.modalManualTrans.value    || "").trim() || null,
      operator_notes:       (el.modalOperatorNotes.value  || "").trim() || null,
      archive_only:         !!el.modalArchiveOnly.checked,
      candidate_ready:      !!el.modalCandidateReady.checked,
      // Replace-all on join tables (mirrors WO-PHOTO-PEOPLE-EDIT-01).
      people:               _collectModalPeople(),
      family_lines:         _collectModalFamilyLines(),
      last_edited_by_user_id: getCuratorId(),
    };

    el.modalSaveBtn.disabled = true;
    setModalStatus("Saving…");

    fetch(ORIGIN + "/api/media-archive/" + encodeURIComponent(itemId), {
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
        if (updated && updated.id) {
          _modalItem = updated;
          setModalStatus("Saved.", "ok");
        }
        refreshList();
      })
      .catch(function (e) {
        setModalStatus("Save failed: " + (e.message || e), "err");
      })
      .finally(function () { el.modalSaveBtn.disabled = false; });
  }

  function deleteItemFromModal() {
    if (!_modalItem) return;
    if (!confirm(
      "Soft-delete this archive item? The original file stays on disk and " +
      "the row stays in the database; it just disappears from the list. " +
      "An admin can restore it manually later."
    )) return;
    var itemId = _modalItem.id;
    if (el.modalDeleteBtn) el.modalDeleteBtn.disabled = true;
    setModalStatus("Deleting…");

    var deleteUrl = ORIGIN + "/api/media-archive/" + encodeURIComponent(itemId) +
                    "?actor_id=" + encodeURIComponent(getCuratorId());
    fetch(deleteUrl, { method: "DELETE" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        closeItemModal();
        refreshList();
      })
      .catch(function (e) {
        setModalStatus("Delete failed: " + (e.message || e), "err");
      })
      .finally(function () {
        if (el.modalDeleteBtn) el.modalDeleteBtn.disabled = false;
      });
  }

  // ── Wire modal controls ─────────────────────────────────────
  if (el.modalCloseBtn)         el.modalCloseBtn.addEventListener("click", closeItemModal);
  if (el.modalCancelBtn)        el.modalCancelBtn.addEventListener("click", closeItemModal);
  if (el.modalSaveBtn)          el.modalSaveBtn.addEventListener("click", saveItemModal);
  if (el.modalDeleteBtn)        el.modalDeleteBtn.addEventListener("click", deleteItemFromModal);
  if (el.modalAddPersonBtn) {
    el.modalAddPersonBtn.addEventListener("click", function () {
      if (el.modalPeopleList) el.modalPeopleList.appendChild(_makeModalPersonRow());
    });
  }
  if (el.modalAddFamilyLineBtn) {
    el.modalAddFamilyLineBtn.addEventListener("click", function () {
      if (el.modalFamilyLinesList) el.modalFamilyLinesList.appendChild(_makeModalFamilyLineRow());
    });
  }

  // Backdrop click closes; clicking inside the panel does not
  if (el.modalBackdrop) {
    el.modalBackdrop.addEventListener("click", function (ev) {
      if (ev.target === el.modalBackdrop) closeItemModal();
    });
  }
  // ESC closes
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && el.modalBackdrop && !el.modalBackdrop.hidden) {
      closeItemModal();
    }
  });

  // ── Misc helpers ────────────────────────────────────────────
  function _bytesPretty(n) {
    if (n == null) return "?";
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(0) + " KB";
    if (n < 1073741824) return (n / 1048576).toFixed(1) + " MB";
    return (n / 1073741824).toFixed(2) + " GB";
  }

  // ── Bootstrap ───────────────────────────────────────────────
  // Health probe surfaces the disabled-flag case before the operator
  // tries to upload and gets a confusing 404. Probe is intentionally
  // ungated server-side so this works regardless of flag state.
  fetch(ORIGIN + "/api/media-archive/health")
    .then(function (r) { return r.ok ? r.json() : { ok: false, enabled: false }; })
    .then(function (h) {
      if (!h || !h.enabled) {
        setStatus(
          "Document Archive is DISABLED. Set LOREVOX_MEDIA_ARCHIVE_ENABLED=1 " +
          "in .env and cycle the stack. Form is visible but uploads will 404.",
          "warn"
        );
      }
    })
    .catch(function () {
      setStatus("Cannot reach API at " + ORIGIN + ". Is the stack up?", "err");
    });

  loadNarrators().then(refreshList);
})();
