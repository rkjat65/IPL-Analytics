# Cricket Analytics - Command Guide

This guide outlines all the essential commands for running, updating, and deploying the IPL Analytics application.

---

## 1. Local Development (Startup)

To run the application locally, you need to start both the backend API and the frontend UI.

### 1.1 Start Backend (FastAPI)
Run this from the repository root:
```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```
*   **API URL**: http://localhost:8000
*   **Health Check**: http://localhost:8000/api/health

### 1.2 Start Frontend (Vite)
Run this from the `frontend/` directory (or use `npm run dev` from the root if configured):
```bash
cd frontend
npm run dev
```
*   **App URL**: http://localhost:5173

---

## 2. Updating the Database

When you add new match JSON files to the `ipl_json/` folder, you must update the DuckDB database.

### 2.1 Standard Ingestion
Run this from the repository root:
```bash
python ingest.py
```
*   This will scan the `ipl_json/` directory and update `ipl.duckdb`.
*   It handles incremental updates (only processing new files) by default.

### 2.2 Resetting the Database
If you need to wipe the database and reload all files from scratch:
```bash
python ingest.py --reset
```

### 2.3 Rebuild the T20 World Cup Database
World Cup data stays in its own database and must never be ingested into `ipl.duckdb`:
```powershell
python ingest.py --src "T20 World Cup\t20wc_matches" --db t20_world_cup.duckdb --reset --season-from-date-year
```
The date-year option normalizes Cricsheet seasons to the edition year, including tournaments played across calendar-year boundaries.

---

## 3. Deploying to Oracle Hosting

The application is hosted on Oracle Cloud. Both `ipl.duckdb` and `t20_world_cup.duckdb` are bundled inside the Docker image, so you must redeploy to see new data.

### 3.1 Manual Sync (Local to Oracle)
Use this if you want to push updates immediately without waiting for GitHub Actions:

```powershell
# 1. Update database from JSON
python ingest.py

# 2. Build the production image locally
docker build -t ipl-analytics .

# 3. Transfer and Load (key kept OUTSIDE the repo, e.g. ~/.ssh/crickrida_oracle)
docker save ipl-analytics | ssh -i ~/.ssh/crickrida_oracle "$REMOTE_USER@$ORACLE_IP" "docker load"

# 4. Restart the live service
ssh -i ~/.ssh/crickrida_oracle "$REMOTE_USER@$ORACLE_IP" "docker stop ipl-analytics || true && docker run -d --name ipl-analytics --restart always -p 80:8000 -v /data:/data -e DUCKDB_PATH=/app/ipl.duckdb ipl-analytics"
```

---

## 4. Automatic Deployment (GitHub Actions)

I have set up a workflow in `.github/workflows/deploy.yml`. Once configured, every `git push origin main` will automatically build and deploy the app.

### 4.1 Required Setup (One-time)
Go to your GitHub Repository > **Settings** > **Secrets and variables** > **Actions** and add these **Repository Secrets**:

1.  **`ORACLE_IP`**: your server's public IP
2.  **`REMOTE_USER`**: `opc`
3.  **`SSH_PRIVATE_KEY`**: Copy the entire content of your deploy private key (keep it in `~/.ssh/`, never in this repo).
4.  **`VITE_GOOGLE_CLIENT_ID`**: Your Google Client ID (from `.env`).

### 4.2 The Automated Workflow
1.  Add new JSON files to `ipl_json/`.
2.  Run `python ingest.py` to update the local `ipl.duckdb`.
3.  Commit and Push:
    ```bash
    git add ipl.duckdb t20_world_cup.duckdb ipl_json/ "T20 World Cup/t20wc_matches/"
    git commit -m "data: sync latest match results"
    git push origin main
    ```
4.  GitHub will now:
    *   Build a fresh Docker image containing both isolated tournament databases.
    *   Push it to GitHub Container Registry (GHCR).
    *   SSH into your Oracle server and restart the container with the new image.

---

## 5. Maintenance Commands

*   **View Live Logs**: `ssh -i ~/.ssh/crickrida_oracle "$REMOTE_USER@$ORACLE_IP" "docker logs -f ipl-analytics"`
*   **Check Disk Usage**: `ssh -i ~/.ssh/crickrida_oracle "$REMOTE_USER@$ORACLE_IP" "df -h"`
*   **Prune Old Images**: `ssh -i ~/.ssh/crickrida_oracle "$REMOTE_USER@$ORACLE_IP" "docker image prune -af"`
