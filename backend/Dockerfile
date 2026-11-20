# Owner: B
FROM python:3.11-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
# Defaults for single-container hosts (Render etc.); docker compose overrides these.
ENV RELICX_STORAGE_DIR=/data/storage RELICX_DATABASE_URL=sqlite:////data/storage/relicx.db RELICX_CORS_ORIGINS=https://relic-x.vercel.app
WORKDIR /app

COPY pyproject.toml ./
COPY src ./src
RUN pip install ".[api]" && useradd --create-home --uid 1000 relicx && mkdir -p /data/storage && chown relicx /data/storage

COPY alembic.ini start.sh ./
COPY migrations ./migrations

USER relicx
EXPOSE 8000
CMD ["sh", "./start.sh"]
