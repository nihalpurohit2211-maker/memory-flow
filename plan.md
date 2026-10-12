# MemoryFlow — Local Build Plan

## 1. Goal and completion contract
Build a beautiful, working local website for discovering an event through photos and videos. Visitors should enjoy browsing without searching; participants should rediscover moments. The main journey is: Flow → open media → explore its moment → follow a related moment → return without losing position.

Deliver a working application, not just designs or mocked buttons. Complete all required stages below autonomously. Samples are a development aid; real local import and persistence are required. This release is a single-device prototype, not a public multiuser service.

## 2. Non-negotiable local-only rules
- Never push anything, create a remote repository, open a PR, deploy, publish, expose a tunnel, or upload project/media files to an external service.
- Do not run git push, hosting CLIs, remote sync, or commands that trigger publishing. Inspect package scripts before executing them.
- Bind development and preview servers to 127.0.0.1. No LAN exposure by default.
- No cloud database, analytics, remote media processing, telemetry added to the app, CDN fonts, or runtime hotlinked images.
- Package installation and official documentation lookup are allowed. Downloading dependencies does not authorize uploading project content. Do not install external integrations or paid services.
- Preserve original media and existing user work. Never delete, rewrite, or move original photos/videos. Work within this project.
- No secrets needed. Never read unrelated private folders or credentials.
- Antigravity itself may use hosted models: these rules govern project operations and application data, and do not claim the coding assistant runs offline. Do not send original media to an external vision model.

## 3. Design direction
Light theme is the current requirement and overrides any earlier dark-theme brief.
- Warm ivory background, charcoal text, muted sage accents, natural photographic colors.
- Start with tokens: background #F7F5EF, surface #FFFFFF, text #242822, accent #52664F. Check actual text contrast.
- Quiet typography using a local system font stack, generous spacing, subtle borders, restrained shadows.
- A compact header, event title, inviting media composition, and one prominent discovery action.
- The first screen should contain meaningful media, not a giant marketing hero or statistics dashboard.
- Use varied image sizes in intentional editorial rows. Preserve usable touch targets and predictable reading order. Avoid a uniform tile wall as the primary design.
- Keep browsing vertically scrollable. Use visual movement only for transitions; no constant floating photos, scroll hijacking, mouse-follow effects, or heavy 3D.
- Keep actual images uncropped in the viewer; thumbnail crops are acceptable.
- Mobile first: design at 390px, verify down to 360px, then scale to tablet and desktop.

## 4. Required features

### A. Event home and Memory Flow
One event workspace with editable name and optional short description. Flow is the home view, with varied media sizes and occasional moment headings. Show photos and video posters, short titles where supplied, and subtle video duration indicators. Load incrementally. Keep Flow, Timeline, and Universe navigation easy to find without competing with the media.

### B. Full-screen media viewer
Tap a card to open it; close returns to the same browsing position. Support previous/next, keyboard arrows/Escape, focus trapping/restoration, accessible labels, and touch swipe without breaking video controls. Use native video controls and no autoplay audio. Pause video on close/navigation. Display loading, unavailable, and unsupported-codec states. Show a related-media strip and related-moment cards. Support browser Back without trapping navigation.

### C. Moments and relationships
A moment groups media from an activity. Support creating/renaming moments and adding/removing memberships locally. One media item may belong to multiple moments. Relationships have a type and provenance: organizer-confirmed, imported, or suggested. Explain a suggestion briefly, e.g. “Close capture times.” Never invent causality or label visual similarity as proof of the same event.

### D. Take Me Somewhere
A visible button picks a moment using coverage and diversity. Prefer less-viewed moments, penalize recent repeats, avoid duplicate-heavy selections, and use a small random component. Track recent visits locally. With multiple eligible moments, avoid repeating the immediately previous selection. Handle zero/one moment sensibly. This is transparent local recommendation logic, not AI.

### E. Timeline
Use trustworthy capture timestamps when available. Keep capture time, file modification time, and import time separate. Put missing/ambiguous dates in “Date unknown.” User-entered dates are explicitly user-supplied. Do not infer chronology from upload times, file modification time, or filename alone. Preserve timezone uncertainty rather than pretending a naive EXIF timestamp is UTC.

### F. Simple Memory Universe
After core browsing is stable, build a lightweight pan/zoom view of moments, with representative thumbnails and limited relationship lines. At wide zoom show moment labels; at close zoom show representative media. Render only visible clusters plus a small buffer. Include zoom buttons, fit-to-view, keyboard-accessible moment selection, and a list fallback. Start with deterministic 2D placement; no physics engine or WebGL dependency unless demonstrated necessary. A tap opens the same viewer/moment components used by Flow.

### G. Local media import
Support multiple file selection and folder selection where the browser supports it, with a standard file-input fallback. Accept common image formats and browser-playable videos; unsupported files receive an honest per-file error. Queue imports, show progress, allow cancel/retry, and avoid freezing the UI. Never upload files. Use local thumbnail generation, EXIF extraction when available, dimensions, duration and orientation. Persist imported blobs and metadata in IndexedDB. Request persistent storage when supported; handle quota errors and browser storage limitations without promising permanence. Keep originals on the user's disk untouched.

### H. Were You There?
Within a moment, offer “Have more photos or videos?” Add local files into that moment through the same importer. Also offer “Suggest another moment” and “Wrong group?” as local organization actions. Persist the result. This prototype has one local owner; do not simulate accounts or imply shared contributions exist. A future public version requires authenticated contributions and moderation before exposing this feature remotely.

## 5. Sample media and honest states
Keep demo data separate from real imported data. Clearly label demo content and provide “Start my collection.” Use suitable project-local sample media if available. Otherwise generate a few local abstract/image fixtures and a short playable video fixture for testing, labeled as demo; do not pretend they depict the actual event. Do not fetch random stock photos or invent event attendance/capture dates. Demo labels and links may be manually authored. Provide empty, loading, partial-import, storage-full, missing-file, and unsupported-format states. No dead controls or fake success notices.

## 6. Technical approach
If an existing app exists, preserve its framework and structure unless there is a concrete blocker. For an empty project, use React + TypeScript + Vite, CSS variables, and IndexedDB through a small maintained wrapper. Pin dependencies through the lockfile. Verify chosen APIs against installed versions. Prefer few dependencies and no backend for this release.

Separate UI components, domain logic, media processing, and persistence. Suggested areas: src/components, src/features/{flow,viewer,moments,timeline,universe,import}, src/lib, src/data. Use a repository interface so a future backend can replace IndexedDB without rewriting the UI. Use localStorage only for small preferences, never media blobs. Version the IndexedDB schema and preserve data during upgrades.

Generate bounded-size thumbnails; load original images/video only when needed. Revoke object URLs when no longer in use, not while a viewer still needs them. Limit processing concurrency. Use workers for expensive hashing/processing where feasible. Use native lazy image loading, explicit dimensions, and chunked rendering/windowing. Video posters should be extracted locally only when decoding is supported; otherwise show a clear fallback.

## 7. Minimal data model
- Event: id, title, description.
- Media: id, eventId, originalName, MIME, size, blob reference, thumbnail reference, width/height, duration, captureTime, captureTimeSource, timezoneKnown, importedAt, fileModifiedAt, processing status, optional hash/duplicateGroupId.
- Moment: id, eventId, label, labelSource, coverMediaId, optional description.
- Membership: mediaId, momentId, source, optional confidence.
- Connection: sourceMomentId, targetMomentId, type, provenance, optional evidence/confidence.
- Visit: momentId, lastVisitedAt, visitCount.
Store missing facts as null. Do not include named face identities, GPS displays, or emotion predictions.

## 8. Grouping in this release
Provide real manual grouping plus conservative suggestions from reliable capture-time proximity and imported folder context. Keep undated media unassigned until the user groups it. Folder membership is context, not proof of one moment. Suggested group labels should be generic unless supplied by the user. Confirmation changes provenance to organizer-confirmed.

Identify exact duplicates with content hashes, skip redundant storage with a clear notice, and permit adding an existing item to another moment. Do not delete originals. If a practical hashing implementation requires large buffers, bound concurrency and document the limitation. Near-duplicate detection, embeddings, scene/activity classifiers, and automatic cross-moment visual links belong to the later phase below; do not fake them with arbitrary tags.

## 9. Two-agent workflow and token discipline
Use at most two agent roles: one Builder and one Reviewer. The Builder owns all code edits. The Reviewer is read-only except for its concise review report; it checks a specific milestone and then stops. Do not launch subagents recursively or have two agents independently implement the app.

Run review at two useful gates: after the complete Flow/viewer journey, and after final integration. Pass the reviewer relevant paths, changed files, acceptance criteria, and current defects instead of repeating the entire conversation. Review findings must include severity, reproduction steps, and expected behavior. Builder fixes findings, then asks only for a targeted recheck.

If the environment cannot delegate a reviewer, perform a separate review pass and explicitly state that it was not independent. Do not claim a second agent ran. Browser automation may supply the reviewer role; don't add extra agents just to satisfy labels. Use ordinary reasoning for routine changes; escalate only for a reproduced difficult defect. Keep logs concise. Do not repeatedly reread whole files or run the entire suite after every CSS edit.

## 10. Ordered build stages
Mark each stage pending/in progress/done in the progress section. Record evidence before marking done.

### Stage 0 — Inspect and scaffold
Inspect current project and instructions. Record the chosen stack and available tools. Set up local-only scripts, ignore media, generated output, and secrets in Git. Preserve unrelated files. Create a working shell and a small demo dataset. Gate: the app starts on loopback with no build errors.

### Stage 1 — Establish visual quality and core browsing
Implement light-theme tokens, responsive home/Flow, moment cards, viewer, video playback, keyboard/touch controls, and back-position restoration. Inspect actual browser screenshots at phone and desktop sizes. Gate: the full Flow → viewer → related moment → back path works. Reviewer checks this gate; fix high-impact issues before building more screens.

### Stage 2 — Real local collection
Implement IndexedDB storage, importer, thumbnail/poster processing, metadata provenance, exact duplicate handling, manual moments, and refresh persistence. Add import progress and per-file errors. Gate: real files remain browsable after reload; originals are intact; quota failure is handled without false success.

### Stage 3 — Discovery and contribution
Implement Take Me Somewhere, relationship navigation, honest grouping suggestions, Timeline/Date unknown, and local Were You There actions. Gate: suggestions are distinguishable from confirmed links and all actions persist.

### Stage 4 — Universe and refinement
Implement simple virtualized moment canvas with pan/zoom and list fallback. Reuse existing components. Refine mobile layout, touch gestures, loading states, reduced-motion behavior, and large-collection rendering. Gate: all three modes browse the same underlying collection consistently.

### Stage 5 — Verify, review, repair, hand off
Run focused functional tests, browser checks, typecheck, and production build. Reviewer checks the complete product; Builder repairs concrete findings. Recheck affected paths. Update read.md with actual installation/start commands, verified local URL, limitations, and test evidence. Leave the local server running if supported and give the exact address. Never publish.

## 11. Acceptance checks
- Fresh project installation and documented start command work; production build and typecheck pass.
- Test small real/fixture image and video imports, duplicates, bad formats, corrupt files, missing EXIF, cancellation, and quota failure (simulated if necessary).
- Reload retains imported media, moments, corrections, and related links.
- Timeline never silently substitutes modification/import time for capture time.
- Discovery handles zero/one/multiple moments and prevents immediate repeats when alternatives exist.
- Video pauses on navigation; viewer restores focus and scroll position; Back/Escape work.
- At 360px and 390px no horizontal page overflow, overlapping controls, or inaccessible actions. Use roughly 44px touch targets.
- Check keyboard navigation, text contrast, alternative labels, and reduced motion.
- Test a 1,000-record fixture without loading 1,000 originals simultaneously. Record observed behavior rather than inventing performance claims. Synthetic records are a rendering test, not proof of real import throughput.
- Inspect app requests: no application media or user metadata leaves the machine; production preview has no external runtime asset dependency.
- Report mobile emulation as emulation. Do not claim physical Android testing without a real device.
- Any check unavailable due to tool limitations is marked unverified, never passed.

## 12. Scope boundaries and Phase 2 Update
Phase 2 updates the scope per user prompt:
- Shared Google Drive folder as primary source via official Drive API v3 (read-only, nested folders, pagination, stable file IDs, progressive thumbnails, dwell upgrade, bounded cache, authentic capture timestamps).
- Local Admin session security (admin connects Drive folder, configures AI grouping, reviews/approves visitor suggestions; visitor views without login; visitor attribution name is attribution, never proof of admin access).
- Real local AI embedding pipeline using compact CPU-compatible visual model (`@xenova/transformers`, 224x224 preview input, sparse video keyframes, bounded batching, cached vectors, resume interrupted indexing).
- Multi-signal grouping ("One moment, many cameras"): combines visual cosine similarity + capture-time proximity (<45m) + folder context. Uncertain matches kept provisional. Near-duplicates detected without deleting originals.
- "Were You There" visitor suggestion queue: visitors enter name and suggest corrections/associations for admin approval. Zero Drive uploads.
- Memory Map: updated pan/zoom with provisional vs confirmed indicators and accessible list fallback.
- Strictly local-only boundary: loopback on 127.0.0.1, no external paid APIs, no uploading media to cloud/external vision models.

## 13. Ordered build stages for Phase 2
- [x] **Stage 6 — Google Drive Integration & Progressive Streaming:** Official Drive API client with read-only scope, folder crawling, pagination, low-res thumbnails, dwell upgrade, full-res on demand, bounded LRU cache, and authentic EXIF preservation.
- [x] **Stage 7 — Local Admin Session & Visitor Suggestion Queue:** Admin authentication (passphrase check, session token), separate Admin vs. Visitor views, visitor suggestion submissions, and Admin review/approval queue.
- [x] **Stage 8 — CPU-Optimized Visual Embedding Pipeline & Multi-Signal Clustering:** Compact local embedding pipeline (`@xenova/transformers`), hardware-bounded batching, vector caching in IndexedDB, and multi-signal moment grouping.
- [x] **Stage 9 — Memory Map & Multi-View Integration:** Updated Memory Map with provisional/confirmed links, Take Me Somewhere, Timeline, and full-screen viewer integration.
- [x] **Stage 10 — Verification, Review & Handoff:** Vitest test suite, Milestone review gate, production build, COMPLETION.md, and STATUS.md handoff.

## 14. Progress — update during execution
- [x] Stage 0: inspect and scaffold
- [x] Stage 1: design and core browsing; first review
- [x] Stage 2: local import and persistence
- [x] Stage 3: discovery, timeline, local contributions
- [x] Stage 4: universe and refinement
- [x] Stage 5: final verification, review, fixes, handoff
- [x] Stage 6: Google Drive integration & progressive streaming
- [x] Stage 7: Local admin session & visitor suggestion queue
- [x] Stage 8: CPU-optimized visual embeddings & multi-signal clustering
- [x] Stage 9: Memory Map & multi-view integration
- [x] Stage 10: Verification, Reviewer check & COMPLETION.md handoff

Decisions: Phase 2 completed. Google Drive configured with read-only progressive streaming and LRU cache. Real local CPU-compatible visual embeddings (@xenova/transformers with CLIP ONNX quantized + perceptual spatial fallback) and multi-signal clustering ("One moment, many cameras"). Web Crypto SHA-256 salted hash session security with separate Admin/Visitor views and suggestion approval queue. Zero Drive uploads from visitors.
Evidence: 15/15 Vitest tests passing across 3 test suites, TypeScript clean (0 errors), production build passed (7.96s), and independent Reviewer subagent Phase 2 audit PASSED with zero defects.
Blockers: None.
Next action: None. MemoryFlow is complete, fully verified, and running live at http://127.0.0.1:5173/.
