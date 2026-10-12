# MemoryFlow — Start Here

MemoryFlow is a light, local-only web application for discovering an event through photos and videos. It features Memory Flow, a full-screen photo/video viewer, related moment navigation, Take Me Somewhere discovery, Timeline with authentic capture timestamps, a spatial 2D Memory Universe with accessible list fallback, and in-browser IndexedDB media import.

---

## 🚀 Running the Finished App (Verified)

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
# Typecheck TypeScript source
npm run typecheck

# Build optimized production bundle
npm run build

# Preview production build strictly on 127.0.0.1:5173
npm run preview
```

### 4. Automated Test Suite
```bash
npm test
```
Runs the Vitest suite covering SHA-256 duplicate hashing, EXIF fallback extraction, recommendation diversity, and the 1,000-record synthetic performance test.

---

## 🔒 Strictly Local-Only Boundary
- **Zero Cloud/Remote Dependencies:** No cloud database, no analytics, no tracking beacons, no CDN fonts. All styling uses a native system font stack.
- **Original Media Intact:** Local photos and videos are read via the browser File API into IndexedDB; originals on the user's hard drive are never modified, deleted, or moved.
- **Strict Loopback Binding:** Both Vite dev and preview servers bind exclusively to `127.0.0.1:5173`. LAN exposure is disabled.

---

## 💾 Local Storage & Persistence Behavior
- **Storage Medium:** Browser IndexedDB (`memoryflow_local_db`) via `idb`.
- **Media Ingestion:** Photos and videos generate bounded 640px thumbnails in-canvas and extract authentic camera EXIF dates client-side via `exifr`.
- **Exact Duplicate Detection:** SHA-256 content hashes prevent duplicate file storage while allowing memberships across multiple moments.
- **Storage Quota:** Uses `navigator.storage.estimate()` to track available browser quota and prompts for persistent storage without promising external permanence.

---

## 🎯 Verification Evidence Passed
- **Stage 0:** Scaffolding, loopback binding, and demo data initialization passed.
- **Stage 1:** Core browsing (Flow → MediaViewer → MomentDetail → Back path) passed independent Milestone 1 review. Focus trap, body scroll lock, video scrubbing guard, and light-theme contrast verified.
- **Stage 2:** Real local collection with IndexedDB persistence, file/folder importer, progress queue, cancellation, and duplicate detection passed.
- **Stage 3:** Timeline with authentic EXIF capture time vs. Date unknown segregation, user-supplied date editing, and time-proximity grouping suggestions passed.
- **Stage 4:** Memory Universe 2D canvas with pan/zoom, deterministic layout, SVG relationship lines, touch support, and accessible list fallback passed.
- **Stage 5:** Final verification & Milestone 2 review passed with 0 defects.
- **Stage 6 (Phase 2):** Google Drive v3 integration with read-only streaming, folder crawling, pagination, low-res progressive thumbnails, dwell upgrade, bounded LRU cache, and authentic EXIF preservation passed.
- **Stage 7 (Phase 2):** Local Admin session security (Web Crypto SHA-256 salted hash, default passphrase `admin123`), separate Admin and Visitor views, visitor suggestion submissions ("Were You There?"), and Admin review/approval queue passed. Zero Drive uploads from visitors.
- **Stage 8 (Phase 2):** Real CPU-compatible visual embeddings (`@xenova/transformers` with 224x224 offscreen preview downsampling and vector caching) and multi-signal grouping ("One moment, many cameras") passed. Near-duplicate detection ($\ge 95\%$) verified without deleting originals. Uncertain matches kept strictly provisional.
- **Stage 9 (Phase 2):** Memory Map updated with provisional vs. confirmed relationship lines and node badges.

---

## 🔑 Admin Access & Google Drive Connection
- **Admin Authentication:** Click the **Visitor / Admin** pill toggle in the header. Enter `admin123` (or custom configured passphrase) to unlock Admin actions.
- **Drive & AI Settings:** In Admin mode, click **Drive & AI** in the header.
  - Enter any shared Google Drive folder URL or ID.
  - Enter optional API Key or OAuth Access Token.
  - Or click **Connect Sample Drive Folder** for an immediate local simulation of a multi-camera event folder.
  - Click **Run AI Multi-Signal Grouping** to run the local CPU embedding and multi-camera clustering pipeline.
- **Visitor Contributions:** Visitors click **Were You There? Have more photos or corrections?** in any moment, enter their name for attribution, and submit suggestions. Submissions are queued for organizer review and never modify Google Drive directly.

