FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend /app/backend
COPY scripts/docker-entrypoint-api.sh /app/docker-entrypoint-api.sh
RUN chmod +x /app/docker-entrypoint-api.sh

WORKDIR /app/backend
EXPOSE 8000

ENTRYPOINT ["/app/docker-entrypoint-api.sh"]
