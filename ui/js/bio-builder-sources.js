/* ═══════════════════════════════════════════════════════════════
   bio-builder-sources.js — Source intake, text extraction engine,
   and source card review UI

   Phase 3 of the Bio Builder module split.
   Depends on: bio-builder-core.js (must load first)

   Owns:
     - File intake (_handleFiles, _guessSourceType, _canExtractText)
     - Text extraction (_readFileAsText, _readAndExtract)
     - Pattern-based detection engine (_parseTextItems and sub-detectors)
     - Source card review surface (rendering, status, paste flow)
     - Source view state (_activeSourceCardId)

   Does NOT own:
     - Candidate shaping (stays in bio-builder.js → later candidates module)
     - Duplicate guards on candidates
     - Provenance normalization on candidates

   Exposes: window.LorevoxBioBuilderModules.sources
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ───────────────────────────────────────────────────────────
     CORE MODULE DELEGATION
  ─────────────────────────────────────────────────────────── */

  var _core = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.core;
  if (!_core) throw new Error("bio-builder-core.js must load before bio-builder-sources.js");

  var _bb              = _core._bb;
  var _uid             = _core._uid;
  var _esc             = _core._esc;
  var _el              = _core._el;
  var _currentPersonId = _core._currentPersonId;
  var _formatBytes     = _core._formatBytes;
  var _emptyStateHtml  = _core._emptyStateHtml;

  /* ───────────────────────────────────────────────────────────
     SOURCE VIEW STATE
  ─────────────────────────────────────────────────────────── */

  var _activeSourceCardId = null;

  function _clearSourceReviewState() {
    _activeSourceCardId = null;
  }

  /* ───────────────────────────────────────────────────────────
     FILE HELPERS
  ─────────────────────────────────────────────────────────── */

  function _readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) { resolve(e.target.result || ""); };
      reader.onerror = function () { reject(new Error("FileReader failed")); };
      reader.readAsText(file, "UTF-8");
    });
  }

  function _canExtractText(file) {
    var name = (file.name || "").toLowerCase();
    var mime = (file.type || "").toLowerCase();
    return (
      mime.startsWith("text/") ||
      /\.(txt|md|markdown|csv|tsv|rtf|htm|html|log)$/.test(name)
    );
  }

  function _guessSourceType(filename, mimeType) {
    var name = (filename || "").toLowerCase();
    var mime = (mimeType || "").toLowerCase();
    if (mime.startsWith("image/") || /\.(jpg|jpeg|png|gif|heic|tiff|webp|bmp)$/.test(name)) return "Image";
    if (mime === "application/pdf" || name.endsWith(".pdf")) return "PDF";
    if (/\.(doc|docx)$/.test(name)) return "Word";
    if (mime.startsWith("text/") || /\.(txt|md|markdown|csv|tsv|rtf|log)$/.test(name)) return "Text";
    return "Document";
  }

  /* ───────────────────────────────────────────────────────────
     TEXT EXTRACTION ENGINE

     _parseTextItems(text) → { people, dates, places, memories }

     Each detected item:
     {
       id:       uid,
       text:     the matched value (name / year / place / sentence),
       context:  surrounding sentence (shown in review surface),
       relation: (people only) "mother" | "father" | "sister" etc.
       added:    false   ← set true when user adds it as a candidate
     }

     Detection strategy:
       people    — relationship keyword anchor + nearby proper noun
       dates     — full dates, 4-digit years, decade refs
       places    — movement/origin verbs + capitalized phrase
       memories  — sentences containing recall/reminiscence language

     All detection is conservative — context is always shown so the
     user can judge whether each item is worth adding as a candidate.
  ─────────────────────────────────────────────────────────── */

  var REL_KEYWORDS = [
    "mother","father","mom","dad","mama","papa","mum",
    "grandmother","grandfather","grandma","grandpa","gran","granny","nana","grandad","granddad",
    "sister","brother","aunt","uncle",
    "wife","husband","spouse","partner",
    "daughter","son","child",
    "grandson","granddaughter","grandchild",
    "cousin","niece","nephew",
    "stepmother","stepfather","stepdad","stepmom","stepsis","stepbrother",
    "mother-in-law","father-in-law","sister-in-law","brother-in-law"
  ];

  var MEMORY_TRIGGERS = [
    "I remember", "I recall", "I can still", "I'll never forget", "I will never forget",
    "I never forgot", "I always remember", "I used to", "used to",
    "when I was", "as a child", "as a little", "as a kid", "as a young",
    "growing up", "my earliest", "my first", "my favorite", "my fondest",
    "fondly remember", "always cherished", "never forget", "miss those",
    "those days", "back then", "in those days", "at that time"
  ];

  var MOVEMENT_VERBS = [
    "born in", "born near", "born at",
    "grew up in", "grew up near",
    "raised in", "raised near",
    "lived in", "lived near", "lived on",
    "moved to", "moved from",
    "settled in", "settled near",
    "relocated to", "emigrated to", "emigrated from",
    "immigrated to", "immigrated from",
    "came from", "came to",
    "was from", "originally from",
    "grew up outside", "grew up around"
  ];

  /* Split text into sentences for context lookup */
  function _sentences(text) {
    return text
      .split(/(?<=[.!?])\s+(?=[A-Z"']|$)/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 5; });
  }

  /* Find the sentence containing a match */
  function _contextSentence(text, matchIndex, matchLength) {
    var before  = text.slice(0, matchIndex);
    var after   = text.slice(matchIndex + matchLength);
    var sentStart = before.lastIndexOf(". ");
    var sentEnd   = after.search(/[.!?]/);
    var start = sentStart < 0 ? Math.max(0, matchIndex - 80) : sentStart + 2;
    var end   = sentEnd < 0   ? Math.min(text.length, matchIndex + matchLength + 80)
                              : matchIndex + matchLength + sentEnd + 1;
    var ctx = text.slice(start, end).trim();
    if (ctx.length > 200) ctx = ctx.slice(0, 197) + "\u2026";
    return ctx;
  }

  /*
   * Words that begin with a capital letter but are NOT person names.
   * Checked against both the full captured string and its first word.
   */
  var _NOT_NAMES = new Set([
    // Articles / determiners
    "The","A","An","My","Her","His","Their","Our","Your","Its",
    // Pronouns
    "I","We","She","He","They","You","It","Me","Us","Him","Them","Himself","Herself",
    // Demonstratives
    "This","That","These","Those",
    // Prepositions / conjunctions
    "For","On","In","At","To","Of","And","But","Or","So","As","If","By","Up",
    "Out","Off","From","With","About","After","Before","During","Since","Until",
    // Calendar
    "January","February","March","April","May","June","July","August",
    "September","October","November","December",
    "Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday",
    // Common sentence-starters that aren't names
    "There","Here","Where","When","While","Although","Because","Since",
    "Then","Now","Later","Today","Yesterday","Tomorrow",
    "Mr","Mrs","Miss","Ms","Dr","Prof",
    // Days / time words
    "Spring","Summer","Autumn","Fall","Winter",
    "North","South","East","West","Northern","Southern","Eastern","Western",
    // Very common non-name capitalized words in bio text
    "World","War","School","College","University","Church","God","Lord",
    "United","States","America","American","English","Irish","Scottish"
  ]);

  // Last-word suffixes that indicate a street, road, or geographic feature — not a person
  var _GEO_SUFFIXES = new Set([
    "Street","St","Avenue","Ave","Road","Rd","Drive","Dr","Lane","Ln",
    "Boulevard","Blvd","Court","Ct","Way","Place","Pl","Circle","Cir","Terrace",
    "Highway","Hwy","Parkway","Pkwy","Creek","River","Lake","Mountain","Hill",
    "Valley","Park","Bridge","Farm","Ranch","County","Township","District",
    "Railroad","Railway","College","University","School","Hospital","Church",
    "Elementary","High","Junior","Senior","Middle"
  ]);

  /*
   * Return true if `name` looks like a real person name:
   *   - first char is genuinely uppercase (charCode 65-90 = A-Z)
   *   - not in the exclusion set
   *   - has at least 2 words (single word = too ambiguous)
   *   - each word is 2+ chars
   */
  function _looksLikeName(name) {
    var first = name.charCodeAt(0);
    if (first < 65 || first > 90) return false;                  // must start A-Z
    var words = name.split(/\s+/);
    if (words.length < 2) return false;                           // need >= 2 words
    if (_NOT_NAMES.has(name) || _NOT_NAMES.has(words[0])) return false;
    if (_GEO_SUFFIXES.has(words[words.length - 1])) return false; // street/place suffix
    if (words.some(function (w) { return w.length < 2; })) return false;
    return true;
  }

  function _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /* ── People detection ───────────────────────────────────── */
  function _detectPeople(text) {
    var found = [];
    var seen  = {};
    var m;

    /*
     * Pattern 1: Relationship keyword -> proper name within the same clause.
     *
     * BUG: using `gi` on a regex containing [A-Z] causes JavaScript to
     * expand [A-Z] to match all letters (both cases) due to case-insensitive
     * mode.  We therefore:
     *   a) use `gi` ONLY to locate the relationship keyword, then
     *   b) search the surrounding text with a separate regex that has NO
     *      `i` flag -- [A-Z] then strictly matches uppercase A-Z only.
     *
     * Search order: AFTER the keyword first (primary direction), then
     * BEFORE the keyword only as a fallback.  Searching after first
     * prevents a prior name in the window from displacing the intended
     * one (e.g. "...sister Patricia... and his brother Robert..." -- when
     * scanning for "brother" we want "Robert", not "Patricia").
     */
    var kwPat   = new RegExp("\\b(" + REL_KEYWORDS.join("|") + ")\\b", "gi");
    // Name pattern -- NO `i` flag: [A-Z] = uppercase A-Z only
    var namePat = /\b([A-Z][a-z]{1,18}(?:\s+[A-Z][a-z]{1,18}){1,2})\b/g;

    function _firstNameIn(searchText, fallbackPos) {
      namePat.lastIndex = 0;
      var nm;
      while ((nm = namePat.exec(searchText)) !== null) {
        var candidate = nm[1].trim();
        if (_looksLikeName(candidate)) return candidate;
      }
      return null;
    }

    while ((m = kwPat.exec(text)) !== null) {
      var relation  = m[1].toLowerCase();
      var kwEnd     = m.index + m[0].length;

      // -- Primary: search AFTER the keyword (same clause) --
      var afterKw   = text.slice(kwEnd, Math.min(text.length, kwEnd + 140));
      var sentBreak = afterKw.search(/[.!?]/);
      var clause    = sentBreak >= 0 ? afterKw.slice(0, sentBreak) : afterKw;

      var name = _firstNameIn(clause);

      // -- Fallback: search BEFORE the keyword --
      // Handles "Margaret, his mother, was born..." constructions.
      if (!name) {
        var beforeKw = text.slice(Math.max(0, m.index - 60), m.index);
        // Trim before at previous sentence boundary
        var prevSent = beforeKw.search(/[.!?][^.!?]*$/);
        var beforeClip = prevSent >= 0 ? beforeKw.slice(prevSent + 1) : beforeKw;
        name = _firstNameIn(beforeClip);
      }

      if (!name) continue;
      var key = name.toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;

      var namePos = text.indexOf(name, Math.max(0, m.index - 60));
      found.push({
        id:       _uid(),
        text:     name,
        relation: relation,
        context:  _contextSentence(text, namePos >= 0 ? namePos : m.index, name.length),
        added:    false
      });
    }

    // Pattern 2: "named X" / "called X" / "known as X"  -- no `i` flag needed (keywords are lowercase)
    var namedPat = /\b(?:named|called|known as)\s+([A-Z][a-z]{1,18}(?:\s+[A-Z][a-z]{1,18}){0,2})/g;
    while ((m = namedPat.exec(text)) !== null) {
      var name2 = m[1].trim();
      if (!_looksLikeName(name2)) continue;
      var key2 = name2.toLowerCase();
      if (seen[key2]) continue;
      seen[key2] = true;
      found.push({ id: _uid(), text: name2, relation: "", context: _contextSentence(text, m.index, m[0].length), added: false });
    }

    // Pattern 3: Mr. / Mrs. / Miss / Ms. / Dr. followed by a surname
    var titlePat = /\b(Mr\.|Mrs\.|Miss|Ms\.|Dr\.)\s+([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20})?)/g;
    while ((m = titlePat.exec(text)) !== null) {
      var name3 = m[2].trim();
      var full3 = m[1] + " " + name3;
      var key3  = full3.toLowerCase();
      if (seen[key3]) continue;
      seen[key3] = true;
      found.push({ id: _uid(), text: full3, relation: "", context: _contextSentence(text, m.index, m[0].length), added: false });
    }

    return found.slice(0, 20);
  }

  /* ── Date detection ─────────────────────────────────────── */
  function _detectDates(text) {
    var found       = [];
    var seen        = {};
    var seenYears   = new Set(); // years already covered by a full date
    var m;

    // Full dates first: "January 15, 1942" / "15th January 1942"
    var fullDatePat = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+(\d{4})\b/g;
    while ((m = fullDatePat.exec(text)) !== null) {
      var ds = m[0].trim();
      if (!seen[ds]) {
        seen[ds] = true;
        seenYears.add(m[2]); // mark the year so we don't emit it as a bare year too
        found.push({ id: _uid(), text: ds, context: _contextSentence(text, m.index, m[0].length), added: false });
      }
    }

    // Numeric dates: MM/DD/YYYY or DD/MM/YYYY
    var numDatePat = /\b\d{1,2}[\/\-]\d{1,2}[\/\-](19|20)(\d{2})\b/g;
    while ((m = numDatePat.exec(text)) !== null) {
      var ds2 = m[0].trim();
      if (!seen[ds2]) {
        seen[ds2] = true;
        seenYears.add(m[1] + m[2]);
        found.push({ id: _uid(), text: ds2, context: _contextSentence(text, m.index, m[0].length), added: false });
      }
    }

    // Standalone 4-digit year -- only if not already captured inside a full date
    var yearPat = /(?<!\d)(1[89]\d{2}|20[0-2]\d)(?!\d)/g;
    while ((m = yearPat.exec(text)) !== null) {
      var yr = m[0];
      if (seenYears.has(yr)) continue; // suppress -- already part of a richer date
      if (!seen[yr]) {
        seen[yr] = true;
        found.push({ id: _uid(), text: yr, context: _contextSentence(text, m.index, m[0].length), added: false });
      }
    }

    // Decade references: "the 1950s" / "the '60s"
    var decadePat = /\bthe\s+(1\d{3}s|'\d{2}s)\b/gi;
    while ((m = decadePat.exec(text)) !== null) {
      var dec = m[0].trim();
      if (!seen[dec]) {
        seen[dec] = true;
        found.push({ id: _uid(), text: dec, context: _contextSentence(text, m.index, m[0].length), added: false });
      }
    }

    return found.slice(0, 24);
  }

  /* ── Place detection ────────────────────────────────────── */
  function _detectPlaces(text) {
    var found = [];
    var seen  = {};
    var m;

    /*
     * IMPORTANT: MOVEMENT_VERBS contains space-separated strings like
     * "born in".  The combined regex must NOT use the `i` flag on the
     * capture group, because [A-Z] would otherwise match lowercase with
     * case-insensitive mode.  We use `gi` only for the verb keyword part
     * and verify that the captured place starts with a real uppercase char.
     */
    var verbPat = new RegExp(
      "(?:" + MOVEMENT_VERBS.map(function (v) { return _escapeRegex(v); }).join("|") + ")" +
      // Capture: one or more Title-cased words separated by spaces/commas, max 4 words
      // Stop at: end of clause (. ! ? newline), lowercase continuation word, or 60 chars
      "\\s+([A-Z][a-zA-Z]{1,20}(?:[,\\s]+[A-Z][a-zA-Z]{1,20}){0,3})",
      "gi"
    );
    while ((m = verbPat.exec(text)) !== null) {
      var raw   = m[1] || "";
      var place = raw.trim().replace(/,\s*$/, "");

      // Verify captured text genuinely starts uppercase (gi flag expands [A-Z])
      if (place.charCodeAt(0) < 65 || place.charCodeAt(0) > 90) continue;

      // Strip trailing common stopwords / false-positive words
      place = place
        .replace(/\s+(and|the|a|an|in|on|at|of|from|to|is|was|were|he|she|they|who|where|which)$/i, "")
        .trim();

      // Drop single generic words (too ambiguous)
      if (!place || place.length < 3 || _NOT_NAMES.has(place)) continue;

      var key = place.toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;
      found.push({ id: _uid(), text: place, context: _contextSentence(text, m.index, m[0].length), added: false });
    }

    return found.slice(0, 16);
  }

  /* ── Memory / reminiscence detection ───────────────────── */
  function _detectMemories(text) {
    var found = [];
    var sentences = _sentences(text);
    var trigPat = new RegExp(
      "(" + MEMORY_TRIGGERS.map(function (t) { return _escapeRegex(t); }).join("|") + ")",
      "i"
    );
    sentences.forEach(function (sent) {
      if (trigPat.test(sent) && sent.length > 20) {
        var preview = sent.length > 180 ? sent.slice(0, 177) + "\u2026" : sent;
        found.push({ id: _uid(), text: preview, context: sent, added: false });
      }
    });
    return found.slice(0, 16);
  }

  /* ── Main parse entry point ─────────────────────────────── */
  function _parseTextItems(text) {
    if (!text || !text.trim()) {
      return { people: [], dates: [], places: [], memories: [] };
    }
    return {
      people:   _detectPeople(text),
      dates:    _detectDates(text),
      places:   _detectPlaces(text),
      memories: _detectMemories(text)
    };
  }

  /* ── File extraction orchestration ─────────────────────── */

  function _readAndExtract(cardId, file) {
    return _readFileAsText(file)
      .then(function (text) {
        var bb   = _bb(); if (!bb) return;
        var card = bb.sourceCards.find(function (c) { return c.id === cardId; });
        if (!card) return;
        card.extractedText = text;
        card.status        = "extracted";
        card.detectedItems = _parseTextItems(text);
      })
      .catch(function () {
        var bb   = _bb(); if (!bb) return;
        var card = bb.sourceCards.find(function (c) { return c.id === cardId; });
        if (card) {
          card.status        = "failed";
          card.detectedItems = null;
        }
      });
  }

  /* ───────────────────────────────────────────────────────────
     FILE INTAKE
  ─────────────────────────────────────────────────────────── */

  function _handleFiles(files, renderCallback) {
    var bb = _bb(); if (!bb) return;
    if (!files || files.length === 0) return;
    var pendingPromises = [];

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var sourceType = _guessSourceType(file.name, file.type);
      var card = {
        id:               _uid(),
        filename:         file.name,
        fileSize:         file.size,
        sourceType:       sourceType,
        ts:               Date.now(),
        status:           "extracting",
        extractedText:    null,
        pastedText:       null,
        detectedItems:    null,
        addedCandidateIds: []
      };
      bb.sourceCards.push(card);

      if (_canExtractText(file)) {
        pendingPromises.push(_readAndExtract(card.id, file));
      } else {
        card.status = "manual-only";
      }
    }

    // Show "extracting" status immediately
    if (renderCallback) renderCallback();

    // Re-render after all extractions complete
    if (pendingPromises.length > 0) {
      Promise.all(pendingPromises).then(function () { if (renderCallback) renderCallback(); });
    }
  }

  /* ───────────────────────────────────────────────────────────
     SOURCE ACTIONS
  ─────────────────────────────────────────────────────────── */

  function _reviewSource(cardId, renderCallback) {
    _activeSourceCardId = cardId;
    if (renderCallback) renderCallback();
  }

  function _closeSourceReview(renderCallback) {
    _activeSourceCardId = null;
    if (renderCallback) renderCallback();
  }

  function _savePastedText(cardId, renderCallback) {
    var ta   = _el("bbPasteArea"); if (!ta) return;
    var text = (ta.value || "").trim();
    if (!text) { ta.style.borderColor = "rgba(239,68,68,0.5)"; return; }

    var bb   = _bb(); if (!bb) return;
    var card = bb.sourceCards.find(function (c) { return c.id === cardId; });
    if (!card) return;

    card.pastedText    = text;
    card.status        = "pasted";
    card.detectedItems = _parseTextItems(text);
    if (renderCallback) renderCallback(); // refresh to show detected items
  }

  /* ───────────────────────────────────────────────────────────
     SOURCE TAB RENDERING
  ─────────────────────────────────────────────────────────── */

  function _sourceIcon(type) {
    var t = (type || "").toLowerCase();
    if (t === "pdf")    return "\uD83D\uDCC4";
    if (t === "image")  return "\uD83D\uDDBC";
    if (t === "text")   return "\uD83D\uDCDD";
    if (t === "word")   return "\uD83D\uDCD8";
    return "\uD83D\uDCCE";
  }

  function _sourceCardStatusInfo(card) {
    var st = card.status || "pending";
    if (st === "extracting")  return { label: "Extracting\u2026",     canReview: false };
    if (st === "extracted")   return { label: "Text extracted \u2713", canReview: true  };
    if (st === "pasted")      return { label: "Text pasted \u2713",    canReview: true  };
    if (st === "failed")      return { label: "Extraction failed", canReview: true  };
    if (st === "manual-only") return { label: "Paste text to extract", canReview: true };
    return { label: "Pending",        canReview: false };
  }

  function _renderSourcesTab(container, pid) {
    if (!pid) {
      container.innerHTML = _emptyStateHtml("No narrator selected", "Select a narrator to start adding documents.", []);
      return;
    }

    // If a source card review is active, show the review panel
    if (_activeSourceCardId) {
      _renderSourceReview(container);
      return;
    }

    var bb = _bb();
    var cardsHtml = "";

    if (bb.sourceCards.length > 0) {
      cardsHtml = '<div class="bb-source-cards-list">'
        + bb.sourceCards.map(function (card) {
            var statusInfo = _sourceCardStatusInfo(card);
            var addedCount = (card.addedCandidateIds || []).length;
            var addedBadge = addedCount > 0
              ? '<span class="bb-source-added-badge">' + addedCount + ' added</span>'
              : "";
            var detectedCount = card.detectedItems
              ? (card.detectedItems.people.length + card.detectedItems.dates.length +
                 card.detectedItems.places.length + card.detectedItems.memories.length)
              : 0;
            var detectedBadge = (card.status === "extracted" || card.status === "pasted") && detectedCount > 0
              ? '<span class="bb-source-detected-badge">' + detectedCount + ' detected</span>'
              : "";

            return '<div class="bb-source-card">'
              + '<div class="bb-source-card-icon">' + _sourceIcon(card.sourceType) + '</div>'
              + '<div class="bb-source-card-body">'
              +   '<div class="bb-source-card-name">' + _esc(card.filename) + '</div>'
              +   '<div class="bb-source-card-meta">'
              +     _esc(card.sourceType || "Document") + ' \u00B7 ' + _esc(statusInfo.label)
              +     (card.fileSize ? ' \u00B7 ' + _formatBytes(card.fileSize) : '')
              +   '</div>'
              +   '<div class="bb-source-card-badges">' + detectedBadge + addedBadge + '</div>'
              + '</div>'
              + '<div class="bb-source-card-actions">'
              +   '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._reviewSource(\'' + card.id + '\')">'
              +   (statusInfo.canReview ? "Review \u2192" : "View \u2192")
              +   '</button>'
              + '</div>'
              + '</div>';
          }).join("")
        + '</div>';
    }

    container.innerHTML =
      '<div class="bb-section-title">Source Inbox</div>'
      + '<p class="bb-hint-text">Upload text files, documents, or notes. Each becomes a Source Card \u2014 Bio Builder extracts people, dates, places, and memories for you to review and add as candidates.</p>'
      + '<div class="bb-drop-zone" onclick="document.getElementById(\'bbFileInput\').click()">'
      +   '<div class="bb-drop-icon">\uD83D\uDCCE</div>'
      +   '<div class="bb-drop-label">Drop files here or click to browse</div>'
      +   '<div class="bb-drop-hint">Text \u00B7 Markdown \u00B7 CSV \u00B7 PDF (paste text) \u00B7 Images (paste text) \u00B7 Any document</div>'
      +   '<input id="bbFileInput" type="file" multiple accept="*" style="display:none" onchange="window.LorevoxBioBuilder._handleFiles(this.files)" />'
      + '</div>'
      + (cardsHtml || '<div class="bb-empty-sub">No documents yet \u2014 add files above to begin.</div>');
  }

  /* ── Source Card Review Surface ─────────────────────────── */

  function _renderSourceReview(container) {
    var bb   = _bb(); if (!bb) return;
    var card = bb.sourceCards.find(function (c) { return c.id === _activeSourceCardId; });
    if (!card) { _activeSourceCardId = null; return; }

    var workingText = card.extractedText || card.pastedText || null;
    var di          = card.detectedItems;
    var statusInfo  = _sourceCardStatusInfo(card);

    // ── Paste zone (for non-text files without extractedText) ──
    var pasteZoneHtml = "";
    if (!workingText) {
      pasteZoneHtml =
        '<div class="bb-review-section">'
        + '<div class="bb-review-section-title">Paste the Document\'s Text</div>'
        + '<p class="bb-hint-text">Bio Builder can\'t automatically extract text from ' + _esc(card.sourceType || "this file") + ' files. Paste the document\'s text below to detect candidates.</p>'
        + '<textarea id="bbPasteArea" class="bb-textarea bb-paste-area" rows="8" placeholder="Paste text from the document here\u2026"></textarea>'
        + '<div class="bb-review-footer">'
        +   '<button class="bb-btn-primary" onclick="window.LorevoxBioBuilder._savePastedText(\'' + card.id + '\')">Extract from Pasted Text</button>'
        + '</div>'
        + '</div>';
    }

    // ── Extracted text preview ──
    var textPreviewHtml = "";
    if (workingText) {
      var previewText = workingText.length > 600 ? workingText.slice(0, 597) + "\u2026" : workingText;
      textPreviewHtml =
        '<div class="bb-review-section">'
        + '<div class="bb-review-section-title">Extracted Text <span class="bb-review-chars">(' + workingText.length.toLocaleString() + ' chars)</span></div>'
        + '<div class="bb-review-text-preview">' + _esc(previewText) + '</div>'
        + '</div>';
    }

    // ── Detected items ──
    var detectedHtml = "";
    if (di) {
      var totalDetected = di.people.length + di.dates.length + di.places.length + di.memories.length;
      if (totalDetected === 0) {
        detectedHtml = '<div class="bb-review-section"><p class="bb-hint-text">No items automatically detected in this text. You can still add notes or facts using Quick Capture.</p></div>';
      } else {
        detectedHtml = '<div class="bb-review-section"><div class="bb-review-section-title">Detected Items \u2014 ' + totalDetected + ' found</div>'
          + _renderDetectedBucket(card, "people",   "\uD83D\uDC64", "People",   di.people,   "person")
          + _renderDetectedBucket(card, "dates",    "\uD83D\uDCC5", "Dates",    di.dates,    "event")
          + _renderDetectedBucket(card, "places",   "\uD83D\uDCCD", "Places",   di.places,   "place")
          + _renderDetectedBucket(card, "memories", "\uD83C\uDF19", "Memories", di.memories, "memory")
          + '<div class="bb-review-add-all-row">'
          +   '<button class="bb-btn-primary" onclick="window.LorevoxBioBuilder._addAllFromCard(\'' + card.id + '\')">'
          +   'Add All Detected Items'
          +   '</button>'
          +   '<button class="bb-ghost-btn" onclick="window.LorevoxBioBuilder._closeSourceReview()">Done Reviewing</button>'
          + '</div>'
          + '</div>';
      }
    }

    var addedCount   = (card.addedCandidateIds || []).length;
    var addedSummary = addedCount > 0
      ? '<span class="bb-review-added-summary">' + addedCount + ' candidate' + (addedCount === 1 ? "" : "s") + ' added from this source</span>'
      : "";

    container.innerHTML =
      '<div class="bb-review-nav">'
      +   '<button class="bb-ghost-btn bb-back-btn" onclick="window.LorevoxBioBuilder._closeSourceReview()">\u2190 Back to Source Inbox</button>'
      +   addedSummary
      + '</div>'
      + '<div class="bb-review-header">'
      +   '<div class="bb-review-filename">' + _sourceIcon(card.sourceType) + ' ' + _esc(card.filename) + '</div>'
      +   '<div class="bb-review-meta">' + _esc(card.sourceType || "Document") + ' \u00B7 ' + _esc(statusInfo.label) + (card.fileSize ? ' \u00B7 ' + _formatBytes(card.fileSize) : '') + '</div>'
      + '</div>'
      + pasteZoneHtml
      + textPreviewHtml
      + detectedHtml;
  }

  function _renderDetectedBucket(card, bucketKey, icon, label, items, candidateType) {
    if (!items || items.length === 0) return "";
    var allAdded = items.every(function (it) { return it.added; });
    var pendingCount = items.filter(function (it) { return !it.added; }).length;

    var itemRows = items.map(function (item) {
      var addedMark = item.added ? '<span class="bb-det-added">\u2713 Added</span>' : "";
      var addBtn    = !item.added
        ? '<button class="bb-btn-sm bb-det-add-btn" onclick="window.LorevoxBioBuilder._addItemAsCandidate(\'' + card.id + '\',\'' + bucketKey + '\',\'' + item.id + '\',\'' + candidateType + '\')">'
          + 'Add'
          + '</button>'
        : "";
      var relation  = item.relation ? '<span class="bb-det-relation">' + _esc(item.relation) + '</span>' : "";
      var context   = item.context !== item.text ? '<div class="bb-det-context">' + _esc(item.context) + '</div>' : "";
      return '<div class="bb-det-item' + (item.added ? ' bb-det-item--added' : '') + '">'
        + '<div class="bb-det-item-body">'
        +   '<div class="bb-det-item-text">' + _esc(item.text) + relation + '</div>'
        +   context
        + '</div>'
        + '<div class="bb-det-item-actions">' + addedMark + addBtn + '</div>'
        + '</div>';
    }).join("");

    var addAllBtn = !allAdded && pendingCount > 1
      ? '<button class="bb-ghost-btn bb-det-add-all" onclick="window.LorevoxBioBuilder._addAllOfType(\'' + card.id + '\',\'' + bucketKey + '\',\'' + candidateType + '\')">+ Add all ' + label.toLowerCase() + ' (' + pendingCount + ')</button>'
      : "";

    return '<div class="bb-det-bucket">'
      + '<div class="bb-det-bucket-header">' + icon + ' ' + _esc(label) + ' <span class="bb-det-count">(' + items.length + ')</span></div>'
      + '<div class="bb-det-items-list">' + itemRows + '</div>'
      + addAllBtn
      + '</div>';
  }

  /* ───────────────────────────────────────────────────────────
     MODULE EXPORT
  ─────────────────────────────────────────────────────────── */

  window.LorevoxBioBuilderModules.sources = {
    // View state
    _clearSourceReviewState: _clearSourceReviewState,

    // File intake
    _handleFiles:       _handleFiles,
    _guessSourceType:   _guessSourceType,
    _canExtractText:    _canExtractText,
    _readFileAsText:    _readFileAsText,

    // Extraction engine
    _parseTextItems:    _parseTextItems,
    _readAndExtract:    _readAndExtract,

    // Source actions (accept renderCallback)
    _reviewSource:      _reviewSource,
    _closeSourceReview: _closeSourceReview,
    _savePastedText:    _savePastedText,

    // Rendering
    _renderSourcesTab:       _renderSourcesTab,
    _renderSourceReview:     _renderSourceReview,
    _renderDetectedBucket:   _renderDetectedBucket,
    _sourceCardStatusInfo:   _sourceCardStatusInfo,
    _sourceIcon:             _sourceIcon
  };

})();
