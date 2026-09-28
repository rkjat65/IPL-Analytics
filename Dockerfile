# ── Stage 1: Build frontend ──────────────────────────────
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend

# Accept build-time env vars for Vite (baked into the JS bundle)
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Production server ───────────────────────────
FROM python:3.11-slim
WORKDIR /app

ARG APP_RELEASE=local
ENV APP_RELEASE=$APP_RELEASE

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend
COPY backend/ ./backend/

# Canonical player identities used by ingestion, search, profiles and images
COPY data/ ./data/

# Copy the isolated tournament databases
COPY ipl.duckdb ./ipl.duckdb
COPY t20_world_cup.duckdb ./t20_world_cup.duckdb

# Copy frontend build from stage 1
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Copy other needed files
COPY start-frontend.js ./

# Expose port (Railway sets PORT env var)
EXPOSE 8000

# Start the server
CMD python -m uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
