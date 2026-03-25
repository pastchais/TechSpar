import { useParams, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { AppSection, CalloutCard, ExpandableReviewSection, InsightCard, InsightList, ObservationColumn, PageTitle, ScoreRows, SectionTitle, SubtleButton, Badge, OutlineButton, PanelHeader, PrimaryButton, SurfaceCard } from "../components/ui.jsx";
import { BookOpen } from "lucide-react";
import { getReview, getReferenceAnswer, followupReferenceAnswer, getImprovedAnswer, scoreInterviewAnswer, getTopics, startInterview, getHistory, getAnalysisStatus } from "../api/interview";
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

function trainingLabelBadge(label) {
  const text = label || "稳定性验收";
  if (text === "基础稳固") return { label: text, bg: "rgba(239,68,68,.12)", color: "var(--red)" };
  if (text === "迁移验收") return { label: text, bg: "rgba(34,197,94,.12)", color: "var(--green)" };
  if (text === "平台突破") return { label: text, bg: "rgba(168,85,247,.12)", color: "#a855f7" };
  if (text === "边界追问") return { label: text, bg: "rgba(245,158,11,.12)", color: "#f59e0b" };
  return { label: text, bg: "rgba(91,141,239,.12)", color: "var(--accent-light)" };
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
  const entries = Object.entries(DIMENSION_LABELS)
    .filter(([k]) => dimensionScores[k] != null)
    .map(([key, label]) => {
      const score = dimensionScores[key];
      const color = score >= 8 ? "var(--green)" : score >= 6 ? "var(--accent-light)" : score >= 4 ? "#e2b93b" : "var(--red)";
      return { key, label, value: score, percent: score * 10, color };
    });
  if (!entries.length) return null;

  return (
    <SurfaceCard className="px-5 py-6 md:px-6 md:py-6 mb-6">
      <PanelHeader
        title="维度评分"
        action={avgScore != null ? <span className="text-sm font-normal text-dim">综合 {avgScore}/10</span> : null}
      />
      <ScoreRows items={entries} labelWidth="w-[64px] md:w-[100px]" />
    </SurfaceCard>
  );
}

function AutoScoreCard({ autoScore }) {
  if (!autoScore || !Object.keys(autoScore).length) return null;
  const entries = Object.entries(AUTO_SCORE_LABELS)
    .filter(([k]) => autoScore[k] != null)
    .map(([key, label]) => {
      const score = autoScore[key];
      const percent = (score / 5) * 100;
      const color = score >= 4 ? "var(--green)" : score >= 3 ? "var(--accent-light)" : "var(--red)";
      return { key, label, value: score, percent, color };
    });
  return (
    <SurfaceCard className="px-5 py-6 md:px-6 md:py-6 mb-6">
      <PanelHeader
        title="自动评分"
        action={<div className="text-sm text-dim">总分 {autoScore.total_score ?? "-"}/25 · {autoScore.summary || ""}</div>}
      />
      <ScoreRows items={entries} labelWidth="w-[72px] md:w-[110px]" />
      {autoScore.reason && <div className="mt-4 text-sm text-text leading-[1.8]">{autoScore.reason}</div>}
      <InsightList className="mt-4" title="漏掉的关键点" items={autoScore.missing_points || []} tone="red" />
      <InsightList className="mt-4" title="改进建议" items={autoScore.improvements || []} tone="accent" />
      {autoScore.entered_mistake_book && (
        <div className="mt-4 text-[13px] text-red">该复盘分数较低，已自动写入错题本。</div>
      )}
    </SurfaceCard>
  );
}

function TrendTrainingMetaCard({ meta, focusTrend }) {
  if (!meta) return null;
  return (
    <InsightCard
      className="mb-6 border-green/20"
      title="本轮训练说明"
      action={
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2.5 py-1 rounded-md text-[12px] font-medium bg-green/10 text-green">{meta.label}</span>
          {focusTrend && <span className="text-[12px] text-dim">轨迹状态：{focusTrend}</span>}
        </div>
      }
    >
      <div className="text-[14px] text-text leading-[1.8]">{meta.summary}</div>
    </InsightCard>
  );
}

function PracticeComparisonCard({ comparison }) {
  if (!comparison) return null;
  return (
    <InsightCard
      className="mb-6 border-green/20"
      title="复练结果对比"
      action={typeof comparison.delta_score === "number" ? (
        <div className={`text-sm font-semibold ${comparison.delta_score >= 0 ? "text-green" : "text-red"}`}>
          {comparison.delta_score >= 0 ? `+${comparison.delta_score}` : comparison.delta_score} 分
        </div>
      ) : null}
    >
      {comparison.headline && <div className="text-[15px] leading-[1.8] text-text mb-3">{comparison.headline}</div>}
      <InsightList className="mb-3" items={comparison.bullets || []} tone="green" />
      {comparison.verdict && <div className="text-[13px] text-dim">结论：{comparison.verdict}</div>}
    </InsightCard>
  );
}

function QuestionHeaderPanel({
  question,
  topic,
  navigate,
  trainingBadge,
  questionId,
  index,
  total,
  numericScore,
  focusHit,
  hasImproved,
  isSkipped,
  guidance,
}) {
  const sc = numericScore != null ? getScoreColor(numericScore) : { bg: "var(--bg-hover)", color: "var(--text-dim)" };

  return (
    <SurfaceCard className="px-4 py-3.5 md:px-5 md:py-4 sticky top-2 z-[1] bg-card/75 border-border/70">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <Badge tone="accent">当前查看 Q{questionId}</Badge>
            {focusHit && <Badge tone="green">命中本次 focus</Badge>}
            {numericScore != null && numericScore < 6 && <Badge tone="red">优先修复</Badge>}
            {hasImproved && <Badge tone="green">已有改进版答案</Badge>}
            {isSkipped && <Badge tone="muted">未作答</Badge>}
          </div>
          <div className="text-[13px] leading-[1.7] text-dim">{guidance}</div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-[12px] text-dim">第 {index + 1} / {total} 题</div>
          <span className="text-sm font-bold px-3 py-1 rounded-lg" style={{ background: sc.bg, color: sc.color }}>
            {numericScore ?? "-"}/10
          </span>
        </div>
      </div>

      <div className="border-t border-border/60 pt-3">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-accent-light bg-accent/12 px-2.5 py-0.5 rounded-md">Q{question.id}</span>
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: trainingBadge.bg, color: trainingBadge.color }} title={question.training_intent || question.training_label}>{trainingBadge.label}</span>
            {question.focus_area && <button onClick={() => topic && navigate(`/profile/topic/${topic}`)} className="text-xs text-dim bg-hover px-2 py-0.5 rounded border-none cursor-pointer">{question.focus_area}</button>}
          </div>
          <span className="text-sm font-bold px-3 py-1 rounded-lg" style={{ background: sc.bg, color: sc.color }}>{numericScore ?? "-"}/10</span>
        </div>

        <div className="text-[15px] font-medium leading-relaxed">{question.question}</div>
      </div>
    </SurfaceCard>
  );
}

function QuestionListItemCard({ item, index, active, mobile = false, onClick }) {
  const score = item.numericScore;
  const low = score != null && score < 6;

  if (mobile) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`rounded-xl border px-3 py-2 text-left min-w-[120px] transition-all ${active ? "border-accent bg-accent/8" : low ? "border-red/30 bg-red/5" : "border-border bg-card"}`}
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className={`text-[12px] font-semibold ${active ? "text-accent-light" : "text-text"}`}>Q{index + 1}</span>
          <div className="flex items-center gap-1">
            {item.hasReference && <span className="h-2 w-2 rounded-full bg-accent-light" title="已有参考答案" />}
            {item.hasImproved && <span className="h-2 w-2 rounded-full bg-green" title="已有改进版答案" />}
            {item.hasFollowup && <span className="h-2 w-2 rounded-full bg-orange" title="已有 AI 追问记录" />}
            {item.s.focus_hit && <span className="h-2 w-2 rounded-full bg-green" title="命中 focus" />}
            {item.isSkipped && <span className="h-2 w-2 rounded-full bg-border" title="未作答" />}
            {low && <span className="h-2 w-2 rounded-full bg-red" title="优先修复" />}
          </div>
        </div>
        <div className={`text-[11px] ${low ? "text-red" : score >= 8 ? "text-green" : "text-dim"}`}>{score != null ? `${score}/10` : "暂无得分"}</div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative w-full rounded-xl px-3 py-2.5 text-left transition-all ${active ? "bg-accent/8 text-text" : low ? "bg-red/5 text-text hover:bg-red/8" : "bg-transparent hover:bg-hover/70 text-text"}`}
    >
      <div className={`absolute left-0 top-2 bottom-2 w-[2px] rounded-full transition-all ${active ? "bg-accent-light opacity-100" : "bg-border opacity-0 group-hover:opacity-100"}`} />
      <div className="pl-2">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-[12px] font-semibold ${active ? "text-accent-light" : "text-text"}`}>Q{index + 1}</span>
            {score != null && <span className={`text-[11px] ${low ? "text-red" : score >= 8 ? "text-green" : "text-dim"}`}>{score}/10</span>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {item.hasReference && <span className="h-2 w-2 rounded-full bg-accent-light" title="已有参考答案" />}
            {item.hasImproved && <span className="h-2 w-2 rounded-full bg-green" title="已有改进版答案" />}
            {item.hasFollowup && <span className="h-2 w-2 rounded-full bg-orange" title="已有 AI 追问记录" />}
            {item.s.focus_hit && <span className="h-2 w-2 rounded-full bg-green" title="命中 focus" />}
            {item.isSkipped && <span className="h-2 w-2 rounded-full bg-border" title="未作答" />}
            {low && <span className="h-2 w-2 rounded-full bg-red" title="优先修复" />}
          </div>
        </div>
        <div className={`text-[12px] leading-[1.6] line-clamp-2 ${active ? "text-text" : "text-dim"}`}>
          {item.isSkipped ? item.q.question : (item.s.weak_point || item.q.focus_area || item.q.question)}
        </div>
      </div>
    </button>
  );
}

function AnswerReviewBlock({ answer, scoreItem, topic, question, navigate }) {
  if (!scoreItem) return null;
  const s = scoreItem;

  return (
    <section className="rounded-2xl bg-hover/70 px-3.5 py-3.5 md:px-4">
      <div className="text-[12px] font-semibold text-dim mb-2">回答与点评</div>
      <div className="rounded-xl bg-card px-3 py-3 mb-3">
        <div className="text-xs font-semibold text-dim mb-1.5 opacity-70">你的回答</div>
        <div className="text-sm leading-relaxed whitespace-pre-wrap">{answer}</div>
      </div>
      {s.assessment && s.assessment !== "未作答" && <div className="text-sm leading-[1.8] text-text mb-2"><strong className="text-xs opacity-60">点评：</strong>{s.assessment}</div>}
      {s.improvement && <div className="text-sm leading-[1.8] text-accent-light bg-accent/8 rounded-xl px-3 py-2.5 mb-2"><strong className="text-xs opacity-70">改进建议：</strong>{s.improvement}</div>}
      {s.understanding && s.understanding !== "未作答" && <div className="text-[13px] text-dim italic">理解程度：{s.understanding}</div>}
      {s.weak_point && (
        <div className="mt-2 text-[13px] text-red leading-[1.7] flex items-center gap-2 flex-wrap">
          <span>薄弱点标签：{s.weak_point}</span>
          {s.semantic_bucket && topic && <button onClick={() => navigate("/knowledge", { state: { selectedTopic: topic, searchKeyword: bucketLabel(s.semantic_bucket) } })} className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-accent/10 text-accent-light border-none cursor-pointer" title={s.semantic_bucket}>{bucketLabel(s.semantic_bucket)}</button>}
          {topic && <button onClick={() => navigate(`/profile/topic/${topic}`)} className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-accent/10 text-accent-light border-none cursor-pointer">看专题</button>}
          {topic && <button onClick={() => navigate("/knowledge", { state: { selectedTopic: topic, searchKeyword: s.semantic_bucket ? bucketLabel(s.semantic_bucket) : (s.weak_point || question.focus_area || question.question) } })} className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-card text-dim border-none cursor-pointer">先看题库</button>}
          {topic && <button onClick={() => navigate("/", { state: { quickStartMode: "topic_drill", quickStartTopic: topic } })} className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-green/10 text-green border-none cursor-pointer">去修复</button>}
        </div>
      )}
    </section>
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

function buildStrategyMetaReview({ trainingMeta, targeting, comparison, items = [] }) {
  const baseTrend = targeting?.focus_trend || comparison?.baseline?.focus_trend || "";
  const recent = (items || []).slice(-5);
  const trend = recent.length >= 2 ? analyzePracticeTrend(recent) : null;
  const delta = typeof comparison?.delta_score === "number" ? comparison.delta_score : null;
  const repairRate = typeof targeting?.repair_rate === "number" ? targeting.repair_rate : (typeof comparison?.repair_rate === "number" ? comparison.repair_rate : null);
  const focusHitRate = typeof targeting?.focus_hit_rate === "number" ? targeting.focus_hit_rate : (typeof comparison?.focus_hit_rate === "number" ? comparison.focus_hit_rate : null);
  const attempted = targeting?.attempted_questions || recent.length || 0;
  const front3FocusHits = targeting?.front3_focus_hits || 0;
  const lastScore = recent.length ? recent[recent.length - 1]?.avg_score : null;
  const firstScore = recent.length ? recent[0]?.avg_score : null;
  const scoreRange = recent.length
    ? Math.max(...recent.map((item) => (typeof item.avg_score === "number" ? item.avg_score : 0))) - Math.min(...recent.map((item) => (typeof item.avg_score === "number" ? item.avg_score : 0)))
    : null;

  const evidence = [];
  if (typeof delta === "number") evidence.push(`相对原题基线 ${delta >= 0 ? "+" : ""}${delta} 分`);
  if (typeof focusHitRate === "number") evidence.push(`focus 命中率 ${(focusHitRate * 100).toFixed(0)}%`);
  if (typeof repairRate === "number") evidence.push(`修复率 ${(repairRate * 100).toFixed(0)}%`);
  if (trend?.label) evidence.push(`同目标轨迹：${trend.label}`);
  if (front3FocusHits) evidence.push(`前 3 题命中 focus ${front3FocusHits} 次`);

  let verdict = "部分有效";
  let verdictClass = "bg-accent/10 text-accent-light";
  let summary = trainingMeta?.summary || "本轮训练已结束，但还需要根据趋势判断策略是否真正奏效。";
  let nextAction = "再做 1 轮同目标短打复练，然后再决定是否切换策略。";

  const isEffective = () => {
    if (baseTrend === "进入平台期") {
      return (trend?.label === "持续上升") || ((delta ?? -99) >= 1 && (repairRate ?? 0) >= 0.5);
    }
    if (baseTrend === "出现回退") {
      return (trend?.label && trend.label !== "出现回退") && ((delta ?? 0) >= 0 || (repairRate ?? 0) >= 0.5);
    }
    if (baseTrend === "持续上升") {
      return (focusHitRate ?? 0) >= 0.6 && (((lastScore ?? 0) >= 7.5) || trend?.label === "持续上升");
    }
    if (baseTrend === "波动明显") {
      return (trend?.label && trend.label !== "波动明显") && ((scoreRange ?? 99) <= 1.5 || (repairRate ?? 0) >= 0.5);
    }
    return ((delta ?? 0) >= 1 && (repairRate ?? 0) >= 0.5) || trend?.label === "持续上升";
  };

  const isIneffective = () => {
    if (baseTrend === "进入平台期") {
      return (trend?.label === "进入平台期" || trend?.label === "出现回退") && ((delta ?? -99) < 0.5);
    }
    if (baseTrend === "出现回退") {
      return trend?.label === "出现回退" && ((delta ?? 99) < 0);
    }
    if (baseTrend === "持续上升") {
      return (focusHitRate ?? 0) < 0.5 || ((lastScore ?? 0) < 7);
    }
    if (baseTrend === "波动明显") {
      return trend?.label === "波动明显" && ((scoreRange ?? 0) > 1.8);
    }
    return ((delta ?? 0) < 0) && ((repairRate ?? 0) < 0.4);
  };

  if (isEffective()) {
    verdict = "策略有效";
    verdictClass = "bg-green/10 text-green";
    if (baseTrend === "进入平台期") {
      summary = "这次平台突破训练不只是命中了目标，而且已经出现了脱离平台的迹象。说明继续刷同层题的收益在下降，策略升级是合理的。";
      nextAction = "减少同层重复题，转向 why / 边界条件 / 反例 / 场景迁移题。";
    } else if (baseTrend === "出现回退") {
      summary = "这次稳固训练起效了，回退趋势被压住，说明先降压、先稳表达的策略是对的。";
      nextAction = "再做少量验收题确认稳定后，恢复正常强度训练。";
    } else if (baseTrend === "持续上升") {
      summary = "这轮迁移验收说明提升并不是只会答原题，而是开始具备跨场景复用能力。";
      nextAction = "可以把训练重点切到更复杂场景或新的薄弱点。";
    } else if (baseTrend === "波动明显") {
      summary = "这轮稳定性验收说明表现开始收敛，不再只是偶尔答对，策略方向正确。";
      nextAction = "再做 1 轮不同表述但同结构的问题，确认已经真正稳定。";
    } else {
      summary = "这轮训练对目标薄弱点起到了实质作用，不只是统计上命中，而是开始带来能力变化。";
      nextAction = "保持有效策略，但把下一轮难度往上提一点。";
    }
  } else if (isIneffective()) {
    verdict = "策略未奏效";
    verdictClass = "bg-red/10 text-red";
    if (baseTrend === "进入平台期") {
      summary = "这轮平台突破训练虽然有针对性，但还没有真正把你从平台里拉出来。说明只是换了题皮，认知层级还没变。";
      nextAction = "别继续刷同类题了，改成更小颗粒度拆点，或直接切到 why / 反例 / 对比题。";
    } else if (baseTrend === "出现回退") {
      summary = "这轮稳固训练还没把回退止住，说明当前难度或回答结构仍然偏高。";
      nextAction = "先降难度，强制固定答题骨架，再做一轮基础稳固。";
    } else if (baseTrend === "持续上升") {
      summary = "这轮迁移验收暴露出提升还没有真正内化，原本的上升更像局部熟练而不是稳定能力。";
      nextAction = "先回到修复训练，把关键点与表达主线重新压实。";
    } else if (baseTrend === "波动明显") {
      summary = "这轮稳定性验收没有压住波动，说明你目前还处于会答但不稳定的阶段。";
      nextAction = "继续固定同一答题结构，减少自由发挥，再做短轮验收。";
    } else {
      summary = "这轮训练没有形成足够明显的能力改善，继续照原策略追加投入的性价比不高。";
      nextAction = "应当换策略，而不是继续同配方重复。";
    }
  } else {
    if (baseTrend === "进入平台期") {
      summary = "这轮平台突破训练有一点松动迹象，但还不足以证明平台已经被打破。";
      nextAction = "可以再做 1 轮同目标复练，但题型要更尖锐，别重复当前套路。";
    } else if (baseTrend === "持续上升") {
      summary = "这轮迁移验收说明已有一定迁移能力，但还不够稳，暂时不能判定完全内化。";
      nextAction = "再补 1 轮跨场景验收，确认不是偶然发挥。";
    } else if (baseTrend === "波动明显") {
      summary = "这轮验收有改善，但波动还没完全收敛，说明策略部分有效。";
      nextAction = "继续 1 轮同结构变体题，优先看稳定性而不是峰值分数。";
    } else {
      summary = "这轮训练对目标产生了一些作用，但证据还不够强，暂时更适合视为部分有效。";
      nextAction = "保留策略方向，再补一轮更短、更聚焦的验证。";
    }
  }

  return {
    show: Boolean(trainingMeta || comparison || targeting || attempted),
    verdict,
    verdictLevel: verdict === "策略有效" ? "effective" : verdict === "策略未奏效" ? "ineffective" : "partial",
    verdictClass,
    summary,
    nextAction,
    evidence,
    baseTrend,
    trendLabel: trend?.label,
    attempted,
    firstScore,
    lastScore,
  };
}

function StrategyMetaReviewCard({ trainingMeta, targeting, comparison, items = [], persistedMeta = null }) {
  const meta = persistedMeta || buildStrategyMetaReview({ trainingMeta, targeting, comparison, items });
  if (!meta?.show && !persistedMeta) return null;
  return (
    <div className="bg-card border border-border rounded-2xl px-5 py-6 md:px-6 md:py-6 mb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="text-lg font-semibold">策略成效 Meta-review</div>
        <span className={`px-2.5 py-1 rounded-md text-[12px] font-medium ${meta.verdictClass}`}>{meta.verdict}</span>
      </div>
      <div className="text-[14px] text-text leading-[1.8] mb-3">{meta.summary}</div>
      <div className="flex flex-wrap gap-2 mb-3">
        {meta.baseTrend ? <span className="inline-flex items-center rounded-lg bg-hover px-3 py-1.5 text-[12px] font-medium text-dim">起始轨迹：{meta.baseTrend}</span> : null}
        {meta.trendLabel ? <span className="inline-flex items-center rounded-lg bg-hover px-3 py-1.5 text-[12px] font-medium text-dim">当前轨迹：{meta.trendLabel}</span> : null}
        {typeof meta.firstScore === "number" && typeof meta.lastScore === "number" ? <span className="inline-flex items-center rounded-lg bg-hover px-3 py-1.5 text-[12px] font-medium text-dim">最近 {items.slice(-5).length} 次：{meta.firstScore} → {meta.lastScore}</span> : null}
      </div>
      {meta.evidence?.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-3">
          {meta.evidence.map((item, idx) => (
            <div key={idx} className="px-3 py-2 rounded-lg text-[13px] text-text bg-hover border border-border">{item}</div>
          ))}
        </div>
      )}
      <div className="text-[13px] text-dim leading-[1.8]">下一步：{meta.nextAction}</div>
    </div>
  );
}

function TrainingLabelStatsCard({ stats }) {
  if (!stats?.items?.length) return null;
  return (
    <div className="bg-card border border-border rounded-2xl px-5 py-6 md:px-6 md:py-6 mb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="text-lg font-semibold">训练标签分桶表现</div>
        <div className="text-sm text-dim">已答 {stats.answered || 0} 题</div>
      </div>
      {stats.summary && <div className="text-[14px] text-text leading-[1.8] mb-3">{stats.summary}</div>}
      <div className="flex flex-col gap-2.5">
        {stats.items.map((item, idx) => {
          const badge = trainingLabelBadge(item.label);
          const score = typeof item.avg_score === "number" ? item.avg_score : null;
          const color = score == null ? "var(--border)" : score >= 8 ? "var(--green)" : score >= 6 ? "var(--accent-light)" : "var(--red)";
          return (
            <div key={`${item.label}-${idx}`} className="rounded-xl border border-border bg-hover px-4 py-3">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-1 rounded-md text-[12px] font-medium" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
                  <span className="text-[12px] text-dim">共 {item.count} 题 · 已答 {item.answered} 题</span>
                  <span className="text-[12px] text-dim">回升 {item.improved_count} 题</span>
                  <span className="text-[12px] text-dim">focus 命中 {item.focus_hit_count} 题</span>
                </div>
                <div className="text-[13px] font-semibold" style={{ color }}>{score != null ? `${score}/10` : "暂无得分"}</div>
              </div>
              <div className="w-full h-2 rounded bg-border overflow-hidden mb-2">
                <div className="h-full rounded" style={{ width: `${score != null ? Math.max(6, score * 10) : 6}%`, background: color }} />
              </div>
              <div className="flex flex-wrap gap-2 text-[12px] text-dim">
                <span>回升率 {(Number(item.improved_rate || 0) * 100).toFixed(0)}%</span>
                <span>focus 命中率 {(Number(item.focus_hit_rate || 0) * 100).toFixed(0)}%</span>
                <span>高分题 {item.high_scores || 0}</span>
                <span>低分题 {item.low_scores || 0}</span>
              </div>
              {item.sample_questions?.length > 0 && (
                <div className="mt-2 text-[12px] text-dim leading-[1.7]">
                  题目样本：{item.sample_questions.map((q) => `「${String(q).slice(0, 28)}${String(q).length > 28 ? "…" : ""}」`).join("、")}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SoloRecordingReview({ topicsCovered, overall }) {
  const avgScore = overall?.avg_score || "-";
  return (
    <>
      <div className="bg-card border border-border rounded-2xl px-5 py-6 md:px-6 md:py-6 mb-6">
        <div className="text-lg font-semibold mb-3">录音复盘总览</div>
        <div className="mb-2">
          <span className="inline-block text-[32px] font-bold mr-2" style={{ color: typeof avgScore === "number" ? getScoreColor(avgScore).color : "var(--text)" }}>
            {avgScore}
          </span>
          <span className="text-base text-dim">/10</span>
        </div>
        {overall?.summary && <div className="text-[14px] leading-[1.8] text-text mb-4">{overall.summary}</div>}
        {topicsCovered?.length > 0 && (
          <div>
            <div className="text-[14px] font-semibold mb-2">涉及专题</div>
            <div className="flex flex-wrap gap-2">
              {topicsCovered.map((topic, idx) => (
                <Badge key={`${topic}-${idx}`} tone="muted">{topicDisplayName(topic)}</Badge>
              ))}
            </div>
          </div>
        )}
      </div>
      <DimensionScores dimensionScores={overall?.dimension_scores} avgScore={overall?.avg_score} />
    </>
  );
}

function DrillReview({
  sessionId,
  scores,
  overall,
  questions,
  answers,
  topic,
  topics,
  autoScore,
  practiceTrend = [],
  persistedReferenceAnswers = {},
  persistedReferenceFollowups = {},
  persistedImprovedAnswers = {},
}) {
  const navigate = useNavigate();
  const scoreMap = Object.fromEntries((scores || []).map((item) => [item.question_id, item]));
  const answerMap = Object.fromEntries((answers || []).map((item) => [item.question_id, item.answer]));
  const [refAnswers, setRefAnswers] = useState(persistedReferenceAnswers || {});
  const [refLoading, setRefLoading] = useState({});
  const [followupOpen, setFollowupOpen] = useState({});
  const [followupInput, setFollowupInput] = useState({});
  const [followupLoading, setFollowupLoading] = useState({});
  const [improvedAnswers, setImprovedAnswers] = useState(persistedImprovedAnswers || {});
  const [improvedLoading, setImprovedLoading] = useState({});
  const [followupHistory, setFollowupHistory] = useState(() => {
    const seeded = {};
    Object.entries(persistedReferenceFollowups || {}).forEach(([key, items]) => {
      const qid = String(key || "").startsWith("q:") ? Number(String(key).slice(2)) : null;
      if (qid != null && !Number.isNaN(qid)) seeded[qid] = items || [];
    });
    return seeded;
  });
  const [showSummary, setShowSummary] = useState(true);
  const [openedQuestionState, setOpenedQuestionState] = useState({});

  const questionItems = (questions || []).map((q) => {
    const s = scoreMap[q.id] || {};
    const answer = answerMap[q.id];
    const isSkipped = !answer;
    const numericScore = typeof s.score === "number" ? s.score : null;
    const hasReference = !!persistedReferenceAnswers[q.id]?.reference_answer;
    const hasImproved = !!persistedImprovedAnswers[q.id]?.improved_answer;
    const hasFollowup = Array.isArray(persistedReferenceFollowups[`q:${q.id}`]) && persistedReferenceFollowups[`q:${q.id}`].length > 0;
    const priority = [
      isSkipped ? 0 : 1,
      s.focus_hit ? 3 : 0,
      numericScore != null ? Math.max(0, 10 - numericScore) : 0,
      s.key_missing?.length || 0,
      hasImproved ? 0 : 0.5,
    ].reduce((a, b) => a + b, 0);
    return { q, s, answer, isSkipped, numericScore, priority, hasReference, hasImproved, hasFollowup };
  });

  const defaultQuestionId = questionItems.length
    ? [...questionItems].sort((a, b) => b.priority - a.priority)[0]?.q?.id
    : null;
  const [activeQuestionId, setActiveQuestionId] = useState(defaultQuestionId);

  useEffect(() => {
    if (!questionItems.length) return;
    if (!activeQuestionId || !questionItems.some((item) => item.q.id === activeQuestionId)) {
      setActiveQuestionId(defaultQuestionId || questionItems[0]?.q?.id || null);
    }
  }, [questions, scores]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeIndex = questionItems.findIndex((item) => item.q.id === activeQuestionId);
  const activeItem = activeIndex >= 0 ? questionItems[activeIndex] : questionItems[0] || null;
  const avgScore = overall?.avg_score || (scores?.length ? (scores.reduce((sum, item) => sum + (item.score || 0), 0) / scores.length).toFixed(1) : "-");

  const handleRefAnswer = async (questionId, question, regenerate = false) => {
    try {
      setRefLoading((prev) => ({ ...prev, [questionId]: true }));
      const data = await getReferenceAnswer(sessionId, topic, question, questionId, regenerate);
      setRefAnswers((prev) => ({ ...prev, [questionId]: data }));
    } finally {
      setRefLoading((prev) => ({ ...prev, [questionId]: false }));
    }
  };

  const handleFollowup = async (questionId, question) => {
    const followup = (followupInput[questionId] || "").trim();
    if (!followup) return;
    try {
      setFollowupLoading((prev) => ({ ...prev, [questionId]: true }));
      const data = await followupReferenceAnswer(
        sessionId,
        topic,
        question,
        followup,
        questionId,
        refAnswers[questionId]?.reference_answer || "",
      );
      setFollowupHistory((prev) => ({ ...prev, [questionId]: data?.history || [...(prev[questionId] || []), data] }));
      setOpenedQuestionState((prev) => ({ ...prev, [questionId]: { ...(prev[questionId] || {}), followup: true } }));
      setFollowupInput((prev) => ({ ...prev, [questionId]: "" }));
    } finally {
      setFollowupLoading((prev) => ({ ...prev, [questionId]: false }));
    }
  };

  const handleImprovedAnswer = async (questionId, question) => {
    try {
      setImprovedLoading((prev) => ({ ...prev, [questionId]: true }));
      const data = await getImprovedAnswer(
        sessionId,
        topic,
        question,
        answerMap[questionId] || "",
        questionId,
        refAnswers[questionId]?.reference_answer || "",
      );
      setImprovedAnswers((prev) => ({ ...prev, [questionId]: data }));
    } finally {
      setImprovedLoading((prev) => ({ ...prev, [questionId]: false }));
    }
  };

  const handlePracticeImprovedAnswer = (questionId, question, focusArea) => {
    navigate("/", {
      state: {
        quickStartMode: "topic_drill",
        quickStartTopic: topic,
        quickStartPrompt: improvedAnswers[questionId]?.improved_answer || question,
        quickStartFocus: focusArea || "",
      },
    });
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <SectionTitle className="mb-0">复盘阅读器</SectionTitle>
        <SubtleButton onClick={() => setShowSummary((v) => !v)} className="px-3 py-2 text-[12px]">
          {showSummary ? "隐藏整体评价" : "显示整体评价"}
        </SubtleButton>
      </div>

      {showSummary && (
        <SurfaceCard className="mb-6 px-5 py-5 md:px-6">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div>
              <div className="text-lg font-semibold mb-2">整体评价</div>
              <div className="flex items-end gap-2">
                <span className="inline-block text-[32px] font-bold" style={{ color: typeof avgScore === "number" ? getScoreColor(avgScore).color : "var(--text)" }}>
                  {avgScore}
                </span>
                <span className="text-base text-dim mb-1">/10</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Badge tone="muted" className="px-3 py-1 text-[12px]">共 {questions?.length || 0} 题</Badge>
              <Badge tone="muted" className="px-3 py-1 text-[12px]">已答 {answers?.filter((a) => a.answer).length || 0} 题</Badge>
              {overall?.targeting_stats?.focus_label && <Badge tone="green" className="px-3 py-1 text-[12px]">focus：{overall.targeting_stats.focus_label}</Badge>}
              {overall?.targeting_stats?.hit_rate != null && <Badge tone="muted" className="px-3 py-1 text-[12px]">命中率 {(overall.targeting_stats.hit_rate * 100).toFixed(0)}%</Badge>}
              {overall?.targeting_stats?.repair_rate != null && <Badge tone="muted" className="px-3 py-1 text-[12px]">修复率 {(overall.targeting_stats.repair_rate * 100).toFixed(0)}%</Badge>}
            </div>
          </div>

          {overall?.summary && <div className="text-[14px] leading-[1.8] text-text mb-4">{overall.summary}</div>}

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)] gap-4 mb-4">
            <div className="rounded-2xl bg-hover/70 px-4 py-4">
              <div className="text-[13px] font-semibold text-text mb-3">关键观察</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ObservationColumn
                  title="优先修复"
                  tone="red"
                  items={(overall?.new_weak_points || []).slice(0, 3).map((wp) => (typeof wp === "string" ? wp : wp.point || JSON.stringify(wp)))}
                  emptyText="暂无新的薄弱点总结。"
                />
                <ObservationColumn
                  title="本场亮点"
                  tone="green"
                  items={(overall?.new_strong_points || []).slice(0, 3).map((sp) => (typeof sp === "string" ? sp : sp.point || JSON.stringify(sp)))}
                  emptyText="暂无突出的亮点总结。"
                />
              </div>
              {overall?.strategy_meta_review?.summary && (
                <CalloutCard className="mt-3" title="策略成效结论">
                  {overall.strategy_meta_review.summary}
                </CalloutCard>
              )}
            </div>

            <div className="rounded-2xl bg-hover/70 px-4 py-4">
              <div className="text-[13px] font-semibold text-text mb-3">快速画像</div>
              <DimensionScores dimensionScores={overall?.dimension_scores} avgScore={overall?.avg_score} />
              <AutoScoreCard autoScore={autoScore} />
            </div>
          </div>

          <details className="rounded-2xl border border-border/70 bg-card/60 px-4 py-3 group">
            <summary className="list-none cursor-pointer flex items-center justify-between gap-3">
              <div>
                <div className="text-[13px] font-semibold text-text">展开深层数据</div>
                <div className="text-[11px] text-dim mt-0.5">查看训练说明、对比结果、分桶表现、同目标轨迹与完整策略成效。</div>
              </div>
              <div className="text-[11px] text-dim">
                <span className="group-open:hidden">展开</span>
                <span className="hidden group-open:inline">收起</span>
              </div>
            </summary>
            <div className="mt-4">
              <TrendTrainingMetaCard meta={overall?.trend_training_meta} focusTrend={overall?.targeting_stats?.focus_trend || overall?.practice_comparison?.baseline?.focus_trend} />
              <PracticeComparisonCard comparison={overall?.practice_comparison} />
              <TrainingLabelStatsCard stats={overall?.training_label_stats} />
              <PracticeTrendCard focusLabel={overall?.practice_comparison?.focus_label} items={practiceTrend} />
              <StrategyMetaReviewCard
                trainingMeta={overall?.trend_training_meta}
                targeting={overall?.targeting_stats}
                comparison={overall?.practice_comparison}
                items={practiceTrend}
                persistedMeta={overall?.strategy_meta_review}
              />
            </div>
          </details>
        </SurfaceCard>
      )}

      <SectionTitle className="mt-2">逐题复盘</SectionTitle>
      {questionItems.length > 0 && activeItem && (() => {
        const { q, s, answer, isSkipped, numericScore, hasReference, hasImproved } = activeItem;
        const sc = numericScore != null ? getScoreColor(numericScore) : { bg: "var(--bg-hover)", color: "var(--text-dim)" };
        const tb = trainingLabelBadge(q.training_label);
        const sectionState = openedQuestionState[q.id] || {};
        const scoreNeedsOpen = numericScore != null && numericScore < 6;
        const refSectionOpen = sectionState.reference ?? (hasReference && !hasImproved);
        const improvedSectionOpen = sectionState.improved ?? hasImproved;
        const scoreSectionOpen = sectionState.score ?? (scoreNeedsOpen || (s.key_missing?.length > 0));
        const followupSectionOpen = sectionState.followup ?? true;
        const guidance = isSkipped
          ? "这题没有作答，优先级取决于它是否属于本轮 focus。若属于，建议先补；否则可放到第二轮。"
          : numericScore != null && numericScore < 6
            ? "这题建议优先修。先看缺失点和参考答案，再生成改进版答案，最后带着改进版回练。"
            : numericScore != null && numericScore < 8
              ? "这题已经有基础，但还不够稳。重点看评分细项和改进建议，把回答打磨到更自然、更完整。"
              : "这题整体通过度较高，更适合作为高分样本，用来对照你其它题的表达方式。";

        return (
          <SurfaceCard className="mb-4 p-3 md:p-4 bg-card/80">
            <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4">
              <SurfaceCard className="p-3 md:p-4 bg-card/60 border-border/60">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[14px] font-semibold text-text">题目目录</div>
                    <div className="text-[11px] text-dim mt-0.5">先跳到最值得复盘的题，再逐题往后看。</div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <Badge tone="red">低分优先</Badge>
                    <Badge tone="muted">共 {questionItems.length} 题</Badge>
                  </div>
                </div>

                <div className="lg:hidden -mx-1 overflow-x-auto pb-1">
                  <div className="flex gap-2 px-1 min-w-max">
                    {questionItems.map((item, idx) => (
                      <QuestionListItemCard
                        key={item.q.id}
                        item={item}
                        index={idx}
                        active={item.q.id === activeQuestionId}
                        mobile
                        onClick={() => setActiveQuestionId(item.q.id)}
                      />
                    ))}
                  </div>
                </div>

                <div className="hidden lg:block space-y-1.5 max-h-[72vh] overflow-y-auto pr-1">
                  {questionItems.map((item, idx) => (
                    <QuestionListItemCard
                      key={item.q.id}
                      item={item}
                      index={idx}
                      active={item.q.id === activeQuestionId}
                      onClick={() => setActiveQuestionId(item.q.id)}
                    />
                  ))}
                </div>
              </SurfaceCard>

              <div className="space-y-3">
                <QuestionHeaderPanel
                  question={q}
                  topic={topic}
                  navigate={navigate}
                  trainingBadge={tb}
                  questionId={q.id}
                  index={activeIndex}
                  total={questionItems.length}
                  numericScore={numericScore}
                  focusHit={s.focus_hit}
                  hasImproved={!!improvedAnswers[q.id]?.improved_answer}
                  isSkipped={isSkipped}
                  guidance={guidance}
                />

                <SurfaceCard className="px-4 py-4 md:px-5 animate-fade-in">
                  {isSkipped ? (
                    <div className="rounded-lg border border-border bg-hover px-3 py-3 text-sm text-dim">这题未作答，建议直接跳到下一题或回到训练里补答。</div>
                  ) : (
                    <div className="space-y-3">
                      <AnswerReviewBlock answer={answer} scoreItem={s} topic={topic} question={q} navigate={navigate} />

                      <ExpandableReviewSection
                        title="评分细项"
                        open={scoreSectionOpen}
                        onToggle={(e) => setOpenedQuestionState((prev) => ({ ...prev, [q.id]: { ...(prev[q.id] || {}), score: !!e.currentTarget?.open } }))}
                      >
                        {s.key_missing?.length > 0 && <div className="text-[13px] text-red leading-normal mb-2">遗漏关键点：{s.key_missing.join("、")}</div>}
                        <InlineAutoScoreDetail detail={s.auto_score_detail} />
                      </ExpandableReviewSection>

                      {topic && (
                        <>
                          <ExpandableReviewSection
                            title="标准参考答案"
                            icon={<BookOpen size={13} />}
                            open={refSectionOpen}
                            onToggle={(e) => setOpenedQuestionState((prev) => ({ ...prev, [q.id]: { ...(prev[q.id] || {}), reference: !!e.currentTarget?.open } }))}
                          >
                            <div className="text-sm leading-[1.8]">
                              {refAnswers[q.id]?.reference_answer ? (
                                <>
                                  <div className="text-xs font-semibold text-dim mb-2 flex items-center justify-between gap-3 flex-wrap">
                                    <span>标准参考答案</span>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {refAnswers[q.id]?.generated_at && <span className="text-[11px] text-dim">生成于 {refAnswers[q.id].generated_at.replace("T", " ").slice(0, 16)}</span>}
                                      <button className="text-[12px] text-dim bg-transparent border-none cursor-pointer" onClick={() => handleRefAnswer(q.id, q.question, true)} disabled={refLoading[q.id]}>{refLoading[q.id] ? "重新生成中..." : "重新生成"}</button>
                                    </div>
                                  </div>
                                  <div className="md-content bg-hover rounded-xl px-3.5 py-3"><ReactMarkdown>{refAnswers[q.id].reference_answer}</ReactMarkdown></div>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <button className="text-[13px] text-accent-light flex items-center gap-1.5 bg-transparent border-none cursor-pointer" onClick={() => setFollowupOpen((p) => ({ ...p, [q.id]: !p[q.id] }))}><BookOpen size={13} /> {followupOpen[q.id] ? "收起继续问 AI" : "继续问 AI"}</button>
                                    <button className="text-[13px] text-green flex items-center gap-1.5 bg-transparent border-none cursor-pointer disabled:opacity-50" onClick={() => handleImprovedAnswer(q.id, q.question)} disabled={improvedLoading[q.id] || !refAnswers[q.id]?.reference_answer}><BookOpen size={13} /> {improvedLoading[q.id] ? "整理中..." : "吸收为改进版答案"}</button>
                                  </div>
                                </>
                              ) : (
                                <button className="text-[13px] text-accent-light flex items-center gap-1.5 bg-transparent border-none cursor-pointer transition-opacity disabled:opacity-50" onClick={() => handleRefAnswer(q.id, q.question)} disabled={refLoading[q.id]}><BookOpen size={13} />{refLoading[q.id] ? "正在生成参考答案..." : "生成标准参考答案"}</button>
                              )}
                            </div>
                          </ExpandableReviewSection>

                          {improvedAnswers[q.id]?.improved_answer && (
                            <ExpandableReviewSection
                              title="改进版答案"
                              tone="green"
                              open={improvedSectionOpen}
                              onToggle={(e) => setOpenedQuestionState((prev) => ({ ...prev, [q.id]: { ...(prev[q.id] || {}), improved: !!e.currentTarget?.open } }))}
                            >
                              <div>
                                <div className="text-xs font-semibold text-dim mb-2 flex items-center justify-between gap-2 flex-wrap">
                                  <span>我的改进版答案</span>
                                  {improvedAnswers[q.id]?.generated_at && <span className="text-[11px] text-dim">{improvedAnswers[q.id].generated_at.replace("T", " ").slice(0, 16)}</span>}
                                </div>
                                <div className="md-content rounded-xl bg-card px-3.5 py-3"><ReactMarkdown>{improvedAnswers[q.id].improved_answer}</ReactMarkdown></div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button className="text-[13px] text-green flex items-center gap-1.5 bg-transparent border-none cursor-pointer" onClick={() => handlePracticeImprovedAnswer(q.id, q.question, q.focus_area)}><BookOpen size={13} /> 带着这版再练一遍</button>
                                </div>
                              </div>
                            </ExpandableReviewSection>
                          )}

                          {followupOpen[q.id] && (
                            <ExpandableReviewSection
                              title="AI 继续追问"
                              open={followupSectionOpen}
                              onToggle={(e) => setOpenedQuestionState((prev) => ({ ...prev, [q.id]: { ...(prev[q.id] || {}), followup: !!e.currentTarget?.open } }))}
                            >
                              <div className="rounded-xl bg-hover px-3 py-3">
                                <div className="text-xs font-semibold text-dim mb-2">临时追问（不会覆盖标准参考答案）</div>
                                <div className="flex flex-wrap gap-2 mb-2.5">
                                  {FOLLOWUP_QUICK_ACTIONS.map((item) => (
                                    <button key={item.label} className="px-2.5 py-1 rounded-lg text-[12px] bg-card text-dim border border-border cursor-pointer" onClick={() => setFollowupInput((p) => ({ ...p, [q.id]: item.prompt }))} type="button">{item.label}</button>
                                  ))}
                                </div>
                                <textarea className="w-full min-h-[84px] rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-text resize-y outline-none" placeholder="例如：给我一个更口语化的版本 / 如果面试官继续追问一致性怎么答 / 给一个项目里的实际例子" value={followupInput[q.id] || ""} onChange={(e) => setFollowupInput((p) => ({ ...p, [q.id]: e.target.value }))} />
                                <div className="mt-2 flex items-center gap-2 flex-wrap">
                                  <button className="px-3 py-1.5 rounded-lg text-[13px] bg-accent/10 text-accent-light border-none cursor-pointer disabled:opacity-50" onClick={() => handleFollowup(q.id, q.question)} disabled={followupLoading[q.id] || !(followupInput[q.id] || "").trim()}>{followupLoading[q.id] ? "AI 思考中..." : "发送追问"}</button>
                                  <button className="px-3 py-1.5 rounded-lg text-[13px] bg-transparent text-dim border border-border cursor-pointer" onClick={() => setFollowupInput((p) => ({ ...p, [q.id]: "" }))}>清空输入</button>
                                </div>
                                {followupHistory[q.id]?.length > 0 && (
                                  <div className="mt-3">
                                    <div className="text-xs font-semibold text-dim mb-2">AI 临时辅导记录</div>
                                    <div className="flex flex-col gap-3">
                                      {followupHistory[q.id].map((item, idx) => (
                                        <div key={`${q.id}-${idx}`} className="rounded-xl border border-border bg-card px-3.5 py-3">
                                          <div className="text-[12px] font-semibold text-accent-light mb-1">你追问</div>
                                          <div className="text-sm leading-[1.7] whitespace-pre-wrap">{item.followup}</div>
                                          <div className="text-[12px] font-semibold text-dim mt-3 mb-1">AI 回答</div>
                                          <div className="md-content"><ReactMarkdown>{item.answer || ""}</ReactMarkdown></div>
                                          {item.created_at && <div className="mt-2 text-[11px] text-dim">{item.created_at.replace("T", " ").slice(0, 16)}</div>}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </ExpandableReviewSection>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </SurfaceCard>

                <div className="flex items-center justify-between gap-3">
                  <OutlineButton onClick={() => activeIndex > 0 && setActiveQuestionId(questionItems[activeIndex - 1].q.id)} disabled={activeIndex <= 0} className="px-3 py-2 text-[12px] disabled:opacity-40">上一题</OutlineButton>
                  <div className="text-[12px] text-dim">第 {activeIndex + 1} / {questionItems.length} 题</div>
                  <OutlineButton onClick={() => activeIndex < questionItems.length - 1 && setActiveQuestionId(questionItems[activeIndex + 1].q.id)} disabled={activeIndex >= questionItems.length - 1} className="px-3 py-2 text-[12px] disabled:opacity-40">下一题</OutlineButton>
                </div>
              </div>
            </div>
          </SurfaceCard>
        );
      })()}
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
  const [pendingRecording, setPendingRecording] = useState(false);
  const [pendingDrillReview, setPendingDrillReview] = useState(false);
  const [pendingResumeReview, setPendingResumeReview] = useState(false);

  useEffect(() => {
    getTopics().then(setTopics).catch(() => {});
  }, []);

  useEffect(() => {
    if (!review && !scores) {
      let cancelled = false;
      let retryTimer = null;
      const load = async () => {
        setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
        try {
          const data = await getReview(sessionId);
          if (cancelled) return;
          setPendingRecording(false);
          setPendingDrillReview(false);
          setPendingResumeReview(false);
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
        } catch (err) {
          try {
            const status = await getAnalysisStatus(sessionId);
            if (cancelled) return;
            setPendingRecording(status.mode === "recording" && ["queued", "running"].includes(status.status));
            setPendingDrillReview(status.mode === "topic_drill" && ["queued", "running"].includes(status.status));
            setPendingResumeReview(status.mode === "resume" && ["queued", "running"].includes(status.status));
            if (["queued", "running"].includes(status.status)) {
              setMode(status.mode || mode);
              retryTimer = setTimeout(load, 1500);
              return;
            }
            if (status.status === "failed") {
              setReview("加载失败: " + (status.error || "任务执行失败"));
              return;
            }
          } catch {
            if (!cancelled) setReview("加载失败: " + err.message);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      };
      load();
      return () => {
        cancelled = true;
        if (retryTimer) clearTimeout(retryTimer);
      };
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

  if (loading || pendingRecording || pendingDrillReview || pendingResumeReview) {
    return <div className="text-center py-15 text-dim">{pendingRecording ? "录音分析进行中，复盘报告生成后会自动刷新..." : pendingDrillReview ? "训练评估进行中，复盘报告生成后会自动刷新..." : pendingResumeReview ? "面试复盘生成中，报告完成后会自动刷新..." : "加载复盘报告中..."}</div>;
  }

  const showDrill = isDrill || isRecordingDual || (mode === "topic_drill" && (scores || questions.length > 0)) || (mode === "recording" && stateData.recording_mode === "dual");

  return (
    <div className="flex-1 px-4 py-8 md:px-6 md:py-10 max-w-[1400px] mx-auto w-full">
      <section className="mb-6 overflow-hidden rounded-[32px] border border-border/80 bg-[linear-gradient(180deg,rgba(245,158,11,0.07),rgba(245,158,11,0.02))] px-5 py-6 md:px-7 md:py-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <PageTitle
            className="mb-0"
            title={isRecording ? "录音复盘" : showDrill ? "训练复盘" : "面试复盘"}
            subtitle={showDrill ? "先看这轮训练是否真的命中了目标、是否形成了可重复的改进，再进入逐题深挖。" : `Session: ${sessionId}`}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:min-w-[420px]">
            <SurfaceCard className="px-4 py-4 bg-card/85">
              <div className="text-[12px] text-dim">复盘类型</div>
              <div className="mt-2 text-[16px] font-semibold text-text">{isRecording ? "录音复盘" : showDrill ? "训练复盘" : "面试复盘"}</div>
            </SurfaceCard>
            <SurfaceCard className="px-4 py-4 bg-card/85">
              <div className="text-[12px] text-dim">复盘重点</div>
              <div className="mt-2 text-[16px] font-semibold text-text">{showDrill ? (overall?.practice_comparison?.focus_label || overall?.targeting_stats?.focus_label || "目标命中与回升") : "总体表现与回答质量"}</div>
            </SurfaceCard>
            <SurfaceCard className="px-4 py-4 bg-card/85">
              <div className="text-[12px] text-dim">Session</div>
              <div className="mt-2 text-[13px] font-medium text-dim break-all">{sessionId}</div>
            </SurfaceCard>
          </div>
        </div>
      </section>

      {isRecording && !isRecordingDual ? (
        <SoloRecordingReview topicsCovered={topicsCovered} overall={overall} />
      ) : showDrill ? (
        <DrillReview sessionId={sessionId} scores={scores} overall={overall} questions={questions} answers={answers} topic={topic} topics={topics} autoScore={autoScore} practiceTrend={practiceTrend} persistedReferenceAnswers={referenceAnswers} persistedReferenceFollowups={referenceFollowups} persistedImprovedAnswers={improvedAnswers} />
      ) : (
        <>
          <AppSection title="结论优先" subtitle="先看总体判断，再决定要不要展开完整复盘文本和原始面试记录。" className="mb-6">
            <DimensionScores
              dimensionScores={stateData.dimension_scores || overall?.dimension_scores}
              avgScore={stateData.avg_score ?? overall?.avg_score}
            />
            <SurfaceCard className="px-5 py-6 md:px-8 leading-[1.8] text-[15px]">
              <div className="md-content">
                <ReactMarkdown>{review || ""}</ReactMarkdown>
              </div>
            </SurfaceCard>
          </AppSection>

          {messages.length > 0 && (
            <AppSection title="原始面试记录" subtitle="当你需要核对上下文、追问路径或真实表达状态时，再展开查看。">
              <SubtleButton
                className="mr-3 px-5 py-2.5"
                onClick={() => setShowTranscript(!showTranscript)}
              >
                {showTranscript ? "收起面试记录" : "查看面试记录"}
              </SubtleButton>
              {showTranscript && (
                <SurfaceCard className="mt-4 max-h-[500px] overflow-y-auto px-4 py-5 md:px-6">
                  {messages.map((msg, i) => (
                    <div key={i} className="border-b border-border py-2 text-sm leading-relaxed last:border-b-0">
                      <strong style={{ color: msg.role === "user" ? "var(--accent-light)" : "var(--green)" }}>
                        {msg.role === "user" ? "你" : "面试官"}:
                      </strong>{" "}
                      {msg.content}
                    </div>
                  ))}
                </SurfaceCard>
              )}
            </AppSection>
          )}
        </>
      )}

      <div className="mt-6 flex">
        <PrimaryButton onClick={() => navigate("/")}>返回首页</PrimaryButton>
      </div>
    </div>
  );
}
