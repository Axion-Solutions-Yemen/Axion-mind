# Axion Mind — Frontend Debugging and Stabilization Plan

Status: PLAN ONLY. Source inspection completed; no fixes or new runtime tests executed for this planning request.
Project: D:/Side-Projects/StartUp/personas_hub_tauri
Target: the shipped Tauri/WebView2 desktop app, not an unrelated browser mockup.

## 1. Objective, constraints, and known evidence

Objective: turn the intermittent report that the frontend “acts weird” into reproducible, individually verified defects, then stabilize it without losing streaming, automatic latest-message scrolling, or the existing visual identity.

Preserve these requirements:
- Real upstream streaming for provider-returned thinking and answer text.
- Latest text stays visible during generation, including inside the thinking panel. This is the user's explicit current requirement. Do not silently revert to scroll-up-pauses-follow behavior.
- Immediate, predictable Stop feedback; actual request cancellation and partial-response preservation must be verified separately.
- Existing authentication, account isolation, backups, recovery, and customer content remain intact.
- Motion remains available, but never blocks interaction or correctness. Respect reduced-motion preferences.

VERIFIED BY SOURCE INSPECTION:
- ui/index.html rebuilds the answer's markdown HTML on rendered streaming updates and scrolls the message container to the bottom each time.
- ui/premium-motion.css combines entrance animations, hover/press transforms, discrete display transitions, and interpolated sidebar accordion height.
- ui/workspace-motion.js animates stable containers with the Web Animations API at startup and chat selection.
- selectItem changes shared activeMode/activeId before awaiting history loading; completion and save handlers also consult shared state.
- The frontend finally block resets shared streaming controls; the Rust cancellation interface targets a global active stream ID.
- tauri.conf.json embeds ui assets and defines a 900 x 600 minimum window size.

HISTORICAL EVIDENCE, NOT A NEW BASELINE:
- Previous runs reported passing unit suites and narrow live checks for motion, streaming, and scroll position.
- These did not establish that all combinations, fast interactions, real pointer hit targets, or repeated transitions were correct.

UNKNOWN:
- The exact visual symptom, affected control, triggering action sequence, frequency, and whether it occurs only during generation.
- Whether the cause is motion, state races, rendering cost, focus, asset availability, or a combination.

Do not describe any hypothesis below as a confirmed root cause until a reproducer and trace support it.

## 2. Safe baseline and reproducible environment

Deliverables: baseline manifest, preserved candidate binary/source, test workspace, execution log.

Before changing code:
1. Record executable path, SHA-256, source file hashes, Git status, Tauri config, Windows/WebView2 versions, viewport size, display scale, active model ID, bridge health, and reduced-motion setting. Never dump secrets or complete user config.
2. Preserve the current executable outside the build output, plus copies of files being edited. This repository currently has substantial untracked content, so Git alone is not a sufficient rollback mechanism. Do not commit credential or session files.
3. Identify the running app and any active generation. Do not close a working turn, kill unrelated WebView processes, or restart all inference bridges just to test the UI.
4. Establish disposable application storage and non-customer fixtures. Verify the actual storage path resolution in native code. A different WebView user-data folder alone does NOT isolate Rust-side persona files, auth, or backups.
5. Disable cloud writes only in the disposable test environment. Never toggle the user's production backup policy as a testing shortcut.
6. Use a local deterministic streaming fixture for most runs. Reserve a small final real-model smoke test for integration.
7. Bind CDP to loopback for the test instance only. Confirm its target page belongs to the candidate binary. Shut the debug instance down and confirm the port is closed afterward.

Baseline commands, run from the project directory in the existing Git Bash environment:

    export PATH="$HOME/.cargo/bin:$PATH"
    node --test tests/*.test.cjs && cargo test

Record complete output, exit codes, failures, warnings, skipped tests, and test counts. Do not mask a failure by chaining subsequent commands with semicolons.

Rollback policy:
- Roll back only the specific implementation slice that worsens behavior.
- Restore preserved source/binary, not customer data.
- Do not overwrite a live session or an entire workspace with a test copy.

## 3. Observability and bug evidence

Deliverables: a small opt-in diagnostics harness and an evidence directory scoped to this investigation.

Suggested structure:

    docs/frontend-debug/
      baseline.json
      issues.json
      repro/
      traces/
      screenshots/
      results/
      FINAL_REPORT.md

Keep raw traces local and redact before sharing. Do not capture message bodies, API headers, OAuth codes, passwords, tokens, or auth storage.

Capture these boundaries:
- Input: pointer down/up target, clicked control ID, key event, active session identity, focus target.
- UI state: request ID, originating session/mode, current visible session/mode, pending history load, generation lifecycle, save lifecycle.
- Rendering: incoming delta type and length, scheduled/executed render count, render duration, DOM node count, container dimensions, scroll position before/after.
- Motion: active animation names, affected element IDs/classes, animation start/cancel/finish, transform/opacity/display at key instants.
- Native/backend: request accepted, first upstream event, cancellation requested/observed, connection closed, terminal event delivered, save completion.
- Failures: JavaScript exceptions, unhandled rejections, failed IPC, asset/network failures, native errors, and stalled requests.

Use correlation IDs across frontend -> Tauri -> HTTP fixture/bridge. Log lengths and timing rather than private text.

For every issue record:
- ID, severity, category, evidence classification.
- Exact build/environment and action sequence.
- Expected and actual behavior.
- Reproduction frequency from counted attempts.
- Trace/screenshot/video references.
- One-command regression test when feasible.
- Root cause, narrow fix, red/green results, and remaining uncertainty.

Screenshots prove layout, not smooth animation or timing. Use a short video or an animation timeline plus layout measurements for transient bugs. Programmatic element.click() alone does not prove that a real pointer can hit a moving control.

## 4. Ranked hypotheses and controlled isolation

Test in this order, adjusting the ranking if evidence contradicts it.

H1 — Layout-changing motion and display transitions produce jumps or temporary hit-target changes.
Prediction: the same action sequence changes behavior when only motion is disabled; repeated accordion/dialog operations reveal an intermediate layout or visibility mismatch.
Probe: replay identical timed pointer/keyboard actions with motion on/off, keeping streaming and content identical. Measure geometry, elementFromPoint, focus, opacity, and display throughout.

H2 — Shared asynchronous state races when switching chats or stopping/restarting generation.
Prediction: deliberately reversed history responses or a late terminal event changes the wrong chat, resets a newer request, or saves to a different identity.
Probe: deterministic delayed IPC/history fixtures and separately identified requests. Compare originating IDs against render/save destinations. Treat potential wrong-session writes as high priority; use fixtures only.

H3 — Forced scroll and streaming content growth combine with animation into perceived jumps.
Prediction: scroll displacement correlates with a render, panel height change, focus action, or intermediate animation geometry, rather than missing provider chunks.
Probe: record main and nested thinking scroll geometry per frame while preserving latest-message follow. Compare motion on/off without changing the scrolling policy.

H4 — Repeated full-markdown parsing, syntax processing, or growing DOM causes pauses.
Prediction: render duration and long-task frequency increase with answer/history length or code/table complexity even when motion is off.
Probe: deterministic bursts, slow deltas, long code blocks, tables, and long history. Profile before optimizing; distinguish forced layout from parsing and paint cost.

H5 — Focus management, periodic refresh, and dependent assets cause apparent instability.
Prediction: focus or sidebar content changes without the user's intended action, or failed/slow CDN loads correlate with missing formatting/errors.
Probe: idle plus active-edit scenarios, timer-triggered refresh, dialog-close focus, offline startup, blocked markdown/highlight assets, and resize/DPI changes.

Isolation matrix:
- Motion on + deterministic streaming.
- Motion off + the same deterministic streaming.
- Motion on + completed static content.
- Reduced-motion preference + deterministic streaming.

Change one factor at a time. Do not bundle a redesign, state refactor, and scrolling policy change into one experiment.

## 5. Reproduction and regression matrix

A. Navigation and sidebar
- Switch A -> B -> A quickly with history responses arriving in reverse order.
- Expand/collapse the same sidebar group repeatedly; check preserved DOM, final height, list scroll, arrow direction, and reachable session items.
- Filter the sidebar while a group is open; clear the filter and check remembered expansion state.
- Refresh sessions while a user is typing or inspecting older content.
- Switch sessions during generation. Define and assert the intended destination of ongoing output and saves; do not infer it from whichever chat is active later.

B. Streaming lifecycle
- Thinking-only prefix followed by answer; answer without thinking; interleaved provider events; empty stream; error before/after partial text; disconnect; timeout.
- Chunk boundaries split inside UTF-8, SSE lines, markdown fences, inline code, links, and tables.
- Fast burst versus slow tokens; large accumulated answer; long pre-existing history.
- Exactly one terminal outcome per request; no duplicate rows, lost typed input, stale timers, or cursor after termination.

C. Stop and concurrency
- Stop before headers, during thinking, during answer, and near completion.
- Stop then immediately send again; late completion from the first request must not reset the second request's controls, cancel it, or save its content under the wrong identity.
- Double-click Send/Stop and press Enter repeatedly.
- Verify backend cancellation independently of immediate UI feedback.
- Preserve partial output to the originating chat exactly once. Reload the disposable session and compare persisted contents.

D. Latest-message scrolling
- Main container and thinking panel remain pinned after new content and final formatting/layout changes settle.
- Long paragraphs, tall code blocks, tables, panel collapse/reopen, and window resize during streaming.
- Respect the current always-follow requirement; characterize manual scroll behavior but do not silently change it.
- After generation, normal reading/scrolling must not be pulled back by a stale timer or callback.
- At settled frame checkpoints, bottom gap <= 3 CSS pixels, or a documented rendering tolerance backed by evidence.

E. Controls, dialogs, and forms
- Every visible toolbar action, model menu, settings dialog, persona dialog, thinking toggle, and utility action.
- Open -> close -> reopen before a transition finishes; rapid repeated Escape; outside click; Enter/Tab/Shift+Tab.
- Closing dialog must stop intercepting input, and focus must return to a sensible trigger without jumping to an unrelated input.
- Real pointer hit tests while controls move; no click-through into destructive actions.
- Focus forms during refresh/stream completion; typed text must not disappear or lose focus unexpectedly.
- Toggle groups/checkboxes with mouse and keyboard; disabled/busy states must agree with behavior.
- Destructive actions such as Clear Chat operate on disposable fixtures only.

F. Environment and accessibility
- 900 x 600 minimum window, 1280 x 820 default, and maximized window; resize during active generation.
- Windows 100%, 125%, and 150% scaling where available. Distinguish actual display-scale tests from browser viewport emulation.
- Reduced motion on before startup and changed during an active animation.
- Keyboard-only navigation, focus visibility, high zoom, and long/unbroken text.
- Offline/slow asset loading: app must fail visibly and safely rather than leaving partial unusable controls.
- Account/backup UI: use existing isolated fixtures; real Google sign-in or cloud writes are a separate explicitly authorized integration check.

## 6. Fix strategy and architectural guardrails

For each reproduced issue:
1. Minimize to the smallest reliable action sequence.
2. Write a failing regression that exercises actual behavior, not just source-string matches or a busy indicator.
3. Change one root cause.
4. Run the reproducer to green, then adjacent tests and the full regression suite.
5. Preserve evidence and re-test the shipped candidate.

Likely remediation options, conditional on proof:
- Consolidate competing CSS transform/translate/animation rules into a single ownership model per component.
- Keep motion on stable wrappers; avoid per-token child animation and whole-workspace observers.
- Remove layout interpolation only where proven problematic; retain less risky opacity/transform feedback.
- Treat reduced motion as a runtime preference, including cancellation of already-running Web Animations if required.
- Capture immutable request/session identities at send time; discard stale history loads and late callbacks.
- Use explicit per-request lifecycle states and idempotent terminal handling. A previous request's finally handler must not clear a newer request.
- Bind cancel to the intended request and verify interruption while awaiting headers or the next body chunk, not only between chunks.
- Persist user/assistant turns and interrupted partials against the originating session; avoid duplicate asynchronous saves.
- Centralize post-render latest-message alignment, including final highlight/layout changes, without creating an unconditional idle scroll loop.
- Optimize markdown work only after profiling identifies a bottleneck; preserve formatting and code-copy behavior.
- Make missing local/CDN assets recoverable and visible. Do not claim offline support without testing it.

Stop rule: if three targeted fixes fail on one symptom, stop patching and revisit the state/layout architecture with the evidence. No broad framework migration or rewrite without a separate decision.

## 7. Automation, commands, and test limitations

Retain useful existing tests:
- tests/streaming-ux.test.cjs
- tests/thinking-stream.test.cjs
- tests/follow-latest.test.cjs
- tests/premium-motion.test.cjs
- tests/workspace-motion.test.cjs
- tests/live-thinking-verify.cjs
- tests/premium-motion-live.cjs
- tests/workspace-motion-live.cjs
- Existing native auth, backup, backup policy, Google auth, cloud sync, and automatic backup tests.

Strengthen the test strategy:
- Source-string/CSS contract checks are useful guards, but not proof of correct interactions.
- Add deterministic history/stream fixtures and pointer/keyboard tests against the actual WebView.
- Do not report cursor, scrolling, or code-block correctness merely because a log line says YES; assert actual state and incremental growth.
- Replace fixed sleeps with event/state waits where possible. Use deadlines to expose hangs rather than hiding them.
- Run race reproducers repeatedly with fixed seed/schedule, then varied schedules. Start with 30 repetitions per targeted race; expand when failures are rarer. Report attempts and failures programmatically.
- Test startup and steady-state separately. Do not treat a transient launch/CDP attachment failure as a product defect until independently reproduced.

Regression command:

    node --test tests/*.test.cjs && cargo test

Candidate build, only after preserving the current binary and gracefully closing the exact app instance when idle:

    export PATH="$HOME/.cargo/bin:$PATH"
    cargo build --release

Existing live scripts require the isolated candidate already running with loopback CDP on port 43823 (or AXION_CDP_PORT set appropriately):

    node tests/premium-motion-live.cjs
    node tests/workspace-motion-live.cjs
    node tests/live-thinking-verify.cjs

Inspect and adapt these scripts to disposable storage before execution. Some send prompts or use fixed waits and are not a complete or production-safe acceptance harness by themselves. Keep the real-model probe separate from deterministic tests; it can fail for network/quota reasons unrelated to the frontend.

## 8. Acceptance gates and final release verification

Correctness gates:
- Each confirmed issue has a repeatable regression, demonstrated RED before the fix and GREEN after it.
- No wrong-session rendering or persistence, duplicate saves, lost input, or stale terminal callback corruption in the tested race matrix.
- Stop restores UI promptly and closes the intended backend operation; partial persistence is verified by read-back.
- Latest-message follow works throughout thinking, answer, and final layout changes; no idle scroll/focus stealing after completion.
- Dialogs, menus, accordions, and real pointer/keyboard actions produce correct final states under repeated interruptions.
- No unhandled exceptions/rejections or unexplained IPC failures in the tested flows.

Performance gates (provisional budgets, to be checked against the recorded machine baseline):
- Render batching stays bounded to at most one scheduled content render per frame per active text region.
- For a defined representative fixture, target p95 main-thread render work <= 16 ms; diagnose application-attributable tasks > 50 ms. If baseline hardware cannot meet this, document the measured budget rather than inventing a pass.
- Standard deterministic UI interactions visibly acknowledge within 100 ms, excluding genuine backend/model latency.
- Repeated navigation and generation leave no growing accumulation of animation handles, listeners, intervals, detached message trees, or stuck busy state.
- Do not use aggregate CPU alone as proof of smoothness; inspect frame/long-task traces and interaction latency.

Release gates:
- Full JS and Rust suites pass, with skipped tests/warnings disclosed.
- Deterministic live matrix passes on the built release executable, not only source or a development page.
- A final real-model smoke check confirms genuine chunk arrival, visible text growth, stopping, and scrolling.
- Verify customer data preservation with hashes/read-only checks that exclude legitimate changes; do not run destructive cloud validation.
- Gracefully stop the debug instance, launch the verified production binary normally, read back process/window readiness, and confirm debug port closure.

## 9. Execution order, artifacts, and completion report

Recommended work order:
1. Preserve baseline and isolate test data.
2. Capture diagnostics and find one concrete reproducer for the reported instability.
3. Run controlled motion/static/streaming comparisons.
4. Resolve wrong-session/data-loss/cancellation races first if reproduced.
5. Resolve layout, motion, scrolling, focus, and input defects.
6. Profile and resolve demonstrated rendering bottlenecks.
7. Run the complete regression and stress matrix.
8. Verify and reopen the release build; remove temporary diagnostic hooks.

Priority definitions:
- Critical: customer data loss, cross-account disclosure, destructive unintended writes.
- High: wrong-session saves/output, unusable chat, broken cancellation, lost input, dialogs blocking interaction.
- Medium: repeated layout jumps, flicker, focus/scroll disruption, inaccessible motion, materially sluggish interactions.
- Low: minor polish issues without functional impact.

Track each work item as NOT STARTED, REPRODUCED, ROOT CAUSE VERIFIED, FIXED, or VERIFIED. Do not equate a passing broad suite with a verified individual bug.

Final report must include:
- Exact symptoms reproduced and their proven causes.
- What changed, with file paths and rollback location.
- Regression/stress results and evidence links.
- Remaining unknowns, blocked scenarios, skipped integration checks, and observed warnings.
- Exact candidate executable path/hash and confirmation of normal launch.

Completion means the demonstrated problems are resolved and the agreed acceptance gates are satisfied. If the original intermittent symptom remains unidentified, report that explicitly; do not call the frontend fully stable merely because the planned tests ran.
