/* ═══════════════════════════════════════════════════════════════
   app.js — Lorevox 7.1 review patch
   Purpose: hook profile save/load to timeline seed behavior
═══════════════════════════════════════════════════════════════ */

/* ── Simple client-side timeline builder for review ──────────── */
function initializeTimelineSpineFromProfile(){
  const basics = state.profile?.basics || {};
  if(!basics.dob || !basics.pob) return null;

  const birthYear = parseInt(String(basics.dob).slice(0,4), 10);
  if(Number.isNaN(birthYear)) return null;

  const buckets = [
    { label:"early_childhood", start_age:0,  end_age:5  },
    { label:"school_years",    start_age:6,  end_age:12 },
    { label:"adolescence",     start_age:13, end_age:18 },
    { label:"early_adulthood", start_age:19, end_age:30 },
    { label:"midlife",         start_age:31, end_age:55 },
    { label:"later_life",      start_age:56, end_age:null },
  ];

  const periods = buckets.map(b => ({
    label: b.label,
    start_year: birthYear + b.start_age,
    end_year: b.end_age === null ? null : (birthYear + b.end_age),
    is_approximate: true,
    places: b.label === "early_childhood" ? [basics.pob] : [],
    people: [],
    notes: b.label === "early_childhood" ? [`Born in ${basics.pob}`] : [],
  }));

  state.timeline.spine = {
    birth_date: basics.dob,
    birth_place: basics.pob,
    periods,
  };
  state.timeline.seedReady = true;
  saveTimelineSpineLocal();
  setInterviewPass("pass2a");
  setInterviewEra(periods[0]?.label || null);
  setInterviewMode71("open");
  return state.timeline.spine;
}

/* ── Readiness card upgrade ──────────────────────────────────── */
function updateArchiveReadiness71(){
  const el=document.getElementById("readinessChecks");
  if(!el) return;
  const b=state.profile?.basics||{};
  const checks=[
    {label:"Date of birth added", ok:!!b.dob},
    {label:"Birthplace added", ok:!!b.pob},
    {label:"Timeline seed ready", ok:getTimelineSeedReady()},
    {label:"Profile saved", ok:profileSaved},
  ];
  el.innerHTML=checks.map(c=>`
    <div class="readiness-item${c.ok?" ok":""}">
      <div class="readiness-dot ${c.ok?"ok":"miss"}"></div>
      <span>${c.label}</span>
      ${c.ok?'<span style="color:#4ade80;font-size:10px;margin-left:auto">✓</span>':''}
    </div>`).join("");
}

/* ── Sidebar heading relabel ─────────────────────────────────── */
function relabelRoadmapHeading71(){
  const titles = document.querySelectorAll(".sb-section-title");
  titles.forEach(el => {
    if(el.textContent && el.textContent.trim() === "Interview Roadmap"){
      el.textContent = "Life Periods";
    }
  });
}

/* ── Hook points for existing app lifecycle ──────────────────── */
function apply71ShellHydration(){
  relabelRoadmapHeading71();

  if(state.person_id){
    const cached = loadTimelineSpineLocal(state.person_id);
    if(cached){
      state.timeline.spine = cached;
      state.timeline.seedReady = true;
      if(!state.session.currentEra && cached.periods?.length){
        setInterviewEra(cached.periods[0].label);
      }
      if(!state.session.currentPass || state.session.currentPass === "pass1"){
        setInterviewPass("pass2a");
      }
    }
  }

  updateArchiveReadiness71();
  renderRoadmap();
  renderInterview();
  renderTimeline();
}

/* ── Review merge instructions ─────────────────────────────────
   Add these calls to the real app lifecycle:

   1) after hydrateProfileForm() / loadPerson():
      apply71ShellHydration();

   2) after saveProfile() succeeds:
      initializeTimelineSpineFromProfile();
      apply71ShellHydration();

   3) after createPersonFromForm() + loadPerson():
      initializeTimelineSpineFromProfile();
      apply71ShellHydration();
*/
