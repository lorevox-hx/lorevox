/* ═══════════════════════════════════════════════════════════════
   permissions.js — permission card: mic/camera/location toggles
   Lorevox v6.1 Track B  |  Step 3: optional location added
   Load order: SIXTH

   LOCATION GUARD CONTRACT (Step 3)
   ─────────────────────────────────
   navigator.geolocation is NEVER called on page load or from any
   automatic path. It is ONLY called from requestOptionalLocation()
   which requires prior explicit user action (clicking the location
   toggle in the settings panel, then confirming).

   Location data:
   ├─ Stored in state.session.locationContext (session-scoped only)
   ├─ Never written to localStorage
   ├─ Cleared on page reload (session ends)
   └─ Sent to server only as city/region string — never raw coords
═══════════════════════════════════════════════════════════════ */

function togglePermMic(){
  permMicOn=!permMicOn;
  const el = document.getElementById("permMicToggle");
  if (el) el.classList.toggle("on",permMicOn);
}

function togglePermCam(){
  permCamOn=!permCamOn;
  const el = document.getElementById("permCamToggle");
  if (el) el.classList.toggle("on",permCamOn);
}

// Step 3 — location toggle: only flips the UI flag.
// Actual geolocation is only requested via requestOptionalLocation().
function togglePermLoc(){
  permLocOn=!permLocOn;
  const el = document.getElementById("permLocToggle");
  if (el) el.classList.toggle("on",permLocOn);
  _lv80UpdateLocStatus();
}

function confirmPermCard(){
  const card = document.getElementById("permCard");
  if (card) card.classList.add("hidden");
  // If camera opted in, enable affect-aware mode automatically
  if(permCamOn){
    emotionAware=true;
    if (typeof updateEmotionAwareBtn === "function") updateEmotionAwareBtn();
  }
  // If location opted in via perm card, request it now
  if(permLocOn) requestOptionalLocation();
  _ivStartActual();
}

function dismissPermCard(){
  const card = document.getElementById("permCard");
  if (card) card.classList.add("hidden");
  _ivStartActual();
}

// ── Step 3: Optional location ─────────────────────────────────────────────
// Called ONLY after explicit user consent (togglePermLoc → this function,
// or from the settings panel "Use my location" button).
// Never called on page load or automatically.

function requestOptionalLocation(){
  if (!navigator.geolocation) {
    _lv80UpdateLocStatus("Location not supported by this browser.");
    permLocOn = false;
    return;
  }
  _lv80UpdateLocStatus("Requesting location…");
  navigator.geolocation.getCurrentPosition(
    function(pos){
      // Convert raw coords to approximate city/region via free API
      const lat = pos.coords.latitude.toFixed(2);
      const lon = pos.coords.longitude.toFixed(2);
      // Use BigDataCloud's free reverse-geocode API (no API key required)
      fetch("https://api.bigdatacloud.net/data/reverse-geocode-client?latitude="+lat+"&longitude="+lon+"&localityLanguage=en")
        .then(function(r){ return r.json(); })
        .then(function(d){
          const city    = d.city || d.locality || d.principalSubdivision || "";
          const region  = d.principalSubdivision || "";
          const country = d.countryName || "";
          const label   = [city, region, country].filter(Boolean).slice(0,2).join(", ");
          if (!state.session) state.session = {};
          // Store city/region only — never raw coordinates
          state.session.locationContext = { label: label, city: city, region: region, country: country };
          _lv80UpdateLocStatus("📍 " + (label || "Location shared"));
          console.log("[location_context]", state.session.locationContext);
        })
        .catch(function(){
          // Fallback: store approximate coords as region string only
          if (!state.session) state.session = {};
          state.session.locationContext = { label: "Location shared (approximate)", city: "", region: "", country: "" };
          _lv80UpdateLocStatus("📍 Location shared");
        });
    },
    function(err){
      permLocOn = false;
      const el = document.getElementById("permLocToggle");
      if (el) el.classList.remove("on");
      const msgs = { 1: "Location access denied.", 2: "Location unavailable.", 3: "Location request timed out." };
      _lv80UpdateLocStatus(msgs[err.code] || "Location error.");
    },
    { timeout: 8000, enableHighAccuracy: false }
  );
}

function clearOptionalLocation(){
  if (state.session) state.session.locationContext = null;
  permLocOn = false;
  const el = document.getElementById("permLocToggle");
  if (el) el.classList.remove("on");
  _lv80UpdateLocStatus("Not shared this session");
}

// Update the location status label in the settings panel (if present)
function _lv80UpdateLocStatus(msg){
  const el = document.getElementById("lv80LocStatus");
  if (el) el.textContent = msg !== undefined ? msg : (
    state.session?.locationContext?.label
      ? "📍 " + state.session.locationContext.label
      : "Not shared this session"
  );
}
