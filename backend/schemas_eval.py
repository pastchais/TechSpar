"""Structured schemas and normalization helpers for LLM evaluation outputs."""
from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, Field, ConfigDict, field_validator


class WeakPointItem(BaseModel):
    point: str = Field(min_length=2, max_length=200)
    topic: str | None = Field(default=None, max_length=64)
    confidence: float = Field(default=0.7, ge=0.0, le=1.0)


class StrongPointItem(BaseModel):
    point: str = Field(min_length=2, max_length=200)
    topic: str | None = Field(default=None, max_length=64)
    confidence: float = Field(default=0.7, ge=0.0, le=1.0)


class TopicMasteryEntry(BaseModel):
    score: float | None = Field(default=None, ge=0.0, le=100.0)
    level: int | None = Field(default=None, ge=1, le=5)
    notes: str = Field(default="", max_length=500)
    confidence: float = Field(default=0.7, ge=0.0, le=1.0)


class CommunicationObservations(BaseModel):
    style_update: str = Field(default="", max_length=300)
    new_habits: list[str] = Field(default_factory=list, max_length=10)
    new_suggestions: list[str] = Field(default_factory=list, max_length=10)


class ThinkingPatterns(BaseModel):
    new_strengths: list[str] = Field(default_factory=list, max_length=10)
    new_gaps: list[str] = Field(default_factory=list, max_length=10)


class DimensionScores(BaseModel):
    technical_depth: float | None = Field(default=None, ge=1.0, le=10.0)
    project_articulation: float | None = Field(default=None, ge=1.0, le=10.0)
    communication: float | None = Field(default=None, ge=1.0, le=10.0)
    problem_solving: float | None = Field(default=None, ge=1.0, le=10.0)


class ExtractionResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    weak_points: list[WeakPointItem] = Field(default_factory=list)
    strong_points: list[StrongPointItem] = Field(default_factory=list)
    topic_mastery: dict[str, TopicMasteryEntry] | TopicMasteryEntry = Field(default_factory=dict)
    communication_observations: CommunicationObservations = Field(default_factory=CommunicationObservations)
    thinking_patterns: ThinkingPatterns = Field(default_factory=ThinkingPatterns)
    session_summary: str = Field(default="", max_length=1200)
    dimension_scores: DimensionScores | None = None
    avg_score: float | None = Field(default=None, ge=0.0, le=10.0)
    confidence: float = Field(default=0.7, ge=0.0, le=1.0)

    @field_validator("avg_score")
    @classmethod
    def round_avg_score(cls, value: float | None):
        return None if value is None else round(float(value), 1)


class DrillScoreItem(BaseModel):
    question_id: int
    score: float | None = Field(default=None, ge=0.0, le=10.0)
    assessment: str = Field(default="", max_length=500)
    improvement: str = Field(default="", max_length=500)
    understanding: str = Field(default="", max_length=64)
    weak_point: str | None = Field(default=None, max_length=200)
    key_missing: list[str] = Field(default_factory=list)


class DrillOverall(BaseModel):
    avg_score: float | None = Field(default=None, ge=0.0, le=10.0)
    summary: str = Field(default="", max_length=1200)
    new_weak_points: list[WeakPointItem] = Field(default_factory=list)
    new_strong_points: list[StrongPointItem] = Field(default_factory=list)
    communication_observations: CommunicationObservations = Field(default_factory=CommunicationObservations)
    thinking_patterns: ThinkingPatterns = Field(default_factory=ThinkingPatterns)
    topic_mastery: TopicMasteryEntry = Field(default_factory=TopicMasteryEntry)
    confidence: float = Field(default=0.7, ge=0.0, le=1.0)


class DrillEvaluationResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    scores: list[DrillScoreItem] = Field(default_factory=list)
    overall: DrillOverall = Field(default_factory=DrillOverall)


def canonicalize_topic_key(topic: str | None) -> str | None:
    if not topic:
        return topic
    return re.sub(r"[^a-z0-9._-]+", "_", topic.strip().lower())[:64] or None


def normalize_point_text(text: str | None) -> str:
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text.strip())
    text = text.strip("，。；;、 ")
    return text[:200]


def _normalize_items(items: list[Any], fallback_topic: str | None, cls):
    normalized = []
    seen = set()
    fallback_topic = canonicalize_topic_key(fallback_topic)
    for item in items or []:
        if isinstance(item, str):
            item = {"point": item, "topic": fallback_topic}
        elif isinstance(item, dict):
            item = dict(item)
        else:
            continue

        item["point"] = normalize_point_text(item.get("point"))
        item["topic"] = canonicalize_topic_key(item.get("topic") or fallback_topic)
        if not item["point"]:
            continue
        key = (item["point"].lower(), item.get("topic") or "")
        if key in seen:
            continue
        seen.add(key)
        normalized.append(cls.model_validate(item))
    return normalized


def normalize_extraction_payload(payload: dict, fallback_topic: str | None) -> ExtractionResult:
    payload = dict(payload or {})
    payload["weak_points"] = _normalize_items(payload.get("weak_points", []), fallback_topic, WeakPointItem)
    payload["strong_points"] = _normalize_items(payload.get("strong_points", []), fallback_topic, StrongPointItem)

    topic_mastery = payload.get("topic_mastery") or {}
    fallback_topic = canonicalize_topic_key(fallback_topic)
    if isinstance(topic_mastery, dict) and ("score" in topic_mastery or "level" in topic_mastery or "notes" in topic_mastery):
        topic_mastery = {fallback_topic or "general": topic_mastery}
    if isinstance(topic_mastery, dict):
        normalized_mastery = {}
        for key, value in topic_mastery.items():
            norm_key = canonicalize_topic_key(key) or fallback_topic or "general"
            try:
                normalized_mastery[norm_key] = TopicMasteryEntry.model_validate(value or {})
            except Exception:
                continue
        payload["topic_mastery"] = normalized_mastery
    else:
        payload["topic_mastery"] = {}

    if payload.get("session_summary"):
        payload["session_summary"] = str(payload["session_summary"]).strip()[:1200]

    return ExtractionResult.model_validate(payload)


def normalize_drill_evaluation_payload(payload: dict, fallback_topic: str | None) -> DrillEvaluationResult:
    payload = dict(payload or {})
    overall = dict(payload.get("overall") or {})
    overall["new_weak_points"] = _normalize_items(overall.get("new_weak_points", []), fallback_topic, WeakPointItem)
    overall["new_strong_points"] = _normalize_items(overall.get("new_strong_points", []), fallback_topic, StrongPointItem)
    payload["overall"] = overall
    return DrillEvaluationResult.model_validate(payload)
