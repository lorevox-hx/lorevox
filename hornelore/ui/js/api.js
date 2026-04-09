/* ═══════════════════════════════════════════════════════════════
   api.js — API endpoint constants and localStorage keys
   Lorevox v6.1
   Load order: THIRD (after state.js, data.js)
═══════════════════════════════════════════════════════════════ */

const ORIGIN   = window.LOREVOX_API || "http://localhost:8000";
const TTS_ORIG = window.LOREVOX_TTS || "http://localhost:8001";
const LS_ACTIVE = "lv_active_person_v55";
const LS_DONE   = (pid) => `lv_done_${pid}`;
const LS_SEGS   = (pid) => `lv_segs_${pid}`;

const API = {
  PING:       ORIGIN + "/api/ping",
  TTS_VOICES: TTS_ORIG + "/api/tts/voices",
  PEOPLE:     ORIGIN + "/api/people",
  PERSON:     (id) => `${ORIGIN}/api/people/${id}`,
  PROFILE:    (id) => `${ORIGIN}/api/profiles/${id}`,
  SESS_NEW:   ORIGIN + "/api/session/new",
  SESS_PUT:   ORIGIN + "/api/session/put",
  SESS_LIST:  ORIGIN + "/api/sessions/list",
  SESS_TURNS: (id) => `${ORIGIN}/api/session/turns?conv_id=${encodeURIComponent(id)}`,
  CHAT_SSE:   ORIGIN + "/api/chat/stream",
  CHAT_WS:    ORIGIN.replace(/^http/,"ws") + "/api/chat/ws",
  IV_START:   ORIGIN + "/api/interview/start",
  IV_ANSWER:  ORIGIN + "/api/interview/answer",
  TIMELINE:   (id) => `${ORIGIN}/api/timeline/list?person_id=${encodeURIComponent(id)}`,
  TL_ADD:     ORIGIN + "/api/timeline/add",
  // v6.1 Track A
  IV_SEG_FLAGS:  (sid) => `${ORIGIN}/api/interview/segment-flags?session_id=${encodeURIComponent(sid)}`,
  IV_SEG_UPDATE: ORIGIN + "/api/interview/segment-flag/update",
  IV_SEG_DELETE: ORIGIN + "/api/interview/segment-flag/delete",
  // v6.1 Track B
  IV_AFFECT_EVENT: ORIGIN + "/api/interview/affect-event",
  IV_AFFECT_CTX:   (sid) => `${ORIGIN}/api/interview/affect-context?session_id=${encodeURIComponent(sid)}`,
  // v7.4D — Phase 7: facts
  FACTS_ADD:       ORIGIN + "/api/facts/add",
  FACTS_LIST:      (pid) => `${ORIGIN}/api/facts/list?person_id=${encodeURIComponent(pid)}`,
  // v8 — Phase 2: narrator delete cascade
  PERSON_INVENTORY: (id) => `${ORIGIN}/api/people/${id}/delete-inventory`,
  PERSON_RESTORE:   (id) => `${ORIGIN}/api/people/${id}/restore`,
  // Phase G — Storage Authority
  BB_QQ_GET:        (id) => `${ORIGIN}/api/bio-builder/questionnaire?person_id=${encodeURIComponent(id)}`,
  BB_QQ_PUT:        ORIGIN + "/api/bio-builder/questionnaire",
  IV_PROJ_GET:      (id) => `${ORIGIN}/api/interview/projection?person_id=${encodeURIComponent(id)}`,
  IV_PROJ_PUT:      ORIGIN + "/api/interview/projection",
  NARRATOR_STATE:   (id) => `${ORIGIN}/api/narrator/state-snapshot?person_id=${encodeURIComponent(id)}`,
  // Phase Q.1 — Relationship Graph Layer
  GRAPH_GET:        (id) => `${ORIGIN}/api/graph/${encodeURIComponent(id)}`,
  GRAPH_PUT:        (id) => `${ORIGIN}/api/graph/${encodeURIComponent(id)}`,
  GRAPH_PERSON:     (nid) => `${ORIGIN}/api/graph/${encodeURIComponent(nid)}/person`,
  GRAPH_REL:        (nid) => `${ORIGIN}/api/graph/${encodeURIComponent(nid)}/relationship`,
  GRAPH_DEL_PERSON: (pid) => `${ORIGIN}/api/graph/person/${encodeURIComponent(pid)}`,
  GRAPH_DEL_REL:    (rid) => `${ORIGIN}/api/graph/relationship/${encodeURIComponent(rid)}`,
  // Phase Q.4 — Chat Readiness Gate
  WARMUP:           ORIGIN + "/api/warmup",
  // WO-8 — Transcript History & Thread Anchor
  TRANSCRIPT_HISTORY: (pid, sid) => `${ORIGIN}/api/transcript/history?person_id=${encodeURIComponent(pid)}${sid ? '&session_id=' + encodeURIComponent(sid) : ''}`,
  TRANSCRIPT_SESSIONS: (pid) => `${ORIGIN}/api/transcript/sessions?person_id=${encodeURIComponent(pid)}`,
  TRANSCRIPT_EXPORT_TXT: (pid, sid) => `${ORIGIN}/api/transcript/export/txt?person_id=${encodeURIComponent(pid)}${sid ? '&session_id=' + encodeURIComponent(sid) : ''}`,
  TRANSCRIPT_EXPORT_JSON: (pid, sid) => `${ORIGIN}/api/transcript/export/json?person_id=${encodeURIComponent(pid)}${sid ? '&session_id=' + encodeURIComponent(sid) : ''}`,
  THREAD_ANCHOR_GET: (pid, sid) => `${ORIGIN}/api/transcript/thread-anchor?person_id=${encodeURIComponent(pid)}${sid ? '&session_id=' + encodeURIComponent(sid) : ''}`,
  THREAD_ANCHOR_PUT: ORIGIN + "/api/transcript/thread-anchor",
  // WO-8 — Multi-field extraction
  EXTRACT_FIELDS: ORIGIN + "/api/extract-fields",
  // WO-9 — Rolling summary & recent turns
  ROLLING_SUMMARY_GET: (pid) => `${ORIGIN}/api/transcript/rolling-summary?person_id=${encodeURIComponent(pid)}`,
  ROLLING_SUMMARY_PUT: ORIGIN + "/api/transcript/rolling-summary",
  RECENT_TURNS: (pid, sid, limit) => `${ORIGIN}/api/transcript/recent-turns?person_id=${encodeURIComponent(pid)}${sid ? '&session_id=' + encodeURIComponent(sid) : ''}${limit ? '&limit=' + limit : ''}`,
  // WO-9 — All-session export
  TRANSCRIPT_EXPORT_ALL_TXT: (pid) => `${ORIGIN}/api/transcript/export/all/txt?person_id=${encodeURIComponent(pid)}`,
  TRANSCRIPT_EXPORT_ALL_JSON: (pid) => `${ORIGIN}/api/transcript/export/all/json?person_id=${encodeURIComponent(pid)}`,
  // WO-10 — Resume preview, session timeline, thread update
  RESUME_PREVIEW: (pid) => `${ORIGIN}/api/transcript/resume-preview?person_id=${encodeURIComponent(pid)}`,
  SESSION_TIMELINE: (pid) => `${ORIGIN}/api/transcript/session-timeline?person_id=${encodeURIComponent(pid)}`,
  UPDATE_THREADS: ORIGIN + "/api/transcript/update-threads",
};
