"""Runtime-editable non-secret settings for admin UI."""
from __future__ import annotations

import json
from pathlib import Path
from threading import Lock

from pydantic import BaseModel, Field

from backend.config import settings

_RUNTIME_SETTINGS_PATH = settings.base_dir / "data" / "runtime_settings.json"
_LOCK = Lock()


class AdminSettingsModel(BaseModel):
    model: str = Field(default="")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    min_confidence_to_persist: float = Field(default=0.6, ge=0.0, le=1.0)
    allow_registration: bool = False


DEFAULTS = AdminSettingsModel(
    model=settings.model,
    temperature=settings.temperature,
    min_confidence_to_persist=settings.min_confidence_to_persist,
    allow_registration=settings.allow_registration,
)


def _ensure_parent():
    _RUNTIME_SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)


def load_runtime_settings() -> AdminSettingsModel:
    _ensure_parent()
    if not _RUNTIME_SETTINGS_PATH.exists():
        save_runtime_settings(DEFAULTS)
        return DEFAULTS
    try:
        data = json.loads(_RUNTIME_SETTINGS_PATH.read_text(encoding="utf-8"))
        merged = DEFAULTS.model_dump()
        merged.update(data or {})
        return AdminSettingsModel.model_validate(merged)
    except Exception:
        save_runtime_settings(DEFAULTS)
        return DEFAULTS


def save_runtime_settings(new_settings: AdminSettingsModel) -> AdminSettingsModel:
    _ensure_parent()
    with _LOCK:
        _RUNTIME_SETTINGS_PATH.write_text(
            json.dumps(new_settings.model_dump(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    return new_settings


def get_effective_settings() -> AdminSettingsModel:
    current = load_runtime_settings()
    settings.model = current.model
    settings.temperature = current.temperature
    settings.min_confidence_to_persist = current.min_confidence_to_persist
    settings.allow_registration = current.allow_registration
    return current
