import { useParams, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { PageTitle } from "../components/ui.jsx";
import { BookOpen } from "lucide-react";
import { getReview, getReferenceAnswer, scoreInterviewAnswer, getTopics } from "../api/interview";
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
          <div className="text-base font-semibold mb-3 mt-2 text-text">薄弱点</div>
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
          <div className="text-base font-semibold mb-3 mt-2 text-text">亮点</div>
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
          <div className="text-base font-semibold mb-3 mt-2 text-text">涉及知识点</div>
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

function DrillReview({ scores, overall, questions, answers, topic, topics }) {
  const answerMap = {};
  for (const a of (answers || [])) answerMap[a.question_id] = a.answer;
  const scoreMap = {};
  for (const s of (scores || [])) scoreMap[s.question_id] = s;
  const [refAnswers, setRefAnswers] = useState({});
  const [refLoading, setRefLoading] = useState({});

  const handleRefAnswer = async (qId, questionText) => {
    if (refAnswers[qId]) return;
    setRefLoading((p) => ({ ...p, [qId]: true }));
    try {
      const data = await getReferenceAnswer(topic, questionText);
      setRefAnswers((p) => ({ ...p, [qId]: data.reference_answer }));
    } catch (e) {
      setRefAnswers((p) => ({ ...p, [qId]: "生成失败: " + e.message }));
    }
    setRefLoading((p) => ({ ...p, [qId]: false }));
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
          <div className="text-base font-semibold mb-3">针对性训练命中</div>
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
          <div className="text-base font-semibold mb-3 mt-2 text-text">薄弱点</div>
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
          <div className="text-base font-semibold mb-3 mt-2 text-text">亮点</div>
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
      <div className="text-base font-semibold mb-3 mt-2 text-text">逐题复盘</div>
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
                {refAnswers[q.id] ? (
                  <div className="text-sm leading-[1.8]">
                    <div className="text-xs font-semibold text-dim mb-2 flex items-center gap-1.5">
                      <BookOpen size={13} /> 参考答案
                    </div>
                    <div className="md-content bg-hover rounded-lg px-3.5 py-3">
                      <ReactMarkdown>{refAnswers[q.id]}</ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <button
                    className="text-[13px] text-accent-light flex items-center gap-1.5 bg-transparent border-none cursor-pointer transition-opacity disabled:opacity-50"
                    onClick={() => handleRefAnswer(q.id, q.question)}
                    disabled={refLoading[q.id]}
                  >
                    <BookOpen size={13} />
                    {refLoading[q.id] ? "正在生成参考答案..." : "查看参考答案"}
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

      {isRecording && !isRecordingDual ? (
        <SoloRecordingReview topicsCovered={topicsCovered} overall={overall} />
      ) : showDrill ? (
        <DrillReview scores={scores} overall={overall} questions={questions} answers={answers} topic={topic} topics={topics} />
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
