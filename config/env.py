"""Minimal .env loading for Kriti control-plane commands.

The repository deliberately does not require python-dotenv. This loader supports
simple KEY=VALUE files and never overwrites environment variables that are
already set by the shell or secret manager.
"""

from __future__ import annotations

import os
from pathlib import Path


def load_env_file(path: str | Path = ".env") -> bool:
    """Load simple KEY=VALUE entries from *path* without overriding os.environ.

    Returns True when the file existed and was read. Blank lines and comments are
    ignored. Single/double quotes surrounding the complete value are removed.
    """
    env_path = Path(path)
    if not env_path.is_file():
        return False

    for raw_line in env_path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        os.environ.setdefault(key, value)
    return True
