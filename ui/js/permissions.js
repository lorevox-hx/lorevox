/* ═══════════════════════════════════════════════════════════════
   permissions.js — permission card: mic/camera toggles and confirm
   Lorevox v6.1 Track B
   Load order: SIXTH
═══════════════════════════════════════════════════════════════ */

function togglePermMic(){
  permMicOn=!permMicOn;
  document.getElementById("permMicToggle").classList.toggle("on",permMicOn);
}

function togglePermCam(){
  permCamOn=!permCamOn;
  document.getElementById("permCamToggle").classList.toggle("on",permCamOn);
}

function confirmPermCard(){
  document.getElementById("permCard").classList.add("hidden");
  // If camera opted in, enable affect-aware mode automatically
  if(permCamOn){
    emotionAware=true;
    updateEmotionAwareBtn();
  }
  _ivStartActual();
}

function dismissPermCard(){
  document.getElementById("permCard").classList.add("hidden");
  _ivStartActual();
}
