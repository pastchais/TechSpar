import { useParams, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { PageTitle, SectionTitle, SubtleButton } from "../components/ui.jsx";
import { BookOpen } from "lucide-react";
import { getReview, getReferenceAnswer, followupReferenceAnswer, getImprovedAnswer, scoreInterviewAnswer, getTopics, startInterview, getHistory } from "../api/interview";
import { topicDisplayName } from "../utils/topicLabels";

function getScoreColor(score) {
  if (score >= 8) return { bg: "rgba(0,184,148,0.15)", color: "var(--green)" };
  if (score >= 6) return { bg: "rgba(245,158,11,0.15)", color: "var(--accent-light)" };
  if (score >= 4) return { bg: "rgba(253,203,110,0.2)", color: "#e2b93b" };
  return { bg: "rgba(225,112,85,0.15)", color: "var(--red)" };
}

const DIMENSION_LABELS = {
  technical_depth: "技术深度",
  project_articulation: "项目表达",
  communication: "表达能力",
  problem_solving: "问题解决",
};

const AUTO_SCORE_LABELS = {
  accuracy: "准确性",
  structure: "结构性",
  engineering: "工程感",
  followup: "追问稳定性",
  delivery: "表达完成度",
};

const FOLLOWUP_QUICK_ACTIONS = [
  { label: "更口语化", prompt: "请把这道题的标准参考答案改写成更口语化、像真实面试中会说出来的版本，控制在 1 分钟内。" },
  { label: "30 秒版本", prompt: "请把这道题压缩成一个 30 秒可讲完的回答，保留最关键的信息。" },
  { label: "项目实战版", prompt: "请结合真实项目场景，给我一个更像工程落地的回答版本，强调为什么这样设计。" },
  { label: "继续追问版", prompt: "如果面试官继续深挖这道题，请帮我列出 3 个高概率追问，并分别给出回答思路。" },
  { label: "只提示漏点", prompt: "先不要直接给完整答案，只告诉我如果我来回答，这题最容易漏掉的 3-5 个关键点是什么。" },
];

function strategyBadge(strategy) {
  if (strategy === "repair") return { label: "攻坚", bg: "rgba(239,68,68,.12)", color: "var(--red)" };
  if (strategy === "advance") return { label: "进阶", bg: "rgba(34,197,94,.12)", color: "var(--green)" };
  return { label: "稳固", bg: "rgba(91,141,239,.12)", color: "var(--accent-light)" };
}

function strategyReason(item) {
  if (!item) return "";
  if (item.adaptive_strategy === "repair") {
    return `连续低分 ${item.recent_low_streak || 0} 次${item.repair_success_rate != null ? `，历史修复率 ${(Number(item.repair_success_rate) * 100).toFixed(0)}%` : ""}，所以本轮更适合先修概念和 why。`;
  }
  if (item.adaptive_strategy === "advance") {
    return `${item.avg_recent_score != null ? `近5次均分 ${item.avg_recent_score}` : ""}${item.repair_success_rate != null ? `，历史修复率 ${(Number(item.repair_success_rate) * 100).toFixed(0)}%` : ""}，该点更适合少量验收后转向拓展。`;
  }
  return `${item.avg_recent_score != null ? `近5次均分 ${item.avg_recent_score}` : ""}${item.repair_success_rate != null ? `，历史修复率 ${(Number(item.repair_success_rate) * 100).toFixed(0)}%` : ""}，当前主要验证是否稳定掌握。`;
}

function bucketLabel(bucket) {
  const labels = {
    spring_transaction: "事务",
    spring_aop: "AOP",
    spring_ioc_di: "IOC/DI",
    spring_circular_dependency: "循环依赖",
    spring_startup: "Spring 启动",
    mysql_lock: "MySQL 锁",
    mysql_mvcc_txn: "MVCC/隔离",
    mysql_index_sql: "索引/SQL",
    redis_cache_consistency: "缓存一致性",
    redis_breakdown: "缓存异常",
    mq_core: "MQ",
    mq_reliability: "MQ 可靠性",
    java_concurrency: "并发",
    jvm_runtime: "JVM",
    microservice_governance: "微服务治理",
    distributed_ai: "AI/RAG",
  };
  return labels[bucket] || bucket;
}

function InlineAutoScoreDetail({ detail }) {
  if (!detail || !Object.keys(detail).length) return null;
  const entries = Object.entries(AUTO_SCORE_LABELS).filter(([k]) => detail[k] != null);
  if (!entries.length) return null;
  return (
    <div className="mt-3 rounded-lg border border-border bg-hover px-3 py-3 md:px-4">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div className="text-xs font-semibold text-dim">单题五维评分</div>
        <div className="text-xs text-dim">{detail.total_score ?? "-"}/25 · {detail.summary || ""}</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
        {entries.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between text-[13px]">
            <span className="text-dim">{label}</span>
            <span className="font-semibold">{detail[key]}/5</span>
          </div>
        ))}
      </div>
      {detail.reason && <div className="mt-2 text-[13px] leading-[1.7] text-text">{detail.reason}</div>}
      {detail.missing_points?.length > 0 && (
        <div className="mt-2 text-[13px] text-red leading-[1.7]">漏点: {detail.missing_points.join("、")}</div>
      )}
      {detail.improvements?.length > 0 && (
        <div className="mt-2 text-[13px] text-accent-light leading-[1.7]">建议: {detail.improvements.join("；")}</div>
      )}
      {detail.entered_mistake_book && (
        <div className="mt-2 text-[12px] text-red">该题已自动写入错题本</div>
      )}
    </div>
  );
}

function DimensionScores({ dimensionScores, avgScore }) {
  if (!dimensionScores) return null;
  const entries = Object.entries(DIMENSION_LABELS).filter(([k]) => dimensionScores[k] != null);
  if (!entries.length) return null;

  return (
    <div className="bg-card border border-border rounded-2xl px-5 py-6 md:px-6 md:py-6 mb-6">
      <div className="text-lg font-semibold mb-4">
        维度评分
        {avgScore != null && (
          <span className="text-sm font-normal text-dim ml-3">综合 {avgScore}/10</span>
        )}
      </div>
      {entries.map(([key, label]) => {
        const score = dimensionScores[key];
        const color = score >= 8 ? "var(--green)" : score >= 6 ? "var(--accent-light)" : score >= 4 ? "#e2b93b" : "var(--red)";
        return (
          <div key={key} className="flex items-center gap-2.5 mb-2.5">
            <div className="w-[64px] md:w-[100px] text-[12px] md:text-[13px] text-dim text-right shrink-0 leading-4">{label}</div>
            <div className="flex-1 h-2 rounded bg-border overflow-hidden">
              <div className="h-full rounded transition-[width] duration-500 ease-in-out" style={{ width: `${score * 10}%`, background: color }} />
            </div>
            <div className="w-9 text-sm font-semibold text-right shrink-0" style={{ color }}>{score}</div>
          </div>
        );
      })}
    </div>
  );
}

function AutoScoreCard({ autoScore }) {
  if (!autoScore || !Object.keys(autoScore).length) return null;
  const entries = Object.entries(AUTO_SCORE_LABELS).filter(([k]) => autoScore[k] != null);
  return (
    <div className="bg-card border border-border rounded-2xl px-5 py-6 md:px-6 md:py-6 mb-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="text-lg font-semibold">自动评分</div>
        <div className="text-sm text-dim">总分 {autoScore.total_score ?? "-"}/25 · {autoScore.summary || ""}</div>
      </div>
      {entries.map(([key, label]) => {
        const score = autoScore[key];
        const percent = (score / 5) * 100;
        const color = score >= 4 ? "var(--green)" : score >= 3 ? "var(--accent-light)" : "var(--red)";
        return (
          <div key={key} className="flex items-center gap-2.5 mb-2.5">
            <div className="w-[72px] md:w-[110px] text-[12px] md:text-[13px] text-dim text-right shrink-0 leading-4">{label}</div>
            <div className="flex-1 h-2 rounded bg-border overflow-hidden">
              <div className="h-full rounded transition-[width] duration-500 ease-in-out" style={{ width: `${percent}%`, background: color }} />
            </div>
            <div className="w-10 text-sm font-semibold text-right shrink-0" style={{ color }}>{score}</div>
          </div>
        );
      })}
      {autoScore.reason && <div className="mt-4 text-sm text-text leading-[1.8]">{autoScore.reason}</div>}
      {autoScore.missing_points?.length > 0 && (
        <div className="mt-4">
          <div className="text-[15px] font-medium mb-2">漏掉的关键点</div>
          <div className="flex flex-col gap-1.5">
            {autoScore.missing_points.map((item, idx) => (
              <div key={idx} className="px-3 py-2 rounded-lg text-[13px] text-text bg-red/8 border border-red/20">{item}</div>
            ))}
          </div>
        </div>
      )}
      {autoScore.improvements?.length > 0 && (
        <div className="mt-4">
          <div className="text-[15px] font-medium mb-2">改进建议</div>
          <div className="flex flex-col gap-1.5">
            {autoScore.improvements.map((item, idx) => (
              <div key={idx} className="px-3 py-2 rounded-lg text-[13px] text-text bg-accent/8 border border-accent/20">{item}</div>
            ))}
          </div>
        </div>
      )}
      {autoScore.entered_mistake_book && (
        <div className="mt-4 text-[13px] text-red">该复盘分数较低，已自动写入错题本。</div>
      )}
    </div>
  );
}

function PracticeComparisonCard({ comparison }) {
  if (!comparison) return null;
  return (
    <div className="bg-card border border-green/20 rounded-2xl px-5 py-6 md:px-6 md:py-6 mb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="text-lg font-semibold">复练结果对比</div>
        {typeof comparison.delta_score === "number" && (
          <div className={`text-sm font-semibold ${comparison.delta_score >= 0 ? "text-green" : "text-red"}`}>
            {comparison.delta_score >= 0 ? `+${comparison.delta_score}` : comparison.delta_score} 分
          </div>
        )}
      </div>
      {comparison.headline && <div className="text-[15px] leading-[1.8] text-text mb-3">{comparison.headline}</div>}
      {comparison.bullets?.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-3">
          {comparison.bullets.map((item, idx) => (
            <div key={idx} className="px-3 py-2 rounded-lg text-[13px] text-text bg-green/6 border border-green/15">{item}</div>
          ))}
        </div>
      )}
      {comparison.verdict && <div className="text-[13px] text-dim">结论：{comparison.verdict}</div>}
    </div>
  );
}

function analyzePracticeTrend(items = []) {
  const scored = items
    .map((item) => ({ ...item, avg_score: typeof item.avg_score === "number" ? item.avg_score : null }))
    .filter((item) => item.avg_score != null);
  if (scored.length < 2) {
    return {
      label: "样本不足",
      tone: "text-dim",
      summary: "还需要至少两次同目标复练，才能判断趋势。",
      advice: "先继续做 1-2 次同一 focus 的短打复练。",
    };
  }

  const recent = scored.slice(-5);
  const first = recent[0].avg_score;
  const last = recent[recent.length - 1].avg_score;
  const delta = Number((last - first).toFixed(1));
  let upSteps = 0;
  let downSteps = 0;
  let flatSteps = 0;
  for (let i = 1; i < recent.length; i += 1) {
    const diff = recent[i].avg_score - recent[i - 1].avg_score;
    if (diff >= 0.6) upSteps += 1;
    else if (diff <= -0.6) downSteps += 1;
    else flatSteps += 1;
  }

  if (delta >= 1.2 && upSteps >= Math.max(1, recent.length - 2)) {
    return {
      label: "持续上升",
      tone: "text-green",
      summary: `最近 ${recent.length} 次同目标复练整体呈上升趋势（${delta >= 0 ? "+" : ""}${delta} 分）。`,
      advice: "可以减少同类重复题，转向更深一层的 why / 边界 / 追问。",
    };
  }
  if (delta <= -1.2 && downSteps >= Math.max(1, recent.length - 2)) {
    return {
      label: "出现回退",
      tone: "text-red",
      summary: `最近 ${recent.length} 次同目标复练整体在回落（${delta} 分）。`,
      advice: "建议回到更基础的口语化表达和关键点复述，先稳住再加压。",
    };
  }
  if (upSteps > 0 && downSteps > 0) {
    return {
      label: "波动明显",
      tone: "text-accent-light",
      summary: `最近 ${recent.length} 次分数有起伏（净变化 ${delta >= 0 ? "+" : ""}${delta} 分）。`,
      advice: "说明理解可能还不稳定，建议固定同一种答题结构，再做 1-2 轮验收。",
    };
  }
  return {
    label: "进入平台期",
    tone: "text-dim",
    summary: `最近 ${recent.length} 次表现基本持平（净变化 ${delta >= 0 ? "+" : ""}${delta} 分）。`,
    advice: "别再刷同一层问题了，应该改成更刁钻的追问或项目化表达训练。",
  };
}

function PracticeTrendCard({ focusLabel, items = [] }) {
  if (!focusLabel || !items.length) return null;
  const recent = items.slice(-5);
  const trend = analyzePracticeTrend(recent);
  return (
    <div className="bg-card border border-border rounded-2xl px-5 py-6 md:px-6 md:py-6 mb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="text-lg font-semibold">同一目标复练轨迹</div>
        <div className="text-sm text-dim">{focusLabel}</div>
      </div>
      <div className="mb-4 rounded-xl border border-border bg-hover px-4 py-3">
        <div className={`text-sm font-semibold mb-1 ${trend.tone}`}>轨迹判断：{trend.label}</div>
        <div className="text-[13px] text-text leading-[1.7]">{trend.summary}</div>
        <div className="text-[12px] text-dim mt-1.5">建议：{trend.advice}</div>
      </div>
      <div className="flex items-end gap-2 h-28 mb-3">
        {recent.map((item, idx) => {
          const score = typeof item.avg_score === "number" ? item.avg_score : 0;
          const height = Math.max(12, Math.round((score / 10) * 100));
          const color = score >= 8 ? "var(--green)" : score >= 6 ? "var(--accent-light)" : "var(--red)";
          return (
            <div key={`${item.session_id}-${idx}`} className="flex-1 min-w-0 flex flex-col items-center gap-1">
              <div className="text-[11px] text-dim">{typeof item.avg_score === "number" ? item.avg_score : "-"}</div>
              <div className="w-full rounded-t-md" style={{ height: `${height}%`, background: color, minHeight: 12 }} />
              <div className="text-[10px] text-dim whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
                {String(item.created_at || "").slice(5, 10)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {recent.map((item) => (
          <div key={item.session_id} className="px-3 py-2 rounded-lg text-[12px] bg-hover border border-border text-text">
            {String(item.created_at || "").slice(5, 16)} · {item.avg_score ?? "-"}/10
            {item.focus_hit_rate != null ? ` · 命中 ${(item.focus_hit_rate * 100).toFixed(0)}%` : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

function SoloRecordingReview({ topicsCovered, overall }) {
  const avgScore = overall?.avg_score || "-";
  return (
    <>
      {/* Overall summary */}
      <div className="bg-card border border-border rounded-2xl px-5 py-6 md:px-6 md:py-6 mb-6">
        <div className="text-lg font-semibold mb-3">整体评价</div>
        <div>
          <span className="inline-block text-[32px] font-bold mr-2" style={{ color: typeof avgScore === "number" ? getScoreColor(avgScore).color : "var(--text)" }}>
            {avgScore}
          </span>
          <span className="text-base text-dim">/10</span>
        </div>
        {overall?.summary && (
          <div className="mt-4 text-[15px] leading-[1.8] text-text">{overall.summary}</div>
        )}
      </div>

      {/* Weak & strong points */}
      {overall?.new_weak_points?.length > 0 && (
        <>
          <SectionTitle className="mt-2">薄弱点</SectionTitle>
          <div className="flex flex-col gap-1.5 mb-4">
            {overall.new_weak_points.map((wp, i) => (
              <div key={i} className="px-3 py-2 rounded-lg text-[13px] text-text bg-red/8 border border-red/20">
                {typeof wp === "string" ? wp : wp.point || JSON.stringify(wp)}
              </div>
            ))}
          </div>
        </>
      )}
      {overall?.new_strong_points?.length > 0 && (
        <>
          <SectionTitle className="mt-2">亮点</SectionTitle>
          <div className="flex flex-col gap-1.5 mb-4">
            {overall.new_strong_points.map((sp, i) => (
              <div key={i} className="px-3 py-2 rounded-lg text-[13px] text-text bg-green/8 border border-green/20">
                {typeof sp === "string" ? sp : sp.point || JSON.stringify(sp)}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Topics covered */}
      {topicsCovered?.length > 0 && (
        <>
          <SectionTitle className="mt-2">涉及知识点</SectionTitle>
          {topicsCovered.map((t, i) => {
            const score = t.score;
            const sc = typeof score === "number" ? getScoreColor(score) : { bg: "var(--bg-hover)", color: "var(--text-dim)" };
            return (
              <div key={i} className="bg-card border border-border rounded-xl px-4 py-4 md:px-5 mb-4 animate-fade-in">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[15px] font-medium">{topicDisplayName(t.topic, topics) || "未知知识点"}</span>
                  <span className="text-sm font-bold px-3 py-1 rounded-lg" style={{ background: sc.bg, color: sc.color }}>
                    {score ?? "-"}/10
                  </span>
                </div>
                {t.assessment && <div className="text-sm leading-[1.7] text-text mb-2">{t.assessment}</div>}
                {t.understanding && <div className="text-[13px] text-dim italic mb-1">理解程度: {t.understanding}</div>}
                {t.errors?.length > 0 && <div className="text-[13px] text-red leading-normal">错误: {t.errors.join("、")}</div>}
                {t.missing?.length > 0 && <div className="text-[13px] text-dim leading-normal">遗漏: {t.missing.join("、")}</div>}
              </div>
            );
          })}
        </>
      )}
    </>
  );
}

function DrillReview({ sessionId, scores, overall, questions, answers, topic, topics, persistedReferenceAnswers = {}, persistedReferenceFollowups = {}, persistedImprovedAnswers = {} }) {
  const answerMap = {};
  for (const a of (answers || [])) answerMap[a.question_id] = a.answer;
  const scoreMap = {};
  for (const s of (scores || [])) scoreMap[s.question_id] = s;
  const [refAnswers, setRefAnswers] = useState(() => {
    const seeded = {};
    Object.entries(persistedReferenceAnswers || {}).forEach(([key, value]) => {
      const qid = value?.question_id;
      if (qid != null) seeded[qid] = value;
    });
    return seeded;
  });
  const [refLoading, setRefLoading] = useState({});
  const [followupOpen, setFollowupOpen] = useState({});
  const [followupInput, setFollowupInput] = useState({});
  const [followupLoading, setFollowupLoading] = useState({});
  const [improvedLoading, setImprovedLoading] = useState({});
  const [improvedAnswers, setImprovedAnswers] = useState(() => {
    const seeded = {};
    Object.entries(persistedImprovedAnswers || {}).forEach(([key, value]) => {
      const qid = value?.question_id;
      if (qid != null) seeded[qid] = value;
    });
    return seeded;
  });
  const [followupHistory, setFollowupHistory] = useState(() => {
    const seeded = {};
    Object.entries(persistedReferenceFollowups || {}).forEach(([key, items]) => {
      const qid = String(key || "").startsWith("q:") ? Number(String(key).slice(2)) : null;
      if (qid != null && !Number.isNaN(qid)) seeded[qid] = items || [];
    });
    return seeded;
  });

  const handleRefAnswer = async (qId, questionText, forceRegenerate = false) => {
    if (refAnswers[qId]?.reference_answer && !forceRegenerate) return;
    setRefLoading((p) => ({ ...p, [qId]: true }));
    try {
      const data = await getReferenceAnswer(sessionId, topic, questionText, qId, forceRegenerate);
      setRefAnswers((p) => ({
        ...p,
        [qId]: {
          reference_answer: data.reference_answer,
          generated_at: data.generated_at,
          cached: data.cached,
          question_key: data.question_key,
          knowledge_refs: data.knowledge_refs || [],
          model: data.model,
        },
      }));
    } catch (e) {
      setRefAnswers((p) => ({
        ...p,
        [qId]: {
          reference_answer: "生成失败: " + e.message,
          generated_at: null,
          cached: false,
          question_key: null,
          knowledge_refs: [],
        },
      }));
    }
    setRefLoading((p) => ({ ...p, [qId]: false }));
  };

  const handleFollowup = async (qId, questionText) => {
    const text = (followupInput[qId] || "").trim();
    const referenceAnswer = refAnswers[qId]?.reference_answer || "";
    if (!text) return;
    setFollowupLoading((p) => ({ ...p, [qId]: true }));
    try {
      const data = await followupReferenceAnswer(sessionId, topic, questionText, text, qId, referenceAnswer);
      setFollowupHistory((p) => ({ ...p, [qId]: data.history || [] }));
      setFollowupInput((p) => ({ ...p, [qId]: "" }));
    } catch (e) {
      setFollowupHistory((p) => ({
        ...p,
        [qId]: [
          ...(p[qId] || []),
          {
            followup: text,
            answer: "追问失败: " + e.message,
            created_at: new Date().toISOString(),
            model: null,
            error: true,
          },
        ],
      }));
    }
    setFollowupLoading((p) => ({ ...p, [qId]: false }));
  };

  const handleImprovedAnswer = async (qId, questionText) => {
    const referenceAnswer = refAnswers[qId]?.reference_answer || "";
    const originalAnswer = answerMap[qId] || "";
    if (!referenceAnswer) return;
    setImprovedLoading((p) => ({ ...p, [qId]: true }));
    try {
      const data = await getImprovedAnswer(sessionId, topic, questionText, originalAnswer, qId, referenceAnswer, false);
      setImprovedAnswers((p) => ({
        ...p,
        [qId]: {
          improved_answer: data.improved_answer,
          generated_at: data.generated_at,
          cached: data.cached,
          question_key: data.question_key,
          model: data.model,
        },
      }));
    } catch (e) {
      setImprovedAnswers((p) => ({
        ...p,
        [qId]: {
          improved_answer: "生成失败: " + e.message,
          generated_at: null,
          cached: false,
          question_key: null,
          model: null,
        },
      }));
    }
    setImprovedLoading((p) => ({ ...p, [qId]: false }));
  };

  const handlePracticeImprovedAnswer = async (qId, questionText, focusArea = "") => {
    const improved = improvedAnswers[qId]?.improved_answer || "";
    const focusLabel = scoreMap[qId]?.weak_point || focusArea || "改进版回答复练";
    if (!improved || !topic) return;
    try {
      const data = await startInterview("topic_drill", topic, {
        focusKeyword: `${questionText} ${focusLabel}`,
        focusLabel,
        practiceContext: `原题：${questionText}\n\n你的原回答：${answerMap[qId] || "（无）"}\n\n改进版答案：${improved}`,
        practiceBaseline: {
          question: questionText,
          focus_label: focusLabel,
          source_score: scoreMap[qId]?.score ?? null,
          original_answer: answerMap[qId] || "",
          improved_answer: improved,
        },
      });
      navigate(`/interview/${data.session_id}`, { state: data });
    } catch (e) {
      alert(`启动复练失败：${e.message}`);
    }
  };

  const avgScore = overall?.avg_score || "-";

  return (
    <>
      {/* Overall summary */}
      <div className="bg-card border border-border rounded-2xl px-5 py-6 md:px-6 md:py-6 mb-6">
        <div className="text-lg font-semibold mb-3">整体评价</div>
        <div>
          <span className="inline-block text-[32px] font-bold mr-2" style={{ color: typeof avgScore === "number" ? getScoreColor(avgScore).color : "var(--text)" }}>
            {avgScore}
          </span>
          <span className="text-base text-dim">/10</span>
        </div>
        {overall?.summary && (
          <div className="mt-4 text-[15px] leading-[1.8] text-text">{overall.summary}</div>
        )}
        <div className="flex flex-wrap gap-4 mt-4">
          <span className="inline-flex items-center rounded-lg bg-hover px-3.5 py-1.5 text-[13px] font-medium text-dim">
            共 {questions?.length || 0} 题
          </span>
          <span className="inline-flex items-center rounded-lg bg-hover px-3.5 py-1.5 text-[13px] font-medium text-dim">
            已答 {answers?.filter((a) => a.answer).length || 0} 题
          </span>
        </div>
      </div>

      {/* Targeting stats */}
      {overall?.targeting_stats && (
        <div className="bg-card border border-border rounded-2xl px-5 py-6 md:px-6 md:py-6 mb-6">
          <SectionTitle>针对性训练命中</SectionTitle>
          {overall.targeting_stats.focus_label && (
            <div className="mb-4 rounded-xl border border-green/20 bg-green/5 px-4 py-3">
              <div className="text-[13px] font-semibold text-text mb-1">本次显式修复目标</div>
              <div className="text-[12px] text-dim leading-[1.7]">
                围绕「{overall.targeting_stats.focus_label}」启动本轮 drill。
                前3题命中 {overall.targeting_stats.front3_focus_hits || 0} 次，
                全场命中 {overall.targeting_stats.focus_hit_count || 0} / {overall.targeting_stats.attempted_questions || 0} 题。
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-3 mb-4">
            <span className="inline-flex items-center rounded-lg bg-hover px-3.5 py-1.5 text-[13px] font-medium text-dim">
              命中率 {(overall.targeting_stats.hit_rate * 100).toFixed(0)}%
            </span>
            <span className="inline-flex items-center rounded-lg bg-hover px-3.5 py-1.5 text-[13px] font-medium text-dim">
              修复率 {(overall.targeting_stats.repair_rate * 100).toFixed(0)}%
            </span>
            <span className="inline-flex items-center rounded-lg bg-hover px-3.5 py-1.5 text-[13px] font-medium text-dim">
              前3题命中高优先级点 {overall.targeting_stats.front3_high_priority_hits || 0} 次
            </span>
            {overall.targeting_stats.focus_label && (
              <span className="inline-flex items-center rounded-lg bg-hover px-3.5 py-1.5 text-[13px] font-medium text-dim">
                focus 命中率 {((overall.targeting_stats.focus_hit_rate || 0) * 100).toFixed(0)}%
              </span>
            )}
          </div>
          {overall.targeting_stats.strategy_snapshot?.length > 0 && (
            <div className="mb-3">
              <div className="text-[15px] font-medium mb-2">本场重点覆盖 weak points</div>
              <div className="flex flex-col gap-1.5">
                {overall.targeting_stats.strategy_snapshot.map((item, idx) => {
                  const badge = strategyBadge(item.adaptive_strategy);
                  return (
                    <div key={idx} className="px-3 py-2 rounded-lg text-[13px] text-text bg-hover border border-border">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span>{item.point}</span>
                        <button
                          onClick={() => navigate(`/profile/topic/${topic}`)}
                          className="px-2 py-0.5 rounded text-[11px] font-medium border-none cursor-pointer"
                          style={{ background: badge.bg, color: badge.color }}
                        >
                          策略 {badge.label}
                        </button>
                        {item.priority_score != null && <span className="text-[12px] text-dim">优先级 {item.priority_score}</span>}
                        {item.semantic_bucket && topic && (
                          <button
                            onClick={() => navigate("/knowledge", { state: { selectedTopic: topic, searchKeyword: bucketLabel(item.semantic_bucket) } })}
                            className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-accent/10 text-accent-light border-none cursor-pointer"
                            title={item.semantic_bucket}
                          >
                            {bucketLabel(item.semantic_bucket)}
                          </button>
                        )}
                        {topic && (
                          <button
                            onClick={() => navigate("/", { state: { quickStartMode: "topic_drill", quickStartTopic: topic } })}
                            className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-green/10 text-green border-none cursor-pointer"
                          >
                            开始本轮训练
                          </button>
                        )}
                      </div>
                      <div className="text-[12px] leading-[1.7] text-dim">{strategyReason(item)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {overall.targeting_stats.matched_items?.length > 0 && (
            <div>
              <div className="text-[15px] font-medium mb-2">命中结果</div>
              <div className="flex flex-col gap-1.5">
                {overall.targeting_stats.matched_items.map((item, idx) => {
                  const badge = strategyBadge(item.adaptive_strategy);
                  return (
                    <div key={idx} className="px-3 py-2 rounded-lg text-[13px] border border-border bg-hover">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-medium">Q{item.question_id}</span>
                        <span>{item.weak_point}</span>
                        <button
                          onClick={() => navigate(`/profile/topic/${topic}`)}
                          className="px-2 py-0.5 rounded text-[11px] font-medium border-none cursor-pointer"
                          style={{ background: badge.bg, color: badge.color }}
                        >
                          策略 {badge.label}
                        </button>
                        {item.semantic_bucket && topic && (
                          <button
                            onClick={() => navigate("/knowledge", { state: { selectedTopic: topic, searchKeyword: bucketLabel(item.semantic_bucket) } })}
                            className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-accent/10 text-accent-light border-none cursor-pointer"
                            title={item.semantic_bucket}
                          >
                            {bucketLabel(item.semantic_bucket)}
                          </button>
                        )}
                        {item.score_10 != null ? <span className="text-[12px] text-dim">{item.score_10}/10</span> : null}
                        {item.focus_hit && (
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-green/10 text-green">
                            命中本次 focus
                          </span>
                        )}
                        <span style={{ color: item.improved ? "var(--green)" : "var(--red)" }}>
                          {item.improved ? "本次有回升" : "仍需继续修复"}
                        </span>
                        {topic && (
                          <button
                            onClick={() => navigate("/", { state: { quickStartMode: "topic_drill", quickStartTopic: topic } })}
                            className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-green/10 text-green border-none cursor-pointer"
                          >
                            开始本轮训练
                          </button>
                        )}
                      </div>
                      <div className="text-[12px] leading-[1.7] text-dim">{strategyReason(item)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Weak points */}
      {overall?.new_weak_points?.length > 0 && (
        <>
          <SectionTitle className="mt-2">薄弱点</SectionTitle>
          <div className="flex flex-col gap-1.5 mb-4">
            {overall.new_weak_points.map((wp, i) => (
              <div key={i} className="px-3 py-2 rounded-lg text-[13px] text-text bg-red/8 border border-red/20">
                {typeof wp === "string" ? wp : wp.point || JSON.stringify(wp)}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Strong points */}
      {overall?.new_strong_points?.length > 0 && (
        <>
          <SectionTitle className="mt-2">亮点</SectionTitle>
          <div className="flex flex-col gap-1.5 mb-4">
            {overall.new_strong_points.map((sp, i) => (
              <div key={i} className="px-3 py-2 rounded-lg text-[13px] text-text bg-green/8 border border-green/20">
                {typeof sp === "string" ? sp : sp.point || JSON.stringify(sp)}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Per-question cards */}
      <SectionTitle className="mt-2">逐题复盘</SectionTitle>
      {(questions || []).map((q) => {
        const s = scoreMap[q.id] || {};
        const answer = answerMap[q.id];
        const isSkipped = !answer;
        const score = s.score;
        const sc = typeof score === "number" ? getScoreColor(score) : { bg: "var(--bg-hover)", color: "var(--text-dim)" };

        if (isSkipped) {
          return (
            <div key={q.id} className="bg-card border border-border rounded-xl px-4 py-3 md:px-5 mb-4 opacity-50 flex items-center justify-between animate-fade-in">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-accent-light bg-accent/12 px-2.5 py-0.5 rounded-md">Q{q.id}</span>
                <span className="text-sm text-dim">{q.question.slice(0, 50)}{q.question.length > 50 ? "..." : ""}</span>
              </div>
              <span className="text-[13px] text-dim">未作答</span>
            </div>
          );
        }

        return (
          <div key={q.id} className="bg-card border border-border rounded-xl px-4 py-4 md:px-5 mb-4 animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-accent-light bg-accent/12 px-2.5 py-0.5 rounded-md">Q{q.id}</span>
                {q.focus_area && (
                  <button
                    onClick={() => topic && navigate(`/profile/topic/${topic}`)}
                    className="text-xs text-dim bg-hover px-2 py-0.5 rounded border-none cursor-pointer"
                  >
                    {q.focus_area}
                  </button>
                )}
              </div>
              <span className="text-sm font-bold px-3 py-1 rounded-lg" style={{ background: sc.bg, color: sc.color }}>
                {score ?? "-"}/10
              </span>
            </div>

            <div className="text-[15px] font-medium leading-relaxed mb-3">{q.question}</div>

            <div className="bg-hover rounded-lg px-3 py-3 md:px-3.5 mb-3">
              <div className="text-xs font-semibold text-dim mb-1.5 opacity-70">你的回答</div>
              <div className="text-sm leading-relaxed whitespace-pre-wrap">{answer}</div>
            </div>

            {s.assessment && s.assessment !== "未作答" && (
              <div className="text-sm leading-[1.7] text-text mb-2">
                <strong className="text-xs opacity-60">点评: </strong>{s.assessment}
              </div>
            )}

            {s.improvement && (
              <div className="text-sm leading-[1.7] text-accent-light bg-accent/8 rounded-lg px-3 py-2.5 md:px-3.5 mb-2">
                <strong className="text-xs opacity-70">改进建议: </strong>{s.improvement}
              </div>
            )}

            {s.understanding && s.understanding !== "未作答" && (
              <div className="text-[13px] text-dim italic mt-1">理解程度: {s.understanding}</div>
            )}

            {s.key_missing?.length > 0 && (
              <div className="text-[13px] text-red leading-normal">遗漏关键点: {s.key_missing.join("、")}</div>
            )}

            {s.weak_point && (
              <div className="mt-2 text-[13px] text-red leading-[1.7] flex items-center gap-2 flex-wrap">
                <span>薄弱点标签: {s.weak_point}</span>
                {s.semantic_bucket && topic && (
                  <button
                    onClick={() => navigate("/knowledge", { state: { selectedTopic: topic, searchKeyword: bucketLabel(s.semantic_bucket) } })}
                    className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-accent/10 text-accent-light border-none cursor-pointer"
                    title={s.semantic_bucket}
                  >
                    {bucketLabel(s.semantic_bucket)}
                  </button>
                )}
                {topic && (
                  <button
                    onClick={() => navigate(`/profile/topic/${topic}`)}
                    className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-accent/10 text-accent-light border-none cursor-pointer"
                  >
                    看专题
                  </button>
                )}
                {topic && (
                  <button
                    onClick={() => navigate("/knowledge", { state: { selectedTopic: topic, searchKeyword: s.semantic_bucket ? bucketLabel(s.semantic_bucket) : (s.weak_point || q.focus_area || q.question) } })}
                    className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-hover text-dim border-none cursor-pointer"
                  >
                    先看题库
                  </button>
                )}
                {topic && (
                  <button
                    onClick={() => navigate("/", { state: { quickStartMode: "topic_drill", quickStartTopic: topic } })}
                    className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-green/10 text-green border-none cursor-pointer"
                  >
                    去修复
                  </button>
                )}
              </div>
            )}

            <InlineAutoScoreDetail detail={s.auto_score_detail} />

            {topic && (
              <div className="mt-3 pt-3 border-t border-border">
                {refAnswers[q.id]?.reference_answer ? (
                  <div className="text-sm leading-[1.8]">
                    <div className="text-xs font-semibold text-dim mb-2 flex items-center justify-between gap-3 flex-wrap">
                      <span className="flex items-center gap-1.5">
                        <BookOpen size={13} /> 标准参考答案
                      </span>
                      <div className="flex items-center gap-2 flex-wrap">
                        {refAnswers[q.id]?.generated_at && (
                          <span className="text-[11px] text-dim">生成于 {refAnswers[q.id].generated_at.replace("T", " ").slice(0, 16)}</span>
                        )}
                        <button
                          className="text-[12px] text-dim bg-transparent border-none cursor-pointer"
                          onClick={() => handleRefAnswer(q.id, q.question, true)}
                          disabled={refLoading[q.id]}
                        >
                          {refLoading[q.id] ? "重新生成中..." : "重新生成"}
                        </button>
                      </div>
                    </div>
                    <div className="md-content bg-hover rounded-lg px-3.5 py-3">
                      <ReactMarkdown>{refAnswers[q.id].reference_answer}</ReactMarkdown>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="text-[13px] text-accent-light flex items-center gap-1.5 bg-transparent border-none cursor-pointer"
                        onClick={() => setFollowupOpen((p) => ({ ...p, [q.id]: !p[q.id] }))}
                      >
                        <BookOpen size={13} /> {followupOpen[q.id] ? "收起继续问 AI" : "继续问 AI"}
                      </button>
                      <button
                        className="text-[13px] text-green flex items-center gap-1.5 bg-transparent border-none cursor-pointer disabled:opacity-50"
                        onClick={() => handleImprovedAnswer(q.id, q.question)}
                        disabled={improvedLoading[q.id] || !refAnswers[q.id]?.reference_answer}
                      >
                        <BookOpen size={13} /> {improvedLoading[q.id] ? "整理中..." : "吸收为改进版答案"}
                      </button>
                    </div>

                    {improvedAnswers[q.id]?.improved_answer && (
                      <div className="mt-3 rounded-lg border border-green/20 bg-green/5 px-3 py-3">
                        <div className="text-xs font-semibold text-dim mb-2 flex items-center justify-between gap-2 flex-wrap">
                          <span>我的改进版答案</span>
                          {improvedAnswers[q.id]?.generated_at && (
                            <span className="text-[11px] text-dim">{improvedAnswers[q.id].generated_at.replace("T", " ").slice(0, 16)}</span>
                          )}
                        </div>
                        <div className="md-content rounded-lg bg-card px-3.5 py-3">
                          <ReactMarkdown>{improvedAnswers[q.id].improved_answer}</ReactMarkdown>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            className="text-[13px] text-green flex items-center gap-1.5 bg-transparent border-none cursor-pointer"
                            onClick={() => handlePracticeImprovedAnswer(q.id, q.question, q.focus_area)}
                          >
                            <BookOpen size={13} /> 带着这版再练一遍
                          </button>
                        </div>
                      </div>
                    )}

                    {followupOpen[q.id] && (
                      <div className="mt-3 rounded-lg border border-border bg-hover px-3 py-3">
                        <div className="text-xs font-semibold text-dim mb-2">临时追问（不会覆盖标准参考答案）</div>
                        <div className="flex flex-wrap gap-2 mb-2.5">
                          {FOLLOWUP_QUICK_ACTIONS.map((item) => (
                            <button
                              key={item.label}
                              className="px-2.5 py-1 rounded-lg text-[12px] bg-card text-dim border border-border cursor-pointer"
                              onClick={() => setFollowupInput((p) => ({ ...p, [q.id]: item.prompt }))}
                              type="button"
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                        <textarea
                          className="w-full min-h-[84px] rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-text resize-y outline-none"
                          placeholder="例如：给我一个更口语化的版本 / 如果面试官继续追问一致性怎么答 / 给一个项目里的实际例子"
                          value={followupInput[q.id] || ""}
                          onChange={(e) => setFollowupInput((p) => ({ ...p, [q.id]: e.target.value }))}
                        />
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <button
                            className="px-3 py-1.5 rounded-lg text-[13px] bg-accent/10 text-accent-light border-none cursor-pointer disabled:opacity-50"
                            onClick={() => handleFollowup(q.id, q.question)}
                            disabled={followupLoading[q.id] || !(followupInput[q.id] || "").trim()}
                          >
                            {followupLoading[q.id] ? "AI 思考中..." : "发送追问"}
                          </button>
                          <button
                            className="px-3 py-1.5 rounded-lg text-[13px] bg-transparent text-dim border border-border cursor-pointer"
                            onClick={() => {
                              setFollowupInput((p) => ({ ...p, [q.id]: "" }));
                            }}
                          >
                            清空输入
                          </button>
                        </div>
                        {followupHistory[q.id]?.length > 0 && (
                          <div className="mt-3">
                            <div className="text-xs font-semibold text-dim mb-2">AI 临时辅导记录</div>
                            <div className="flex flex-col gap-3">
                              {followupHistory[q.id].map((item, idx) => (
                                <div key={`${q.id}-${idx}`} className="rounded-lg border border-border bg-card px-3.5 py-3">
                                  <div className="text-[12px] font-semibold text-accent-light mb-1">你追问</div>
                                  <div className="text-sm leading-[1.7] whitespace-pre-wrap">{item.followup}</div>
                                  <div className="text-[12px] font-semibold text-dim mt-3 mb-1">AI 回答</div>
                                  <div className="md-content">
                                    <ReactMarkdown>{item.answer || ""}</ReactMarkdown>
                                  </div>
                                  {item.created_at && (
                                    <div className="mt-2 text-[11px] text-dim">{item.created_at.replace("T", " ").slice(0, 16)}</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    className="text-[13px] text-accent-light flex items-center gap-1.5 bg-transparent border-none cursor-pointer transition-opacity disabled:opacity-50"
                    onClick={() => handleRefAnswer(q.id, q.question)}
                    disabled={refLoading[q.id]}
                  >
                    <BookOpen size={13} />
                    {refLoading[q.id] ? "正在生成参考答案..." : "查看标准参考答案"}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

export default function Review() {
  const { sessionId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const stateData = location.state || {};
  const isDrill = stateData.mode === "topic_drill";
  const isRecording = stateData.mode === "recording";
  const isRecordingDual = isRecording && stateData.recording_mode === "dual";

  const [review, setReview] = useState(stateData.review || null);
  const [scores, setScores] = useState(stateData.scores || null);
  const [overall, setOverall] = useState(stateData.overall || null);
  const [questions, setQuestions] = useState(stateData.questions || []);
  const [answers, setAnswers] = useState(stateData.answers || []);
  const [messages, setMessages] = useState(stateData.messages || []);
  const [mode, setMode] = useState(stateData.mode || null);
  const [topic, setTopic] = useState(stateData.topic || null);
  const [topics, setTopics] = useState({});
  const [topicsCovered, setTopicsCovered] = useState(stateData.topics_covered || []);
  const [autoScore, setAutoScore] = useState(stateData.auto_score || null);
  const [referenceAnswers, setReferenceAnswers] = useState(stateData.reference_answers || {});
  const [referenceFollowups, setReferenceFollowups] = useState(stateData.reference_followups || {});
  const [improvedAnswers, setImprovedAnswers] = useState(stateData.improved_answers || {});
  const [practiceTrend, setPracticeTrend] = useState([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [loading, setLoading] = useState(!review && !scores);

  useEffect(() => {
    getTopics().then(setTopics).catch(() => {});
  }, []);

  useEffect(() => {
    if (!review && !scores) {
      setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
      getReview(sessionId)
        .then((data) => {
          setReview(data.review);
          if (data.scores) setScores(data.scores);
          if (data.questions) setQuestions(data.questions);
          if (data.transcript) {
            setMessages(data.transcript);
            if (data.mode === "topic_drill" && data.questions) {
              const ans = data.questions.map((q) => {
                const qIdx = data.transcript.findIndex(m => m.role === "assistant" && m.content === q.question);
                const next = qIdx >= 0 ? data.transcript[qIdx + 1] : null;
                return { question_id: q.id, answer: next?.role === "user" ? next.content : "" };
              });
              setAnswers(ans);
            }
          }
          if (data.mode) setMode(data.mode);
          if (data.topic) setTopic(data.topic);
          if (data.overall && Object.keys(data.overall).length) {
            setOverall(data.overall);
          } else if (data.weak_points) {
            const wp = Array.isArray(data.weak_points) ? data.weak_points : [];
            if (wp.length) setOverall((prev) => ({ ...prev, new_weak_points: wp }));
          }
          if (data.reference_answers) setReferenceAnswers(data.reference_answers);
          if (data.reference_followups) setReferenceFollowups(data.reference_followups);
          if (data.improved_answers) setImprovedAnswers(data.improved_answers);
          if (data.auto_score && Object.keys(data.auto_score).length) {
            setAutoScore(data.auto_score);
          } else if (data.review) {
            scoreInterviewAnswer({
              mode: data.mode || "resume",
              topic: data.topic || null,
              review: data.review,
              transcript: data.transcript || [],
            }).then(setAutoScore).catch(() => {});
          }
        })
        .catch((err) => setReview("加载失败: " + err.message))
        .finally(() => setLoading(false));
    }
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const focusLabel = overall?.practice_comparison?.focus_label;
    if (!topic || !focusLabel) return;
    getHistory(50, 0, "topic_drill", topic)
      .then((data) => {
        const items = (data.items || [])
          .filter((item) => item.focus_label === focusLabel)
          .reverse();
        setPracticeTrend(items);
      })
      .catch(() => {});
  }, [topic, overall?.practice_comparison?.focus_label]);

  if (loading) {
    return <div className="text-center py-15 text-dim">加载复盘报告中...</div>;
  }

  const showDrill = isDrill || isRecordingDual || (mode === "topic_drill" && (scores || questions.length > 0)) || (mode === "recording" && stateData.recording_mode === "dual");

  return (
    <div className="flex-1 px-4 py-8 md:px-6 md:py-10 max-w-3xl mx-auto w-full">
      <PageTitle
        className="mb-8"
        title={isRecording ? "录音复盘" : showDrill ? "训练复盘" : "面试复盘"}
        subtitle={`Session: ${sessionId}`}
      />

      <AutoScoreCard autoScore={autoScore} />
      <PracticeComparisonCard comparison={overall?.practice_comparison} />
      <PracticeTrendCard focusLabel={overall?.practice_comparison?.focus_label} items={practiceTrend} />

      {isRecording && !isRecordingDual ? (
        <SoloRecordingReview topicsCovered={topicsCovered} overall={overall} />
      ) : showDrill ? (
        <DrillReview sessionId={sessionId} scores={scores} overall={overall} questions={questions} answers={answers} topic={topic} topics={topics} persistedReferenceAnswers={referenceAnswers} persistedReferenceFollowups={referenceFollowups} persistedImprovedAnswers={improvedAnswers} />
      ) : (
        <>
          <DimensionScores
            dimensionScores={stateData.dimension_scores || overall?.dimension_scores}
            avgScore={stateData.avg_score ?? overall?.avg_score}
          />
          <div className="bg-card border border-border rounded-box px-5 py-6 md:px-8 leading-[1.8] text-[15px]">
            <div className="md-content">
              <ReactMarkdown>{review || ""}</ReactMarkdown>
            </div>
          </div>

          {messages.length > 0 && (
            <>
              <button
                className="mt-6 mr-3 px-5 py-2.5 rounded-box bg-transparent text-accent-light text-sm border border-border cursor-pointer"
                onClick={() => setShowTranscript(!showTranscript)}
              >
                {showTranscript ? "收起面试记录" : "查看面试记录"}
              </button>
              {showTranscript && (
                <div className="mt-4 bg-card border border-border rounded-box px-4 py-5 md:px-6 max-h-[500px] overflow-y-auto">
                  {messages.map((msg, i) => (
                    <div key={i} className="py-2 border-b border-border text-sm leading-relaxed">
                      <strong style={{ color: msg.role === "user" ? "var(--accent-light)" : "var(--green)" }}>
                        {msg.role === "user" ? "你" : "面试官"}:
                      </strong>{" "}
                      {msg.content}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      <button
        className="inline-block mt-6 px-6 py-2.5 rounded-box bg-hover text-text text-sm border border-border cursor-pointer"
        onClick={() => navigate("/")}
      >
        返回首页
      </button>
    </div>
  );
}
