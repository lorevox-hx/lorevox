/* ═══════════════════════════════════════════════════════════════
   camera-preview.js — Draggable camera preview mirror
   Lorevox 1.0 (ported from Lorevox 8.0 lori8.0.html §4527-4611)
   Load order: after emotion-ui.js, before app.js

   Purpose:
   - Creates a small draggable video preview so the narrator can see
     themselves on screen (mirror effect via CSS scaleX(-1) in lori80.css).
   - Called by beginCameraConsent74() in app.js after the emotion engine
     starts and cameraActive is true.
   - Preview can be hidden (camera keeps running) and reopened.
   - Stream is attached from the existing getUserMedia grant — does not
     request a second camera permission.

   Privacy:
   - Video element is local display only — no frames leave the browser.
   - srcObject is never captured, recorded, or transmitted.
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /**
   * Is this MediaStream usable — i.e. does it have at least one live track?
   * After Cam toggle off the old stream stays attached to the preview video,
   * but all its tracks are in readyState="ended". Early-returning on
   * `video.srcObject` truthy then leaves the preview bound to a dead stream
   * (frame frozen / blank) when Cam toggles back on.
   */
  function _streamIsLive(s) {
    if (!s) return false;
    try {
      var tracks = s.getTracks ? s.getTracks() : [];
      for (var i = 0; i < tracks.length; i++) {
        if (tracks[i] && tracks[i].readyState === "live") return true;
      }
    } catch (_) {}
    return false;
  }

  /**
   * Find the emotion engine's hidden video element without matching
   * the preview video itself. emotion.js creates its video with
   * playsinline and display:none and no id; the preview video is
   * id="lv74-cam-video" and ALSO carries playsinline, so a raw
   * `querySelector("video[playsinline]")` can return the preview
   * video and end up copying its own (possibly stale) srcObject.
   */
  function _findEmotionEngineVideo() {
    var vids = document.querySelectorAll("video[playsinline]");
    for (var i = 0; i < vids.length; i++) {
      var v = vids[i];
      if (v.id === "lv74-cam-video") continue;
      if (v.srcObject && _streamIsLive(v.srcObject)) return v;
    }
    // Fallback — any video with a live srcObject, excluding the preview
    for (var j = 0; j < vids.length; j++) {
      if (vids[j].id !== "lv74-cam-video" && vids[j].srcObject) return vids[j];
    }
    return null;
  }

  /**
   * Attach the camera stream to the preview video element.
   * Reuses an existing srcObject if present AND live; otherwise rebinds
   * from the emotion engine's fresh stream, or (last resort) requests a
   * new stream (camera permission should already be granted by the
   * emotion engine's earlier getUserMedia call).
   */
  function _attachPreviewStream() {
    var video = document.getElementById("lv74-cam-video");
    if (!video) return;

    // If the preview is already bound to a live stream, nothing to do.
    if (video.srcObject && _streamIsLive(video.srcObject)) return;

    // If the preview has a dead stream attached (all tracks ended after
    // a Cam toggle-off), drop it so the new assignment takes effect.
    if (video.srcObject) {
      try { video.srcObject = null; } catch (_) {}
    }

    // Try to reuse the emotion engine's existing (live) stream first.
    var emotionVideo = _findEmotionEngineVideo();
    if (emotionVideo && emotionVideo.srcObject) {
      video.srcObject = emotionVideo.srcObject;
      // Some browsers need a nudge to start rendering after src swap.
      try { video.play && video.play().catch(function () {}); } catch (_) {}
      return;
    }

    // Fallback: request own stream (permission already granted)
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(function (stream) {
        video.srcObject = stream;
        try { video.play && video.play().catch(function () {}); } catch (_) {}
      })
      .catch(function (err) {
        console.warn("[lv74] Camera preview stream error:", err.message);
      });
  }

  /**
   * Show (or create) the draggable camera preview overlay.
   * Called from beginCameraConsent74() via window.lv74.showCameraPreview().
   */
  function showCameraPreview() {
    // If preview already exists, just unhide it
    if (document.getElementById("lv74-cam-preview")) {
      document.getElementById("lv74-cam-preview").classList.remove("lv74-preview-hidden");
      var reopenEl = document.getElementById("lv74-cam-reopen");
      if (reopenEl) reopenEl.classList.remove("lv74-reopen-visible");
      _attachPreviewStream();
      return;
    }

    // ── Create preview DOM ──────────────────────────────────────
    var preview = document.createElement("div");
    preview.id = "lv74-cam-preview";
    preview.innerHTML =
      '<div id="lv74-cam-preview-bar">' +
        '<span>Camera preview</span>' +
        '<button id="lv74-cam-close" title="Hide preview (camera keeps running)">&#10005;</button>' +
      '</div>' +
      '<video id="lv74-cam-video" autoplay playsinline muted></video>';
    document.body.appendChild(preview);

    // ── Create reopen pill ──────────────────────────────────────
    var reopen = document.createElement("div");
    reopen.id = "lv74-cam-reopen";
    reopen.title = "Show camera preview";
    reopen.innerHTML = "<span>Camera</span>";
    document.body.appendChild(reopen);

    // ── Close / reopen handlers ─────────────────────────────────
    document.getElementById("lv74-cam-close").addEventListener("click", function (e) {
      e.stopPropagation();
      preview.classList.add("lv74-preview-hidden");
      reopen.classList.add("lv74-reopen-visible");
    });

    reopen.addEventListener("click", function () {
      preview.classList.remove("lv74-preview-hidden");
      reopen.classList.remove("lv74-reopen-visible");
    });

    // ── Drag + resize support ───────────────────────────────────
    // Native CSS `resize: both` on #lv74-cam-preview provides a bottom-right
    // resize handle. We skip drag-start when mousedown lands inside the
    // handle's ~18px box so it doesn't fight the browser's resize gesture.
    var RESIZE_HANDLE_PX = 18;
    var dragging = false, ox = 0, oy = 0;

    preview.addEventListener("mousedown", function (e) {
      if (e.target.id === "lv74-cam-close") return;
      var r = preview.getBoundingClientRect();
      // Skip drag if the mousedown is inside the resize-handle corner.
      if (e.clientX > r.right - RESIZE_HANDLE_PX &&
          e.clientY > r.bottom - RESIZE_HANDLE_PX) return;
      dragging = true;
      preview.style.left = r.left + "px";
      preview.style.top = r.top + "px";
      preview.style.transform = "none";
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      e.preventDefault();
    });

    document.addEventListener("mousemove", function (e) {
      if (!dragging) return;
      preview.style.left = (e.clientX - ox) + "px";
      preview.style.top = (e.clientY - oy) + "px";
    });

    document.addEventListener("mouseup", function () { dragging = false; });

    // ── Persist chosen size across reloads ──────────────────────
    var SIZE_KEY = "lv74_cam_preview_size";
    try {
      var saved = JSON.parse(localStorage.getItem(SIZE_KEY) || "null");
      if (saved && saved.w && saved.h) {
        preview.style.width  = saved.w + "px";
        preview.style.height = saved.h + "px";
      }
    } catch (_) {}

    if (typeof ResizeObserver === "function") {
      var _sizeSaveTimer = null;
      var ro = new ResizeObserver(function () {
        clearTimeout(_sizeSaveTimer);
        _sizeSaveTimer = setTimeout(function () {
          try {
            var r = preview.getBoundingClientRect();
            localStorage.setItem(SIZE_KEY, JSON.stringify({
              w: Math.round(r.width), h: Math.round(r.height),
            }));
          } catch (_) {}
        }, 180); // debounce during continuous drag
      });
      ro.observe(preview);
    }

    // ── Attach camera stream ────────────────────────────────────
    _attachPreviewStream();
  }

  // ── Expose on window.lv74 ───────────────────────────────────
  window.lv74 = window.lv74 || {};
  window.lv74.showCameraPreview = showCameraPreview;

})();
