/**
 * LoreVox Emotion Engine — v6.1 Track B
 * ========================================
 * Browser-side: MediaPipe Face Mesh → geometry rules → affect state → POST to backend
 *
 * Design rules:
 *  - Camera is OPT-IN and off by default
 *  - MediaPipe runs locally in WASM — no video ever leaves the browser
 *  - Raw emotion labels are NEVER sent to the backend
 *  - Only derived affect_state events are posted
 *  - Frames discarded immediately after landmark extraction
 *  - Affect states: steady | engaged | reflective | moved | distressed | overwhelmed
 *
 * Usage:
 *   LoreVoxEmotion.init({ sessionId, apiBase, onAffectState })
 *   LoreVoxEmotion.start()
 *   LoreVoxEmotion.stop()
 *   LoreVoxEmotion.setSection(sectionId)
 *   LoreVoxEmotion.isActive()
 */

(function (global) {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────

  const AFFECT_STATES = ['steady', 'engaged', 'reflective', 'moved', 'distressed', 'overwhelmed'];

  // Minimum duration (ms) a raw geometry state must persist before mapping to affect
  const SUSTAIN_MS = 2000;

  // Confidence threshold — discard weak detections
  const MIN_CONFIDENCE = 0.65;

  // Debounce: minimum time (ms) between posting events to backend
  const DEBOUNCE_MS = 3000;

  // FPS target for face mesh processing
  const TARGET_FPS = 15;

  // ── MediaPipe Landmark Indices ──────────────────────────────────────────────
  // Based on MediaPipe Face Mesh canonical face model (468 points)
  const LM = {
    // Lip corners
    LIP_LEFT:    61,
    LIP_RIGHT:   291,
    LIP_UPPER_C: 13,    // upper lip centre
    LIP_LOWER_C: 14,    // lower lip centre

    // Inner brow
    BROW_LEFT_INNER:  65,
    BROW_RIGHT_INNER: 295,

    // Outer brow (for raise detection)
    BROW_LEFT_OUTER:  70,
    BROW_RIGHT_OUTER: 300,

    // Eye centres (for lid-raise detection)
    EYE_LEFT_UPPER:  159,
    EYE_LEFT_LOWER:  145,
    EYE_RIGHT_UPPER: 386,
    EYE_RIGHT_LOWER: 374,

    // Nose tip (reference for normalisation)
    NOSE_TIP: 1,

    // Chin (for jaw drop)
    CHIN: 152,

    // Cheeks
    CHEEK_LEFT:  117,
    CHEEK_RIGHT: 346,

    // Forehead reference
    FOREHEAD: 10,
  };

  // ── Raw Emotion → Affect State Mapping ────────────────────────────────────
  // Raw emotion labels are INTERNAL ONLY — never sent to backend or shown to user.
  const EMOTION_TO_AFFECT = {
    happiness:           'engaged',
    sadness_low:         'reflective',
    sadness_high:        'moved',
    surprise:            'engaged',
    fear_low:            'distressed',
    fear_high:           'overwhelmed',
    anger_low:           'distressed',
    anger_high:          'overwhelmed',
    disgust:             'distressed',
    neutral:             'steady',
  };

  // ── Geometry Classifier ────────────────────────────────────────────────────

  /**
   * Extract a single landmark [x, y, z] from the results array.
   * Returns null if index out of range.
   */
  function lm(landmarks, idx) {
    const p = landmarks[idx];
    return p ? [p.x, p.y, p.z] : null;
  }

  /**
   * Vertical delta: positive = point B is BELOW point A (in image coords y increases downward).
   */
  function dy(landmarks, idxA, idxB) {
    const a = lm(landmarks, idxA);
    const b = lm(landmarks, idxB);
    if (!a || !b) return 0;
    return b[1] - a[1];   // positive = B is lower
  }

  /**
   * Euclidean distance between two landmarks.
   */
  function dist(landmarks, idxA, idxB) {
    const a = lm(landmarks, idxA);
    const b = lm(landmarks, idxB);
    if (!a || !b) return 0;
    return Math.sqrt(
      Math.pow(b[0] - a[0], 2) +
      Math.pow(b[1] - a[1], 2) +
      Math.pow(b[2] - a[2], 2)
    );
  }

  /**
   * Normalisation factor: distance between forehead and chin.
   * Used to make all measurements scale-invariant.
   */
  function faceScale(landmarks) {
    const s = dist(landmarks, LM.FOREHEAD, LM.CHIN);
    return s > 0 ? s : 1;
  }

  /**
   * Classify raw emotion from 468 facial landmarks.
   * Returns { rawEmotion: string, confidence: float }
   * rawEmotion is INTERNAL ONLY — never exposed to backend.
   */
  function classifyGeometry(landmarks) {
    const scale = faceScale(landmarks);

    // ── Lip corner raise (happiness signal) ──
    const lipY = lm(landmarks, LM.LIP_UPPER_C);
    const leftCornerY = lm(landmarks, LM.LIP_LEFT);
    const rightCornerY = lm(landmarks, LM.LIP_RIGHT);
    let lipCornerRaise = 0;
    if (lipY && leftCornerY && rightCornerY) {
      const leftRaise  = lipY[1] - leftCornerY[1];
      const rightRaise = lipY[1] - rightCornerY[1];
      lipCornerRaise = (leftRaise + rightRaise) / (2 * scale);
    }

    // ── Brow inner lowering (sadness / anger signal) ──
    const browInnerDrop = -dy(landmarks, LM.BROW_LEFT_INNER, LM.BROW_RIGHT_INNER) / scale;

    // ── Brow outer raise (surprise / fear signal) ──
    const browOuterRaise = -dy(landmarks, LM.FOREHEAD, LM.BROW_LEFT_OUTER) / scale;

    // ── Eye openness (fear / surprise signal) ──
    const eyeOpen = (
      dist(landmarks, LM.EYE_LEFT_UPPER, LM.EYE_LEFT_LOWER) +
      dist(landmarks, LM.EYE_RIGHT_UPPER, LM.EYE_RIGHT_LOWER)
    ) / (2 * scale);

    // ── Jaw drop (surprise signal) ──
    const jawDrop = dy(landmarks, LM.NOSE_TIP, LM.CHIN) / scale;

    // ── Lip press / tension (anger signal) ──
    const lipTension = -dy(landmarks, LM.LIP_UPPER_C, LM.LIP_LOWER_C) / scale;

    // ── Decision tree ──
    // Thresholds tuned for normalised coordinates — may need calibration per user.

    // Happiness: lip corners raised, mild brow
    if (lipCornerRaise > 0.022) {
      const conf = Math.min(0.60 + (lipCornerRaise - 0.022) * 15, 0.95);
      return { rawEmotion: 'happiness', confidence: conf };
    }

    // Surprise: brow raise + eye openness + jaw drop
    if (browOuterRaise > 0.018 && eyeOpen > 0.030 && jawDrop > 0.35) {
      const conf = Math.min(0.60 + (browOuterRaise - 0.018) * 10, 0.92);
      return { rawEmotion: 'surprise', confidence: conf };
    }

    // Fear: brow raise + eye open without jaw drop
    if (browOuterRaise > 0.018 && eyeOpen > 0.030 && jawDrop < 0.35) {
      const intensity = browOuterRaise + eyeOpen;
      const conf = Math.min(0.55 + intensity * 5, 0.88);
      const rawEmotion = conf > 0.75 ? 'fear_high' : 'fear_low';
      return { rawEmotion, confidence: conf };
    }

    // Anger: brow inner lowering + lip tension
    if (browInnerDrop > 0.010 && lipTension > 0.005) {
      const conf = Math.min(0.55 + (browInnerDrop - 0.010) * 20, 0.88);
      const rawEmotion = conf > 0.72 ? 'anger_high' : 'anger_low';
      return { rawEmotion, confidence: conf };
    }

    // Sadness: brow inner lowering without anger markers
    if (browInnerDrop > 0.008 && lipTension < 0.004) {
      const conf = Math.min(0.55 + (browInnerDrop - 0.008) * 20, 0.85);
      const rawEmotion = conf > 0.72 ? 'sadness_high' : 'sadness_low';
      return { rawEmotion, confidence: conf };
    }

    // Disgust: brow lowering + lip raise (not corner raise)
    if (browInnerDrop > 0.008 && lipCornerRaise < -0.010) {
      return { rawEmotion: 'disgust', confidence: 0.65 };
    }

    // Neutral
    return { rawEmotion: 'neutral', confidence: 0.80 };
  }

  /**
   * Map raw internal emotion to interview-safe affect state.
   * The affect state is what gets sent to the backend — never the raw emotion.
   */
  function toAffectState(rawEmotion) {
    return EMOTION_TO_AFFECT[rawEmotion] || 'steady';
  }


  // ── Sustain Tracker ─────────────────────────────────────────────────────────
  // Tracks how long a raw emotion has been continuously detected.

  function createSustainTracker() {
    let currentEmotion = null;
    let sustainStart = null;

    return {
      update(rawEmotion, confidence) {
        const now = Date.now();
        if (rawEmotion !== currentEmotion) {
          currentEmotion = rawEmotion;
          sustainStart = now;
          return { sustained: false, durationMs: 0, rawEmotion, confidence };
        }
        const durationMs = now - sustainStart;
        return { sustained: durationMs >= SUSTAIN_MS, durationMs, rawEmotion, confidence };
      },
      reset() {
        currentEmotion = null;
        sustainStart = null;
      },
    };
  }


  // ── Engine State ─────────────────────────────────────────────────────────────

  let _config = null;          // { sessionId, apiBase, onAffectState }
  let _faceMesh = null;        // MediaPipe FaceMesh instance
  let _camera = null;          // MediaPipe Camera instance
  let _videoEl = null;         // hidden <video> element
  let _active = false;
  let _currentSectionId = null;
  let _lastPostTime = 0;
  let _sustainTracker = createSustainTracker();
  let _lastAffectState = 'steady';


  // ── API Poster ──────────────────────────────────────────────────────────────

  async function postAffectEvent(affectState, confidence, durationMs) {
    // v7.4B: Deprecated. This side-channel POST is non-authoritative.
    // Affect now flows through the single authoritative path:
    //   emotion-ui.js → AffectBridge74 → state.session.visualSignals
    //   → buildRuntime71() → prompt_composer.py
    //
    // Retained as a guarded no-op to prevent accidental re-activation.
    void affectState; void confidence; void durationMs;
    return;
  }


  // ── MediaPipe Result Handler ────────────────────────────────────────────────

  function onResults(results) {
    if (!_active) return;
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      _sustainTracker.reset();
      return;
    }

    const landmarks = results.multiFaceLandmarks[0];

    // Classify geometry → raw emotion (INTERNAL, never exposed)
    const { rawEmotion, confidence } = classifyGeometry(landmarks);

    // Discard low-confidence detections
    if (confidence < MIN_CONFIDENCE) {
      _sustainTracker.reset();
      return;
    }

    // Track sustain duration
    const sustain = _sustainTracker.update(rawEmotion, confidence);

    // Map to affect state
    const affectState = toAffectState(rawEmotion);

    // Notify UI callback (always, even before sustained — for live indicator)
    if (_config.onAffectState && affectState !== _lastAffectState) {
      _lastAffectState = affectState;
      _config.onAffectState({ affectState, confidence, durationMs: sustain.durationMs });
    }

    // Post to backend only when sustained
    if (sustain.sustained) {
      postAffectEvent(affectState, confidence, sustain.durationMs);
    }
  }


  // ── Public API ───────────────────────────────────────────────────────────────

  const LoreVoxEmotion = {

    /**
     * Initialise the engine.
     * @param {Object} config
     * @param {string} config.sessionId    — current interview session ID
     * @param {string} config.apiBase      — e.g. 'http://localhost:8000'
     * @param {Function} [config.onAffectState] — callback({ affectState, confidence, durationMs })
     */
    async init(config) {
      _config = config;
      _active = false;
      _sustainTracker = createSustainTracker();
      _lastAffectState = 'steady';

      // Load MediaPipe Face Mesh
      if (typeof FaceMesh === 'undefined') {
        console.error('[LoreVoxEmotion] MediaPipe FaceMesh not loaded. Include the local vendor script first (vendor/mediapipe/face_mesh/face_mesh.js).');
        return false;
      }

      _faceMesh = new FaceMesh({
        locateFile: (file) => {
          // Force non-SIMD WASM binary — SIMD variant crashes at loadGraph on this machine.
          // Both JS loaders remain present; only the WASM binary is redirected.
          if (file === 'face_mesh_solution_simd_wasm_bin.wasm') {
            console.log('[LoreVoxEmotion] Redirecting SIMD WASM → non-SIMD WASM');
            return `vendor/mediapipe/face_mesh/face_mesh_solution_wasm_bin.wasm`;
          }
          return `vendor/mediapipe/face_mesh/${file}`;
        },
      });

      _faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: false,   // 468 points, not 478
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      _faceMesh.onResults(onResults);

      return true;
    },

    /**
     * Request camera permission and start processing.
     * Returns true if successful.
     */
    async start() {
      if (!_faceMesh || !_config) {
        console.error('[LoreVoxEmotion] Not initialised. Call init() first.');
        return false;
      }

      try {
        // Create hidden video element
        _videoEl = document.createElement('video');
        _videoEl.setAttribute('playsinline', '');
        _videoEl.style.display = 'none';
        document.body.appendChild(_videoEl);

        // Load Camera utility
        if (typeof Camera === 'undefined') {
          console.error('[LoreVoxEmotion] MediaPipe Camera not loaded.');
          return false;
        }

        _camera = new Camera(_videoEl, {
          onFrame: async () => {
            if (_active && _faceMesh) {
              await _faceMesh.send({ image: _videoEl });
            }
          },
          width: 320,
          height: 240,
          facingMode: 'user',
        });

        await _camera.start();
        _active = true;
        console.log('[LoreVoxEmotion] Camera started — affect detection active.');
        return true;

      } catch (err) {
        console.warn('[LoreVoxEmotion] Camera access denied or unavailable:', err);
        // Step 3 fix: clean up partially-created DOM and state on failed start.
        // Without this, every failed attempt leaves an orphaned <video> element in the DOM.
        if (_videoEl) {
          try { _videoEl.remove(); } catch (_) {}
          _videoEl = null;
        }
        if (_camera) {
          try { _camera.stop(); } catch (_) {}
          _camera = null;
        }
        _active = false;
        return false;
      }
    },

    /** Stop processing and release camera. */
    stop() {
      _active = false;
      if (_camera) {
        try { _camera.stop(); } catch (_) { /* ignore */ }
        _camera = null;
      }
      if (_videoEl) {
        try { _videoEl.remove(); } catch (_) {}
        _videoEl = null;
      }
      // Step 3 fix: reset _faceMesh reference so a subsequent init() starts clean
      // and doesn't hold a stale reference to the closed mesh/video pair.
      _faceMesh = null;
      _sustainTracker.reset();
      _lastAffectState = 'steady';
      console.log('[LoreVoxEmotion] Stopped.');
    },

    /** Update the current interview section ID (included in affect events). */
    setSection(sectionId) {
      _currentSectionId = sectionId || null;
    },

    /** Returns true if the camera is active and processing. */
    isActive() {
      return _active;
    },

    /** Returns the last known affect state string. */
    getLastAffectState() {
      return _lastAffectState;
    },

    /** All valid affect state values. */
    AFFECT_STATES,
  };

  // Expose globally
  global.LoreVoxEmotion = LoreVoxEmotion;

})(typeof window !== 'undefined' ? window : global);
