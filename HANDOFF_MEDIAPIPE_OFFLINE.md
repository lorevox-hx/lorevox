# Handoff — MediaPipe Offline Bundling

**Goal:** Make the Lorevox facial expression engine work with no internet connection.
**Status:** Not done — all MediaPipe assets currently load from `cdn.jsdelivr.net` at runtime.
**Scope:** 3 files to change, 1 directory to create, ~10–15 MB of assets to vendor.
**Consent gate and `LoreVoxEmotion.start()` behaviour is unchanged** — offline bundling is a drop-in swap.

---

## What currently loads from the internet

There are two distinct CDN dependencies, both required before the emotion engine can initialise:

| Dependency | Currently loaded from | What it is |
|---|---|---|
| `face_mesh.js` | `cdn.jsdelivr.net/npm/@mediapipe/face_mesh/` | MediaPipe JS entry script, sets up the WASM runtime |
| `camera_utils.js` | `cdn.jsdelivr.net/npm/@mediapipe/camera_utils/` | Helper that wraps `getUserMedia` into a frame-feed loop |

Beyond those two script tags, `face_mesh.js` itself fetches additional binary files at initialisation time using the `locateFile` callback in `emotion.js` (line 364–366). These are:

| File | Size (approx) | What it is |
|---|---|---|
| `face_mesh_solution_packed_assets.data` | ~2 MB | Face landmark model data |
| `face_mesh_solution_packed_assets_loader.js` | ~5 KB | JS loader for the data file |
| `face_mesh_solution_simd_wasm_bin.wasm` | ~6 MB | SIMD-optimised WASM binary |
| `face_mesh_solution_simd_wasm_bin.js` | ~10 KB | JS wrapper for SIMD binary |
| `face_mesh_solution_wasm_bin.wasm` | ~5 MB | Fallback non-SIMD WASM binary |
| `face_mesh_solution_wasm_bin.js` | ~10 KB | JS wrapper for fallback binary |

All of these must be present locally. The `locateFile` override is how you tell MediaPipe where to find them — it currently points at the CDN.

---

## Action plan

### Step 1 — Download the packages via npm

Run this once, anywhere you have npm. You don't need to install into the project — you're just extracting files.

```bash
mkdir -p /tmp/mediapipe_vendor
cd /tmp/mediapipe_vendor
npm pack @mediapipe/face_mesh@latest
npm pack @mediapipe/camera_utils@latest
```

This creates two `.tgz` files. Unpack them:

```bash
tar -xzf mediapipe-face_mesh-*.tgz
tar -xzf mediapipe-camera_utils-*.tgz
```

**Pin the version.** Check which version was unpacked:

```bash
cat package/package.json | grep '"version"'
```

Note the exact version (e.g. `0.4.1633559619`). Use this same version string in all future `npm pack` commands and document it in `LOREVOX_ARCHITECTURE.md` under dependencies. Do not silently upgrade — MediaPipe WASM binaries are not backwards-compatible with older `face_mesh.js` loaders.

---

### Step 2 — Copy files into the project

Create the vendor directory structure inside the UI folder:

```
lorevox/ui/vendor/mediapipe/face_mesh/
lorevox/ui/vendor/mediapipe/camera_utils/
```

Copy from the unpacked packages:

```bash
# face_mesh — copy everything from the package root
cp /tmp/mediapipe_vendor/package/* lorevox/ui/vendor/mediapipe/face_mesh/

# camera_utils — copy the JS file
cp /tmp/mediapipe_vendor/package/camera_utils.js lorevox/ui/vendor/mediapipe/camera_utils/
```

The files that must be present in `vendor/mediapipe/face_mesh/` after this step:

```
face_mesh.js
face_mesh_solution_packed_assets.data
face_mesh_solution_packed_assets_loader.js
face_mesh_solution_simd_wasm_bin.wasm
face_mesh_solution_simd_wasm_bin.js
face_mesh_solution_wasm_bin.wasm
face_mesh_solution_wasm_bin.js
```

If any of these are missing, `LoreVoxEmotion.init()` will fail silently after the camera permission is granted — the engine will not start and the consent gate will remain open.

---

### Step 3 — Update `lori7.1.html` (2 lines)

In `ui/lori7.1.html`, find the two CDN script tags (currently lines 13–14):

```html
<!-- BEFORE -->
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js" crossorigin="anonymous"></script>
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js" crossorigin="anonymous"></script>
```

Replace with:

```html
<!-- AFTER -->
<script src="vendor/mediapipe/face_mesh/face_mesh.js"></script>
<script src="vendor/mediapipe/camera_utils/camera_utils.js"></script>
```

Remove the `crossorigin` attribute — it is only needed for cross-origin CDN requests and will cause a CORS error if left on a local file path.

---

### Step 4 — Update `emotion.js` (1 line)

In `ui/js/emotion.js`, find the `locateFile` callback inside `LoreVoxEmotion.init()` (currently line 364–366):

```javascript
// BEFORE
_faceMesh = new FaceMesh({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
});
```

Replace with:

```javascript
// AFTER
_faceMesh = new FaceMesh({
  locateFile: (file) =>
    `vendor/mediapipe/face_mesh/${file}`,
});
```

This is the critical change. Without it, `face_mesh.js` will load locally but will immediately go back to the CDN to fetch the WASM binaries and model data — the engine will still fail offline.

---

### Step 5 — Verify offline

1. Disconnect from the internet (or block outbound requests in Chrome DevTools → Network → Offline).
2. Load `lori7.1.html` from the file system.
3. Open the Interview tab. Enable emotion-aware mode.
4. The `FacialConsent` modal should appear as normal.
5. Approve consent. The camera should activate.
6. Open DevTools Console and confirm:
   - `[LoreVoxEmotion] Camera started — affect detection active.` appears.
   - No `net::ERR_INTERNET_DISCONNECTED` or `cdn.jsdelivr.net` errors.
7. Open DevTools Network tab. Filter by `mediapipe`. Confirm all requests resolve to `vendor/mediapipe/...` with status `200` and no requests go to `cdn.jsdelivr.net`.

If the WASM binary fails to load, check that the `.wasm` files were copied correctly — some package managers silently skip large binary files.

---

## Out of scope for this handoff

**Tailwind CSS** (`https://cdn.tailwindcss.com`) is also loaded from the internet (line 8 of `lori7.1.html`). It is not part of the emotion engine and will not block camera or facial consent, but it will break the visual layout offline. To fix it separately: download the Tailwind standalone CLI binary, run a build against `lori7.1.html`, output a compiled `ui/css/tailwind.css`, remove the CDN tag, and add a local `<link>` tag. That is a separate task.

**The affect-event POST** (`/api/interview/affect-event` in `emotion.js` line 287) sends derived affect data to the Lorevox backend. This is a localhost call — it is not an internet dependency and does not need to change for offline operation.

---

## Files changed summary

| File | Change |
|---|---|
| `ui/lori7.1.html` | Lines 13–14: CDN script tags → local vendor paths |
| `ui/js/emotion.js` | Line 365: `locateFile` CDN URL → local vendor path |
| `ui/vendor/mediapipe/face_mesh/` | New directory — 7 files (~13 MB) |
| `ui/vendor/mediapipe/camera_utils/` | New directory — 1 file (~20 KB) |
