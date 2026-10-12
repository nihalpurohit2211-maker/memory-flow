# MemoryFlow — Deployment & Go-Live Guide

Welcome! Your MemoryFlow app is fully implemented and ready to deploy.
Follow these straightforward steps to take it live on the internet for free.

---

## 1. Quick Deploy to Render.com (Free Tier)

Render provides free Node.js hosting with automatic SSL (`https://...`).

### Step 1.1: Push to GitHub
Your repository is already set up on GitHub:
```bash
git add .
git commit -m "feat: complete release with AI pipeline, search, and sharing"
git push origin main
```

### Step 1.2: Connect on Render
1. Go to [render.com](https://render.com) and log in (with your GitHub account).
2. Click **New +** → **Web Service**.
3. Select your repository: `memory-flow`.
4. Render will automatically detect `render.yaml`. Click **Apply**.
   - If setting up manually:
     - **Build Command**: `npm ci && npm run build`
     - **Start Command**: `npm run preview`
     - **Instance Type**: `Free`
5. Click **Create Web Service**.
6. Render builds the app in ~2 minutes and gives you a live URL:
   `https://memory-flow-xxxx.onrender.com`

---

## 2. Default Access & Passwords

| Role | Default / Placeholder Password | Notes |
|---|---|---|
| **Admin** | `admin123` | Click the lock icon in the top right to log in as Admin. Change this anytime under **Sharing > Admin Passphrase**. |
| **Visitor** | `elevate2026` | Visitors need this password if visibility is set to Password Protected. Change it anytime under **Sharing**. |

---

## 3. Real AI Processing on Google Colab (Free GPU)

To group people by face and calibrate real CLIP scene tags without slowing down your computer:

1. Open [Google Colab](https://colab.research.google.com).
2. Click **Upload** and upload `colab/memoryflow_embeddings.ipynb` from this repo.
3. In Colab, go to **Runtime > Change runtime type > T4 GPU > Save**.
4. Run all cells:
   - Cell 1 installs dependencies.
   - Cell 2 downloads thumbnails and computes 512-dim CLIP visual embeddings.
   - Cell 3 detects faces with InsightFace and clusters people with DBSCAN.
   - Cell 4 automatically downloads `embeddings.json` and `face_groups.json` to your computer.
5. In your running MemoryFlow app:
   - Log in as **Admin** (`admin123`).
   - Click **AI Import** in the header.
   - Select `embeddings.json` and `face_groups.json`, then click **Upload & Apply**.
6. Click **People** in the header to view and name the face clusters!

---

## 4. Key Features Reference

- **Search**: The search bar is always in the header. Type any keyword (or press `/`) to instantly filter photos, places, moments, or activities.
- **Captions**: Any visitor can click "+ Add caption note" in the viewer. The suggestion goes to the Admin **Queue** for one-click approval.
- **Sharing & QR Code**: Open **Sharing** in the header to toggle between Public and Password Protected, copy the share link, or show the QR code.
- **Keyboard Shortcuts**:
  - `Alt+1`: Switch to Flow View
  - `Alt+2`: Switch to Timeline View
  - `Alt+3`: Switch to Universe View
  - `Alt+S`: "Take Me Somewhere" surprise
  - `/`: Focus search input
