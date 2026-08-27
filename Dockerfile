# syntax=docker/dockerfile:1
# Production image: Python chapter agent + Remotion headless renderer.
# Remotion's compositor needs glibc >= 2.35; bullseye (2.31) cannot run it.
FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    CHROME_PATH=/usr/bin/chromium \
    VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:/usr/local/bin:/usr/bin:/bin"

# Python 3, pip, FFmpeg/ffprobe, Chromium (Remotion + SVG fallback), emoji fonts,
# and the shared libraries Chromium/Remotion need for headless GL rendering.
# Cairo/Pango cover manim + optional cairosvg rasterization from requirements.txt.
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        python3-venv \
        python3-dev \
        python3-setuptools \
        ca-certificates \
        tini \
        ffmpeg \
        chromium \
        fonts-noto-color-emoji \
        fonts-liberation \
        libnss3 \
        libdbus-1-3 \
        libatk1.0-0 \
        libatk-bridge2.0-0 \
        libcups2 \
        libdrm2 \
        libxkbcommon0 \
        libxcomposite1 \
        libxdamage1 \
        libxfixes3 \
        libxrandr2 \
        libgbm1 \
        libasound2 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libcairo2 \
        libcairo2-dev \
        libpango1.0-dev \
        libffi-dev \
        pkg-config \
        build-essential \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && python3 -m venv /opt/venv \
    && ffmpeg -version >/dev/null \
    && ffprobe -version >/dev/null \
    && test -x /usr/bin/chromium \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps first so source edits do not bust the pip layer.
# Bookworm enforces PEP 668; install into the container venv, not system site-packages.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Remotion / Node deps live under remotion/ (not the repo root).
COPY remotion/package.json remotion/package-lock.json ./remotion/
WORKDIR /app/remotion
RUN npm ci
WORKDIR /app

# Application source. node_modules is excluded via .dockerignore and kept from npm ci.
COPY Chapter_Agent.py lip_sync_service.py ./
COPY assets ./assets
COPY remotion ./remotion

# Linux is case-sensitive; the Windows working copy is Chapter_Agent.py.
RUN ln -sf Chapter_Agent.py chapter_agent.py \
    && mkdir -p /app/Source_Books /app/Rendered_Output /app/temp

VOLUME ["/app/Source_Books", "/app/Rendered_Output"]

# Chromium in containers needs a larger /dev/shm (set shm_size in Compose).
# tini reaps zombie renderer processes from Remotion/FFmpeg.
ENTRYPOINT ["tini", "--"]
CMD ["python3", "chapter_agent.py"]
