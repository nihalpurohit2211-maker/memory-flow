# MemoryFlow — Start Here

MemoryFlow is a light, fast, local-first web application for discovering an event through photos and videos. It features an editorial Memory Flow layout, a rebuilt full-contain high-res image and video viewer with single active-media state and request cancellation, deliberate in-card quality upgrades (hover-to-open removed), related moment and place navigation, "Take Me Somewhere" discovery, a Timeline with authentic camera capture timestamps, an interactive 2D Memory Map, real local CPU-optimized visual embeddings (`Xenova/clip-vit-base-patch32`), multi-signal grouping ("One moment, many cameras"), persistent SQLite storage (`better-sqlite3`), visitor contribution queue with admin approval, and authenticated shareable collections with 100,000 PBKDF2 iterations, server-enforced sessions, and IP rate limiting.

---

## 🌐 Public Repository & Links
- **GitHub Repository (Public):** [https://github.com/nihalpurohit2211-maker/memory-flow](https://github.com/nihalpurohit2211-maker/memory-flow)
- **Local Application URL:** [http://127.0.0.1:5173/](http://127.0.0.1:5173/)
- **Direct Collection Route:** [http://127.0.0.1:5173/c/elevate](http://127.0.0.1:5173/c/elevate)

---

## 🚀 Running the App (Verified)

### 1. Installation
```bash
npm install
```

### 2. Start Local Development Server
```bash
npm run dev
```
- **Verified Local Address:** [`http://127.0.0.1:5173/`](http://127.0.0.1:5173/)
- The server binds strictly to loopback (`127.0.0.1`) on port `5173` with `--strictPort`.

### 3. Production Build & Loopback Preview
```bash
# Typecheck TypeScript source (0 errors)
npm run typecheck

# Build optimized production bundle
npm run build

# Preview production build strictly on 127.0.0.1:5173
npm run preview
```

### 4. Automated Test Suite (39 Tests Passing Across 8 Suites)
```bash
npm test
```
Runs the 8 Vitest test suites covering:
1. `server/__tests__/sqliteBackup.test.ts` — SQLite WAL mode, foreign keys, media queries, and hot online backups (`backupDatabase`).
2. `server/__tests__/storageAndSecurity.test.ts` — 100,000 PBKDF2 rounds, timing-safe checks, server-enforced sessions, place renames/merges, and rate limiting.
3. `src/lib/ai/__tests__/embeddingAudit.test.ts` — Model specifications, vector throughput (>100k ops/sec), 95% near-duplicate detection, and temporal separation.
4. `src/lib/ai/__tests__/sceneClassification.test.ts` — 8 calibrated scene activity tags, zero-mean noise rejection, and cross-photo place clustering.
5. `src/lib/__tests__/imageRepairAndCdn.test.ts` — JPEG integrity analysis, honest damage tagging without false repair claims, and Google CDN `=s0` URL builder.
6. `src/lib/__tests__/phase2DriveAndAI.test.ts` — Drive client link parsing, EXIF camera timestamps, admin security guards, and multi-camera clustering.
7. `src/lib/__tests__/stage2.test.ts` — SHA-256 duplicate detection and recommendation diversity.
8. `src/lib/__tests__/largeFixture.test.ts` — 1,000-record synthetic performance test.

---

## 🖼️ Rebuilt Image Viewing & Decoder Resilience

- **No Hover-to-Open:** Hovering never opens a modal or alters page state. Viewer opens strictly upon deliberate click or tap.
- **In-Card Quality Upgrade:** Hovering or focusing a card for ~1 second seamlessly loads and renders a higher-quality thumbnail within its card frame. Pointer leave immediately cancels the pending request.
- **Single Active-Media State:** Navigation (arrow keys, swipes) switches cleanly with zero crossfade or stacked images. The previous image is immediately cleared, and the next preview or loader is shown.
- **Request Cancellation & Stale Response Rejection:** Navigation uses incrementing request IDs (`activeRequestIdRef`) to discard delayed image decode callbacks during rapid input.
- **State Reset & Media Control:** Zoom and pan are reset per item, and previous video playback is immediately paused and unloaded upon navigation.
- **Root Cause & Fix for Bottom White Band:**
  1. *Root Cause 1 (Layout):* Two stacked `<img>` elements (Layer 1 in-flow thumbnail vs Layer 2 absolute original) created aspect-ratio and bounding box mismatches.
  2. *Root Cause 2 (Decoding):* Incomplete/truncated camera JPEGs: standard browser decoders decode available top scanlines and render the remaining declared frame height as solid white/blank pixels.
  3. *Resolution:* Replaced dual-stack images with a single active `<img>` element. Truncated camera files are honestly flagged with `isDamaged = true`, displaying a non-misleading notice alongside the best available preview and a direct download button.
- **JPEG Byte-Repair Audit:** Adding JPEG markers (`0xFF, 0xD9`) allows decoders to parse the stream without syntax errors, but does **not** restore missing image data. The application never modifies originals on disk and never claims missing pixels are restored.
- **Authentic "Download Original":** Downloads exact raw file bytes preserving filename (not canvas re-exports or recompressed copies) via `/api/collections/:slug/download/:mediaId`.
- **Contributor Attribution:** Displays verified contributor name when available; otherwise displays "Contributor unknown". Never presents the Drive owner or editor as the photographer.
- **Clickable Metadata Chips:** Short chips for moment, place, and activity with horizontal touch/keyboard scroll and direct group navigation.

---

## 🏷️ People, Places & Scene Classification

- **8 Calibrated Activity & Scene Tags:**
  - `group photo`, `person speaking`, `stage performance`, `rehearsal`, `preparation`, `auditorium`, `classroom`, `outdoors`.
  - Calibrated zero-mean reference vectors reject solid colors, flat images, and noise (`targetVariance < 1e-4`).
- **Cross-Photo Place Grouping:** Visual place clustering matches photos across the collection regardless of timestamps, completely free from the 90-minute moment rule.
- **Admin Place Management:** Organizers can rename places (e.g., "Sabian Hall") and merge multiple places with atomic database updates.
- **Privacy First (People Grouping):** Facial/people grouping is strictly **OFF by default** (`people_grouping_enabled = 0`).

---

## 🗄️ Shared Server-Side Persistence & Performance

- **Persistent SQLite Database:** Backed by `data/memoryflow.db` using `better-sqlite3` with WAL mode and foreign key constraints enabled.
- **Schema Migrations & Auto-Migration:** Automated schema migrations migrate legacy `data/server_collection.json` records on startup.
- **Online Hot Backups:** `backupDatabase()` leverages SQLite's online backup API to take snapshots in `data/backups/` without locking readers.
- **Zero Client Model Downloads:** Visitors do NOT download ONNX/Transformers models or run heavy indexing. Visitors fetch pre-indexed collection data directly from the server.

---

## 📥 Viewer Contributions & Review Queue

- **Local Storage:** Uploads are stored securely in `uploads/pending/` with randomized unique filenames.
- **Server-Side File Validation:** Strictly enforces 25MB for images and 100MB for videos.
- **Review Workflow:** Contributions appear in the organizer's Review Queue where the admin can approve or reject them. Approved contributions are integrated with verified contributor attribution.

---

## 🔒 Complete Backend & Release Security

- **100,000 PBKDF2 Rounds:** Passwords hashed with 100,000 iterations of PBKDF2 (SHA-512) and verified using constant-time `crypto.timingSafeEqual`.
- **Server-Enforced Sessions:** Admin sessions are tracked in SQLite with 24-hour expiration and enforced via middleware.
- **IP Rate Limiting:** 5 failed password attempts per 15-minute window per IP, returning HTTP 429 with retry cooldown.
- **Instant Revocation:** Changing visibility or updating the password increments the `access_epoch`, instantly invalidating all existing visitor tokens.
- **Repository Hygiene:** Clean `.gitignore` excludes SQLite databases (`data/*.db*`), backups, uploaded media (`uploads/`), caches, and secrets.

---

## 🐳 Hosting & Deployment Preparation
- **Dockerfile:** Multi-stage production container build on Node 20 Alpine.
- **render.yaml:** Blueprint for deploying on Render.com web services.
- **Environment Template:** See `.env.example` for environment variable options.
