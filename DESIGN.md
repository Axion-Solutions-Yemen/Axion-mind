---
version: "alpha-4"
name: "Axion Mind | Soft Precision"
description: "Reference-07-first softly rounded layered neutral AI workspace, with SVG rail/iconography, soft elevation and full behavior preservation."
colors:
  white: "#FFFFFF"
  black: "#0C0C0D"
  light-canvas: "#F8F9FB"
  light-chat-canvas: "#F8F9FB"
  light-rail: "#FFFFFF"
  light-surface: "#FFFFFF"
  light-subtle-surface: "#F2F3F5"
  light-text: "#171719"
  light-text-secondary: "#5B5B60"
  light-text-muted: "#77777E"
  light-line: "#E8E8EA"
  light-button-primary: "#0C0C0D"
  light-button-on-primary: "#FFFFFF"
  dark-canvas: "#0C0C0D"
  dark-chat-canvas: "#121316"
  dark-rail: "#111113"
  dark-surface: "#111113"
  dark-subtle-surface: "#1C1D21"
  dark-elevated-surface: "#18191C"
  dark-text: "#F8F8FA"
  dark-text-secondary: "#B8B8BF"
  dark-text-muted: "#9999A2"
  dark-line: "#303034"
  dark-button-primary: "#FFFFFF"
  dark-button-on-primary: "#0C0C0D"
typography:
  display:
    fontFamily: "Satoshi"
    fontSize: "40px"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.035em"
  heading-xl:
    fontFamily: "Satoshi"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  heading-lg:
    fontFamily: "Satoshi"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  heading-md:
    fontFamily: "Satoshi"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.015em"
  heading-sm:
    fontFamily: "Satoshi"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Satoshi"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  body-compact:
    fontFamily: "Satoshi"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Satoshi"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
  caption:
    fontFamily: "Satoshi"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  code:
    fontFamily: "JetBrains Mono"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.65
spacing:
  xxs: "2px"
  xs: "4px"
  sm: "8px"
  sm-plus: "12px"
  md: "16px"
  md-plus: "20px"
  lg: "24px"
  xl: "32px"
  xxl: "40px"
  xxxl: "48px"
  section: "64px"
rounded:
  none: "0px"
  subtle: "8px"
  control: "12px"
  card: "16px"
  dialog: "20px"
  composer: "24px"
  shell: "28px"
  pill: "9999px" # Ordinary capsule actions permitted where visually appropriate

components:
  button-primary:
    backgroundColor: "{colors.light-button-primary}"
    textColor: "{colors.light-button-on-primary}"
    rounded: "{rounded.control}"
    minHeight: "40px"
  button-signature-special:
    status: "OPTIONAL bespoke layered optical effect, not required or approved by default"
    shape: "capsule, distinct from ordinary freely permitted pill buttons"
    backgroundColor: "{colors.light-surface}"
    minHeight: "48px"

  button-secondary:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-text}"
    rounded: "{rounded.control}"
    borderColor: "{colors.light-line}"
    minHeight: "40px"
  field:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-text}"
    borderColor: "{colors.light-line}"
    rounded: "{rounded.control}"
  card:
    backgroundColor: "{colors.light-surface}"
    borderColor: "{colors.light-line}"
    rounded: "{rounded.card}"
  modal:
    backgroundColor: "{colors.light-surface}"
    rounded: "{rounded.dialog}"
---

# Axion Mind — Soft Precision

**Approved alpha-4 product-wide specification.** This document describes the existing application's final visual system. It replaces obsolete migration restrictions, permanent Persona-list proposals, visible Online status, sharp-only geometry, and unavailable Thinking controls. The newest explicit user instruction takes precedence. Corporate brand blue remains pending approval.

## Authority and scope

- Use installed **Impeccable** in Operate mode for controls and management, and Read mode for conversations, Markdown, logs, and technical output. Apply Layout, Typeset, Adapt, Harden, Polish, and Animate where relevant.
- Reference `design-references/ref-07-chat-active.webp` defines the primary workspace composition. `design-references/ref-10-chat-motion.mp4` defines meaningful interaction continuity. Reference artwork, promotional backgrounds, camera movement, branding, and unsupported controls are not product features.
- This system covers Workspace, Personas, chat, model picker, Hermes Control Center, Agent Editor and Source Distillation, Account & Cloud Backup, Diagnostics, Settings and AI Connections, Local Data Vault, Conference Rooms, and Updater.
- Existing behavior and data integrity take precedence over presentation. This specification authorizes no new backend, authentication, backup, AI, storage, or native functionality.
- Do not add another design document, frontend framework, external icon library, remote assets, speculative features, or development-stage identifiers in production code.

## Materials, typography, and geometry

Use the exact approved neutral values and type/spacing scales in the frontmatter through the existing semantic CSS tokens. Preserve legacy aliases as mappings, never competing palettes.

| Material | Light | Dark |
|---|---|---|
| Main chat canvas | #F8F9FB | #121316 |
| Base | #F8F9FB | #0C0C0D |
| Navigation / rail | #FFFFFF | #111113 |
| Elevated composer / dialog | #FFFFFF | #18191C |
| Quiet inset / selection | #F2F3F5 | #1C1D21 |
| Primary text | #171719 | #F8F8FA |
| Secondary text | #5B5B60 | #B8B8BF |
| Muted text | #77777E | #9999A2 |
| Separator | #E8E8EA | #303034 |
| Primary action / foreground | #0C0C0D / #FFFFFF | #FFFFFF / #0C0C0D |

- Preserve the project-wide composition target: about 90% quiet surfaces, 6–7% opposing neutral, and a reserved 3–4% potential brand accent. Blue is **PENDING_COLOR_APPROVAL**; do not invent, sample, or ship a corporate blue. Neutral focus and selection remain correct until approval.
- Dark mode has deliberate raised charcoal layers and edge contrast, not a uniform black inversion. Light uses a near-white canvas and selectively elevated white surfaces.
- Primary font is Satoshi; established fallback is Source Sans 3, then the neutral system sans. Technical content uses JetBrains Mono with the established monospace fallbacks. Use legitimate local assets; no font downloads. Do not silently claim unavailable fonts are installed.
- Normal body is 14–15px; functional UI text is at least 12px. Keep fixed product type scales, readable line height, restrained tracking, and approximately 70–85 characters per prose line where possible.
- Keep the 4px spacing rhythm, usually 8/12/16px within related controls and 20/24/32px between meaningful sections.
- Geometry: compact tools 8px; controls 12px; cards/message chips 16px; dialogs/popovers 20px; main composer 24px; appropriate large containers 28px. Ordinary capsule controls are permitted. The optional bespoke optical signature capsule is not implemented or required.
- Use semantic elevation selectively for composer, popovers, dialogs, small summary cards, and active navigation. No shadows on every row, gradients, neon, heavy white shadows, or decorative glow.

## SVG identity and iconography

- The provisional Axion identity is the original two-piece geometric A / axial-motion SVG, reusable at `ui/assets/axion-mark.svg`. The rail renders controllable inline geometry. Preserve existing packaged native logo resources.
- Light mark pieces: #171719 / #77777E. Dark: #F8F8FA / #B8B8BF. This neutral direction does not approve permanent corporate accent color.
- Keep one SVG family: 24×24 viewBox, approximately 1.75–2px stroke, rounded joins/caps, and rendered sizes 16/18/20/24px. Interface icon-only actions require accessible labels; decorative SVGs are hidden from assistive technology.
- No decorative interface Emoji. Preserve stored/custom Agent avatars, preset values, model identifiers, and user-authored content. Render recognized presets as SVG without mutating data.
- Recognized built-in Alex Hormozi briefcase/weightlifter defaults render as the same AH geometric monogram in the header and Persona selector. Genuine custom identity values remain intact.
- Keep the existing 280ms secondary-piece navigation animation and genuine operation-bound activity. No competing logo controller, idle loop, route delay, or invented progress. Reduced motion disables logo motion.

## Workspace and navigation

- Desktop has exactly three regions: 56–68px SVG rail; adjacent 230–280px navigation panel; flexible main canvas. Preserve existing responsive sidebar and native Tauri behavior.
- The top rail has only the existing Agents and Personal Agent destinations. Its bottom has only Theme and User. User opens the anchored menu containing Hermes Control Center, Diagnostics, AI Connection Settings, Account & Cloud Backup, and the appropriate existing Sign In / Sign Out actions.
- The navigation header identifies Agents or Personal Agent. Place the compact selected-Persona selector directly beneath New Agent. Its anchored, scrollable overlay contains actual available Personas; never permanently stack the full Persona list or add a desktop column.
- Persona selection activates its latest available legitimate session or an appropriate empty conversation. Resolve ownership from authoritative existing collections, not ID substring guesses or hardcoded Alex startup selection. Header and transcript must have the same owner.
- Personal Agent uses a matching-height Hermes context slot. Keep stable header/action spacing, Conference Rooms, search, New Session, expansion, and Show More. History consumes remaining independent scrolling height.
- Show selected Persona identity in exactly two main locations: conversation header and compact selector. Do not repeat it in the generic Conversations heading or assistant rows. Cross-Persona search results may label their actual owner for disambiguation.
- Group real sessions by local calendar Today, Yesterday, older dates, and Earlier / Undated. Prefer last activity, then updated, then created metadata; accept valid existing ISO/Unix-second/Unix-millisecond values. Newest first, stable ties, no fabricated dates or persisted grouping state.
- Search is an anchored surface with one input, one SVG magnifier, and exactly one trailing Clear text action visible only with a query. No native search cancel duplicate. Preserve filtering, query retention, cross-Persona discovery, Escape, and focus return.
- Remove visible Online/Offline labels, dots, and reserved space. Preserve background health checks. Account/storage/backup status belongs in Account & Cloud Backup.

## Conversations and controls

- Preserve the single existing composer. Empty welcome content, composer, and three existing suggestions form the central group; active transcript uses a stable 680–820px reading column above the bottom composer.
- Composer is borderless in every focus state, elevated white/charcoal, with 24px corners and balanced spacing. Preserve textarea growth, caret, input contents, Enter/Shift+Enter, model selection, sending, Stop, focus, and scroll behavior.
- Primary Send is enabled only with non-whitespace input, a valid existing context, and no genuine blocking request/save state. Enabled fill is full near-black Light / white Dark, never gray. Genuine disabled states remain distinct.
- User messages use compact neutral rounded bubbles. Ordinary assistant text and Markdown render directly on the canvas: no avatar, model icon/name, role heading, outer background, border, or shadow.
- Keep contained surfaces for code, tables, tool details, reasoning, errors, and functional feedback. Long code/tables scroll internally. Preserve safe Markdown, syntax highlighting, links, Copy, streaming, errors, stopped responses, unsaved warnings, and Retry saving.
- Thinking only controls visibility of real disclosures. Hide both control and toolbar when no genuine non-hidden trace exists. When available, use compact model-picker-like geometry, clear Show/Hide labels and aria-pressed, ephemeral preferences keyed by mode/session, and independent native/custom disclosure behavior. Never configure model reasoning or invent content.
- Chat model routing and Hermes global model configuration remain distinct. Preserve identifiers, custom IDs, providers, search, commands, and model detection.
- More Options remains one cohesive 220–240px elevated menu. Clear Chat's hovered/focused foreground must contrast with its actual background without changing confirmation behavior.
- Agent Editor preserves New/Edit states, preset values, source file/URL controls, source distillation, and Save/Cancel/Delete behavior. No platform dependency repairs are authorized by styling work.

## Account & Cloud Backup

- Use a bounded, softly elevated dialog with stable header and internally scrollable body. Organize account/storage summary, Google/email sign-in, Sign In/Create Account selection, and existing Supabase configuration clearly.
- Signed-in content distinguishes authentication, availability, verified-backup status, manual Back Up & Verify Now, Recover Cloud Backup, Cancel Backup, automatic settings, offline pause, and Sign Out.
- Preserve all existing security, shared-local-workspace, account verification, automatic schedule, recovery, and restore warnings. Authentication does not prove a backup has been verified.
- This is verified backup/recovery, **not continuous multi-device synchronization**. UI messages must not imply automatic cloud-to-PC merging or deletion.
- Keep OAuth callbacks, Supabase requests, tokens, verified-session ownership, account isolation, scheduling, backup execution/verification, recovery paths, and confirmations unchanged. UI-only state/copy bindings do not own these operations.

## Diagnostics

- Use readable summary cards for Storage Vault, Dual-RAG, Model Bridges, and Cloud Database; clear monitoring/action hierarchy; integrated search/categories; bounded technical log output; and wrapping metadata/paths.
- Initial summaries say not checked/awaiting diagnostics. Never present sample counts, guessed paths, ports, health, synchronization, or latency as received telemetry. Unreported metadata is labeled unavailable; failed refreshes must not make old data appear current.
- A contained dark neutral log terminal is allowed in both themes. Use readable monospace text, 12px minimum details, actual level/tag labels, and semantic emphasis. Empty filters do not imply the system is healthy.
- Preserve health/log IPC, data, parsing, filtering, categories, counts, export, Clear Stream, events, and live updates. Do not animate periodic refreshes.

## Conference Rooms

- Keep the actual room list integrated into navigation, with restrained SVGs, selected states, empty state, and the existing create action.
- Native conference dialog has clear topic, participant/provider/exact-model controls, original speaking-order guidance, validation/error presentation, bounded scrolling, and existing Create/Save/Cancel actions.
- Active room shows topic, real participant metadata, readable speaker attribution, open Markdown responses, real status/error/interrupted states, optional existing reasoning, and the room composer with Send Round / Stop Round.
- Speaker identity is essential in conferences and is retained; the normal-chat prohibition on decorative assistant identity does not remove conference attribution.
- Preserve participant selection, speaking order, mentions, model assignments, execution, requests, cancellation, persistence, existing rendering/controller ownership, and keyboard contracts. Do not add tools or private/live Hermes context to conferences.

## Application Updater

- Present actual checking, current-version/no-update, available release/version comparison, release notes, downloading, installing, restarting, failure/retry, and Remind Me Later states using the existing updater.
- No fabricated versions, percentages, duration estimates, or completion. Unknown totals use indeterminate presentation; numerical progress and 100% completion come only from native events.
- Preserve check, install, restart, retry commands, native progress events, timing, and dismissal guards. Manual check results may use the same accessible dialog rather than an unstyled alert; retry checking delegates to the existing manual check action.

## Settings, Local Data Vault, and shared components

- Preserve the completed Settings, Local Hermes/Direct API/Custom Server controls, provider/gateway/authentication fields, Test Connection, Save/Cancel, and feedback.
- Keep Local Data Vault directory, export, import/restore, loading, confirmations, path/status data, and safety explanations. No new cloud synchronization or storage behavior.
- Primary actions use opposing neutral; secondary actions use quiet surfaces; ghosts use restrained hover feedback. Destructive meaning remains explicit through action labels, hierarchy, and appropriate contrast. Disabled labels stay readable.
- Global fields keep normal borders unchanged on focus, with no colored outline, inset ring, or focus-triggered border. Use a quiet surface/shadow keyboard cue and preserve caret and independent validation. Buttons and other interactive elements retain visible keyboard focus.
- Preserve existing selectors, IDs, data attributes, labels, events, and state classes. Tabs expose selected state; busy controls reflect real operation state; technical strings wrap or scroll without widening the window.

## Motion and visual feedback — REFERENCE VIDEO APPROVED

- Reference video is about 12 seconds at 60fps. Ignore its promotional black backdrop, camera zoom, product branding, and unsupported features.
- Highest-priority interaction is the existing **440ms empty-to-active composer FLIP**, easing `cubic-bezier(.22,1,.36,1)`: measure before/after real first-send DOM changes, animate the same composer with transforms, and finish at natural bottom layout. Never duplicate the composer or fly it through the screen when opening populated history.
- New user messages reveal once with 6–10px upward movement around 200ms. Assistant content reveals once when it actually begins, around 180ms. Saved transcript rows do not stagger or animate on load.
- Streamed text, tables, code, and room entries grow according to actual content. No token/cell animation, simulated typing delay, transcript-height tween, forced scroll after the user scrolls upward, or repeated entrance during refresh.
- Navigation/selected feedback and disclosures use roughly 160–220ms. Anchored popovers use 150–220ms opacity plus 4–6px translation, reverse safely, and preserve anchoring, viewport limits, keyboard access, Escape, and focus return.
- Existing custom/native dialogs use 180–240ms backdrop/content transitions, maximum content scale .98→1, with functional browser fallbacks. Actual dismissal and focus restoration are never delayed by motion.
- Buttons use 100–160ms surface/press feedback, at most approximately 1px motion. Enabled Send's primary appearance stays immediate. Theme surface/elevation transitions are bounded to a real toggle, with technical content and opposing primary pairs switching together.
- Preserve the existing AxionMotion and anchored-surface controllers and two-piece brand animation. No competing controllers or new dependencies.
- Prefer transform/opacity; use contained disclosure sizing and progress-bar width only for genuine state/progress changes. Never poll layout per frame. Cancel or safely replace motion on navigation, resize, cancellation, theme changes, or reduced-motion changes. An animation failure leaves the natural functional UI visible.
- Reduced motion suppresses decorative motion, composer movement, stagger, and animated scrolling without altering keyboard/focus, announcements, state, or operation completion.

## Responsive and accessibility contract

- Support existing desktop/compact window layouts, long labels, technical paths, tall content, and 200% text zoom without horizontal page overflow or clipped actions. Keep dialog height bounded with internal scrolling; preserve independent history/transcript scrolling.
- Use labels, logical order, native dialog semantics, existing focus trapping/restoration, Escape, accessible icon names, accurate selected/disabled/busy states, readable contrast, and at least 12px functional text. Do not create another responsive navigation system.
- Theme remains the existing repeatable html data-theme switch, Dark by default, no theme persistence or application reinitialization.

## Preservation and review boundary

- Styling lives in existing HTML/CSS and small existing presentation bindings. No Rust/Tauri, IPC names/arguments, schemas, paths, OAuth/auth/storage/backup contracts, model routing, prompts, AI requests, streaming protocol, cancellations, session IDs, persistence, conference execution, or updater install/restart changes.
- No unrelated defect repairs, architectural rewrite, invented data, feature development, remote icon/font packages, or development-stage production identifiers.
- Scope-specific review is read-only and checks design compliance, protected behavior, shared visual consistency, broken bindings, and obvious regressions directly caused by the changes. PASS means ready; BLOCKED identifies a specific caused issue. No automatic fixes or unrelated audit expansion.
- For this implementation, no builds, tests, analyzers, or application runtime checks are authorized. Preserve source and existing behavior if any visual improvement would require a protected logic change, and report the exact blocker.
