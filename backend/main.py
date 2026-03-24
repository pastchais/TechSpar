"""FastAPI 入口 — 面试模拟系统 API."""
import re
import os
import json
import uuid
from datetime import datetime

from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks, UploadFile, File, Form, Depends
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import HumanMessage, AIMessage

from backend.models import (
    StartInterviewRequest, ChatRequest, EndDrillRequest,
    RecordingAnalyzeRequest, RegisterRequest, LoginRequest, AdminSettingsRequest,
    InterviewMode, InterviewPhase, InterviewScoreRequest, QueryHintsRequest,
)
from backend.graphs.resume_interview import compile_resume_interview
from backend.graphs.topic_drill import (
    generate_drill_questions, evaluate_drill_answers,
)
from backend.graphs.review import generate_review
from backend.config import settings
from backend.indexer import load_topics, save_topics, _index_cache
from backend.memory import get_profile, update_profile_after_interview, llm_update_profile, DEFAULT_PROFILE
from backend.schemas_eval import normalize_drill_evaluation_payload, normalize_point_text
from backend.storage.sessions import (
    create_session, append_message, save_review, save_drill_answers,
    get_session, list_sessions, list_sessions_by_topic,
    delete_session, list_distinct_topics, upsert_reference_answer,
    append_reference_followup, upsert_improved_answer,
)
from backend.graph import build_graph
from backend.auth import (
    init_users_table, ensure_default_user,
    create_user, authenticate_user, create_token, get_current_user,
)
from backend.runtime_settings import get_effective_settings, load_runtime_settings, save_runtime_settings, AdminSettingsModel
from backend.query_hints import build_query_hints

app = FastAPI(title="TechSpar", version="0.2.0")


def _score_bucket(total: float) -> str:
    if total >= 21:
        return "比较稳"
    if total >= 16:
        return "可用但不够成熟"
    if total >= 11:
        return "易翻车"
    return "基础不稳"


def _reference_answer_key(question_id: str | int | None = None, question: str | None = None) -> str:
    if question_id is not None and str(question_id).strip() != "":
        return f"q:{question_id}"
    text = (question or "").strip()
    return f"text:{text}"


def _append_to_mistake_book(user_id: str, topic: str | None, payload: dict):
    topic_key = (topic or "general").strip() or "general"
    review_dir = settings.user_knowledge_path(user_id) / "review_templates"
    review_dir.mkdir(parents=True, exist_ok=True)
    path = review_dir / f"{topic_key}_auto_mistakes.md"
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = [
        f"\n## {now} | {payload.get('question') or '综合评分'}",
        f"- 总评: {payload.get('summary', '')}",
        f"- 总分: {payload.get('total_score', '-')}/25",
        f"- 最低维度: {payload.get('lowest_dimension', '')}",
    ]
    missing = payload.get("missing_points") or []
    if missing:
        lines.append(f"- 漏掉的关键点: {'、'.join(missing[:5])}")
    lines.append("")
    with open(path, "a", encoding="utf-8") as f:
        f.write("\n".join(lines))


def _derive_weak_point_label(topic: str | None, focus_area: str | None, detail: dict, base_score: dict) -> str:
    lowest = detail.get("lowest_dimension") or "engineering"
    focus = (focus_area or "").strip()
    missing = [normalize_point_text(x) for x in (detail.get("missing_points") or base_score.get("key_missing") or [])]
    missing = [x for x in missing if x]
    focus_prefix = focus if focus else (topic or "该专题")
    mapping = {
        "accuracy": f"{focus_prefix} 的概念边界与关键知识点不稳",
        "structure": f"{focus_prefix} 回答结构不稳定，缺少分层与主线",
        "engineering": f"{focus_prefix} 缺少工程化落地与实现细节",
        "followup": f"{focus_prefix} 被追问后稳定性不足，容易断层",
        "delivery": f"{focus_prefix} 表达完成度不足，结论与重点不够清晰",
    }
    if missing:
        return normalize_point_text(f"{focus_prefix}：{missing[0]}") or mapping.get(lowest, f"{focus_prefix} 存在薄弱点")
    return normalize_point_text(mapping.get(lowest, f"{focus_prefix} 存在薄弱点"))


def _merge_auto_weak_points_into_overall(topic: str, questions: list[dict], scores: list[dict], overall: dict) -> dict:
    overall = dict(overall or {})
    existing = list(overall.get("new_weak_points") or [])
    seen = set()
    normalized_existing = []
    for item in existing:
        if isinstance(item, dict):
            point = normalize_point_text(item.get("point"))
            item_topic = item.get("topic") or topic
            confidence = item.get("confidence", 0.7)
        else:
            point = normalize_point_text(str(item))
            item_topic = topic
            confidence = 0.7
        if not point:
            continue
        key = (point.lower(), item_topic)
        if key in seen:
            continue
        seen.add(key)
        normalized_existing.append({"point": point, "topic": item_topic, "confidence": confidence})

    q_lookup = {q.get("id"): q for q in (questions or [])}
    for s in scores or []:
        detail = s.get("auto_score_detail") or {}
        total = detail.get("total_score")
        if total is None or total > 15:
            continue
        label = normalize_point_text(s.get("weak_point"))
        if not label:
            label = _derive_weak_point_label(topic, q_lookup.get(s.get("question_id"), {}).get("focus_area"), detail, s)
            s["weak_point"] = label
        if not label:
            continue
        key = (label.lower(), topic)
        if key in seen:
            continue
        seen.add(key)
        confidence = 0.85 if total <= 10 else 0.75
        normalized_existing.append({"point": label, "topic": topic, "confidence": confidence})

    overall["new_weak_points"] = normalized_existing
    return overall


def _compute_drill_targeting_stats(topic: str, questions: list[dict], scores: list[dict], user_id: str, focus_keyword: str | None = None, focus_label: str | None = None) -> dict:
    from backend.spaced_repetition import get_due_reviews
    from backend.memory import get_topic_context_for_drill

    drill_ctx = get_topic_context_for_drill(topic, user_id)
    due_reviews = get_due_reviews(user_id, topic)
    due_points = [wp.get("point") for wp in due_reviews[:5] if wp.get("point")]
    priority_details = [wp for wp in drill_ctx.get("weak_point_details", [])[:8] if wp.get("point")]
    priority_points = [wp.get("point") for wp in priority_details]
    priority_detail_map = {wp.get("point"): wp for wp in priority_details}
    targeted_pool = []
    for p in due_points + priority_points:
        if p and p not in targeted_pool:
            targeted_pool.append(p)

    def _match_target(score_item: dict, question: dict | None) -> str | None:
        hay = " ".join([
            str(score_item.get("weak_point") or ""),
            str(question.get("focus_area") if question else ""),
            str(question.get("question") if question else ""),
        ]).lower()
        for p in targeted_pool:
            if p and p.lower() in hay:
                return p
        return None

    def _focus_hit(question: dict | None, score_item: dict | None = None) -> bool:
        if not focus_terms:
            return False
        hay = " ".join([
            str(score_item.get("weak_point") if score_item else ""),
            str(question.get("focus_area") if question else ""),
            str(question.get("question") if question else ""),
        ]).lower()
        return any(term and term in hay for term in focus_terms)

    q_lookup = {q.get("id"): q for q in (questions or [])}
    attempted = [s for s in (scores or []) if s.get("question_id") is not None]
    matched = []
    repaired = []
    unrepaired = []

    focus_seed = (focus_label or focus_keyword or "").strip()
    focus_terms = []
    if focus_seed:
        hints = build_query_hints(focus_seed)
        focus_terms = [str(x).lower() for x in (hints.get("aliases") or [focus_seed]) if x]
    for s in attempted:
        q = q_lookup.get(s.get("question_id"))
        matched_point = _match_target(s, q)
        if not matched_point:
            continue
        detail = s.get("auto_score_detail") or {}
        total_25 = detail.get("total_score")
        base_10 = s.get("score")
        effective_10 = None
        if isinstance(base_10, (int, float)):
            effective_10 = float(base_10)
        elif isinstance(total_25, (int, float)):
            effective_10 = round(float(total_25) / 2.5, 1)
        meta = priority_detail_map.get(matched_point, {})
        item = {
            "question_id": s.get("question_id"),
            "weak_point": matched_point,
            "focus_area": q.get("focus_area") if q else None,
            "score_10": effective_10,
            "score_25": total_25,
            "improved": bool(effective_10 is not None and effective_10 >= 7.0),
            "adaptive_strategy": meta.get("adaptive_strategy"),
            "priority_score": meta.get("priority_score"),
            "recent_low_streak": meta.get("recent_low_streak"),
            "repair_success_rate": meta.get("repair_success_rate"),
            "avg_recent_score": meta.get("avg_recent_score"),
            "semantic_bucket": meta.get("semantic_bucket"),
            "semantic_buckets": meta.get("semantic_buckets"),
            "focus_hit": _focus_hit(q, s),
        }
        matched.append(item)
        if item["improved"]:
            repaired.append(item)
        else:
            unrepaired.append(item)

    attempted_count = len(attempted)
    hit_count = len(matched)
    high_priority_in_front3 = 0
    front3_focus_hits = 0
    for idx, q in enumerate((questions or [])[:3], start=1):
        hay = f"{q.get('focus_area', '')} {q.get('question', '')}".lower()
        if any(p.lower() in hay for p in targeted_pool[:4] if p):
            high_priority_in_front3 += 1
        if _focus_hit(q):
            front3_focus_hits += 1

    strategy_snapshot = []
    for p in targeted_pool[:8]:
        meta = priority_detail_map.get(p, {})
        strategy_snapshot.append({
            "point": p,
            "adaptive_strategy": meta.get("adaptive_strategy"),
            "priority_score": meta.get("priority_score"),
            "recent_low_streak": meta.get("recent_low_streak"),
            "repair_success_rate": meta.get("repair_success_rate"),
            "avg_recent_score": meta.get("avg_recent_score"),
        })

    focus_hit_count = sum(1 for s in attempted if _focus_hit(q_lookup.get(s.get("question_id")), s))

    return {
        "targeted_pool": targeted_pool[:8],
        "targeted_pool_count": len(targeted_pool),
        "attempted_questions": attempted_count,
        "hit_count": hit_count,
        "hit_rate": round(hit_count / attempted_count, 2) if attempted_count else 0.0,
        "front3_high_priority_hits": high_priority_in_front3,
        "focus_keyword": focus_keyword,
        "focus_label": focus_label,
        "focus_hit_count": focus_hit_count,
        "focus_hit_rate": round(focus_hit_count / attempted_count, 2) if attempted_count else 0.0,
        "front3_focus_hits": front3_focus_hits,
        "repaired_count": len(repaired),
        "repair_rate": round(len(repaired) / hit_count, 2) if hit_count else 0.0,
        "unrepaired_count": len(unrepaired),
        "matched_items": matched[:10],
        "strategy_snapshot": strategy_snapshot,
    }


def _track_weak_point_repairs(topic: str, targeting_stats: dict, user_id: str):
    from backend.memory import _load_profile, _save_profile, _refresh_weak_point_aggregates

    profile = _load_profile(user_id)
    matched_items = targeting_stats.get("matched_items") or []

    changed = False
    focus_label = targeting_stats.get("focus_label")
    focus_keyword = targeting_stats.get("focus_keyword")
    focus_hit_rate = targeting_stats.get("focus_hit_rate", 0.0)
    front3_focus_hits = targeting_stats.get("front3_focus_hits", 0)

    for item in matched_items:
        point_text = (item.get("weak_point") or "").lower()
        for wp in profile.get("weak_points", []):
            if wp.get("improved"):
                continue
            if topic and wp.get("topic") != topic:
                continue
            wp_text = str(wp.get("point") or "").lower()
            if point_text not in wp_text and wp_text not in point_text:
                continue
            history = list(wp.get("repair_history", []))[-9:]
            history.append({
                "question_id": item.get("question_id"),
                "score_10": item.get("score_10"),
                "score_25": item.get("score_25"),
                "improved": item.get("improved", False),
                "focus_area": item.get("focus_area"),
                "focus_hit": item.get("focus_hit", False),
                "focus_label": targeting_stats.get("focus_label"),
                "focus_keyword": targeting_stats.get("focus_keyword"),
                "at": datetime.now().isoformat(),
            })
            wp["repair_history"] = history
            wp["repair_attempts"] = int(wp.get("repair_attempts", 0) or 0) + 1
            if item.get("improved"):
                wp["repair_successes"] = int(wp.get("repair_successes", 0) or 0) + 1
            wp["repair_success_rate"] = round(
                (wp.get("repair_successes", 0) or 0) / max(wp.get("repair_attempts", 1), 1), 2
            )
            changed = True
            break

    if focus_label and topic:
        for wp in profile.get("weak_points", []):
            if wp.get("improved"):
                continue
            if wp.get("topic") != topic:
                continue
            effectiveness = list(wp.get("focus_effectiveness") or [])
            entry = next((x for x in effectiveness if x.get("focus_label") == focus_label), None)
            if not entry:
                entry = {
                    "focus_label": focus_label,
                    "focus_keyword": focus_keyword or focus_label,
                    "attempts": 0,
                    "focus_hit_count": 0,
                    "focus_hit_rate": 0.0,
                    "improved_count": 0,
                    "improvement_rate": 0.0,
                    "avg_score": None,
                    "topic_level": True,
                }
                effectiveness.append(entry)
            entry["attempts"] = int(entry.get("attempts", 0) or 0) + 1
            entry["focus_hit_count"] = int(entry.get("focus_hit_count", 0) or 0) + (1 if focus_hit_rate and focus_hit_rate > 0 else 0)
            entry["focus_hit_rate"] = round(max(float(entry.get("focus_hit_rate", 0.0) or 0.0), float(focus_hit_rate or 0.0)), 2)
            entry["last_front3_focus_hits"] = front3_focus_hits
            wp["focus_effectiveness"] = effectiveness[-8:]
            if not wp.get("best_focus") and focus_hit_rate and focus_hit_rate > 0:
                wp["best_focus"] = entry
            changed = True

    stats = profile.setdefault("stats", {})
    drill_stats = stats.setdefault("drill_targeting", [])
    drill_stats.append({
        "date": datetime.now().strftime("%Y-%m-%d"),
        "topic": topic,
        "hit_rate": targeting_stats.get("hit_rate", 0.0),
        "repair_rate": targeting_stats.get("repair_rate", 0.0),
        "hit_count": targeting_stats.get("hit_count", 0),
        "repaired_count": targeting_stats.get("repaired_count", 0),
        "attempted_questions": targeting_stats.get("attempted_questions", 0),
        "front3_high_priority_hits": targeting_stats.get("front3_high_priority_hits", 0),
        "focus_label": targeting_stats.get("focus_label"),
        "focus_hit_rate": targeting_stats.get("focus_hit_rate", 0.0),
        "front3_focus_hits": targeting_stats.get("front3_focus_hits", 0),
    })
    stats["drill_targeting"] = drill_stats[-20:]

    _refresh_weak_point_aggregates(profile)
    _save_profile(profile, user_id)


async def _auto_score_interview(req: InterviewScoreRequest, user_id: str) -> dict:
    from backend.llm_provider import get_langchain_llm
    from langchain_core.messages import SystemMessage, HumanMessage

    transcript_text = "\n".join(
        f"{m.get('role', 'unknown')}: {m.get('content', '')}" for m in (req.transcript or [])
    )[:6000]

    prompt = f"""
你是技术面试评分器。请基于下面的回答内容，输出严格 JSON。

评分维度（每项 1-5 分）：
1. accuracy: 概念准确性
2. structure: 回答结构性
3. engineering: 工程感
4. followup: 被追问后的稳定性
5. delivery: 表达完成度

输入：
- 模式: {req.mode}
- 专题: {req.topic or '综合'}
- 题目: {req.question or '综合复盘'}
- 用户回答: {req.answer or ''}
- 参考答案: {req.reference_answer or ''}
- 已有 review: {req.review or ''}
- 对话记录:\n{transcript_text or '无'}

返回：
{{
  "accuracy": 1-5,
  "structure": 1-5,
  "engineering": 1-5,
  "followup": 1-5,
  "delivery": 1-5,
  "missing_points": ["最多5条"],
  "strengths": ["最多4条"],
  "improvements": ["最多4条"],
  "lowest_dimension": "accuracy|structure|engineering|followup|delivery",
  "reason": "一句话总结"
}}
只返回 JSON。
"""

    llm = get_langchain_llm()
    resp = llm.invoke([
        SystemMessage(content="你是严格的技术面试评分引擎，只返回 JSON。"),
        HumanMessage(content=prompt),
    ])

    from backend.graphs.topic_drill import _parse_json_response
    data = _parse_json_response(resp.content)
    scores = {
        "accuracy": max(1, min(5, int(round(float(data.get("accuracy", 3)))))),
        "structure": max(1, min(5, int(round(float(data.get("structure", 3)))))),
        "engineering": max(1, min(5, int(round(float(data.get("engineering", 3)))))),
        "followup": max(1, min(5, int(round(float(data.get("followup", 3)))))),
        "delivery": max(1, min(5, int(round(float(data.get("delivery", 3)))))),
    }
    total = sum(scores.values())
    result = {
        **scores,
        "total_score": total,
        "summary": _score_bucket(total),
        "reason": str(data.get("reason", "")).strip()[:300],
        "missing_points": list(data.get("missing_points") or [])[:5],
        "strengths": list(data.get("strengths") or [])[:4],
        "improvements": list(data.get("improvements") or [])[:4],
        "lowest_dimension": data.get("lowest_dimension") or min(scores, key=scores.get),
        "question": req.question or "",
        "topic": req.topic,
    }

    if total <= 15:
        _append_to_mistake_book(user_id, req.topic, result)
        result["entered_mistake_book"] = True
    else:
        result["entered_mistake_book"] = False
    return result


async def _auto_score_drill_questions(topic: str, questions: list[dict], answers: list[dict], scores: list[dict], user_id: str) -> list[dict]:
    from backend.llm_provider import get_langchain_llm
    from langchain_core.messages import SystemMessage, HumanMessage
    from backend.graphs.topic_drill import _parse_json_response

    answer_map = {a.get("question_id"): (a.get("answer") or "").strip() for a in (answers or [])}
    score_map = {s.get("question_id"): dict(s) for s in (scores or [])}
    answered_questions = []

    for q in questions or []:
        qid = q.get("id")
        answer = answer_map.get(qid, "")
        if not answer:
            continue
        base = score_map.get(qid, {})
        answered_questions.append({
            "question_id": qid,
            "question": q.get("question", ""),
            "focus_area": q.get("focus_area", ""),
            "answer": answer[:2000],
            "assessment": base.get("assessment", ""),
            "improvement": base.get("improvement", ""),
            "understanding": base.get("understanding", ""),
            "key_missing": base.get("key_missing", []),
        })

    if not answered_questions:
        return scores

    payload_lines = []
    for item in answered_questions:
        payload_lines.append(
            f"### question_id={item['question_id']}\n"
            f"题目: {item['question']}\n"
            f"focus_area: {item['focus_area']}\n"
            f"回答: {item['answer']}\n"
            f"已有点评: {item['assessment']}\n"
            f"已有改进建议: {item['improvement']}\n"
            f"理解程度: {item['understanding']}\n"
            f"遗漏点: {'、'.join(item['key_missing'] or [])}"
        )

    prompt = f"""
你是技术面试逐题评分引擎。请对下面每道已作答题给出五维评分，并返回严格 JSON。

专题: {topic}
评分维度（每项 1-5 分）：
- accuracy
- structure
- engineering
- followup
- delivery

返回格式：
{{
  "items": [
    {{
      "question_id": 1,
      "accuracy": 1-5,
      "structure": 1-5,
      "engineering": 1-5,
      "followup": 1-5,
      "delivery": 1-5,
      "missing_points": ["最多4条"],
      "improvements": ["最多3条"],
      "lowest_dimension": "accuracy|structure|engineering|followup|delivery",
      "reason": "一句话"
    }}
  ]
}}
只返回 JSON，不要解释。

题目列表：
{chr(10).join(payload_lines)}
"""

    llm = get_langchain_llm()
    resp = llm.invoke([
        SystemMessage(content="你是严格的技术面试逐题评分引擎，只返回 JSON。"),
        HumanMessage(content=prompt),
    ])
    data = _parse_json_response(resp.content)
    items = data.get("items", []) if isinstance(data, dict) else []
    item_map = {}
    for item in items:
        try:
            qid = int(item.get("question_id"))
        except Exception:
            continue
        dims = {
            "accuracy": max(1, min(5, int(round(float(item.get("accuracy", 3)))))),
            "structure": max(1, min(5, int(round(float(item.get("structure", 3)))))),
            "engineering": max(1, min(5, int(round(float(item.get("engineering", 3)))))),
            "followup": max(1, min(5, int(round(float(item.get("followup", 3)))))),
            "delivery": max(1, min(5, int(round(float(item.get("delivery", 3)))))),
        }
        total = sum(dims.values())
        detail = {
            **dims,
            "total_score": total,
            "summary": _score_bucket(total),
            "reason": str(item.get("reason", "")).strip()[:200],
            "missing_points": list(item.get("missing_points") or [])[:4],
            "improvements": list(item.get("improvements") or [])[:3],
            "lowest_dimension": item.get("lowest_dimension") or min(dims, key=dims.get),
            "entered_mistake_book": total <= 15,
        }
        item_map[qid] = detail

    merged_scores = []
    question_lookup = {q.get("id"): q for q in (questions or [])}
    for s in scores or []:
        qid = s.get("question_id")
        detail = item_map.get(qid)
        merged = dict(s)
        if detail:
            merged["auto_score_detail"] = detail
            if detail["entered_mistake_book"]:
                _append_to_mistake_book(user_id, topic, {
                    **detail,
                    "question": question_lookup.get(qid, {}).get("question", f"Q{qid}"),
                    "topic": topic,
                })
            if detail["total_score"] <= 15 and not merged.get("weak_point"):
                merged["weak_point"] = _derive_weak_point_label(
                    topic,
                    question_lookup.get(qid, {}).get("focus_area"),
                    detail,
                    merged,
                )
        if merged.get("weak_point"):
            hints = build_query_hints(merged.get("weak_point"))
            merged["semantic_bucket"] = hints.get("semantic_bucket")
            merged["semantic_buckets"] = hints.get("semantic_buckets") or []
        merged_scores.append(merged)
    return merged_scores

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

router = APIRouter(prefix="/api")

# In-memory graph instances keyed by session_id (resume mode only)
_graphs: dict[str, dict] = {}
# Drill session data (questions stored for evaluation at end)
_drill_sessions: dict[str, dict] = {}


@app.on_event("startup")
def preload_models():
    """Pre-load embedding model + init vector memory on startup."""
    from backend.vector_memory import init_memory_table
    import logging
    logger = logging.getLogger("uvicorn")
    current_runtime = get_effective_settings()

    try:
        from backend.llm_provider import get_embedding
        from backend.indexer import _init_llama_settings
        logger.info("Pre-loading embedding model...")
        get_embedding()
        _init_llama_settings()
        logger.info(f"Embedding model ready. Active model: {current_runtime.model}")
    except Exception as exc:
        logger.warning(f"Embedding preload skipped: {exc}")

    # Init tables + default user
    init_memory_table()
    init_users_table()
    ensure_default_user()
    logger.info("Database tables initialized.")


# ── Auth endpoints (no authentication required) ──

@router.get("/auth/config")
def auth_config():
    """Public endpoint — tells the frontend whether registration is enabled."""
    runtime = load_runtime_settings()
    return {"allow_registration": runtime.allow_registration}


@router.post("/auth/register")
def register(req: RegisterRequest):
    runtime = load_runtime_settings()
    if not runtime.allow_registration:
        raise HTTPException(403, "Registration is disabled")
    user = create_user(req.email, req.password, req.name)
    token = create_token(user["id"])
    return {"token": token, "user": user}


@router.post("/auth/login")
def login(req: LoginRequest):
    user = authenticate_user(req.email, req.password)
    if not user:
        raise HTTPException(401, "Invalid email or password")
    token = create_token(user["id"])
    return {"token": token, "user": user}


@router.get("/")
def root():
    return {"service": "TechSpar", "version": "0.2.0"}


@router.get("/health")
def health():
    runtime = load_runtime_settings()
    return {
        "status": "ok",
        "service": "TechSpar",
        "version": "0.2.0",
        "model": runtime.model,
        "allow_registration": runtime.allow_registration,
    }


# ── Resume ──

@router.get("/resume/status")
def resume_status(user_id: str = Depends(get_current_user)):
    """Check if a resume file exists."""
    resume_dir = settings.user_resume_path(user_id)
    if not resume_dir.exists():
        return {"has_resume": False}
    files = [f for f in resume_dir.iterdir() if f.suffix.lower() == ".pdf"]
    if not files:
        return {"has_resume": False}
    f = files[0]
    return {"has_resume": True, "filename": f.name, "size": f.stat().st_size}


@router.post("/resume/upload")
async def upload_resume(file: UploadFile = File(...), user_id: str = Depends(get_current_user)):
    """Upload a resume PDF. Replaces any existing resume."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported.")
    max_bytes = settings.upload_max_mb * 1024 * 1024

    resume_dir = settings.user_resume_path(user_id)
    resume_dir.mkdir(parents=True, exist_ok=True)

    # Remove old resumes
    for old in resume_dir.iterdir():
        if old.is_file():
            old.unlink()

    # Save new file
    safe_name = os.path.basename(file.filename)
    dest = resume_dir / safe_name
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(413, f"File too large. Max {settings.upload_max_mb} MB.")
    dest.write_bytes(content)

    # Clear index cache so next query rebuilds from new resume
    _index_cache.pop((user_id, "resume"), None)
    cache_dir = settings.user_index_cache_path(user_id) / "resume"
    if cache_dir.exists():
        import shutil
        shutil.rmtree(cache_dir)

    return {"ok": True, "filename": safe_name, "size": len(content)}


# ── Speech-to-text ──

@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...), user_id: str = Depends(get_current_user)):
    """Transcribe short audio clip to text via DashScope ASR."""
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(400, "Empty audio file.")

    try:
        from backend.transcribe import transcribe_audio
        suffix = "." + (file.filename or "audio.webm").rsplit(".", 1)[-1]
        text = transcribe_audio(audio_bytes, suffix=suffix)
        return {"text": text}
    except Exception as e:
        raise HTTPException(500, f"Transcription failed: {e}")


# ── Recording review endpoints ──

@router.post("/recording/transcribe")
async def recording_transcribe(
    file: UploadFile = File(...),
    mode: str = Form("dual"),
    user_id: str = Depends(get_current_user),
):
    """Transcribe recording audio via DashScope ASR."""
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(400, "Empty audio file.")

    suffix = "." + (file.filename or "audio.webm").rsplit(".", 1)[-1]

    try:
        from backend.transcribe import transcribe_audio
        text = transcribe_audio(audio_bytes, suffix=suffix)
        return {"transcript": text, "segments": []}
    except Exception as e:
        raise HTTPException(500, f"Transcription failed: {e}")


@router.post("/recording/analyze")
async def recording_analyze(req: RecordingAnalyzeRequest, user_id: str = Depends(get_current_user)):
    """Analyze a recording transcript — dual mode extracts Q&A, solo mode does holistic eval."""
    session_id = str(uuid.uuid4())

    if req.recording_mode == "dual":
        return await _analyze_dual(req, session_id, user_id)
    else:
        return await _analyze_solo(req, session_id, user_id)


async def _analyze_dual(req: RecordingAnalyzeRequest, session_id: str, user_id: str):
    """Dual mode: structure transcript into Q&A → evaluate → update profile."""
    from backend.graphs.topic_drill import _parse_json_response
    from backend.llm_provider import get_langchain_llm
    from backend.prompts.recording import RECORDING_STRUCTURE_PROMPT, RECORDING_DUAL_EVAL_PROMPT
    from langchain_core.messages import SystemMessage

    llm = get_langchain_llm()

    # Step 1: LLM structures transcript into Q&A pairs
    structure_prompt = RECORDING_STRUCTURE_PROMPT.format(
        transcript=req.transcript[:8000],
    )
    response = llm.invoke([
        SystemMessage(content="你是面试记录分析引擎。只返回 JSON，不要其他内容。"),
        HumanMessage(content=structure_prompt),
    ])

    try:
        structured = _parse_json_response(response.content)
    except Exception:
        raise HTTPException(500, "录音结构化失败，LLM 返回格式异常。请重试。")

    qa_pairs = structured.get("qa_pairs", [])
    if not qa_pairs:
        raise HTTPException(400, "未能从录音中提取出有效的问答对。请检查转写文本。")

    # Convert to drill-compatible format
    questions = []
    answers = []
    for pair in qa_pairs:
        qid = pair.get("id", len(questions) + 1)
        questions.append({
            "id": qid,
            "question": pair["question"],
            "difficulty": 3,
            "focus_area": pair.get("focus_area", ""),
        })
        answers.append({
            "question_id": qid,
            "answer": pair.get("answer", ""),
        })

    # Create session
    create_session(session_id, mode="recording", questions=questions, user_id=user_id)

    # Step 2: Evaluate Q&A pairs (recording-specific prompt, no topic binding)
    qa_lines = []
    for q, a in zip(questions, answers):
        qa_lines.append(
            f"### Q{q['id']} ({q.get('focus_area', '')})\n"
            f"**题目**: {q['question']}\n**回答**: {a['answer']}"
        )

    eval_prompt = RECORDING_DUAL_EVAL_PROMPT.format(
        qa_pairs="\n\n".join(qa_lines),
    )
    eval_response = llm.invoke([
        SystemMessage(content="你是面试评估引擎。只返回 JSON，不要其他内容。"),
        HumanMessage(content=eval_prompt),
    ])

    try:
        eval_result = normalize_drill_evaluation_payload(_parse_json_response(eval_response.content), None).model_dump()
    except Exception:
        raise HTTPException(500, "评估失败，LLM 返回格式异常。请重试。")

    scores = eval_result.get("scores", [])
    overall = eval_result.get("overall", {})

    for s in scores:
        s.setdefault("difficulty", 3)

    # Step 3: Format review + save
    review = _format_drill_review(questions, answers, scores, overall)
    save_drill_answers(session_id, answers, user_id=user_id)
    auto_score = await _auto_score_interview(InterviewScoreRequest(
        mode="recording",
        topic=None,
        review=review,
        transcript=[],
    ), user_id)
    save_review(session_id, review, scores, overall.get("new_weak_points", []), overall, auto_score=auto_score, user_id=user_id)

    # Step 4: Update profile (topic=None, weak/strong points carry their own topic)
    await _update_recording_profile(overall, scores, len(questions), user_id)

    return {
        "session_id": session_id,
        "mode": "recording",
        "recording_mode": "dual",
        "review": review,
        "scores": scores,
        "overall": overall,
        "questions": questions,
        "answers": answers,
        "auto_score": auto_score,
    }


async def _analyze_solo(req: RecordingAnalyzeRequest, session_id: str, user_id: str):
    """Solo mode: holistic evaluation of candidate's technical expression."""
    from backend.graphs.topic_drill import _parse_json_response
    from backend.llm_provider import get_langchain_llm
    from backend.prompts.recording import RECORDING_SOLO_EVAL_PROMPT
    from langchain_core.messages import SystemMessage

    create_session(session_id, mode="recording", user_id=user_id)

    llm = get_langchain_llm()
    eval_prompt = RECORDING_SOLO_EVAL_PROMPT.format(
        transcript=req.transcript[:8000],
    )
    response = llm.invoke([
        SystemMessage(content="你是录音评估引擎。只返回 JSON，不要其他内容。"),
        HumanMessage(content=eval_prompt),
    ])

    try:
        eval_result = normalize_drill_evaluation_payload(_parse_json_response(response.content), None).model_dump()
    except Exception:
        raise HTTPException(500, "评估失败，LLM 返回格式异常。请重试。")

    topics_covered = eval_result.get("topics_covered", [])
    overall = eval_result.get("overall", {})

    # Format review
    review = _format_solo_review(topics_covered, overall)

    # Build scores-like structure for profile update
    scores = [
        {"question_id": t.get("id", i + 1), "score": t.get("score"), "difficulty": 3}
        for i, t in enumerate(topics_covered)
    ]

    # Save to DB
    auto_score = await _auto_score_interview(InterviewScoreRequest(
        mode="recording",
        topic=None,
        review=review,
        transcript=[],
    ), user_id)
    save_review(session_id, review, scores, overall.get("new_weak_points", []), overall, auto_score=auto_score, user_id=user_id)

    # Update profile (topic=None, points carry their own topic labels)
    await _update_recording_profile(overall, scores, max(len(topics_covered), 1), user_id)

    return {
        "session_id": session_id,
        "mode": "recording",
        "recording_mode": "solo",
        "review": review,
        "topics_covered": topics_covered,
        "overall": overall,
        "auto_score": auto_score,
    }


async def _update_recording_profile(overall: dict, scores: list, total_items: int, user_id: str):
    """Update profile from recording analysis — no single topic, points carry their own topic."""
    valid = []
    for s in scores:
        try:
            valid.append(float(s["score"]))
        except (TypeError, ValueError, KeyError):
            pass

    await llm_update_profile(
        mode="recording",
        topic=None,
        new_weak_points=overall.get("new_weak_points", []),
        new_strong_points=overall.get("new_strong_points", []),
        topic_mastery={},
        communication=overall.get("communication_observations", {}),
        user_id=user_id,
        thinking_patterns=overall.get("thinking_patterns"),
        session_summary=overall.get("summary", ""),
        avg_score=overall.get("avg_score"),
        answer_count=len(valid),
        session_weight=0.3,
        extraction_confidence=overall.get("confidence", 0.7),
    )


def _format_solo_review(topics_covered: list, overall: dict) -> str:
    """Format solo mode evaluation into a readable review."""
    lines = [f"## 整体评价\n\n{overall.get('summary', '')}\n\n**平均分: {overall.get('avg_score', '-')}/10**\n"]

    if topics_covered:
        lines.append("---\n\n## 涉及知识点\n")
        for t in topics_covered:
            score = t.get("score", "-")
            lines.append(f"### {t.get('topic', '未知')} — {score}/10")
            if t.get("assessment"):
                lines.append(f"**评价**: {t['assessment']}")
            if t.get("understanding"):
                lines.append(f"**理解程度**: {t['understanding']}")
            if t.get("errors"):
                lines.append(f"**错误**: {', '.join(t['errors'])}")
            if t.get("missing"):
                lines.append(f"**遗漏**: {', '.join(t['missing'])}")
            lines.append("")

    if overall.get("new_weak_points"):
        lines.append("---\n\n## 薄弱点")
        for wp in overall["new_weak_points"]:
            lines.append(f"- {wp.get('point', wp) if isinstance(wp, dict) else wp}")

    if overall.get("new_strong_points"):
        lines.append("\n## 亮点")
        for sp in overall["new_strong_points"]:
            lines.append(f"- {sp.get('point', sp) if isinstance(sp, dict) else sp}")

    return "\n".join(lines)


# ── Topics ──

@router.get("/topics")
def get_topics(user_id: str = Depends(get_current_user)):
    """List available drill topics (with name and icon)."""
    return load_topics(user_id)


@router.post("/topics")
def create_topic(body: dict, user_id: str = Depends(get_current_user)):
    """Add a new topic."""
    name = body.get("name", "").strip()
    icon = body.get("icon", "📝").strip()
    if not name:
        raise HTTPException(400, "name is required")

    # Auto-generate a short URL-safe key
    key = body.get("key", "").strip()
    if not key:
        key = uuid.uuid4().hex[:8]
    # Sanitize: only keep alphanumeric, hyphens, underscores
    key = re.sub(r'[^a-zA-Z0-9_-]', '', key)
    if not key:
        key = uuid.uuid4().hex[:8]

    topics = load_topics(user_id)
    if key in topics:
        raise HTTPException(409, f"Topic '{key}' already exists")

    dir_name = key
    topics[key] = {"name": name, "icon": icon, "dir": dir_name}
    save_topics(topics, user_id)

    # Create knowledge directory with README
    topic_dir = settings.user_knowledge_path(user_id) / dir_name
    topic_dir.mkdir(parents=True, exist_ok=True)
    readme = topic_dir / "README.md"
    if not readme.exists():
        readme.write_text(f"# {name}\n", encoding="utf-8")

    return {"ok": True, "key": key}


@router.delete("/topics/{key}")
def delete_topic(key: str, user_id: str = Depends(get_current_user)):
    """Remove a topic."""
    topics = load_topics(user_id)
    if key not in topics:
        raise HTTPException(404, f"Topic '{key}' not found")

    del topics[key]
    save_topics(topics, user_id)

    # Clear index cache
    _index_cache.pop((user_id, key), None)

    return {"ok": True}


# ── Profile ──

@router.get("/admin/settings")
def admin_get_settings(user_id: str = Depends(get_current_user)):
    """Return runtime-editable admin settings."""
    _ = user_id
    return load_runtime_settings().model_dump()


@router.put("/admin/settings")
def admin_update_settings(req: AdminSettingsRequest, user_id: str = Depends(get_current_user)):
    """Update runtime-editable admin settings."""
    _ = user_id
    updated = save_runtime_settings(AdminSettingsModel.model_validate(req.model_dump()))
    get_effective_settings()
    return {"ok": True, "settings": updated.model_dump()}


@router.get("/profile")
def get_user_profile(user_id: str = Depends(get_current_user)):
    """Get the user's accumulated interview profile."""
    return get_profile(user_id)


@router.delete("/profile")
def reset_user_profile(user_id: str = Depends(get_current_user)):
    """Reset only the accumulated profile/persona data, keeping session history intact."""
    from backend.memory import _save_profile
    _save_profile(json.loads(json.dumps(DEFAULT_PROFILE)), user_id)
    return {"ok": True}


@router.get("/profile/due-reviews")
def get_due_reviews_endpoint(topic: str = None, user_id: str = Depends(get_current_user)):
    """Get weak points due for spaced repetition review."""
    from backend.spaced_repetition import get_due_reviews as _get_due
    return _get_due(user_id, topic)


@router.get("/profile/topic/{topic}/history")
def get_topic_history(topic: str, user_id: str = Depends(get_current_user)):
    """Get session history for a specific topic."""
    sessions = list_sessions_by_topic(topic, user_id=user_id)
    return sessions


@router.post("/profile/topic/{topic}/retrospective")
async def generate_retrospective(topic: str, user_id: str = Depends(get_current_user)):
    """Generate a comprehensive retrospective for a topic based on all past sessions."""
    from backend.prompts.interviewer import TOPIC_RETROSPECTIVE_PROMPT
    from backend.memory import _load_profile, _save_profile
    from backend.llm_provider import get_langchain_llm
    from langchain_core.messages import SystemMessage, HumanMessage

    # Gather all sessions for this topic
    sessions = list_sessions_by_topic(topic, user_id=user_id)
    if not sessions:
        raise HTTPException(400, "该领域暂无训练记录")

    profile = _load_profile(user_id)
    topic_display = {k: v["name"] for k, v in load_topics(user_id).items()}
    topic_name = topic_display.get(topic, topic)
    mastery = profile.get("topic_mastery", {}).get(topic, {})

    # Format session history — only include answered questions
    history_lines = []
    for s in sessions:
        date = s["created_at"][:10]
        scores = s.get("scores", [])
        valid_scores = [sc for sc in scores if isinstance(sc.get("score"), (int, float))]
        avg = round(sum(sc["score"] for sc in valid_scores) / len(valid_scores), 1) if valid_scores else None

        # Summary section only (before per-question breakdown)
        review = s.get("review") or ""
        summary_part = review.split("## 逐题复盘")[0].strip()

        # Per-question scores — answered only
        score_lines = []
        for sc in valid_scores:
            line = f"- Q{sc.get('question_id', '?')}: {sc['score']}/10"
            if sc.get("assessment"):
                line += f" — {sc['assessment']}"
            score_lines.append(line)

        history_lines.append(
            f"### {date} (答题 {len(valid_scores)}/10, 平均 {avg or '无'}/10)\n"
            f"{summary_part}\n"
            + ("\n".join(score_lines) + "\n" if score_lines else "")
        )

    mastery_score = mastery.get("score", mastery.get("level", 0) * 20)
    mastery_text = f"{mastery_score}/100 — {mastery.get('notes', '')}" if mastery_score > 0 else "暂无评估"

    prompt = TOPIC_RETROSPECTIVE_PROMPT.format(
        topic_name=topic_name,
        session_history="\n".join(history_lines),
        mastery_info=mastery_text,
    )

    llm = get_langchain_llm()
    response = llm.invoke([
        SystemMessage(content="你是面试教练。用 markdown 生成回顾报告。"),
        HumanMessage(content=prompt),
    ])

    retrospective = response.content.strip()

    # Cache in profile
    profile.setdefault("topic_mastery", {}).setdefault(topic, {})["retrospective"] = retrospective
    profile["topic_mastery"][topic]["retrospective_at"] = datetime.now().isoformat()
    _save_profile(profile, user_id)

    return {
        "topic": topic,
        "topic_name": topic_name,
        "retrospective": retrospective,
        "session_count": len(sessions),
    }


# ── Interview ──

@router.post("/interview/start")
async def start_interview(req: StartInterviewRequest, user_id: str = Depends(get_current_user)):
    """Start a new interview session."""
    session_id = str(uuid.uuid4())[:8]

    if req.mode == InterviewMode.TOPIC_DRILL:
        # ── Drill mode: generate 10 questions upfront ──
        topics = load_topics(user_id)
        if not req.topic or req.topic not in topics:
            raise HTTPException(400, f"Invalid topic. Available: {list(topics.keys())}")

        try:
            questions = generate_drill_questions(
                req.topic,
                user_id,
                focus_keyword=req.focus_keyword,
                focus_label=req.focus_label,
            )
        except RuntimeError as e:
            raise HTTPException(500, str(e))
        create_session(session_id, req.mode.value, req.topic, questions=questions, user_id=user_id)
        _drill_sessions[session_id] = {
            "topic": req.topic,
            "questions": questions,
            "user_id": user_id,
            "focus_keyword": req.focus_keyword,
            "focus_label": req.focus_label,
        }

        return {
            "session_id": session_id,
            "mode": req.mode.value,
            "topic": req.topic,
            "questions": questions,
            "focus_keyword": req.focus_keyword,
            "focus_label": req.focus_label,
        }
    else:
        # ── Resume mode: LangGraph interactive interview ──
        graph = compile_resume_interview(user_id)
        initial_state = {}
        config = {"configurable": {"thread_id": session_id}}

        result = graph.invoke(initial_state, config)

        ai_message = ""
        for msg in reversed(result["messages"]):
            if isinstance(msg, AIMessage):
                ai_message = msg.content
                break

        create_session(session_id, req.mode.value, req.topic, user_id=user_id)
        append_message(session_id, "assistant", ai_message, user_id=user_id)
        _graphs[session_id] = {
            "graph": graph, "config": config,
            "mode": req.mode, "topic": req.topic,
            "user_id": user_id,
        }

        return {
            "session_id": session_id,
            "mode": req.mode.value,
            "topic": req.topic,
            "message": ai_message,
        }


@router.post("/interview/chat")
async def chat(req: ChatRequest, user_id: str = Depends(get_current_user)):
    """Send user answer, get next interviewer response (resume mode only)."""
    if req.session_id not in _graphs:
        raise HTTPException(404, "Session not found. It may have expired (in-memory only).")

    entry = _graphs[req.session_id]
    if entry.get("user_id") != user_id:
        raise HTTPException(403, "Access denied.")

    graph = entry["graph"]
    config = entry["config"]

    result = graph.invoke(
        {"messages": [HumanMessage(content=req.message)]},
        config,
    )

    append_message(req.session_id, "user", req.message, user_id=user_id)

    is_finished = False
    if isinstance(result, dict):
        is_finished = result.get("is_finished", False)
        phase = result.get("phase", "")
        if phase in (InterviewPhase.END.value, "end"):
            is_finished = True

    ai_message = ""
    for msg in reversed(result["messages"]):
        if isinstance(msg, AIMessage):
            ai_message = msg.content
            break

    append_message(req.session_id, "assistant", ai_message, user_id=user_id)

    return {
        "session_id": req.session_id,
        "message": ai_message,
        "is_finished": is_finished,
    }


@router.post("/interview/end/{session_id}")
async def end_interview(session_id: str, body: EndDrillRequest = None,
                        user_id: str = Depends(get_current_user)):
    """End interview → evaluate → generate review → update profile."""

    # ── Drill mode: batch evaluate ──
    if session_id in _drill_sessions:
        entry = _drill_sessions[session_id]
        if entry.get("user_id") != user_id:
            raise HTTPException(403, "Access denied.")

        topic = entry["topic"]
        questions = entry["questions"]
        answers = body.answers if body and body.answers else []

        # Save answers to SQLite
        save_drill_answers(session_id, answers, user_id=user_id)

        # Batch evaluate (1 LLM call)
        eval_result = evaluate_drill_answers(topic, questions, answers, user_id)
        scores = eval_result.get("scores", [])
        overall = eval_result.get("overall", {})

        # Attach difficulty from questions to scores (for mastery calculation)
        q_diff = {q["id"]: q.get("difficulty", 3) for q in questions}
        for s in scores:
            s.setdefault("difficulty", q_diff.get(s.get("question_id"), 3))

        scores = await _auto_score_drill_questions(topic, questions, answers, scores, user_id)
        overall = _merge_auto_weak_points_into_overall(topic, questions, scores, overall)
        overall["targeting_stats"] = _compute_drill_targeting_stats(
            topic,
            questions,
            scores,
            user_id,
            focus_keyword=entry.get("focus_keyword"),
            focus_label=entry.get("focus_label"),
        )

        # Generate review text from eval
        review = _format_drill_review(questions, answers, scores, overall)

        # Save to SQLite
        auto_score = await _auto_score_interview(InterviewScoreRequest(
            mode="topic_drill",
            topic=topic,
            review=review,
            transcript=[],
        ), user_id)
        save_review(session_id, review, scores, overall.get("new_weak_points", []), overall, auto_score=auto_score, user_id=user_id)

        # Update profile (1 LLM call via Mem0 pipeline — uses overall data)
        await _update_drill_profile(topic, overall, scores, len(questions), user_id)
        _track_weak_point_repairs(topic, overall.get("targeting_stats") or {}, user_id)

        # Update spaced repetition state for evaluated weak points
        from backend.spaced_repetition import update_weak_point_sr
        for s in scores:
            wp = s.get("weak_point")
            sc = s.get("score")
            detail = s.get("auto_score_detail") or {}
            if wp and isinstance(sc, (int, float)):
                update_weak_point_sr(topic, wp, sc, user_id)
            elif wp and isinstance(detail.get("total_score"), (int, float)):
                update_weak_point_sr(topic, wp, round(detail.get("total_score", 0) / 2.5, 1), user_id)

        del _drill_sessions[session_id]

        return {
            "session_id": session_id,
            "mode": "topic_drill",
            "review": review,
            "scores": scores,
            "overall": overall,
            "auto_score": auto_score,
        }

    # ── Resume mode: existing flow ──
    if session_id not in _graphs:
        raise HTTPException(404, "Session not found.")

    entry = _graphs[session_id]
    if entry.get("user_id") != user_id:
        raise HTTPException(403, "Access denied.")

    graph = entry["graph"]
    config = entry["config"]

    state = graph.get_state(config)
    messages = state.values.get("messages", [])
    scores = state.values.get("scores", [])
    weak_points = state.values.get("weak_points", [])
    eval_history = state.values.get("eval_history", [])
    topic_name = state.values.get("topic_name", entry.get("topic"))

    review = generate_review(
        mode=entry["mode"],
        messages=messages,
        scores=scores,
        weak_points=weak_points,
        topic=topic_name,
        eval_history=eval_history,
    )

    extraction = await update_profile_after_interview(
        mode=entry["mode"].value,
        topic=entry.get("topic"),
        messages=messages,
        user_id=user_id,
        scores=scores,
    )

    # Persist dimension_scores + avg_score into session for later review loading
    resume_overall = {}
    if extraction.get("dimension_scores"):
        resume_overall["dimension_scores"] = extraction["dimension_scores"]
    if extraction.get("avg_score"):
        resume_overall["avg_score"] = extraction["avg_score"]
    auto_score = await _auto_score_interview(InterviewScoreRequest(
        mode="resume",
        topic=entry.get("topic"),
        review=review,
        transcript=[{"role": "human" if isinstance(m, HumanMessage) else "assistant", "content": getattr(m, "content", "")} for m in messages if getattr(m, "content", None)],
    ), user_id)
    save_review(session_id, review, scores, weak_points, overall=resume_overall, auto_score=auto_score, user_id=user_id)

    del _graphs[session_id]

    return {
        "session_id": session_id,
        "mode": "resume",
        "review": review,
        "profile_update": {
            "new_weak_points": extraction.get("weak_points", []),
            "new_strong_points": extraction.get("strong_points", []),
            "session_summary": extraction.get("session_summary", ""),
        },
        "dimension_scores": extraction.get("dimension_scores"),
        "avg_score": extraction.get("avg_score"),
        "auto_score": auto_score,
    }


def _format_drill_review(questions, answers, scores, overall) -> str:
    """Format drill evaluation into a readable review string."""
    answer_map = {a["question_id"]: a["answer"] for a in answers}
    score_map = {s["question_id"]: s for s in scores}

    lines = [f"## 整体评价\n\n{overall.get('summary', '')}\n\n**平均分: {overall.get('avg_score', '-')}/10**\n"]

    lines.append("---\n\n## 逐题复盘\n")
    for q in questions:
        qid = q["id"]
        s = score_map.get(qid, {})
        answer = answer_map.get(qid, "")

        # Unanswered: one-line summary only
        if not answer:
            lines.append(f"### Q{qid} ({q.get('focus_area', '')}) — 未作答")
            lines.append(f"**题目**: {q['question']}\n")
            continue

        score = s.get("score", "-")
        assessment = s.get("assessment", "")
        understanding = s.get("understanding", "")
        missing = s.get("key_missing", [])

        lines.append(f"### Q{qid} ({q.get('focus_area', '')}) — {score}/10")
        lines.append(f"**题目**: {q['question']}")
        lines.append(f"**你的回答**: {answer}")
        if assessment:
            lines.append(f"**点评**: {assessment}")
        improvement = s.get("improvement", "")
        if improvement:
            lines.append(f"**改进建议**: {improvement}")
        if understanding:
            lines.append(f"**理解程度**: {understanding}")
        if missing:
            lines.append(f"**遗漏关键点**: {', '.join(missing)}")
        lines.append("")

    if overall.get("new_weak_points"):
        lines.append("---\n\n## 薄弱点")
        for wp in overall["new_weak_points"]:
            lines.append(f"- {wp.get('point', wp) if isinstance(wp, dict) else wp}")

    if overall.get("new_strong_points"):
        lines.append("\n## 亮点")
        for sp in overall["new_strong_points"]:
            lines.append(f"- {sp.get('point', sp) if isinstance(sp, dict) else sp}")

    return "\n".join(lines)


async def _update_drill_profile(topic: str, overall: dict, scores: list,
                                total_questions: int, user_id: str):
    """Update profile from drill evaluation — Mem0-style LLM update."""
    # Compute mastery score (0-100) from per-question scores + difficulty
    valid = []
    for s in scores:
        try:
            valid.append((float(s["score"]), float(s.get("difficulty", 3))))
        except (TypeError, ValueError, KeyError):
            pass
    mastery = overall.get("topic_mastery", {})
    coverage = len(valid) / total_questions if total_questions else 0
    session_weight = coverage * 0.4  # 1/10 answered → 0.04, 10/10 → 0.4

    if valid:
        # contribution = (difficulty/5) × (score/10), unanswered = 0
        contributions = [(d / 5) * (s / 10) for s, d in valid]
        mastery["score"] = round(sum(contributions) / total_questions * 100, 1)
    mastery.pop("level", None)  # migrate away from old Lv1-5

    await llm_update_profile(
        mode="topic_drill",
        topic=topic,
        new_weak_points=overall.get("new_weak_points", []),
        new_strong_points=overall.get("new_strong_points", []),
        topic_mastery=mastery,
        communication=overall.get("communication_observations", {}),
        user_id=user_id,
        thinking_patterns=overall.get("thinking_patterns"),
        session_summary=overall.get("summary", ""),
        avg_score=overall.get("avg_score"),
        answer_count=len(scores),
        session_weight=session_weight,
    )


# ── Knowledge management endpoints ──

@router.get("/knowledge/{topic}/core")
async def get_core_knowledge(topic: str, user_id: str = Depends(get_current_user)):
    """List core knowledge files for a topic."""
    topics = load_topics(user_id)
    if topic not in topics:
        raise HTTPException(400, f"Unknown topic: {topic}")
    topic_dir = settings.user_knowledge_path(user_id) / topics[topic]["dir"]
    if not topic_dir.exists():
        return []
    files = []
    for f in sorted(topic_dir.glob("*.md")):
        files.append({"filename": f.name, "content": f.read_text(encoding="utf-8")})
    return files


@router.post("/knowledge/query-hints")
async def knowledge_query_hints(body: QueryHintsRequest, user_id: str = Depends(get_current_user)):
    return build_query_hints(body.query)


@router.put("/knowledge/{topic}/core/{filename}")
async def update_core_knowledge(topic: str, filename: str, body: dict,
                                user_id: str = Depends(get_current_user)):
    """Update a core knowledge file."""
    topics = load_topics(user_id)
    if topic not in topics:
        raise HTTPException(400, f"Unknown topic: {topic}")
    topic_dir = settings.user_knowledge_path(user_id) / topics[topic]["dir"]
    filepath = topic_dir / filename
    if not filepath.exists():
        raise HTTPException(404, f"File not found: {filename}")
    filepath.write_text(body.get("content", ""), encoding="utf-8")
    # Clear index cache so next retrieval rebuilds
    _index_cache.pop((user_id, topic), None)
    return {"ok": True}


@router.delete("/knowledge/{topic}/core/{filename}")
async def delete_core_knowledge(topic: str, filename: str,
                                user_id: str = Depends(get_current_user)):
    """Delete a core knowledge file."""
    topics = load_topics(user_id)
    if topic not in topics:
        raise HTTPException(400, f"Unknown topic: {topic}")
    topic_dir = settings.user_knowledge_path(user_id) / topics[topic]["dir"]
    filepath = topic_dir / filename
    if not filepath.exists():
        raise HTTPException(404, f"File not found: {filename}")
    filepath.unlink()
    _index_cache.pop((user_id, topic), None)
    return {"ok": True}


@router.post("/knowledge/{topic}/core")
async def create_core_knowledge(topic: str, body: dict,
                                user_id: str = Depends(get_current_user)):
    """Create a new core knowledge file."""
    topics = load_topics(user_id)
    if topic not in topics:
        raise HTTPException(400, f"Unknown topic: {topic}")
    filename = body.get("filename", "").strip()
    if not filename or not filename.endswith(".md"):
        raise HTTPException(400, "Filename must end with .md")
    topic_dir = settings.user_knowledge_path(user_id) / topics[topic]["dir"]
    topic_dir.mkdir(parents=True, exist_ok=True)
    filepath = topic_dir / filename
    if filepath.exists():
        raise HTTPException(409, f"File already exists: {filename}")
    filepath.write_text(body.get("content", ""), encoding="utf-8")
    _index_cache.pop((user_id, topic), None)
    return {"ok": True, "filename": filename}


@router.post("/knowledge/{topic}/generate")
async def generate_core_knowledge(topic: str, user_id: str = Depends(get_current_user)):
    """Use LLM to generate foundational knowledge content for a topic."""
    topics = load_topics(user_id)
    if topic not in topics:
        raise HTTPException(400, f"Unknown topic: {topic}")
    from backend.llm_provider import get_langchain_llm
    from langchain_core.messages import SystemMessage, HumanMessage

    topic_name = topics[topic].get("name", topic)

    llm = get_langchain_llm()
    resp = llm.invoke([
        SystemMessage(content="你是一位资深技术面试官，擅长梳理技术领域的核心知识体系。"),
        HumanMessage(content=(
            f"请为「{topic_name}」这个技术领域生成一份核心知识梳理，作为面试出题和评分的参考依据。\n\n"
            "要求：\n"
            "- 用 Markdown 格式\n"
            "- 以 `# {topic_name}` 作为标题\n"
            "- 列出该领域最核心的 8-12 个知识点，每个用二级标题\n"
            "- 每个知识点下用简洁的要点说明关键概念、原理、常见面试考点\n"
            "- 重点覆盖：核心概念、工作原理、最佳实践、常见陷阱\n"
            "- 保持简洁实用，面向面试准备场景\n"
            "- 直接输出 Markdown 内容，不要包裹在代码块中"
        )),
    ])
    content = resp.content.strip()

    topic_dir = settings.user_knowledge_path(user_id) / topics[topic]["dir"]
    topic_dir.mkdir(parents=True, exist_ok=True)
    readme = topic_dir / "README.md"
    readme.write_text(content, encoding="utf-8")
    _index_cache.pop((user_id, topic), None)

    return {"ok": True, "content": content}


@router.get("/knowledge/{topic}/high_freq")
async def get_high_freq(topic: str, user_id: str = Depends(get_current_user)):
    """Get high-frequency question bank for a topic."""
    topics = load_topics(user_id)
    if topic not in topics:
        raise HTTPException(400, f"Unknown topic: {topic}")
    filepath = settings.user_high_freq_path(user_id) / f"{topic}.md"
    if not filepath.exists():
        return {"content": ""}
    return {"content": filepath.read_text(encoding="utf-8")}


@router.put("/knowledge/{topic}/high_freq")
async def update_high_freq(topic: str, body: dict, user_id: str = Depends(get_current_user)):
    """Update high-frequency question bank for a topic."""
    topics = load_topics(user_id)
    if topic not in topics:
        raise HTTPException(400, f"Unknown topic: {topic}")
    hf_dir = settings.user_high_freq_path(user_id)
    hf_dir.mkdir(parents=True, exist_ok=True)
    filepath = hf_dir / f"{topic}.md"
    filepath.write_text(body.get("content", ""), encoding="utf-8")
    return {"ok": True}


# ── Graph ──

@router.get("/graph/{topic}")
def get_topic_graph(topic: str, user_id: str = Depends(get_current_user)):
    """Build question relationship graph for a topic."""
    return build_graph(topic, user_id)


# ── Reference answer ──

@router.post("/interview/score")
async def score_interview_answer(req: InterviewScoreRequest, user_id: str = Depends(get_current_user)):
    """Auto-score a single answer or a session review summary and auto-link low scores to mistake book."""
    try:
        return await _auto_score_interview(req, user_id)
    except Exception as e:
        raise HTTPException(500, f"自动评分失败: {e}")


@router.post("/interview/reference-answer")
async def generate_reference_answer(body: dict, user_id: str = Depends(get_current_user)):
    """Generate or fetch a persisted reference answer for a specific review question."""
    session_id = (body.get("session_id") or "").strip()
    topic = (body.get("topic") or "").strip()
    question = (body.get("question") or "").strip()
    question_id = body.get("question_id")
    force_regenerate = bool(body.get("force_regenerate"))
    if not session_id or not topic or not question:
        raise HTTPException(400, "session_id, topic and question are required")

    session = get_session(session_id, user_id=user_id)
    if not session:
        raise HTTPException(404, "Session not found.")

    from backend.indexer import retrieve_topic_context
    from backend.llm_provider import get_langchain_llm
    from backend.prompts.interviewer import REFERENCE_ANSWER_PROMPT
    from langchain_core.messages import HumanMessage

    key = _reference_answer_key(question_id=question_id, question=question)
    existing = (session.get("reference_answers") or {}).get(key)
    if existing and not force_regenerate:
        return {
            "reference_answer": existing.get("reference_answer", ""),
            "cached": True,
            "generated_at": existing.get("generated_at"),
            "question_key": key,
            "knowledge_refs": existing.get("knowledge_refs", []),
            "model": existing.get("model"),
        }

    topics = load_topics(user_id)
    topic_name = topics.get(topic, {}).get("name", topic)

    refs = retrieve_topic_context(topic, question, user_id, top_k=3)
    knowledge_context = "\n\n".join(refs) if refs else "（暂无参考材料）"

    prompt = REFERENCE_ANSWER_PROMPT.format(
        topic_name=topic_name,
        question=question,
        knowledge_context=knowledge_context,
    )

    llm = get_langchain_llm()
    resp = llm.invoke([HumanMessage(content=prompt)])
    answer = resp.content.strip()
    payload = {
        "question": question,
        "question_id": question_id,
        "reference_answer": answer,
        "knowledge_refs": refs,
        "generated_at": datetime.now().isoformat(),
        "model": settings.model,
        "version": 1,
    }
    upsert_reference_answer(session_id, key, payload, user_id=user_id)
    return {
        "reference_answer": answer,
        "cached": False,
        "generated_at": payload["generated_at"],
        "question_key": key,
        "knowledge_refs": refs,
        "model": settings.model,
    }


@router.post("/interview/reference-answer/followup")
async def followup_reference_answer(body: dict, user_id: str = Depends(get_current_user)):
    """Temporary coaching follow-up for a persisted reference answer. Does not overwrite the standard answer."""
    session_id = (body.get("session_id") or "").strip()
    topic = (body.get("topic") or "").strip()
    question = (body.get("question") or "").strip()
    followup = (body.get("followup") or "").strip()
    question_id = body.get("question_id")
    reference_answer = (body.get("reference_answer") or "").strip()
    if not session_id or not topic or not question or not followup:
        raise HTTPException(400, "session_id, topic, question and followup are required")

    session = get_session(session_id, user_id=user_id)
    if not session:
        raise HTTPException(404, "Session not found.")

    key = _reference_answer_key(question_id=question_id, question=question)
    stored = (session.get("reference_answers") or {}).get(key) or {}
    effective_reference_answer = reference_answer or stored.get("reference_answer", "")
    if not effective_reference_answer:
        raise HTTPException(400, "reference answer not found, generate it first")

    from backend.indexer import retrieve_topic_context
    from backend.llm_provider import get_langchain_llm
    from backend.prompts.interviewer import REFERENCE_ANSWER_FOLLOWUP_PROMPT
    from langchain_core.messages import HumanMessage

    topics = load_topics(user_id)
    topic_name = topics.get(topic, {}).get("name", topic)
    refs = stored.get("knowledge_refs") or retrieve_topic_context(topic, question, user_id, top_k=3)
    knowledge_context = "\n\n".join(refs) if refs else "（暂无参考材料）"

    prompt = REFERENCE_ANSWER_FOLLOWUP_PROMPT.format(
        topic_name=topic_name,
        question=question,
        reference_answer=effective_reference_answer,
        knowledge_context=knowledge_context,
        followup=followup,
    )

    llm = get_langchain_llm()
    resp = llm.invoke([HumanMessage(content=prompt)])
    answer = resp.content.strip()
    item = {
        "question": question,
        "question_id": question_id,
        "followup": followup,
        "answer": answer,
        "created_at": datetime.now().isoformat(),
        "model": settings.model,
    }
    append_reference_followup(session_id, key, item, user_id=user_id)
    return {
        "answer": answer,
        "question_key": key,
        "reference_generated_at": stored.get("generated_at"),
        "history": (session.get("reference_followups") or {}).get(key, []) + [item],
    }


@router.post("/interview/reference-answer/improved")
async def generate_improved_answer(body: dict, user_id: str = Depends(get_current_user)):
    """Generate and persist an improved candidate-style answer from original answer + reference answer + followup thread."""
    session_id = (body.get("session_id") or "").strip()
    topic = (body.get("topic") or "").strip()
    question = (body.get("question") or "").strip()
    original_answer = (body.get("original_answer") or "").strip()
    question_id = body.get("question_id")
    force_regenerate = bool(body.get("force_regenerate"))
    if not session_id or not topic or not question:
        raise HTTPException(400, "session_id, topic and question are required")

    session = get_session(session_id, user_id=user_id)
    if not session:
        raise HTTPException(404, "Session not found.")

    key = _reference_answer_key(question_id=question_id, question=question)
    existing = (session.get("improved_answers") or {}).get(key)
    if existing and not force_regenerate:
        return {
            "improved_answer": existing.get("improved_answer", ""),
            "cached": True,
            "generated_at": existing.get("generated_at"),
            "question_key": key,
            "model": existing.get("model"),
        }

    stored = (session.get("reference_answers") or {}).get(key) or {}
    reference_answer = (body.get("reference_answer") or "").strip() or stored.get("reference_answer", "")
    if not reference_answer:
        raise HTTPException(400, "reference answer not found, generate it first")

    from backend.indexer import retrieve_topic_context
    from backend.llm_provider import get_langchain_llm
    from backend.prompts.interviewer import IMPROVED_ANSWER_PROMPT
    from langchain_core.messages import HumanMessage

    topics = load_topics(user_id)
    topic_name = topics.get(topic, {}).get("name", topic)
    refs = stored.get("knowledge_refs") or retrieve_topic_context(topic, question, user_id, top_k=3)
    knowledge_context = "\n\n".join(refs) if refs else "（暂无参考材料）"
    history = (session.get("reference_followups") or {}).get(key, [])
    history_text = "\n\n".join([
        f"用户追问：{item.get('followup', '')}\nAI回答：{item.get('answer', '')}" for item in history
    ]) or "（暂无后续辅导对话）"

    prompt = IMPROVED_ANSWER_PROMPT.format(
        topic_name=topic_name,
        question=question,
        original_answer=original_answer or "（候选人原始回答为空）",
        reference_answer=reference_answer,
        followup_history=history_text,
        knowledge_context=knowledge_context,
    )

    llm = get_langchain_llm()
    resp = llm.invoke([HumanMessage(content=prompt)])
    improved_answer = resp.content.strip()
    payload = {
        "question": question,
        "question_id": question_id,
        "original_answer": original_answer,
        "improved_answer": improved_answer,
        "generated_at": datetime.now().isoformat(),
        "model": settings.model,
        "version": 1,
    }
    upsert_improved_answer(session_id, key, payload, user_id=user_id)
    return {
        "improved_answer": improved_answer,
        "cached": False,
        "generated_at": payload["generated_at"],
        "question_key": key,
        "model": settings.model,
    }


# ── History ──

@router.get("/interview/review/{session_id}")
async def get_review(session_id: str, user_id: str = Depends(get_current_user)):
    """Get review for a completed session."""
    session = get_session(session_id, user_id=user_id)
    if not session:
        raise HTTPException(404, "Session not found.")
    if not session.get("review"):
        raise HTTPException(400, "Interview not yet reviewed.")
    if not session.get("auto_score") and session.get("review"):
        try:
            session["auto_score"] = await _auto_score_interview(InterviewScoreRequest(
                mode=session.get("mode") or "resume",
                topic=session.get("topic"),
                review=session.get("review") or "",
                transcript=session.get("transcript") or [],
            ), user_id)
            save_review(
                session_id,
                session.get("review") or "",
                session.get("scores") or [],
                session.get("weak_points") or [],
                session.get("overall") or {},
                auto_score=session.get("auto_score"),
                user_id=user_id,
            )
        except Exception:
            session["auto_score"] = {}
    return session


@router.get("/interview/history")
async def get_history(
    limit: int = 20,
    offset: int = 0,
    mode: str = None,
    topic: str = None,
    user_id: str = Depends(get_current_user),
):
    """List past interview sessions with filtering and pagination."""
    return list_sessions(user_id=user_id, limit=limit, offset=offset, mode=mode, topic=topic)


@router.delete("/interview/session/{session_id}")
async def delete_session_endpoint(session_id: str, user_id: str = Depends(get_current_user)):
    """Delete a session record."""
    deleted = delete_session(session_id, user_id=user_id)
    if not deleted:
        raise HTTPException(404, "Session not found.")
    return {"ok": True}


@router.get("/interview/topics")
async def get_interview_topics(user_id: str = Depends(get_current_user)):
    """List distinct topics from completed sessions (for filter dropdown)."""
    return list_distinct_topics(user_id=user_id)


app.include_router(router)
