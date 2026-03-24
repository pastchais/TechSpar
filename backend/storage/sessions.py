"""面试记录持久化 (SQLite)."""
import json
import sqlite3
from datetime import datetime
from pathlib import Path

from backend.config import settings
from backend.query_hints import build_query_hints

DB_PATH = settings.db_path


def _collect_session_semantic_buckets(overall: dict, weak_points: list, scores: list) -> list[str]:
    buckets: list[str] = []
    seen: set[str] = set()

    def add(bucket: str | None):
        if not bucket or bucket in seen:
            return
        seen.add(bucket)
        buckets.append(bucket)

    for item in (overall.get("targeting_stats", {}).get("strategy_snapshot", []) or []):
        add(item.get("semantic_bucket"))
        for b in item.get("semantic_buckets", []) or []:
            add(b)
    for item in (overall.get("targeting_stats", {}).get("matched_items", []) or []):
        add(item.get("semantic_bucket"))
        for b in item.get("semantic_buckets", []) or []:
            add(b)
    for item in weak_points or []:
        if isinstance(item, dict):
            add(item.get("semantic_bucket"))
            for b in item.get("semantic_buckets", []) or []:
                add(b)
        elif isinstance(item, str):
            hints = build_query_hints(item)
            add(hints.get("semantic_bucket"))
            for b in hints.get("semantic_buckets", []) or []:
                add(b)
    for item in scores or []:
        if not isinstance(item, dict):
            continue
        add(item.get("semantic_bucket"))
        for b in item.get("semantic_buckets", []) or []:
            add(b)
        if item.get("weak_point"):
            hints = build_query_hints(item.get("weak_point"))
            add(hints.get("semantic_bucket"))
            for b in hints.get("semantic_buckets", []) or []:
                add(b)
    return buckets[:8]


def _get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            mode TEXT NOT NULL,
            topic TEXT,
            questions TEXT DEFAULT '[]',
            transcript TEXT DEFAULT '[]',
            scores TEXT DEFAULT '[]',
            weak_points TEXT DEFAULT '[]',
            overall TEXT DEFAULT '{}',
            auto_score TEXT DEFAULT '{}',
            reference_answers TEXT DEFAULT '{}',
            reference_followups TEXT DEFAULT '{}',
            improved_answers TEXT DEFAULT '{}',
            review TEXT,
            user_id TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Migrate: add columns if missing (existing DBs)
    for col, default in [("questions", "'[]'"), ("overall", "'{}'"), ("auto_score", "'{}'"), ("reference_answers", "'{}'"), ("reference_followups", "'{}'"), ("improved_answers", "'{}'"), ("user_id", "NULL")]:
        try:
            conn.execute(f"SELECT {col} FROM sessions LIMIT 1")
        except sqlite3.OperationalError:
            conn.execute(f"ALTER TABLE sessions ADD COLUMN {col} TEXT DEFAULT {default}")
    conn.commit()
    return conn


def create_session(session_id: str, mode: str, topic: str | None = None,
                   questions: list | None = None, *, user_id: str):
    conn = _get_conn()
    conn.execute(
        "INSERT INTO sessions (session_id, mode, topic, questions, user_id) VALUES (?, ?, ?, ?, ?)",
        (session_id, mode, topic, json.dumps(questions or [], ensure_ascii=False), user_id),
    )
    conn.commit()
    conn.close()


def append_message(session_id: str, role: str, content: str, *, user_id: str):
    conn = _get_conn()
    row = conn.execute(
        "SELECT transcript FROM sessions WHERE session_id = ? AND user_id = ?",
        (session_id, user_id),
    ).fetchone()
    if not row:
        conn.close()
        return
    transcript = json.loads(row["transcript"])
    transcript.append({"role": role, "content": content, "time": datetime.now().isoformat()})
    conn.execute(
        "UPDATE sessions SET transcript = ?, updated_at = CURRENT_TIMESTAMP WHERE session_id = ? AND user_id = ?",
        (json.dumps(transcript, ensure_ascii=False), session_id, user_id),
    )
    conn.commit()
    conn.close()


def save_drill_answers(session_id: str, answers: list[dict], *, user_id: str):
    """Save drill answers into transcript as Q&A pairs."""
    conn = _get_conn()
    row = conn.execute(
        "SELECT questions FROM sessions WHERE session_id = ? AND user_id = ?",
        (session_id, user_id),
    ).fetchone()
    if not row:
        conn.close()
        return
    questions = json.loads(row["questions"])
    answer_map = {a["question_id"]: a["answer"] for a in answers}

    transcript = []
    for q in questions:
        transcript.append({"role": "assistant", "content": q["question"], "time": datetime.now().isoformat()})
        answer = answer_map.get(q["id"], "")
        if answer:
            transcript.append({"role": "user", "content": answer, "time": datetime.now().isoformat()})

    conn.execute(
        "UPDATE sessions SET transcript = ?, updated_at = CURRENT_TIMESTAMP WHERE session_id = ? AND user_id = ?",
        (json.dumps(transcript, ensure_ascii=False), session_id, user_id),
    )
    conn.commit()
    conn.close()


def save_review(session_id: str, review: str, scores: list = None,
                weak_points: list = None, overall: dict = None, auto_score: dict = None,
                reference_answers: dict | None = None, *, user_id: str):
    conn = _get_conn()
    if reference_answers is None:
        conn.execute(
            "UPDATE sessions SET review = ?, scores = ?, weak_points = ?, overall = ?, auto_score = ?, updated_at = CURRENT_TIMESTAMP "
            "WHERE session_id = ? AND user_id = ?",
            (review, json.dumps(scores or [], ensure_ascii=False),
             json.dumps(weak_points or [], ensure_ascii=False),
             json.dumps(overall or {}, ensure_ascii=False),
             json.dumps(auto_score or {}, ensure_ascii=False),
             session_id, user_id),
        )
    else:
        conn.execute(
            "UPDATE sessions SET review = ?, scores = ?, weak_points = ?, overall = ?, auto_score = ?, reference_answers = ?, updated_at = CURRENT_TIMESTAMP "
            "WHERE session_id = ? AND user_id = ?",
            (review, json.dumps(scores or [], ensure_ascii=False),
             json.dumps(weak_points or [], ensure_ascii=False),
             json.dumps(overall or {}, ensure_ascii=False),
             json.dumps(auto_score or {}, ensure_ascii=False),
             json.dumps(reference_answers or {}, ensure_ascii=False),
             session_id, user_id),
        )
    conn.commit()
    conn.close()


def upsert_reference_answer(session_id: str, question_key: str, payload: dict, *, user_id: str):
    conn = _get_conn()
    row = conn.execute(
        "SELECT reference_answers FROM sessions WHERE session_id = ? AND user_id = ?",
        (session_id, user_id),
    ).fetchone()
    if not row:
        conn.close()
        return
    current = json.loads(row["reference_answers"] or "{}")
    current[question_key] = payload
    conn.execute(
        "UPDATE sessions SET reference_answers = ?, updated_at = CURRENT_TIMESTAMP WHERE session_id = ? AND user_id = ?",
        (json.dumps(current, ensure_ascii=False), session_id, user_id),
    )
    conn.commit()
    conn.close()


def append_reference_followup(session_id: str, question_key: str, item: dict, *, user_id: str):
    conn = _get_conn()
    row = conn.execute(
        "SELECT reference_followups FROM sessions WHERE session_id = ? AND user_id = ?",
        (session_id, user_id),
    ).fetchone()
    if not row:
        conn.close()
        return
    current = json.loads(row["reference_followups"] or "{}")
    items = list(current.get(question_key) or [])
    items.append(item)
    current[question_key] = items
    conn.execute(
        "UPDATE sessions SET reference_followups = ?, updated_at = CURRENT_TIMESTAMP WHERE session_id = ? AND user_id = ?",
        (json.dumps(current, ensure_ascii=False), session_id, user_id),
    )
    conn.commit()
    conn.close()


def upsert_improved_answer(session_id: str, question_key: str, payload: dict, *, user_id: str):
    conn = _get_conn()
    row = conn.execute(
        "SELECT improved_answers FROM sessions WHERE session_id = ? AND user_id = ?",
        (session_id, user_id),
    ).fetchone()
    if not row:
        conn.close()
        return
    current = json.loads(row["improved_answers"] or "{}")
    current[question_key] = payload
    conn.execute(
        "UPDATE sessions SET improved_answers = ?, updated_at = CURRENT_TIMESTAMP WHERE session_id = ? AND user_id = ?",
        (json.dumps(current, ensure_ascii=False), session_id, user_id),
    )
    conn.commit()
    conn.close()


def get_session(session_id: str, *, user_id: str) -> dict | None:
    conn = _get_conn()
    row = conn.execute(
        "SELECT * FROM sessions WHERE session_id = ? AND user_id = ?",
        (session_id, user_id),
    ).fetchone()
    conn.close()
    if not row:
        return None
    result = dict(row)
    result["transcript"] = json.loads(result["transcript"])
    result["questions"] = json.loads(result.get("questions", "[]"))
    result["scores"] = json.loads(result["scores"])
    result["weak_points"] = json.loads(result["weak_points"])
    result["overall"] = json.loads(result.get("overall", "{}") or "{}")
    result["auto_score"] = json.loads(result.get("auto_score", "{}") or "{}")
    result["reference_answers"] = json.loads(result.get("reference_answers", "{}") or "{}")
    result["reference_followups"] = json.loads(result.get("reference_followups", "{}") or "{}")
    result["improved_answers"] = json.loads(result.get("improved_answers", "{}") or "{}")
    return result


def list_sessions_by_topic(topic: str, *, user_id: str, limit: int = 50) -> list[dict]:
    """Get all sessions for a topic with reviews and scores."""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT session_id, mode, topic, review, scores, created_at FROM sessions "
        "WHERE topic = ? AND user_id = ? AND review IS NOT NULL ORDER BY created_at ASC LIMIT ?",
        (topic, user_id, limit),
    ).fetchall()
    conn.close()
    results = []
    for r in rows:
        results.append({
            "session_id": r["session_id"],
            "review": r["review"],
            "scores": json.loads(r["scores"]) if r["scores"] else [],
            "created_at": r["created_at"],
        })
    return results


def list_sessions(
    *, user_id: str,
    limit: int = 20,
    offset: int = 0,
    mode: str | None = None,
    topic: str | None = None,
) -> dict:
    conn = _get_conn()

    where = ["review IS NOT NULL", "user_id = ?"]
    params: list = [user_id]
    if mode:
        where.append("mode = ?")
        params.append(mode)
    if topic:
        where.append("topic = ?")
        params.append(topic)
    where_sql = " AND ".join(where)

    total = conn.execute(
        f"SELECT COUNT(*) FROM sessions WHERE {where_sql}", params,
    ).fetchone()[0]

    rows = conn.execute(
        f"SELECT session_id, mode, topic, created_at, overall, weak_points, scores FROM sessions "
        f"WHERE {where_sql} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        params + [limit, offset],
    ).fetchall()
    conn.close()

    items = []
    for r in rows:
        overall = json.loads(r["overall"] or "{}")
        weak_points = json.loads(r["weak_points"] or "[]")
        scores = json.loads(r["scores"] or "[]")
        targeting = (overall.get("targeting_stats") or {}) if isinstance(overall, dict) else {}
        strategy_meta = (overall.get("strategy_meta_review") or {}) if isinstance(overall, dict) else {}
        items.append({
            "session_id": r["session_id"],
            "mode": r["mode"],
            "topic": r["topic"],
            "created_at": r["created_at"],
            "avg_score": overall.get("avg_score"),
            "semantic_buckets": _collect_session_semantic_buckets(overall, weak_points, scores),
            "focus_label": targeting.get("focus_label"),
            "focus_keyword": targeting.get("focus_keyword"),
            "focus_hit_count": targeting.get("focus_hit_count"),
            "focus_hit_rate": targeting.get("focus_hit_rate"),
            "front3_focus_hits": targeting.get("front3_focus_hits"),
            "strategy_verdict": strategy_meta.get("verdict"),
            "strategy_verdict_level": strategy_meta.get("verdict_level"),
            "strategy_next_action": strategy_meta.get("next_action"),
            "strategy_trend_label": strategy_meta.get("trend_label"),
        })
    return {"items": items, "total": total}


def delete_session(session_id: str, *, user_id: str) -> bool:
    conn = _get_conn()
    cursor = conn.execute(
        "DELETE FROM sessions WHERE session_id = ? AND user_id = ?",
        (session_id, user_id),
    )
    conn.commit()
    conn.close()
    return cursor.rowcount > 0


def list_distinct_topics(*, user_id: str) -> list[str]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT DISTINCT topic FROM sessions "
        "WHERE topic IS NOT NULL AND review IS NOT NULL AND user_id = ? ORDER BY topic",
        (user_id,),
    ).fetchall()
    conn.close()
    return [r["topic"] for r in rows]
