#!/usr/bin/env bash
# =============================================================================
# Kriti / Drona Engine — Google Colab GPU environment bootstrap
# Run from the project root (directory that contains Chapter_Agent.py).
# =============================================================================
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
export PUPPETEER_EXECUTABLE_PATH="${PUPPETEER_EXECUTABLE_PATH:-/usr/bin/chromium}"
export CHROME_PATH="${CHROME_PATH:-$PUPPETEER_EXECUTABLE_PATH}"
export PUPPETEER_SKIP_DOWNLOAD="${PUPPETEER_SKIP_DOWNLOAD:-true}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$SCRIPT_DIR}"
cd "$PROJECT_ROOT"

echo "==> Project root: $PROJECT_ROOT"

# ------------------------------------------------------------------------------
# 1. System packages: FFmpeg, ffprobe, Chromium deps, build tools
# ------------------------------------------------------------------------------
echo "==> Updating apt and installing FFmpeg / Chromium dependencies..."
apt-get update -qq
apt-get install -y -qq \
  ca-certificates \
  curl \
  gnupg \
  ffmpeg \
  fonts-noto-color-emoji \
  fonts-liberation \
  libnss3 \
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
  >/dev/null

command -v ffmpeg >/dev/null
command -v ffprobe >/dev/null
echo "    ffmpeg:  $(ffmpeg -version | head -1)"
echo "    ffprobe: $(ffprobe -version | head -1)"

# ------------------------------------------------------------------------------
# 2. Chromium / Chrome at /usr/bin/chromium (Remotion headless)
# ------------------------------------------------------------------------------
echo "==> Ensuring Chromium is available at /usr/bin/chromium..."
if [[ ! -x /usr/bin/chromium ]]; then
  if apt-get install -y -qq chromium >/dev/null 2>&1 && [[ -x /usr/bin/chromium ]]; then
    echo "    Installed chromium from apt"
  else
    echo "    apt chromium unavailable; installing Google Chrome and linking..."
    curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
      | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
      > /etc/apt/sources.list.d/google-chrome.list
    apt-get update -qq
    apt-get install -y -qq google-chrome-stable >/dev/null
    ln -sfn /usr/bin/google-chrome-stable /usr/bin/chromium
  fi
fi

# Prefer a real binary if chromium is a snap stub
if [[ -x /usr/bin/google-chrome-stable ]] && ! /usr/bin/chromium --version >/dev/null 2>&1; then
  ln -sfn /usr/bin/google-chrome-stable /usr/bin/chromium
fi

test -x /usr/bin/chromium
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
export CHROME_PATH=/usr/bin/chromium
echo "    Chromium: $(/usr/bin/chromium --version 2>/dev/null || echo installed)"
echo "    PUPPETEER_EXECUTABLE_PATH=$PUPPETEER_EXECUTABLE_PATH"

# Persist for later Colab cells in this process tree
if [[ -d /etc/profile.d ]]; then
  cat >/etc/profile.d/kriti-remotion.sh <<'EOF'
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
export CHROME_PATH=/usr/bin/chromium
export PUPPETEER_SKIP_DOWNLOAD=true
EOF
fi

# ------------------------------------------------------------------------------
# 3. Node.js 20.x + npm
# ------------------------------------------------------------------------------
echo "==> Installing Node.js 20.x..."
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)" != "20" ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "    node: $(node -v)"
echo "    npm:  $(npm -v)"

# ------------------------------------------------------------------------------
# 4. Python packages (Colab GPU: torch + pipeline deps)
# ------------------------------------------------------------------------------
echo "==> Installing Python packages..."
python3 -m pip install -q --upgrade pip
python3 -m pip install -q \
  torch \
  torchvision \
  edge-tts \
  anthropic \
  google-genai \
  python-dotenv \
  pypdf \
  librosa \
  openai \
  json-repair \
  pillow \
  moviepy \
  requests

# Linux is case-sensitive; Windows tree often ships Chapter_Agent.py
if [[ -f "$PROJECT_ROOT/Chapter_Agent.py" && ! -e "$PROJECT_ROOT/chapter_agent.py" ]]; then
  ln -sfn Chapter_Agent.py "$PROJECT_ROOT/chapter_agent.py"
fi

# ------------------------------------------------------------------------------
# 5. Remotion npm install
# ------------------------------------------------------------------------------
echo "==> Installing Remotion dependencies..."
if [[ ! -f "$PROJECT_ROOT/remotion/package.json" ]]; then
  echo "ERROR: remotion/package.json not found under $PROJECT_ROOT" >&2
  exit 1
fi
(
  cd "$PROJECT_ROOT/remotion"
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
)

# ------------------------------------------------------------------------------
# 6. Shared Colab data dirs + project symlinks
# ------------------------------------------------------------------------------
echo "==> Creating /content/Source_Books and /content/Rendered_Output..."
mkdir -p /content/Source_Books /content/Rendered_Output /content/temp

# chapter_agent resolves paths relative to the Python file's directory
ln -sfn /content/Source_Books "$PROJECT_ROOT/Source_Books"
ln -sfn /content/Rendered_Output "$PROJECT_ROOT/Rendered_Output"
ln -sfn /content/temp "$PROJECT_ROOT/temp"
mkdir -p "$PROJECT_ROOT/remotion/public/sfx"

# ------------------------------------------------------------------------------
# 7. Silent SFX fallbacks (pop / swoosh / chime)
# ------------------------------------------------------------------------------
echo "==> Ensuring Remotion SFX files exist under remotion/public/sfx/..."
for name in pop swoosh chime; do
  dest="$PROJECT_ROOT/remotion/public/sfx/${name}.mp3"
  if [[ -s "$dest" ]]; then
    echo "    Found sfx/${name}.mp3"
    continue
  fi
  echo "    Creating silent 1s fallback: sfx/${name}.mp3"
  ffmpeg -y -hide_banner -loglevel error \
    -f lavfi -i anullsrc=channel_layout=mono:sample_rate=44100 \
    -t 1 -c:a libmp3lame -q:a 9 \
    "$dest"
  if [[ ! -s "$dest" ]]; then
    echo "ERROR: failed to write $dest" >&2
    exit 1
  fi
done

echo ""
echo "✅ Colab environment ready."
echo "   Upload PDFs under:  /content/Source_Books/<Class>/<Subject>/Chapter-1.pdf"
echo "   Outputs appear in:  /content/Rendered_Output/..."
echo "   Remotion browser:   $PUPPETEER_EXECUTABLE_PATH"
echo ""
echo "Example:"
echo "  python3 chapter_agent.py --grade Class-7 --subject Maths-Ganith-Prakash-I --chapter 1 --provider anthropic --mascot gyanu --student-name \"Rahul\""
