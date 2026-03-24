"""模式2: 专项强化训练 — 批量出题 + 批量评估（不再使用 LangGraph）."""
import json

from langchain_core.messages import SystemMessage, HumanMessage

from backend.config import settings
from backend.llm_provider import get_langchain_llm
from backend.indexer import retrieve_topic_context, load_topics
from backend.memory import get_profile_summary, get_profile_summary_for_drill, get_topic_context_for_drill
from backend.prompts.interviewer import DRILL_QUESTION_GEN_PROMPT, DRILL_BATCH_EVAL_PROMPT
from backend.schemas_eval import normalize_drill_evaluation_payload
from backend.query_hints import expand_query_terms


def _get_topic_display(user_id: str) -> dict[str, str]:
    """Dynamic {key: display_name} from topics.json."""
    return {k: v["name"] for k, v in load_topics(user_id).items()}


def _parse_json_response(content: str) -> dict | list:
    """Extract JSON from LLM response, handling various formats."""
    import re
    content = content.strip()

    # Try direct parse first
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    # Extract from markdown code block
    m = re.search(r"```(?:json)?\s*\n?([\s\S]*?)\n?```", content)
    if m:
        try:
            return json.loads(m.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Find first [ or { and parse from there
    for i, c in enumerate(content):
        if c in ("[", "{"):
            try:
                return json.loads(content[i:])
            except json.JSONDecodeError:
                pass
            break

    raise json.JSONDecodeError("No valid JSON found", content, 0)


def _load_high_freq(topic: str, user_id: str) -> str:
    """Load high-frequency question bank for a topic."""
    filepath = settings.user_high_freq_path(user_id) / f"{topic}.md"
    if filepath.exists():
        return filepath.read_text(encoding="utf-8").strip()
    return ""


def _normalize_training_label(raw: str | None, focus_trend: str | None = None, difficulty: int | None = None, question: str | None = None) -> str:
    text = (raw or "").strip()
    mapping = {
        "repair": "基础稳固",
        "stabilize": "稳定性验收",
        "advance": "迁移验收",
        "platform_break": "平台突破",
        "plateau_break": "平台突破",
        "boundary": "边界追问",
        "基础修复": "基础稳固",
        "基础稳固": "基础稳固",
        "稳定": "稳定性验收",
        "稳定性验收": "稳定性验收",
        "迁移": "迁移验收",
        "迁移验收": "迁移验收",
        "平台突破": "平台突破",
        "边界追问": "边界追问",
    }
    if text in mapping:
        return mapping[text]
    lowered = text.lower()
    if "platform" in lowered or "plateau" in lowered:
        return "平台突破"
    if "boundary" in lowered or "edge" in lowered:
        return "边界追问"
    if "advance" in lowered or "transfer" in lowered or "migration" in lowered:
        return "迁移验收"
    if "repair" in lowered or "fix" in lowered or "basic" in lowered:
        return "基础稳固"
    if "stabil" in lowered or "validate" in lowered:
        return "稳定性验收"
    q = (question or "").lower()
    if any(x in q for x in ["边界", "极端", "如果", "反例", "异常", "限制"]):
        return "边界追问"
    if focus_trend == "进入平台期":
        return "平台突破"
    if focus_trend == "持续上升":
        return "迁移验收"
    if focus_trend == "出现回退":
        return "基础稳固"
    if isinstance(difficulty, int) and difficulty >= 4:
        return "迁移验收"
    return "稳定性验收"


def _default_training_intent(label: str, focus_area: str | None = None) -> str:
    area = (focus_area or "这个知识点").strip() or "这个知识点"
    if label == "基础稳固":
        return f"围绕 {area} 做概念澄清、why 和单点修复。"
    if label == "稳定性验收":
        return f"换一个角度验证 {area} 是否已经稳定掌握。"
    if label == "迁移验收":
        return f"把 {area} 迁移到新场景，检查是否真正内化。"
    if label == "平台突破":
        return f"通过更强约束或换角度提问，尝试打破 {area} 的平台期。"
    if label == "边界追问":
        return f"专门测试 {area} 在边界条件和极端场景下是否仍然成立。"
    return f"围绕 {area} 做定向训练。"


def generate_drill_questions(topic: str, user_id: str, focus_keyword: str | None = None, focus_label: str | None = None, focus_trend: str | None = None, practice_context: str | None = None) -> list[dict]:
    """Generate 10 personalized questions for a topic. 1 LLM call."""
    from backend.spaced_repetition import get_due_reviews, init_sr_for_existing_points

    # Ensure existing weak points have SR state
    init_sr_for_existing_points(user_id)

    topic_display = _get_topic_display(user_id)
    topic_name = topic_display.get(topic, topic)
    drill_ctx = get_topic_context_for_drill(topic, user_id)

    # Spaced repetition + weak-point priority: build weighted focus list
    due_reviews = get_due_reviews(user_id, topic)
    due_points = [wp["point"] for wp in due_reviews[:5]]
    prioritized_weak = [w["point"] for w in drill_ctx.get("weak_point_details", [])[:8]]

    weighted_focus = []
    for point in due_points + prioritized_weak:
        if point and point not in weighted_focus:
            weighted_focus.append(point)

    focus_terms = []
    focus_label = (focus_label or "").strip()
    focus_keyword = (focus_keyword or "").strip()
    focus_seed = focus_label or focus_keyword
    if focus_seed:
        for term in expand_query_terms(focus_seed):
            if term and term not in focus_terms:
                focus_terms.append(term)
        if focus_label and focus_label not in weighted_focus:
            weighted_focus.insert(0, focus_label)
        elif focus_keyword and focus_keyword not in weighted_focus:
            weighted_focus.insert(0, focus_keyword)

    all_weak = list(weighted_focus)
    for wp in drill_ctx["weak_points"]:
        if wp not in all_weak:
            all_weak.append(wp)

    # Retrieve knowledge — prioritize weak areas
    queries = []
    if focus_terms:
        queries.append(" ".join(focus_terms[:12]))
    if all_weak:
        expanded = []
        for item in all_weak[:5]:
            for term in expand_query_terms(item):
                if term not in expanded:
                    expanded.append(term)
        queries.append(" ".join(expanded[:12]))
    queries.append(f"{topic_name} 核心知识点 面试常见问题 {' '.join(expand_query_terms(topic_name)[:6])}")

    all_chunks = []
    for q in queries:
        all_chunks.extend(retrieve_topic_context(topic, q, user_id, top_k=5))
    # Deduplicate and limit
    seen = set()
    unique_chunks = []
    for c in all_chunks:
        key = c[:100]
        if key not in seen:
            seen.add(key)
            unique_chunks.append(c)
    knowledge_ctx = "\n\n---\n\n".join(unique_chunks)[:5000]

    # Format past insights from vector retrieval
    past_insights_text = "\n".join(
        f"- {ins[:200]}" for ins in drill_ctx.get("past_insights", [])
    ) or "暂无历史数据"

    # Load high-frequency questions
    high_freq = _load_high_freq(topic, user_id) or "暂无"

    # Format weak points with due-review + priority hints
    priority_map = {w["point"]: w for w in drill_ctx.get("weak_point_details", [])}
    weak_lines = []
    strategy_lines = []
    for meta in drill_ctx.get("weak_point_details", [])[:8]:
        point = meta.get("point")
        if not point:
            continue
        strategy = meta.get("adaptive_strategy") or "stabilize"
        if strategy == "repair":
            advice = "先用低一档难度的概念辨析题/为什么题/单点应用题修复，不要一上来就复杂场景题"
        elif strategy == "advance":
            advice = "该点已基本修复，只保留少量验收题；更多题目应拓展到相邻知识点或更高阶权衡题"
        else:
            advice = "该点有一定回升但还不稳，适合中等难度追问题、场景变体题、边界条件题"
        strategy_lines.append(f"- {point}: strategy={strategy}；{advice}")
    for w in all_weak[:10]:
        tags = []
        if w in due_points:
            tags.append("到期复习")
        if w in prioritized_weak[:5]:
            tags.append("高优先级")
        meta = priority_map.get(w, {})
        suffix_parts = []
        if meta.get("priority_score") is not None:
            suffix_parts.append(f"priority={meta['priority_score']}")
        if meta.get("times_seen"):
            suffix_parts.append(f"seen={meta['times_seen']}")
        if meta.get("recent_low_streak"):
            suffix_parts.append(f"low_streak={meta['recent_low_streak']}")
        if meta.get("last_score") is not None:
            suffix_parts.append(f"last_score={meta['last_score']}")
        if meta.get("repair_success_rate") is not None and meta.get("repair_attempts"):
            suffix_parts.append(f"repair_rate={meta['repair_success_rate']}")
        if meta.get("adaptive_strategy"):
            suffix_parts.append(f"strategy={meta['adaptive_strategy']}")
        prefix = f"[{'/'.join(tags)}] " if tags else ""
        suffix = f" ({', '.join(suffix_parts)})" if suffix_parts else ""
        weak_lines.append(f"- {prefix}{w}{suffix}")

    # Difficulty range and question strategy based on mastery + adaptive weak-point state
    mastery_score = drill_ctx["mastery_score"]
    repair_count = sum(1 for x in drill_ctx.get("weak_point_details", [])[:6] if x.get("adaptive_strategy") == "repair")
    advance_count = sum(1 for x in drill_ctx.get("weak_point_details", [])[:6] if x.get("adaptive_strategy") == "advance")

    if mastery_score <= 30:
        diff_min, diff_max = 1, 3
        question_strategy = (
            "当前为新手阶段（掌握度 0-30），题目策略：\n"
            "- 70% 基础概念题 + 对比辨析题，30% 简单应用题\n"
            "- 基础概念题考的是「是什么」和「为什么」：核心定义、基本原理、常见术语的含义\n"
            "- 不要考底层实现细节、内核机制、源码级原理等深度概念\n"
            "- 不要出复杂场景设计题或系统架构题，先确认基础概念是否扎实\n"
            "- 概念题要考理解而非背诵——问「为什么这样设计」而非「请背诵定义」"
        )
    elif mastery_score <= 60:
        diff_min, diff_max = 2, 4
        question_strategy = (
            "当前有基础（掌握度 30-60），题目策略：\n"
            "- 40% 深度概念题（底层原理、实现机制、边界行为），40% 场景应用题，20% 设计权衡题\n"
            "- 可以考底层原理和内部机制，但场景题控制在单组件/单服务范围，不需要大规模系统设计"
        )
    else:
        diff_min, diff_max = 3, 5
        question_strategy = (
            "当前已熟练（掌握度 60-100），题目策略：\n"
            "- 20% 概念题（考边界 case 和底层原理），80% 场景设计 + 系统权衡题"
        )

    adaptive_notes = []
    if repair_count >= 2:
        diff_max = max(diff_min, diff_max - 1)
        adaptive_notes.append("当前多个高优先级弱点仍处于 repair 阶段：整体难度上限下调一档，前半程优先做概念澄清、单点 why、低复杂度应用题。")
    if advance_count >= 2 and repair_count == 0:
        diff_min = min(diff_max, diff_min + 1)
        adaptive_notes.append("当前多个高优先级弱点已进入 advance 阶段：减少基础修复题比例，增加场景权衡题、边界 case、跨知识点迁移题。")
    if not adaptive_notes:
        adaptive_notes.append("当前以 stabilize 策略为主：保持中等难度，优先追问型和场景变体题，验证是否真正稳定掌握。")

    question_strategy = question_strategy + "\n- 自适应训练策略：\n" + "\n".join(f"  {note}" for note in adaptive_notes)
    if focus_seed:
        question_strategy += f"\n- 本次训练显式修复目标：优先围绕「{focus_seed}」出前几题，至少覆盖其相关概念辨析、工程落地或边界追问。"
    focus_trend = (focus_trend or "").strip()
    if focus_trend == "进入平台期":
        question_strategy += (
            "\n- 当前 focus 处于平台期：减少同层概念确认题，优先出 why 型追问、边界条件题、反例题、项目化场景题，"
            "用更换角度和更强约束来打破平台，不要再重复基础确认。"
        )
    elif focus_trend == "出现回退":
        question_strategy += (
            "\n- 当前 focus 有回退迹象：前半程先用基础概念辨析题、稳定表达题、低复杂度应用题重新稳住，"
            "避免一上来就复杂架构或多条件系统设计题。"
        )
    elif focus_trend == "持续上升":
        question_strategy += (
            "\n- 当前 focus 正在持续上升：可以减少基础修复题，增加迁移题、跨场景题、工程权衡题，"
            "验证候选人是否能把理解迁移到新语境。"
        )
    elif focus_trend == "波动明显":
        question_strategy += (
            "\n- 当前 focus 波动明显：同一个知识点要从不同角度重复验收，但保持中等难度，"
            "重点验证是否真的稳定，而不是偶尔答对。"
        )
    if (practice_context or "").strip():
        question_strategy += (
            "\n- 本轮为带着改进版答案再练：请围绕候选人刚整理出的改进版回答，优先设计能检验其是否真正内化的题，"
            "包括换角度追问、边界条件、项目落地和 why 型问题；不要简单重复原题。"
        )

    practice_context_text = (practice_context or "").strip() or "暂无"

    prompt = DRILL_QUESTION_GEN_PROMPT.format(
        topic_name=topic_name,
        knowledge_context=knowledge_ctx,
        user_profile=get_profile_summary_for_drill(user_id),
        mastery_info=drill_ctx["mastery_info"],
        weak_points="\n".join(weak_lines) or "暂无",
        priority_weak_points="\n".join(f"- {w}" for w in weighted_focus[:6]) or "暂无",
        adaptive_focus_strategy="\n".join(strategy_lines) or "暂无",
        high_freq_questions=high_freq,
        recent_questions="\n".join(f"- {q}" for q in drill_ctx["recent_questions"][-10:]) or "暂无",
        past_insights=past_insights_text,
        practice_context=practice_context_text,
        question_strategy=question_strategy,
        diff_min=diff_min,
        diff_max=diff_max,
    )

    llm = get_langchain_llm()
    response = llm.invoke([
        SystemMessage(content="你是专项训练出题引擎。只返回 JSON 数组，不要其他内容。"),
        HumanMessage(content=prompt),
    ])

    try:
        questions = _parse_json_response(response.content)
        if not isinstance(questions, list):
            raise ValueError(f"Expected a list, got {type(questions)}")

        high_focus_terms = [x.lower() for x in weighted_focus[:4]]
        explicit_focus_terms = [x.lower() for x in focus_terms[:8]]
        def _focus_hit(q: dict) -> int:
            hay = f"{q.get('focus_area', '')} {q.get('question', '')}".lower()
            score = sum(1 for term in high_focus_terms if term and term in hay)
            score += sum(2 for term in explicit_focus_terms if term and term in hay)
            return score

        if high_focus_terms:
            questions = sorted(
                questions,
                key=lambda q: (-_focus_hit(q), q.get("difficulty", 99))
            )

        # Ensure each question has normalized metadata
        for i, q in enumerate(questions):
            q["id"] = i + 1
            label = _normalize_training_label(q.get("training_label"), focus_trend=focus_trend, difficulty=q.get("difficulty"), question=q.get("question"))
            q["training_label"] = label
            q["training_intent"] = (q.get("training_intent") or "").strip() or _default_training_intent(label, q.get("focus_area"))
        return questions[:10]
    except (json.JSONDecodeError, ValueError, IndexError) as e:
        import logging
        logger = logging.getLogger("uvicorn")
        logger.error(f"Drill question generation failed: {e}")
        logger.error(f"LLM raw response: {response.content[:500]}")
        raise RuntimeError(f"出题失败，LLM 返回格式异常: {e}")


def evaluate_drill_answers(topic: str, questions: list[dict], answers: list[dict],
                           user_id: str) -> dict:
    """Batch evaluate all answers. 1 LLM call."""
    topic_display = _get_topic_display(user_id)
    topic_name = topic_display.get(topic, topic)
    answer_map = {a["question_id"]: a["answer"] for a in answers}

    # Only evaluate answered questions
    answered_questions = [q for q in questions if answer_map.get(q["id"])]

    qa_lines = []
    ref_lines = []
    for q in answered_questions:
        qid = q["id"]
        answer = answer_map[qid]
        qa_lines.append(f"### Q{qid} (难度 {q.get('difficulty', '?')}/5)\n**题目**: {q['question']}\n**回答**: {answer}")

        refs = retrieve_topic_context(topic, q["question"], user_id, top_k=2)
        if refs:
            ref_lines.append(f"### Q{qid} 参考\n" + "\n".join(refs)[:800])

    prompt = DRILL_BATCH_EVAL_PROMPT.format(
        topic_name=topic_name,
        topic_key=topic,
        qa_pairs="\n\n".join(qa_lines),
        references="\n\n".join(ref_lines)[:4000],
    )

    llm = get_langchain_llm()
    response = llm.invoke([
        SystemMessage(content="你是训练评估引擎。只返回 JSON，不要其他内容。"),
        HumanMessage(content=prompt),
    ])

    try:
        result = _parse_json_response(response.content)
        if not isinstance(result, dict):
            raise ValueError(f"Expected a dict, got {type(result)}")
        return normalize_drill_evaluation_payload(result, topic).model_dump()
    except (json.JSONDecodeError, ValueError, IndexError) as e:
        import logging
        logger = logging.getLogger("uvicorn")
        logger.error(f"Drill evaluation failed: {e}")
        logger.error(f"LLM raw response: {response.content[:500]}")
        # Evaluation fallback is acceptable — better than crashing
        return {
            "scores": [{"question_id": q["id"], "score": None, "assessment": "评估解析失败，请重试"} for q in questions],
            "overall": {"avg_score": None, "summary": "评估结果解析失败，请重新提交。", "new_weak_points": [], "new_strong_points": []},
        }
