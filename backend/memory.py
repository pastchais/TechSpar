"""个性化记忆系统 — 跨面试用户画像。

设计哲学：
- 文件即真相（OpenClaw）：profile.json 可人工编辑
- 两阶段提取（Mem0）：Extract → Update，不无脑追加
- 向量召回（bge-m3）：语义搜索历史洞察
"""
import json
import logging
import re
from datetime import datetime
from pathlib import Path

from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

from backend.config import settings
from backend.llm_provider import get_langchain_llm
from backend.schemas_eval import normalize_extraction_payload, normalize_point_text, canonicalize_topic_key
from backend.query_hints import build_query_hints

logger = logging.getLogger("uvicorn")

# ── Profile Schema ──

DEFAULT_PROFILE = {
    "name": "",
    "target_role": "AI 应用开发实习生",
    "updated_at": "",

    # 技术掌握度 (topic → {level: 1-5, notes: str})
    "topic_mastery": {},

    # 薄弱点 (list of {point, topic, first_seen, last_seen, times_seen, improved})
    "weak_points": [],

    # 强项 (list of {point, topic, first_seen})
    "strong_points": [],

    # 表达与沟通特征
    "communication": {
        "style": "",        # e.g. "回答偏短，缺少具体例子"
        "habits": [],       # e.g. ["紧张时语速加快", "喜欢用类比解释"]
        "suggestions": [],  # e.g. ["多用 STAR 法描述项目"]
    },

    # 答题思维模式
    "thinking_patterns": {
        "strengths": [],    # e.g. ["能用类比解释抽象概念", "项目描述有数据支撑"]
        "gaps": [],         # e.g. ["对比类问题缺乏结构", "被追问 why 时容易卡住"]
    },

    # 面试统计
    "stats": {
        "total_sessions": 0,
        "resume_sessions": 0,
        "drill_sessions": 0,
        "avg_score": 0,
        "score_history": [],  # [{date, mode, topic, avg_score}]
    },
}

EXTRACT_PROMPT = """你是一个面试教练的分析引擎。根据面试对话记录，提取关于候选人的结构化洞察。

## 候选人当前画像
{current_profile}

## 本次面试记录
模式: {mode}
领域: {topic}
{transcript}

## 评分记录（如有）
{scores}

## 任务
分析这次面试，提取以下信息，返回 JSON：

```json
{{
    "weak_points": [
        {{"point": "对 Python GIL 的理解停留在表面", "topic": "python"}}
    ],
    "strong_points": [
        {{"point": "RAG 架构描述清晰，有实战数据支撑", "topic": "rag"}}
    ],
    "topic_mastery": {{
        "python": {{"notes": "基础扎实但高级特性（元类、描述符）薄弱"}}
    }},
    "communication_observations": {{
        "style_update": "回答技术题时逻辑清晰，但项目描述缺少量化数据",
        "new_habits": ["遇到不会的题会坦诚说不确定"],
        "new_suggestions": ["项目经历多用数据指标（提升了XX%）来量化成果"]
    }},
    "thinking_patterns": {{
        "new_strengths": ["能用类比解释复杂概念"],
        "new_gaps": ["被追问'为什么这样设计'时缺乏推导过程", "对比类问题回答缺乏结构"]
    }},
    "session_summary": "本次 Python 专项训练，基础题表现好，但 GIL 和 GC 机制理解不够深入",
    "dimension_scores": {{
        "technical_depth": 6,
        "project_articulation": 7,
        "communication": 5,
        "problem_solving": 6
    }},
    "avg_score": 6.0
}}
```

## dimension_scores 评分说明（仅简历面试模式需要填写，专项训练留空即可）
- technical_depth (1-10): 技术理解的深度，是真懂还是在背？能否说出 why？
- project_articulation (1-10): 项目描述能力——设计思路、量化成果、技术权衡是否讲清楚
- communication (1-10): 表达的清晰度、结构化程度、简洁性
- problem_solving (1-10): 被追问时的分析推理能力，能否现场推导
- avg_score = 四个维度的均值，保留一位小数

规则：
- 只提取本次面试中明确暴露的信息，不要猜测
- 薄弱点要具体，不要泛泛说"XX不好"
- 如果候选人对某个之前的薄弱点表现出了进步，在 strong_points 里标注
- topic_mastery 只需提供 notes（一句话描述掌握情况），score 由算法计算，不需要你判断
- 专项训练模式下 dimension_scores 可省略，只需给 avg_score
"""


# ── Per-user path helpers ──

def _profile_path(user_id: str) -> Path:
    return settings.user_profile_dir(user_id) / "profile.json"


def _insights_dir(user_id: str) -> Path:
    return settings.user_profile_dir(user_id) / "insights"


def _load_profile(user_id: str) -> dict:
    path = _profile_path(user_id)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return DEFAULT_PROFILE.copy()


def _save_profile(profile: dict, user_id: str):
    path = _profile_path(user_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    profile["updated_at"] = datetime.now().isoformat()
    path.write_text(
        json.dumps(profile, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _normalize_weak_point_meta(point: str | None) -> dict:
    hints = build_query_hints(point)
    aliases = [x for x in (hints.get("aliases") or []) if x]
    canonical = hints.get("canonical_query") or normalize_point_text(point)
    buckets = [x for x in (hints.get("semantic_buckets") or []) if x]
    return {
        "canonical_query": canonical,
        "aliases": aliases[:12],
        "semantic_bucket": hints.get("semantic_bucket") or (buckets[0] if len(buckets) == 1 else None),
        "semantic_buckets": buckets[:6],
    }


def _bucket_label(bucket: str | None) -> str:
    labels = {
        "spring_transaction": "事务",
        "spring_aop": "AOP",
        "spring_ioc_di": "IOC/DI",
        "spring_circular_dependency": "循环依赖",
        "spring_startup": "Spring 启动",
        "mysql_lock": "MySQL 锁",
        "mysql_mvcc_txn": "MVCC/隔离",
        "mysql_index_sql": "索引/SQL",
        "redis_cache_consistency": "缓存一致性",
        "redis_breakdown": "缓存异常",
        "mq_core": "MQ",
        "mq_reliability": "MQ 可靠性",
        "java_concurrency": "并发",
        "jvm_runtime": "JVM",
        "microservice_governance": "微服务治理",
        "distributed_ai": "AI/RAG",
    }
    return labels.get(bucket or "", bucket or "")


def _classify_focus_trend(scores: list[float]) -> dict:
    vals = [float(x) for x in scores if isinstance(x, (int, float))]
    if len(vals) < 2:
        return {
            "label": "样本不足",
            "summary": "还需要至少两次同 focus 训练才能判断趋势。",
            "advice": "先继续做 1-2 次同一 focus 的短打复练。",
        }
    recent = vals[-5:]
    delta = round(recent[-1] - recent[0], 1)
    up_steps = 0
    down_steps = 0
    for idx in range(1, len(recent)):
        diff = recent[idx] - recent[idx - 1]
        if diff >= 0.6:
            up_steps += 1
        elif diff <= -0.6:
            down_steps += 1
    if delta >= 1.2 and up_steps >= max(1, len(recent) - 2):
        return {
            "label": "持续上升",
            "summary": f"最近 {len(recent)} 次同 focus 表现整体上升（{delta:+.1f} 分）。",
            "advice": "可以减少同类重复题，转向更深的 why / 边界 / 追问。",
        }
    if delta <= -1.2 and down_steps >= max(1, len(recent) - 2):
        return {
            "label": "出现回退",
            "summary": f"最近 {len(recent)} 次同 focus 表现回落（{delta:+.1f} 分）。",
            "advice": "建议回到基础概念和更稳定的口语表达，先稳住再加压。",
        }
    if up_steps > 0 and down_steps > 0:
        return {
            "label": "波动明显",
            "summary": f"最近 {len(recent)} 次同 focus 有明显波动（{delta:+.1f} 分）。",
            "advice": "说明理解还不够稳定，建议固定同一种答题结构连续验收。",
        }
    return {
        "label": "进入平台期",
        "summary": f"最近 {len(recent)} 次同 focus 基本持平（{delta:+.1f} 分）。",
        "advice": "别再刷同一层问题，应该升级为更刁钻的追问或项目化表达训练。",
    }


def _build_next_focus_recommendation(wp: dict) -> dict | None:
    candidates = [x for x in (wp.get("focus_effectiveness") or []) if isinstance(x, dict)]
    priority_score = float(wp.get("priority_score", 0.0) or 0.0)
    adaptive_strategy = wp.get("adaptive_strategy") or "stabilize"
    semantic_buckets = [x for x in (wp.get("semantic_buckets") or []) if x]
    semantic_bucket = wp.get("semantic_bucket")
    best_strategy = wp.get("best_strategy") if isinstance(wp.get("best_strategy"), dict) else None

    if candidates:
        ranked = []
        for item in candidates:
            hit_rate = float(item.get("focus_hit_rate", 0.0) or 0.0)
            improvement_rate = float(item.get("improvement_rate", 0.0) or 0.0)
            attempts = int(item.get("attempts", 0) or 0)
            front3 = min(int(item.get("last_front3_focus_hits", 0) or 0), 3)
            score = priority_score * 0.08 + hit_rate * 35 + improvement_rate * 30 + min(attempts, 4) * 3 + front3 * 4
            if adaptive_strategy == "repair":
                score += 8
            elif adaptive_strategy == "advance":
                score -= 4
            if best_strategy and best_strategy.get("strategy_label"):
                if best_strategy.get("strategy_mode") == adaptive_strategy:
                    score += 6
                if best_strategy.get("verdict_rate", 0) >= 0.6:
                    score += 4
            ranked.append((score, item))
        ranked.sort(key=lambda x: x[0], reverse=True)
        best_score, best = ranked[0]
        reason_bits = []
        if adaptive_strategy == "repair":
            reason_bits.append("当前处于 repair 阶段，优先选择更聚焦的修复入口")
        elif adaptive_strategy == "stabilize":
            reason_bits.append("当前更适合用命中率高的 focus 做稳定性验证")
        else:
            reason_bits.append("当前可用已有高命中 focus 做验收型训练")
        if best_strategy and best_strategy.get("strategy_label"):
            reason_bits.append(f"这个薄弱点历史上更吃「{best_strategy.get('strategy_label')}」")
        if best.get("focus_hit_rate") is not None:
            reason_bits.append(f"该 focus 历史命中率 {(float(best.get('focus_hit_rate', 0.0)) * 100):.0f}%")
        if best.get("improvement_rate") is not None:
            reason_bits.append(f"回升率 {(float(best.get('improvement_rate', 0.0)) * 100):.0f}%")
        if best.get("trend_label"):
            reason_bits.append(f"当前轨迹：{best.get('trend_label')}")
        if best.get("last_front3_focus_hits"):
            reason_bits.append(f"最近一轮前3题命中 {int(best.get('last_front3_focus_hits', 0) or 0)} 次")
        return {
            "focus_label": best.get("focus_label"),
            "focus_keyword": best.get("focus_keyword") or best.get("focus_label"),
            "source": "focus_effectiveness",
            "score": round(best_score, 1),
            "confidence": "high" if (float(best.get("focus_hit_rate", 0.0) or 0.0) >= 0.7 or int(best.get("attempts", 0) or 0) >= 2) else "medium",
            "reason": "；".join(reason_bits),
            "topic_level": bool(best.get("topic_level", False)),
            "trend_label": best.get("trend_label"),
            "trend_summary": best.get("trend_summary"),
            "trend_advice": best.get("trend_advice"),
            "preferred_strategy_label": best_strategy.get("strategy_label") if best_strategy else None,
            "preferred_strategy_mode": best_strategy.get("strategy_mode") if best_strategy else None,
        }

    if semantic_buckets or semantic_bucket:
        buckets = semantic_buckets or ([semantic_bucket] if semantic_bucket else [])
        label = " + ".join(_bucket_label(x) for x in buckets[:2] if x).strip()
        if label:
            reason = f"该薄弱点还没有稳定的 focus 历史，先按语义桶 {label} 收敛到更具体的问题边界。"
            if best_strategy and best_strategy.get("strategy_label"):
                reason += f" 历史上它更适合「{best_strategy.get('strategy_label')}」。"
            return {
                "focus_label": label,
                "focus_keyword": wp.get("canonical_query") or wp.get("point") or label,
                "source": "semantic_bucket",
                "score": round(priority_score * 1.5 + (8 if adaptive_strategy == "repair" else 0), 1),
                "confidence": "medium",
                "reason": reason,
                "topic_level": True,
                "preferred_strategy_label": best_strategy.get("strategy_label") if best_strategy else None,
                "preferred_strategy_mode": best_strategy.get("strategy_mode") if best_strategy else None,
            }

    point_text = wp.get("point") or wp.get("canonical_query")
    if point_text:
        reason = "当前还缺少稳定的 focus 历史，先围绕这个薄弱点本身做一次定向 drill。"
        if best_strategy and best_strategy.get("strategy_label"):
            reason += f" 训练方式优先采用「{best_strategy.get('strategy_label')}」。"
        return {
            "focus_label": point_text[:48],
            "focus_keyword": wp.get("canonical_query") or point_text,
            "source": "weak_point",
            "score": round(priority_score, 1),
            "confidence": "low",
            "reason": reason,
            "topic_level": True,
            "preferred_strategy_label": best_strategy.get("strategy_label") if best_strategy else None,
            "preferred_strategy_mode": best_strategy.get("strategy_mode") if best_strategy else None,
        }
    return None


def _build_mini_training_plan(profile: dict) -> list[dict]:
    recommendations = [x for x in (profile.get("next_focus_recommendations") or []) if isinstance(x, dict)]
    plan = []
    for idx, rec in enumerate(recommendations[:3], start=1):
        adaptive_strategy = rec.get("adaptive_strategy") or "stabilize"
        if adaptive_strategy == "repair":
            success_rule = "若本轮 focus 命中率 >= 70% 且至少 1 题回答明显回升，再继续同类 repair；否则先去知识库补概念边界。"
        elif adaptive_strategy == "advance":
            success_rule = "若回答已稳定 >= 7.5，可切到更难 follow-up / 场景题；否则继续用当前 focus 做一次验收。"
        else:
            success_rule = "若前3题仍高命中且回答更稳定，可继续同 focus；若命中高但分数不升，说明需要先补知识点再练。"
        knowledge_keyword = rec.get("focus_label") or rec.get("focus_keyword") or rec.get("point")
        plan.append({
            "step": idx,
            "title": f"先练 {rec.get('focus_label') or rec.get('point')}",
            "topic": rec.get("topic"),
            "focus_label": rec.get("focus_label"),
            "focus_keyword": rec.get("focus_keyword") or rec.get("focus_label"),
            "weak_point": rec.get("point"),
            "why_now": rec.get("reason"),
            "pre_read_keyword": knowledge_keyword,
            "success_rule": success_rule,
            "confidence": rec.get("confidence"),
            "adaptive_strategy": adaptive_strategy,
            "score": rec.get("score"),
        })
    return plan


def _refresh_weak_point_aggregates(profile: dict):
    weak_points = profile.get("weak_points", [])
    for wp in weak_points:
        point = normalize_point_text(wp.get("point"))
        if point:
            wp["point"] = point
            meta = _normalize_weak_point_meta(point)
            wp.setdefault("canonical_query", meta["canonical_query"])
            wp.setdefault("aliases", meta["aliases"])
            wp.setdefault("semantic_bucket", meta["semantic_bucket"])
            wp.setdefault("semantic_buckets", meta["semantic_buckets"])
        history = [x for x in (wp.get("score_history") or []) if isinstance(x, dict)]
        recent_scores = [float(x.get("score", 0)) for x in history if isinstance(x.get("score"), (int, float))]
        if recent_scores:
            wp["last_score"] = recent_scores[-1]
            wp["avg_recent_score"] = round(sum(recent_scores[-5:]) / min(len(recent_scores), 5), 1)
        wp["review_count"] = max(int(wp.get("review_count", 0) or 0), len(history))
        if len(recent_scores) >= 3 and min(recent_scores[-3:]) >= 7.5 and not wp.get("improved"):
            wp["improved"] = True
            wp["improved_reason"] = wp.get("improved_reason") or "最近连续 3 次相关得分均 >= 7.5"
            wp["improved_at"] = wp.get("improved_at") or datetime.now().isoformat()

        repair_attempts = int(wp.get("repair_attempts", 0) or 0)
        repair_success_rate = float(wp.get("repair_success_rate", 0.0) or 0.0)
        recent_low_streak = int(wp.get("recent_low_streak", 0) or 0)
        avg_recent_score = wp.get("avg_recent_score")
        last_score = wp.get("last_score")

        existing_focus_effectiveness = [x for x in (wp.get("focus_effectiveness") or []) if isinstance(x, dict)]
        focus_effectiveness = []
        focus_stats = {}
        for item in existing_focus_effectiveness:
            label = str(item.get("focus_label") or "").strip()
            if not label:
                continue
            focus_stats[label] = {
                "focus_label": label,
                "focus_keyword": item.get("focus_keyword") or label,
                "attempts": int(item.get("attempts", 0) or 0),
                "focus_hits": int(item.get("focus_hit_count", 0) or 0),
                "improved_count": int(item.get("improved_count", 0) or 0),
                "scores": [],
                "topic_level": bool(item.get("topic_level", False)),
                "last_front3_focus_hits": item.get("last_front3_focus_hits", 0),
            }
        for item in [x for x in (wp.get("repair_history") or []) if isinstance(x, dict)]:
            label = str(item.get("focus_label") or "").strip()
            if not label:
                continue
            stat = focus_stats.setdefault(label, {
                "focus_label": label,
                "focus_keyword": item.get("focus_keyword") or label,
                "attempts": 0,
                "focus_hits": 0,
                "improved_count": 0,
                "scores": [],
            })
            stat["attempts"] += 1
            if item.get("focus_hit"):
                stat["focus_hits"] += 1
            if item.get("improved"):
                stat["improved_count"] += 1
            if isinstance(item.get("score_10"), (int, float)):
                stat["scores"].append(float(item.get("score_10")))
        for stat in focus_stats.values():
            attempts = max(int(stat["attempts"]), 1)
            avg_score = round(sum(stat["scores"]) / len(stat["scores"]), 1) if stat["scores"] else None
            trend = _classify_focus_trend(stat["scores"])
            focus_effectiveness.append({
                "focus_label": stat["focus_label"],
                "focus_keyword": stat["focus_keyword"],
                "attempts": stat["attempts"],
                "focus_hit_count": stat["focus_hits"],
                "focus_hit_rate": round(stat["focus_hits"] / attempts, 2),
                "improved_count": stat["improved_count"],
                "improvement_rate": round(stat["improved_count"] / attempts, 2),
                "avg_score": avg_score,
                "topic_level": bool(stat.get("topic_level", False)),
                "last_front3_focus_hits": stat.get("last_front3_focus_hits", 0),
                "trend_label": trend["label"],
                "trend_summary": trend["summary"],
                "trend_advice": trend["advice"],
            })
        focus_effectiveness.sort(key=lambda x: (-x.get("improvement_rate", 0), -x.get("focus_hit_rate", 0), -(x.get("attempts", 0))))
        wp["focus_effectiveness"] = focus_effectiveness[:5]
        wp["best_focus"] = focus_effectiveness[0] if focus_effectiveness else None

        strategy_effectiveness = []
        strategy_stats = {}
        strategy_history = [x for x in (wp.get("strategy_effectiveness") or []) if isinstance(x, dict)]
        for item in strategy_history:
            mode = str(item.get("strategy_mode") or "").strip()
            if not mode:
                continue
            strategy_stats[mode] = {
                "strategy_mode": mode,
                "strategy_label": item.get("strategy_label") or mode,
                "attempts": int(item.get("attempts", 0) or 0),
                "effective_count": int(item.get("effective_count", 0) or 0),
                "partial_count": int(item.get("partial_count", 0) or 0),
                "ineffective_count": int(item.get("ineffective_count", 0) or 0),
                "delta_scores": [],
                "repair_rates": [],
                "trend_labels": [],
            }
        for item in [x for x in (wp.get("strategy_history") or []) if isinstance(x, dict)]:
            mode = str(item.get("strategy_mode") or "").strip()
            if not mode:
                continue
            stat = strategy_stats.setdefault(mode, {
                "strategy_mode": mode,
                "strategy_label": item.get("strategy_label") or mode,
                "attempts": 0,
                "effective_count": 0,
                "partial_count": 0,
                "ineffective_count": 0,
                "delta_scores": [],
                "repair_rates": [],
                "trend_labels": [],
            })
            stat["attempts"] += 1
            verdict_level = str(item.get("verdict_level") or "partial")
            if verdict_level == "effective":
                stat["effective_count"] += 1
            elif verdict_level == "ineffective":
                stat["ineffective_count"] += 1
            else:
                stat["partial_count"] += 1
            if isinstance(item.get("delta_score"), (int, float)):
                stat["delta_scores"].append(float(item.get("delta_score")))
            if isinstance(item.get("repair_rate"), (int, float)):
                stat["repair_rates"].append(float(item.get("repair_rate")))
            if item.get("trend_label"):
                stat["trend_labels"].append(str(item.get("trend_label")))
        for stat in strategy_stats.values():
            attempts = max(int(stat.get("attempts", 0) or 0), 1)
            avg_delta = round(sum(stat["delta_scores"]) / len(stat["delta_scores"]), 1) if stat["delta_scores"] else None
            avg_repair_rate = round(sum(stat["repair_rates"]) / len(stat["repair_rates"]), 2) if stat["repair_rates"] else None
            trend_counts = {}
            for label in stat["trend_labels"]:
                trend_counts[label] = trend_counts.get(label, 0) + 1
            dominant_trend = None
            if trend_counts:
                dominant_trend = sorted(trend_counts.items(), key=lambda x: (-x[1], x[0]))[0][0]
            strategy_effectiveness.append({
                "strategy_mode": stat["strategy_mode"],
                "strategy_label": stat["strategy_label"],
                "attempts": int(stat.get("attempts", 0) or 0),
                "effective_count": int(stat.get("effective_count", 0) or 0),
                "partial_count": int(stat.get("partial_count", 0) or 0),
                "ineffective_count": int(stat.get("ineffective_count", 0) or 0),
                "verdict_rate": round((int(stat.get("effective_count", 0) or 0) + int(stat.get("partial_count", 0) or 0) * 0.5) / attempts, 2),
                "avg_delta_score": avg_delta,
                "avg_repair_rate": avg_repair_rate,
                "dominant_trend": dominant_trend,
            })
        strategy_effectiveness.sort(key=lambda x: (-x.get("verdict_rate", 0), -x.get("avg_delta_score") if x.get("avg_delta_score") is not None else 999, -x.get("attempts", 0)))
        wp["strategy_effectiveness"] = strategy_effectiveness[:4]
        wp["best_strategy"] = strategy_effectiveness[0] if strategy_effectiveness else None

        priority_score = 0.0
        priority_score += min(recent_low_streak, 5) * 3.0
        priority_score += max(0.0, 6.0 - float(last_score if last_score is not None else 5.0)) * 1.6
        priority_score += min(int(wp.get("times_seen", 1) or 1), 6) * 0.7
        priority_score += max(0.0, 7.5 - float(avg_recent_score if avg_recent_score is not None else 7.5)) * 0.9

        if recent_low_streak >= 2 or (repair_attempts >= 2 and repair_success_rate < 0.4):
            adaptive_strategy = "repair"
        elif repair_attempts >= 2 and repair_success_rate >= 0.75 and (avg_recent_score is not None and float(avg_recent_score) >= 7.5):
            adaptive_strategy = "advance"
        else:
            adaptive_strategy = "stabilize"

        wp["priority_score"] = round(priority_score, 2)
        wp["adaptive_strategy"] = adaptive_strategy
        wp["next_focus_recommendation"] = _build_next_focus_recommendation(wp)

    recommendations = []
    for wp in weak_points:
        if wp.get("improved"):
            continue
        rec = wp.get("next_focus_recommendation")
        if not rec:
            continue
        recommendations.append({
            "point": wp.get("point"),
            "topic": wp.get("topic"),
            "priority_score": wp.get("priority_score", 0),
            "adaptive_strategy": wp.get("adaptive_strategy"),
            **rec,
        })
    recommendations.sort(key=lambda x: (-float(x.get("score", 0) or 0), -float(x.get("priority_score", 0) or 0)))
    profile["next_focus_recommendations"] = recommendations[:5]
    profile["mini_training_plan"] = _build_mini_training_plan(profile)


def _save_insight(mode: str, topic: str, summary: str, raw_extraction: dict, user_id: str):
    """Append daily insight file (OpenClaw-style daily log)."""
    ins_dir = _insights_dir(user_id)
    ins_dir.mkdir(parents=True, exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    path = ins_dir / f"{today}.md"

    time_str = datetime.now().strftime("%H:%M")
    entry = f"\n## {time_str} | {mode} | {topic or '综合'}\n\n{summary}\n"

    if raw_extraction.get("weak_points"):
        entry += "\n**薄弱点:**\n"
        for wp in raw_extraction["weak_points"]:
            entry += f"- {wp['point']} ({wp.get('topic', '')})\n"

    if raw_extraction.get("strong_points"):
        entry += "\n**亮点:**\n"
        for sp in raw_extraction["strong_points"]:
            entry += f"- {sp['point']} ({sp.get('topic', '')})\n"

    entry += "\n---\n"

    with open(path, "a", encoding="utf-8") as f:
        f.write(entry)


def get_profile(user_id: str) -> dict:
    profile = _load_profile(user_id)
    _refresh_weak_point_aggregates(profile)
    return profile


def get_topic_context_for_drill(topic: str, user_id: str) -> dict:
    """Get personalized context for drill question generation."""
    profile = _load_profile(user_id)
    _refresh_weak_point_aggregates(profile)

    mastery = profile.get("topic_mastery", {}).get(topic, {})
    mastery_score = mastery.get("score", mastery.get("level", 0) * 20)
    mastery_notes = mastery.get("notes", "新领域，暂无历史数据" if mastery_score == 0 else "")
    mastery_info = f"{mastery_score}/100 — {mastery_notes}"

    # Weak points for this topic — keep priority metadata for question weighting
    topic_weak_points = []
    for w in profile.get("weak_points", []):
        if w.get("topic") != topic or w.get("improved"):
            continue
        score = 0.0
        score += min(int(w.get("recent_low_streak", 0) or 0), 5) * 3.0
        score += max(0.0, 6.0 - float(w.get("last_score", 5.0) or 5.0)) * 1.6
        score += min(int(w.get("times_seen", 1) or 1), 6) * 0.7
        score += max(0.0, 7.5 - float(w.get("avg_recent_score", 7.5) or 7.5)) * 0.9
        repair_attempts = int(w.get("repair_attempts", 0) or 0)
        repair_success_rate = float(w.get("repair_success_rate", 0.0) or 0.0)
        recent_low_streak = int(w.get("recent_low_streak", 0) or 0)
        avg_recent_score = w.get("avg_recent_score")

        if recent_low_streak >= 2 or (repair_attempts >= 2 and repair_success_rate < 0.4):
            adaptive_strategy = "repair"
        elif repair_attempts >= 2 and repair_success_rate >= 0.75 and (avg_recent_score is not None and float(avg_recent_score) >= 7.5):
            adaptive_strategy = "advance"
        else:
            adaptive_strategy = "stabilize"

        topic_weak_points.append({
            "point": w.get("point", ""),
            "canonical_query": w.get("canonical_query") or w.get("point", ""),
            "aliases": list(w.get("aliases") or []),
            "semantic_bucket": w.get("semantic_bucket"),
            "semantic_buckets": list(w.get("semantic_buckets") or []),
            "priority_score": round(score, 2),
            "times_seen": int(w.get("times_seen", 1) or 1),
            "recent_low_streak": recent_low_streak,
            "last_score": w.get("last_score"),
            "avg_recent_score": avg_recent_score,
            "repair_attempts": repair_attempts,
            "repair_success_rate": repair_success_rate,
            "adaptive_strategy": adaptive_strategy,
        })
    topic_weak_points.sort(key=lambda x: (-x.get("priority_score", 0), -x.get("times_seen", 0)))
    topic_weak = [w["point"] for w in topic_weak_points]

    # Recent questions from score_history for this topic
    recent_questions = [
        h.get("question", "")
        for h in profile.get("stats", {}).get("score_history", [])
        if h.get("topic") == topic and h.get("question")
    ][-20:]  # last 20

    # Semantic retrieval of past insights for this topic
    past_insights = []
    try:
        from backend.vector_memory import search_memory
        results = search_memory(
            query=f"{topic} 面试薄弱点 常见错误",
            chunk_types=["session_summary", "insight"],
            topic=topic,
            user_id=user_id,
            top_k=3,
        )
        past_insights = [r["content"] for r in results if r["score"] > 0.3]
    except Exception:
        pass  # vector table may not exist yet

    return {
        "mastery_info": mastery_info,
        "mastery_score": mastery_score,
        "weak_points": topic_weak,
        "weak_point_details": topic_weak_points,
        "recent_questions": recent_questions,
        "past_insights": past_insights,
    }


def update_profile_realtime(
    mode: str,
    topic: str | None,
    user_id: str,
    score_entry: dict | None = None,
    weak_point: str | None = None,
):
    """Lightweight per-answer profile update — no LLM call, just save the data."""
    profile = _load_profile(user_id)
    now = datetime.now().isoformat()

    # Record score
    if score_entry and score_entry.get("score") is not None:
        history = profile.setdefault("stats", {}).setdefault("score_history", [])
        history.append({
            "date": now[:10],
            "mode": mode,
            "topic": topic,
            "avg_score": score_entry["score"],
            "question": score_entry.get("question", "")[:80],
            "assessment": score_entry.get("assessment", ""),
        })
        # Rolling average
        recent = [h["avg_score"] for h in history[-30:] if h.get("avg_score")]
        if recent:
            profile["stats"]["avg_score"] = round(sum(recent) / len(recent), 1)

    # Record weak point (semantic matching)
    if weak_point:
        from backend.vector_memory import find_similar_weak_point
        match_idx = find_similar_weak_point(weak_point, profile.get("weak_points", []), user_id=user_id)
        if match_idx is not None:
            profile["weak_points"][match_idx]["times_seen"] = profile["weak_points"][match_idx].get("times_seen", 1) + 1
            profile["weak_points"][match_idx]["last_seen"] = now
            meta = _normalize_weak_point_meta(profile["weak_points"][match_idx].get("point"))
            profile["weak_points"][match_idx]["canonical_query"] = meta["canonical_query"]
            profile["weak_points"][match_idx]["aliases"] = meta["aliases"]
            profile["weak_points"][match_idx]["semantic_bucket"] = meta["semantic_bucket"]
            profile["weak_points"][match_idx]["semantic_buckets"] = meta["semantic_buckets"]
        else:
            meta = _normalize_weak_point_meta(weak_point)
            profile.setdefault("weak_points", []).append({
                "point": weak_point,
                "topic": topic or "",
                "first_seen": now,
                "last_seen": now,
                "times_seen": 1,
                "improved": False,
                "canonical_query": meta["canonical_query"],
                "aliases": meta["aliases"],
                "semantic_bucket": meta["semantic_bucket"],
                "semantic_buckets": meta["semantic_buckets"],
            })

    # Track that we have activity (for profile page display)
    profile.setdefault("stats", {}).setdefault("total_answers", 0)
    profile["stats"]["total_answers"] = profile["stats"].get("total_answers", 0) + 1

    _save_profile(profile, user_id)


def get_profile_summary(user_id: str) -> str:
    """Generate a concise summary for injection into interviewer prompts."""
    profile = _load_profile(user_id)

    parts = []
    if profile.get("weak_points"):
        active_weak = [w for w in profile["weak_points"] if not w.get("improved")]
        if active_weak:
            points = ", ".join(w["point"] for w in active_weak[:8])
            parts.append(f"已知薄弱点: {points}")

    if profile.get("strong_points"):
        points = ", ".join(s["point"] for s in profile["strong_points"][:5])
        parts.append(f"强项: {points}")

    if profile.get("communication", {}).get("style"):
        parts.append(f"沟通风格: {profile['communication']['style']}")

    tp = profile.get("thinking_patterns", {})
    if tp.get("gaps"):
        parts.append(f"思维短板: {', '.join(tp['gaps'][:5])}")
    if tp.get("strengths"):
        parts.append(f"思维优势: {', '.join(tp['strengths'][:5])}")

    if profile.get("stats", {}).get("total_sessions"):
        stats = profile["stats"]
        parts.append(f"已完成 {stats['total_sessions']} 次模拟面试")

    if profile.get("topic_mastery"):
        mastery = ", ".join(
            f"{t}: {v.get('score', v.get('level', 0) * 20)}/100"
            for t, v in profile["topic_mastery"].items()
        )
        parts.append(f"掌握度: {mastery}")

    return "\n".join(parts) if parts else "新用户，暂无历史数据"


def get_profile_summary_for_drill(user_id: str) -> str:
    """Concise summary for drill question generation — only cross-topic info."""
    profile = _load_profile(user_id)
    parts = []

    if profile.get("communication", {}).get("style"):
        parts.append(f"沟通风格: {profile['communication']['style']}")

    tp = profile.get("thinking_patterns", {})
    if tp.get("gaps"):
        parts.append(f"思维短板: {', '.join(tp['gaps'][:5])}")
    if tp.get("strengths"):
        parts.append(f"思维优势: {', '.join(tp['strengths'][:5])}")

    if profile.get("stats", {}).get("total_sessions"):
        parts.append(f"已完成 {profile['stats']['total_sessions']} 次模拟面试")

    return "\n".join(parts) if parts else "新用户，暂无历史数据"


# ── Mem0-style LLM profile update ──

def _parse_json_safe(content: str) -> dict | list:
    """Parse JSON from LLM response, handling markdown code blocks."""
    content = content.strip()
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass
    m = re.search(r"```(?:json)?\s*\n?([\s\S]*?)\n?```", content)
    if m:
        try:
            return json.loads(m.group(1).strip())
        except json.JSONDecodeError:
            pass
    for i, c in enumerate(content):
        if c in ("[", "{"):
            try:
                return json.loads(content[i:])
            except json.JSONDecodeError:
                pass
            break
    raise json.JSONDecodeError("No valid JSON found", content, 0)


def _apply_memory_ops(profile: dict, ops: dict, topic: str | None, now: str):
    """Execute LLM-decided ADD/UPDATE/NOOP/IMPROVE operations on profile."""
    weak_points = profile.setdefault("weak_points", [])
    topic = canonicalize_topic_key(topic)

    for op in ops.get("weak_point_ops", []):
        action = op.get("action", "NOOP")
        if action == "ADD":
            point = normalize_point_text(op.get("point"))
            if not point:
                continue
            meta = _normalize_weak_point_meta(point)
            weak_points.append({
                "point": point,
                "topic": canonicalize_topic_key(op.get("topic", topic or "")),
                "first_seen": now, "last_seen": now,
                "times_seen": 1, "improved": False,
                "canonical_query": meta["canonical_query"],
                "aliases": meta["aliases"],
                "semantic_bucket": meta["semantic_bucket"],
                "semantic_buckets": meta["semantic_buckets"],
            })
        elif action == "UPDATE":
            idx = op.get("index")
            if idx is not None and 0 <= idx < len(weak_points):
                wp = weak_points[idx]
                if op.get("new_point"):
                    wp["point"] = normalize_point_text(op["new_point"])
                meta = _normalize_weak_point_meta(wp.get("point"))
                wp["canonical_query"] = meta["canonical_query"]
                wp["aliases"] = meta["aliases"]
                wp["times_seen"] = wp.get("times_seen", 1) + 1
                wp["last_seen"] = now

    for imp in ops.get("improvements", []):
        idx = imp.get("weak_index")
        if idx is not None and 0 <= idx < len(weak_points):
            weak_points[idx]["improved"] = True
            weak_points[idx]["improved_at"] = now

    existing_strong = {s["point"] for s in profile.get("strong_points", [])}
    for op in ops.get("strong_point_ops", []):
        point = normalize_point_text(op.get("point"))
        if op.get("action") == "ADD" and point and point not in existing_strong:
            profile.setdefault("strong_points", []).append({
                "point": point,
                "topic": canonicalize_topic_key(op.get("topic", topic or "")),
                "first_seen": now,
            })


def _deterministic_update(profile: dict, new_weak: list, new_strong: list,
                          topic: str | None, now: str, user_id: str):
    """Fallback: vector cosine dedup when LLM parse fails."""
    from backend.vector_memory import find_similar_weak_point

    topic = canonicalize_topic_key(topic)

    for wp in new_weak:
        point = normalize_point_text(wp.get("point", wp) if isinstance(wp, dict) else str(wp))
        if not point:
            continue
        match_idx = find_similar_weak_point(point, profile.get("weak_points", []), user_id=user_id)
        if match_idx is not None:
            profile["weak_points"][match_idx]["times_seen"] = profile["weak_points"][match_idx].get("times_seen", 1) + 1
            profile["weak_points"][match_idx]["last_seen"] = now
            meta = _normalize_weak_point_meta(profile["weak_points"][match_idx].get("point"))
            profile["weak_points"][match_idx]["canonical_query"] = meta["canonical_query"]
            profile["weak_points"][match_idx]["aliases"] = meta["aliases"]
            profile["weak_points"][match_idx]["semantic_bucket"] = meta["semantic_bucket"]
            profile["weak_points"][match_idx]["semantic_buckets"] = meta["semantic_buckets"]
        else:
            meta = _normalize_weak_point_meta(point)
            profile.setdefault("weak_points", []).append({
                "point": point,
                "topic": canonicalize_topic_key(wp.get("topic", topic) if isinstance(wp, dict) else (topic or "")),
                "first_seen": now, "last_seen": now,
                "times_seen": 1, "improved": False,
                "canonical_query": meta["canonical_query"],
                "aliases": meta["aliases"],
                "semantic_bucket": meta["semantic_bucket"],
                "semantic_buckets": meta["semantic_buckets"],
            })

    for sp in new_strong:
        sp_text = normalize_point_text(sp.get("point", sp) if isinstance(sp, dict) else str(sp))
        if not sp_text:
            continue
        strong_topic = canonicalize_topic_key(sp.get("topic") if isinstance(sp, dict) else topic)
        for w in profile.get("weak_points", []):
            if w.get("topic") == strong_topic and not w.get("improved"):
                w["improved"] = True
                w["improved_at"] = now
                break
        existing = {s["point"] for s in profile.get("strong_points", [])}
        if sp_text not in existing:
            profile.setdefault("strong_points", []).append({
                "point": sp_text,
                "topic": strong_topic,
                "first_seen": now,
            })


def _update_mastery(profile: dict, topic: str | None, mastery_data: dict, now: str,
                    session_weight: float = 0.7):
    """Update topic mastery (0-100 scale). session_weight controls merge ratio."""
    if not mastery_data:
        return
    # {score, notes} → single topic; {topic_key: {score, notes}} → multi-topic
    if "score" in mastery_data or "level" in mastery_data:
        if not topic:
            return
        entries = {topic: mastery_data}
    else:
        entries = mastery_data

    for t, data in entries.items():
        if not isinstance(data, dict):
            continue
        existing = profile.setdefault("topic_mastery", {}).setdefault(t, {})
        new_score = data.get("score")
        if new_score is not None:
            # Backward compat: convert old Lv1-5 to 0-100
            old_score = existing.get("score", existing.get("level", 0) * 20)
            merged = round(old_score * (1 - session_weight) + new_score * session_weight, 1)
            existing["score"] = merged
            existing.pop("level", None)
        if data.get("notes"):
            existing["notes"] = data["notes"]
        existing["last_assessed"] = now


def _update_communication(profile: dict, comm: dict):
    """Append communication observations."""
    if not comm:
        return
    if comm.get("style_update"):
        profile.setdefault("communication", {})["style"] = comm["style_update"]
    for habit in comm.get("new_habits", []):
        habits = profile.setdefault("communication", {}).setdefault("habits", [])
        if habit not in habits:
            habits.append(habit)
    for sug in comm.get("new_suggestions", []):
        suggestions = profile.setdefault("communication", {}).setdefault("suggestions", [])
        if sug not in suggestions:
            suggestions.append(sug)


def _update_thinking_patterns(profile: dict, patterns: dict):
    """Append thinking pattern observations."""
    if not patterns:
        return
    tp = profile.setdefault("thinking_patterns", {"strengths": [], "gaps": []})
    for s in patterns.get("new_strengths", []):
        if s not in tp["strengths"]:
            tp["strengths"].append(s)
    for g in patterns.get("new_gaps", []):
        if g not in tp["gaps"]:
            tp["gaps"].append(g)


def _update_stats(
    profile: dict, mode: str, topic: str | None, avg_score: float | None,
    now: str, answer_count: int = 0, dimension_scores: dict | None = None,
):
    """Update session statistics with per-mode averages."""
    stats = profile.setdefault("stats", {})
    stats["total_sessions"] = stats.get("total_sessions", 0) + 1
    if mode == "resume":
        stats["resume_sessions"] = stats.get("resume_sessions", 0) + 1
    else:
        stats["drill_sessions"] = stats.get("drill_sessions", 0) + 1

    if answer_count:
        stats["total_answers"] = stats.get("total_answers", 0) + answer_count

    if avg_score:
        history = stats.setdefault("score_history", [])
        entry = {"date": now[:10], "mode": mode, "topic": topic, "avg_score": avg_score}
        if dimension_scores:
            entry["dimension_scores"] = dimension_scores
        history.append(entry)

        # Per-mode rolling averages
        drill_scores = [h["avg_score"] for h in history if h.get("mode") == "topic_drill" and h.get("avg_score")][-20:]
        resume_scores = [h["avg_score"] for h in history if h.get("mode") == "resume" and h.get("avg_score")][-10:]

        if drill_scores:
            stats["drill_avg_score"] = round(sum(drill_scores) / len(drill_scores), 1)
        if resume_scores:
            stats["resume_avg_score"] = round(sum(resume_scores) / len(resume_scores), 1)

        # Combined: proportional weighted average
        all_recent = drill_scores + resume_scores
        if all_recent:
            stats["avg_score"] = round(sum(all_recent) / len(all_recent), 1)


async def llm_update_profile(
    mode: str,
    topic: str | None,
    new_weak_points: list[dict],
    new_strong_points: list[dict],
    topic_mastery: dict,
    communication: dict,
    user_id: str,
    thinking_patterns: dict | None = None,
    session_summary: str = "",
    avg_score: float | None = None,
    answer_count: int = 0,
    session_weight: float = 0.7,
    dimension_scores: dict | None = None,
    extraction_confidence: float = 0.7,
):
    """Mem0-style profile update: LLM decides ADD/UPDATE/NOOP for each fact."""
    from backend.prompts.interviewer import PROFILE_UPDATE_PROMPT

    profile = _load_profile(user_id)
    now = datetime.now().isoformat()

    topic = canonicalize_topic_key(topic)
    # ── LLM-based update for weak/strong points ──
    has_new_facts = bool(new_weak_points or new_strong_points)

    if has_new_facts and extraction_confidence >= settings.min_confidence_to_persist:
        # Format existing points with indices for LLM reference
        existing_weak_lines = []
        for i, wp in enumerate(profile.get("weak_points", [])):
            status = "已改善" if wp.get("improved") else f"出现{wp.get('times_seen', 1)}次"
            existing_weak_lines.append(
                f"[{i}] {wp['point']} (领域: {wp.get('topic', '?')}, {status})"
            )
        existing_strong_lines = []
        for i, sp in enumerate(profile.get("strong_points", [])):
            existing_strong_lines.append(f"[{i}] {sp['point']} (领域: {sp.get('topic', '?')})")

        new_weak_lines = []
        for wp in new_weak_points:
            point = wp.get("point", wp) if isinstance(wp, dict) else str(wp)
            t = wp.get("topic", topic) if isinstance(wp, dict) else topic
            new_weak_lines.append(f"- {point} (领域: {t})")
        new_strong_lines = []
        for sp in new_strong_points:
            point = sp.get("point", sp) if isinstance(sp, dict) else str(sp)
            t = sp.get("topic", topic) if isinstance(sp, dict) else topic
            new_strong_lines.append(f"- {point} (领域: {t})")

        prompt = PROFILE_UPDATE_PROMPT.format(
            existing_weak="\n".join(existing_weak_lines) or "暂无",
            existing_strong="\n".join(existing_strong_lines) or "暂无",
            new_weak="\n".join(new_weak_lines) or "暂无",
            new_strong="\n".join(new_strong_lines) or "暂无",
        )

        llm = get_langchain_llm()
        response = llm.invoke([
            SystemMessage(content="你是画像更新引擎。只返回 JSON。"),
            HumanMessage(content=prompt),
        ])

        try:
            ops = _parse_json_safe(response.content)
            if isinstance(ops, dict):
                _apply_memory_ops(profile, ops, topic, now)
            else:
                raise ValueError(f"Expected dict, got {type(ops)}")
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            logger.warning(f"Profile update LLM parse failed ({e}), falling back to deterministic")
            _deterministic_update(profile, new_weak_points, new_strong_points, topic, now, user_id)

    # ── Deterministic updates for mastery / communication / thinking / stats ──
    filtered_mastery = {}
    if extraction_confidence >= settings.min_confidence_to_persist:
        filtered_mastery = topic_mastery
    _update_mastery(profile, topic, filtered_mastery, now, session_weight)
    _update_communication(profile, communication)
    _update_thinking_patterns(profile, thinking_patterns)
    _update_stats(profile, mode, topic, avg_score, now, answer_count, dimension_scores)

    _refresh_weak_point_aggregates(profile)
    _save_profile(profile, user_id)
    _save_insight(mode=mode, topic=topic, summary=session_summary, raw_extraction={
        "weak_points": new_weak_points,
        "strong_points": new_strong_points,
    }, user_id=user_id)

    # Index into vector memory for future semantic retrieval (best effort)
    try:
        from backend.vector_memory import index_session_memory
        index_session_memory(
            session_id=None, topic=topic,
            summary=session_summary,
            weak_points=new_weak_points,
            strong_points=new_strong_points,
            insight_text=session_summary,
            user_id=user_id,
        )
    except Exception as e:
        logger.warning(f"index_session_memory skipped: {e}")


async def update_profile_after_interview(
    mode: str,
    topic: str | None,
    messages: list,
    user_id: str,
    scores: list[dict] | None = None,
) -> dict:
    """Mem0-style two-stage pipeline: Extract → Update."""
    profile = _load_profile(user_id)
    llm = get_langchain_llm()

    # ── Stage 1: Extract insights ──
    transcript_lines = []
    for msg in messages:
        if hasattr(msg, "content"):
            if isinstance(msg, HumanMessage):
                transcript_lines.append(f"候选人: {msg.content}")
            elif hasattr(msg, "content") and not isinstance(msg, SystemMessage):
                transcript_lines.append(f"面试官: {msg.content}")

    score_text = ""
    if scores:
        score_text = "\n".join(
            f"- Q: {s.get('question', '?')} → {s.get('score', '?')}/10 ({s.get('assessment', '')})"
            for s in scores
        )

    extract_msg = EXTRACT_PROMPT.format(
        current_profile=json.dumps(profile, ensure_ascii=False)[:2000],
        mode=mode,
        topic=topic or "综合",
        transcript="\n".join(transcript_lines[-60:]),  # last 60 lines
        scores=score_text or "无",
    )

    response = llm.invoke([
        SystemMessage(content="你是面试分析引擎。只返回 JSON。"),
        HumanMessage(content=extract_msg),
    ])

    try:
        content = response.content.strip()
        if "```" in content:
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()
        extraction = normalize_extraction_payload(json.loads(content), topic)
    except (json.JSONDecodeError, IndexError, Exception):
        extraction = normalize_extraction_payload({"session_summary": "提取失败", "weak_points": [], "strong_points": [], "confidence": 0.0}, topic)

    # ── Stage 2: LLM-based Update (Mem0 style) ──
    await llm_update_profile(
        mode=mode,
        topic=topic,
        new_weak_points=[w.model_dump() for w in extraction.weak_points],
        new_strong_points=[s.model_dump() for s in extraction.strong_points],
        topic_mastery=extraction.topic_mastery if isinstance(extraction.topic_mastery, dict) else {},
        communication=extraction.communication_observations.model_dump(),
        user_id=user_id,
        thinking_patterns=extraction.thinking_patterns.model_dump(),
        session_summary=extraction.session_summary,
        avg_score=extraction.avg_score,
        dimension_scores=extraction.dimension_scores.model_dump() if extraction.dimension_scores else None,
        extraction_confidence=extraction.confidence,
    )

    return extraction.model_dump()
