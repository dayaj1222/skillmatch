"""Where user-uploaded files live.

Avatars are deliberately kept *outside* ``static/``: the frontend build runs
with ``emptyOutDir`` and wipes that directory, which used to delete people's
pictures on every deploy.
"""

from __future__ import annotations

from pathlib import Path

from .config import get_settings

_REPO_ROOT = Path(__file__).resolve().parent.parent


def avatar_dir() -> Path:
    """Absolute directory avatars are written to and served from."""
    configured = Path(get_settings().upload_dir)
    path = configured if configured.is_absolute() else _REPO_ROOT / configured
    path.mkdir(parents=True, exist_ok=True)
    return path


__all__ = ["avatar_dir"]
