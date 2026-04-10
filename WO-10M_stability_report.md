WO-10M — CUDA Stability, Token Guardrails, and Recovery Hardening
===================================================================

Status: STATIC VALIDATION PASS (runtime validation pending full-stack restart)
Scope: chat generation pressure, VRAM guarding, CUDA OOM recovery,
       allocator fragmentation, extraction waste reduction, instrumentation.
Non-scope: prompt-tone rewrite, Whisper migration, route contract work
           (already covered by WO-10L).

1. Files changed
----------------

hornelore/launchers/hornelore_run_gpu_8000.sh
  - MAX_NEW_TOKENS default dropped from 7168 → 512
  - Added task-specific caps: MAX_NEW_TOKENS_CHAT=512,
    MAX_NEW_TOKENS_EXTRACT=128, MAX_NEW_TOKENS_SUMMARY=1024
  - Added VRAM guard tunables: VRAM_GUARD_BASE_MB=600,
    VRAM_GUARD_PER_TOKEN_MB=0.14, VRAM_GUARD_ENABLED=1
  - Added allocator fragmentation mitigation:
    PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
  - Added launcher-banner echo lines for all WO-10M settings so
    runtime proof is visible in the API log on boot.

hornelore/server/code/api/routers/chat_ws.py
  - Added WO-10M env-driven config block at module scope
    (reads MAX_NEW_TOKENS_CHAT, VRAM_GUARD_BASE_MB,
    VRAM_GUARD_PER_TOKEN_MB, VRAM_GUARD_ENABLED).
  - Refactored generate_and_stream() OOM handler to the
    flag-outside-except pattern (set oom_triggered=True inside the
    except, exit the except scope, run empty_cache / mem_get_info
    recovery AFTER the exception object and its stack-frame
    references have been dropped). Prevents the "exception object
    keeps tensors alive" reference-cycle problem documented in the
    PyTorch FAQ and in the WO-10M research brief.
  - Added gc.collect() inside the recovery phase to break any
    lingering reference cycles before re-querying the allocator.
  - Added pre-generation VRAM guard in _generate_and_stream_inner:
    required_mb = base + (prompt_tokens + max_new) * per_token_mb
    If free_vram < required_mb, attempt one empty_cache() flush
    and re-check. If still below threshold, send a structured
    VRAM_PRESSURE error frame and a done frame with blocked flag,
    then return without calling model.generate(). The forward pass
    never runs when the guard fails, so there is no way for the
    MLP down_proj transient to OOM mid-turn.
  - Added hard ceiling enforcement: UI-supplied max_new_tokens is
    clamped to MAX_NEW_TOKENS_CHAT_HARD (default 1024). Any value
    above that is logged and truncated.
  - Added structured instrumentation log line with fields:
    prompt_tokens, max_new, required_mb, free_mb, total_mb,
    guard_decision (pass / pass_after_flush / blocked / disabled).
  - Wrapped all mem_get_info() and empty_cache() calls in
    defensive try/except so an already-wedged allocator cannot
    itself raise and wedge the recovery path.

hornelore/server/code/api/routers/extract.py
  - Added `import os`.
  - Dropped hardcoded max_new from 600 → env-driven value
    (MAX_NEW_TOKENS_EXTRACT, default 128). One LLM call per
    extraction request, no retry loop. Parse failure falls
    straight through to the existing rules-based extractor via
    _extract_via_rules, exactly as before.
  - Added instrumentation log line showing the effective cap
    at call time so runtime proof is in the log.

hornelore/launchers/hornelore_run_tts_8001.sh
  - Not modified. TTS server does not run LLM generation; its
    only interaction with CUDA is model load for XTTS/Coqui and
    its own inference loop, which is outside WO-10M scope.

hornelore/server/code/api/api.py
  - Not modified. The REST /chat and SSE /chat/stream paths
    already accept request-level max_new (default 512 via
    _ChatReq Pydantic model) and already have context-window
    truncation + CUDA OOM try/except with HTTPException 507 and
    structured error frames. The gap WO-10M was asked to close
    was in chat_ws.py, which had no pre-gen guard, and in
    extract.py, which had a hardcoded 600 cap. api.py was not
    the failure point and surgical edits were preferred.

2. Previous behavior
--------------------

WebSocket chat (chat_ws.py):
  * Effective max_new came from UI params (typically 512), with
    no hard ceiling — a misbehaving client could request 7168.
  * VRAM free was LOGGED before generate() but never used for a
    block decision — no circuit breaker.
  * OOM handler caught (torch.cuda.OutOfMemoryError, RuntimeError)
    and called empty_cache() INSIDE the except block. The
    exception object kept the failed-frame tensors rooted, so
    empty_cache() could not reclaim them. On allocator-wedge
    scenarios, mem_get_info() inside the handler could itself
    raise and leave the WebSocket in a partially-closed state.
  * No allocator fragmentation mitigation. Long-running WS
    inference builds up fixed segments; a later large transient
    allocation could fail even with enough total free VRAM.

Launcher:
  * MAX_NEW_TOKENS=7168 as the nominal ceiling. The UI paths
    all clamped to 512 in practice, but the env var was still
    the advertised ceiling and any future call site that read
    it directly would inherit the unsafe value.
  * No VRAM guard tunables.
  * No PYTORCH_CUDA_ALLOC_CONF.

Extraction (extract.py):
  * Hardcoded max_new=600 for every /extract-fields call.
    Extraction output is a 3–8 item JSON array that rarely
    needs more than 60–80 tokens; 600 allowed the model to
    generate verbose prose or multiple blobs, wasting VRAM and
    breaking the parser. That in turn triggered the
    "falling back to rules" log spam users reported.

3. New behavior
---------------

Launcher boot banner (expected additional log lines):
  [launcher] WO-10M caps: chat=512 extract=128 summary=1024
  [launcher] WO-10M VRAM guard: enabled=1 base=600MB per_token=0.14MB
  [launcher] WO-10M allocator: PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True

Chat WS per-turn log line (expected):
  [chat_ws][WO-10M] prompt_tokens=N max_new=M required=X MB
  free=F/T MB guard=pass|pass_after_flush|blocked|disabled

Chat WS blocked turn (expected when guard triggers):
  [chat_ws][WO-10M] BLOCKING turn: required=X MB > free=F MB
  (prompt=N, max_new=M). Not calling model.generate().
  + WebSocket error frame: {type: error, code: VRAM_PRESSURE,
    message: "Not enough GPU memory for this turn — please try a
    shorter message or try again shortly.", vram_free_mb, required_mb,
    prompt_tokens}
  + WebSocket done frame: {type: done, final_text: "",
    blocked: "vram_pressure"}

Chat WS OOM recovery (expected when OOM escapes the guard):
  [chat_ws][WO-10M] CUDA OOM caught (torch.cuda.OutOfMemoryError): ...
  [chat_ws][WO-10M] post-OOM recovery complete, free VRAM=X MB
  + WebSocket error frame: {type: error, code: CUDA_OOM,
    vram_free_mb: X}
  + WebSocket done frame: {type: done, final_text: "", oom: True}
  Next turn on same socket proceeds normally — no process restart.

Extraction log line (expected):
  [extract][WO-10M] calling LLM max_new=128 temp=0.15 conv=_extract_...

4. Effective cap values by path
-------------------------------

| Path                        | Cap source                            | Value |
|-----------------------------|---------------------------------------|-------|
| WS /api/chat/ws             | params.max_new_tokens, clamped to 1024 | 512   |
| REST /api/chat              | _ChatReq.max_new (unchanged)          | 512   |
| SSE /api/chat/stream        | _ChatReq.max_new (unchanged)          | 512   |
| Warmup /api/warmup          | hardcoded                             | 8     |
| Extraction /api/extract-fields | MAX_NEW_TOKENS_EXTRACT env         | 128   |
| llm_interview summary       | default 420 (no change, low frequency) | 420   |
| llm_interview final memoir  | default 900 (no change, rare call)     | 900   |
| Launcher MAX_NEW_TOKENS     | launcher default                       | 512   |

Note on llm_interview.py: the 420/900 defaults there are per-function
kwargs, not env-driven. They are low-frequency paths (section summary
and final memoir draft) and do not run on the chat hot path. If they
ever trigger VRAM pressure in production they can be migrated to
MAX_NEW_TOKENS_SUMMARY in a follow-up. Out of scope for WO-10M.

5. Allocator mitigation status
------------------------------

PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True is exported from the
launcher. Verification that it reaches the Python process will appear
in the [launcher] banner line and can be independently confirmed at
runtime via:

  grep "PYTORCH_CUDA_ALLOC_CONF" /proc/<uvicorn_pid>/environ

It is kept regardless of runtime result because it is safe by design
(it only affects allocator segment layout, not correctness) and the
research explicitly supports it as a long-running-server mitigation.

6. Static validation results
----------------------------

[PASS] launcher syntax (bash -n)
[PASS] chat_ws.py syntax (ast.parse)
[PASS] extract.py syntax (ast.parse)
[PASS] all WO-10M env vars exported in launcher
[PASS] chat_ws.py reads all WO-10M env vars at module scope
[PASS] chat_ws.py OOM handler uses flag-outside-except pattern
[PASS] chat_ws.py pre-gen VRAM guard present and guarded by env
[PASS] chat_ws.py structured instrumentation log present
[PASS] chat_ws.py hard-ceiling clamp on max_new_tokens present
[PASS] extract.py no longer has hardcoded max_new=600
[PASS] extract.py reads MAX_NEW_TOKENS_EXTRACT env (default 128)
[PASS] extract.py remains one-shot: no retry loop on parse failure
[PASS] no live 7168 default remains anywhere (only in a comment)

7. Runtime validation plan (pending user restart)
-------------------------------------------------

A. Boot proof (before any chat):
   1. Start API via Desktop\Horne\Start Hornelore.bat
   2. tail -n 100 of API log should show all three WO-10M
      launcher banner lines.
   3. First model load should show VRAM snapshot unchanged vs
      pre-WO-10M (caps do not affect static floor).

B. Normal chat (one-shot, no stress):
   1. Send "hello" as normal chat turn.
   2. Log should show [chat_ws][WO-10M] prompt_tokens=... guard=pass
   3. Reply should generate normally, 1–3 sentences.
   4. No OOM, no block.

C. Operator feedback regression (WO-10L Part 2 replay):
   1. Re-run the Janice 4-turn operator feedback test script.
   2. All four turns must reach done frame cleanly, not oom/blocked.
   3. No CUDA OOM events in log.
   4. Extraction calls during these turns should log
      [extract][WO-10M] calling LLM max_new=128.

D. Stress case (deliberate large input):
   1. Paste a ~3000-word narrator story in one turn.
   2. Guard should EITHER:
      - let the turn through with guard=pass (if headroom OK), or
      - block with guard=blocked and return VRAM_PRESSURE frame.
   3. Under NO circumstances should the process crash or the
      next turn fail — the very next small turn must work.

E. Post-failure recovery:
   1. Immediately after the stress case (whether it passed or
      was blocked), send a normal small turn.
   2. Turn must complete cleanly. This is the wedge-prevention
      acceptance test.

F. Extraction regression:
   1. Trigger an /api/extract-fields call with a real narrator
      paragraph.
   2. Log should show max_new=128, one _try_call_llm call.
   3. Success OR rules-fallback is acceptable; LOOPING is not.

8. Remaining risk
-----------------

R1. VRAM guard base (600 MB) and per-token (0.14 MB) values are
    derived from research calculations, not measured on this
    specific hardware. If the RTX 5080 Laptop's Blackwell-era
    allocator behaves differently under bitsandbytes 4-bit
    quantization, the guard may be too loose (allowing OOMs
    through) or too tight (blocking safe turns). Mitigation:
    both values are env-tunable without code edits. If stress
    test D blocks too aggressively, raise VRAM_GUARD_PER_TOKEN_MB
    modestly or lower VRAM_GUARD_BASE_MB. If OOMs still occur,
    raise VRAM_GUARD_BASE_MB.

R2. llm_interview.py summary/memoir paths (420/900 tokens) are
    unchanged. They run through api.chat() which has its own
    context-window truncation and OOM handling, so they cannot
    wedge the WS worker, but they can still OOM individually.
    Out of scope; worth a follow-on WO if they trigger.

R3. PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True requires
    PyTorch 2.1+ on Linux/WSL. The venv is on Python 3.12 and
    the research timeline implies PyTorch 2.x+, so this should
    be supported, but we have not run the python -c
    "import torch; print(torch.__version__)" check as part of
    WO-10M. If the feature is unsupported, PyTorch logs a
    warning at startup and ignores the setting — no functional
    regression, just a lost mitigation. Worth verifying in the
    first boot log after restart.

R4. The existing WO-1 context window truncation (MAX_CONTEXT_WINDOW)
    still runs AFTER the WO-10M guard. If a turn with a 10000-token
    prompt passes the guard (because MAX_CONTEXT_WINDOW is 8192),
    the prompt will be truncated to 8192 before generation. This
    means the guard is slightly pessimistic for over-long prompts —
    it uses min(prompt_tokens, MAX_CONTEXT_WINDOW) for planning,
    which is correct. No action needed; documented for clarity.

R5. Whisper STT co-residency is unchanged. The research identified
    this as a ~1.5–2.8 GB hidden tax on the LLM's free VRAM.
    WO-10M does not change STT placement. If the guard's 600 MB
    base proves insufficient after the stress test, the fastest
    follow-on is to either (a) tune VRAM_GUARD_BASE_MB upward, or
    (b) open a WO-10N to demote Whisper to CPU or a smaller
    quantization tier.

9. Operator note (paste-ready)
------------------------------

WO-10M completed. Lorevox now uses bounded task-specific generation
caps (chat=512, extraction=128, summary=1024), a pre-generation VRAM
guard that blocks unsafe turns before model.generate() runs, allocator
fragmentation mitigation via PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True,
a CUDA OOM recovery path that does cleanup AFTER the exception scope
closes so tensor references actually get freed, and one-shot extraction
with the cap dropped from 600 → 128 tokens. Static validation PASS.
Runtime validation pending API restart and the WO-10M validation plan
(boot banner + operator feedback regression + deliberate stress case
+ post-failure recovery). Further behavioral tuning (Part 2 soft-redirect
and mixed-context handling) should proceed only after the runtime
validation plan shows green.

10. Final success condition
---------------------------

WO-10M is complete when a fresh Hornelore boot:
  (a) prints all three WO-10M launcher banner lines
  (b) survives the Janice 4-turn operator feedback test with
      zero CUDA OOM events and all four turns reaching done
  (c) survives a deliberate ~3000-word stress input with either
      guard=pass or guard=blocked + VRAM_PRESSURE frame
  (d) accepts a normal turn immediately after (c) without restart
  (e) shows one-shot extraction at max_new=128 in the log.
