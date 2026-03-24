"""间隔重复系统 — SM-2 算法。

为每个薄弱点维护复习调度：
- 答对了 → 间隔拉长（1天 → 3天 → 7天 → ...）
- 答错了 → 间隔重置到 1 天
- 每次出题时优先出"到期需要复习"的知识点
"""
from datetime import date, timedelta, datetime

from backend.memory import _load_profile, _save_profile


def sm2_update(sr_state: dict, score_0_10: float) -> dict:
    """SM-2 algorithm update.

    Args:
        sr_state: Current spaced repetition state {interval_days, ease_factor, repetitions, ...}
        score_0_10: Score on 0-10 scale (mapped to SM-2 quality 0-5)

    Returns:
        Updated SR state dict
    """
    # Map 0-10 to SM-2 quality 0-5
    quality = min(5, int(score_0_10 / 2))
    ef = sr_state.get("ease_factor", 2.5)
    reps = sr_state.get("repetitions", 0)

    if quality >= 3:  # Pass
        if reps == 0:
            interval = 1
        elif reps == 1:
            interval = 3
        else:
            interval = int(sr_state.get("interval_days", 1) * ef)
        reps += 1
    else:  # Fail — reset
        interval = 1
        reps = 0

    # Update ease factor (never below 1.3)
    ef = max(1.3, ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))

    return {
        "interval_days": interval,
        "ease_factor": round(ef, 2),
        "repetitions": reps,
        "next_review": (date.today() + timedelta(days=interval)).isoformat(),
        "last_score": score_0_10,
    }


def _priority_score(wp: dict) -> float:
    sr = wp.get("sr", {})
    ease = float(sr.get("ease_factor", 2.5) or 2.5)
    last_score = sr.get("last_score")
    last_score = float(last_score) if isinstance(last_score, (int, float)) else 5.0
    times_seen = int(wp.get("times_seen", 1) or 1)
    streak = int(wp.get("recent_low_streak", 0) or 0)
    review_count = int(wp.get("review_count", 0) or 0)
    days_overdue = 0
    try:
        next_review = sr.get("next_review")
        if next_review:
            days_overdue = max(0, (date.today() - date.fromisoformat(next_review)).days)
    except Exception:
        days_overdue = 0

    # 越高越该优先复习
    return (
        streak * 3.0
        + max(0, 6.0 - last_score) * 1.6
        + max(0, 2.6 - ease) * 2.0
        + min(times_seen, 6) * 0.7
        + min(days_overdue, 14) * 0.35
        - min(review_count, 10) * 0.15
    )


def get_due_reviews(user_id: str, topic: str = None) -> list[dict]:
    """Get weak points that are due for review.

    Returns list of weak_point dicts sorted by urgency, not just raw ease factor.
    """
    profile = _load_profile(user_id)
    today = date.today().isoformat()
    due = []

    for wp in profile.get("weak_points", []):
        if wp.get("improved"):
            continue
        if topic and wp.get("topic") != topic:
            continue
        sr = wp.get("sr", {})
        next_review = sr.get("next_review", "2000-01-01")
        if next_review <= today:
            item = dict(wp)
            item["priority_score"] = round(_priority_score(wp), 2)
            due.append(item)

    due.sort(key=lambda x: (-x.get("priority_score", 0), x.get("sr", {}).get("ease_factor", 2.5)))
    return due


def update_weak_point_sr(topic: str, point_text: str, score: float, user_id: str):
    """Update spaced repetition state for a specific weak point after evaluation.

    Matches by topic + point text substring.
    Also keeps lightweight history/aggregation fields for prioritization and auto-improvement.
    """
    profile = _load_profile(user_id)
    now = datetime.now().isoformat()

    for wp in profile.get("weak_points", []):
        if wp.get("improved"):
            continue
        if topic and wp.get("topic") != topic:
            continue
        # Fuzzy match: point_text is contained in the weak point or vice versa
        if point_text.lower() in wp["point"].lower() or wp["point"].lower() in point_text.lower():
            sr = wp.get("sr", {})
            wp["sr"] = sm2_update(sr, score)
            wp["review_count"] = int(wp.get("review_count", 0) or 0) + 1
            wp["last_reviewed_at"] = now
            wp["last_score"] = score
            history = list(wp.get("score_history", []))[-9:]
            history.append({"at": now, "score": score})
            wp["score_history"] = history

            if score < 6:
                wp["recent_low_streak"] = int(wp.get("recent_low_streak", 0) or 0) + 1
                wp["last_low_score_at"] = now
            else:
                wp["recent_low_streak"] = 0

            recent_scores = [float(x.get("score", 0)) for x in history if isinstance(x.get("score"), (int, float))]
            recent_good = recent_scores[-3:]
            if len(recent_good) >= 3 and min(recent_good) >= 7.5:
                wp["improved"] = True
                wp["improved_at"] = now
                wp["improved_reason"] = "最近连续 3 次复习分数均 >= 7.5"

            _save_profile(profile, user_id)
            return True

    return False


def init_sr_for_existing_points(user_id: str):
    """Initialize SR state for existing weak points that don't have it yet."""
    profile = _load_profile(user_id)
    changed = False

    for wp in profile.get("weak_points", []):
        if wp.get("improved"):
            continue
        if "sr" not in wp:
            wp["sr"] = {
                "interval_days": 1,
                "ease_factor": 2.5,
                "repetitions": 0,
                "next_review": date.today().isoformat(),
                "last_score": None,
            }
            changed = True

    if changed:
        _save_profile(profile, user_id)
