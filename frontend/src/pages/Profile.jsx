import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, AlertTriangle, X } from "lucide-react";
import { getProfile, getTopics, resetProfile } from "../api/interview";
import { topicBadgeLabel, topicDisplayName } from "../utils/topicLabels";
import { Badge, PageTitle, SectionTitle, SubtleButton } from "../components/ui.jsx";

function CollapsibleList({ items, limit, renderItem, renderExpandedItem, expandedLabel = "查看完整内容", expandedTitle = "完整展开" }) {
  const [expanded, setExpanded] = useState(false);
  const collapsedItems = items.slice(0, limit);
  const extraItems = items.slice(limit);
  const hasMore = items.length > limit;

  return (
    <div className="flex flex-col gap-2">
      {collapsedItems.map((item, i) => renderItem(item, i))}
      {hasMore && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="rounded-xl border border-border bg-card px-3.5 py-2.5 text-left text-[13px] text-accent-light cursor-pointer transition-all hover:border-accent/40 hover:bg-hover"
        >
          {expandedLabel} · 已显示 {limit} / 共 {items.length} 条
        </button>
      )}
      {hasMore && expanded && (
        <div className="rounded-2xl border border-border bg-card/80 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5 bg-card/95">
            <div className="text-[12px] font-medium text-dim">{expandedTitle}</div>
            <div className="text-[11px] text-dim">其余 {extraItems.length} 条</div>
          </div>
          <div className="relative">
            <div className="max-h-[320px] overflow-y-auto px-3 py-3 pr-2">
              <div className="flex flex-col gap-2">
                {extraItems.map((item, i) => (renderExpandedItem || renderItem)(item, i + limit))}
              </div>
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent" />
          </div>
          <div className="border-t border-border px-3 py-2.5 bg-card/95">
            <button
              onClick={() => setExpanded(false)}
              className="bg-transparent border-none text-accent-light text-[13px] cursor-pointer py-1 text-left"
            >
              收起详情
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


function strategyBadge(strategy) {
  if (strategy === "repair") return { label: "攻坚", bg: "rgba(239,68,68,.10)", color: "var(--red)" };
  if (strategy === "advance") return { label: "进阶", bg: "rgba(34,197,94,.10)", color: "var(--green)" };
  return { label: "稳固", bg: "rgba(91,141,239,.10)", color: "var(--accent-light)" };
}

function strategyReason(w) {
  if (!w) return "";
  if (w.adaptive_strategy === "repair") {
    return `连续低分 ${w.recent_low_streak || 0} 次${w.repair_success_rate != null ? `，修复率 ${(Number(w.repair_success_rate) * 100).toFixed(0)}%` : ""}，适合先做概念澄清 / why / 单点应用题。`;
  }
  if (w.adaptive_strategy === "advance") {
    return `${w.avg_recent_score != null ? `近5次均分 ${w.avg_recent_score}` : ""}${w.repair_success_rate != null ? `，修复率 ${(Number(w.repair_success_rate) * 100).toFixed(0)}%` : ""}，该点可减少基础修复题，转向验收和拓展题。`;
  }
  return `${w.avg_recent_score != null ? `近5次均分 ${w.avg_recent_score}` : ""}${w.repair_success_rate != null ? `，修复率 ${(Number(w.repair_success_rate) * 100).toFixed(0)}%` : ""}，当前更适合追问型 / 场景变体题来验证稳定性。`;
}

function recommendationTone(rec) {
  if (!rec) return { label: "建议", cls: "bg-accent/10 text-accent-light" };
  if (rec.confidence === "high") return { label: "高置信推荐", cls: "bg-green/10 text-green" };
  if (rec.confidence === "medium") return { label: "可尝试", cls: "bg-blue-500/15 text-blue-400" };
  return { label: "探索建议", cls: "bg-hover text-dim" };
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

function CoachSuggestionCard({ primary, alternatives, navigate, topics }) {
  if (!primary) return null;
  const tone = recommendationTone(primary);
  return (
    <div className="mb-7">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="text-base font-semibold flex items-center gap-2">今日教练建议</div>
          <div className="text-[12px] text-dim mt-1">不用从整张画像里自己找入口，直接从这里开始最快。</div>
        </div>
        {primary.topic && (
          <button
            onClick={() => navigate("/", { state: { quickStartMode: "topic_drill", quickStartTopic: primary.topic, quickStartFocusKeyword: primary.focus_keyword || primary.focus_label, quickStartFocusLabel: primary.focus_label } })}
            className="px-3.5 py-2 rounded-xl text-[13px] font-semibold bg-accent text-white border-none cursor-pointer shadow-[0_8px_24px_-12px_rgba(91,141,239,0.55)]"
          >
            直接开始推荐训练
          </button>
        )}
      </div>
      <div className="rounded-2xl border border-accent/25 bg-[linear-gradient(180deg,rgba(91,141,239,0.08),rgba(91,141,239,0.02))] px-4 py-4 md:px-5 md:py-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${tone.cls}`}>{tone.label}</span>
            {primary.topic && <Badge tone="accent">{topicBadgeLabel(primary.topic, topics)}</Badge>}
            {primary.adaptive_strategy && <span className="text-[11px] text-dim">{primary.adaptive_strategy}</span>}
          </div>
          <span className="text-[12px] text-dim">推荐分 {primary.score}</span>
        </div>
        <div className="mt-3 text-[18px] font-semibold text-text leading-[1.5]">{primary.focus_label || primary.title}</div>
        {primary.point && <div className="mt-1 text-[13px] text-dim leading-[1.7]">目标薄弱点：{primary.point}</div>}
        {primary.why_now && <div className="mt-2 text-[13px] text-dim leading-[1.8]">为什么现在练：{primary.why_now}</div>}
        {primary.pre_read_keyword && <div className="mt-1 text-[13px] text-dim leading-[1.8]">练前先看：{primary.pre_read_keyword}</div>}
        {primary.success_rule && <div className="mt-1 text-[13px] text-dim leading-[1.8]">完成判据：{primary.success_rule}</div>}
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          {primary.topic && (
            <button
              onClick={() => navigate("/", { state: { quickStartMode: "topic_drill", quickStartTopic: primary.topic, quickStartFocusKeyword: primary.focus_keyword || primary.focus_label, quickStartFocusLabel: primary.focus_label } })}
              className="px-3.5 py-2 rounded-xl text-[13px] font-semibold bg-green text-white border-none cursor-pointer"
            >
              开始本轮训练
            </button>
          )}
          {primary.topic && (
            <button
              onClick={() => navigate("/knowledge", { state: { selectedTopic: primary.topic, searchKeyword: primary.pre_read_keyword || primary.focus_label } })}
              className="inline-flex items-center gap-2 rounded-xl bg-hover px-3 py-1.5 text-[12px] font-medium text-dim border-none cursor-pointer transition-all hover:text-accent-light"
            >
              先看题库
            </button>
          )}
        </div>
        {alternatives?.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="text-[12px] text-dim mb-2">备选建议</div>
            <div className="flex flex-wrap gap-2">
              {alternatives.slice(0, 3).map((item, idx) => (
                <button
                  key={`${item.topic || 'general'}-${idx}`}
                  onClick={() => item.topic && navigate("/", { state: { quickStartMode: "topic_drill", quickStartTopic: item.topic, quickStartFocusKeyword: item.focus_keyword || item.focus_label, quickStartFocusLabel: item.focus_label } })}
                  className="px-2 py-1 rounded text-[11px] font-medium bg-hover text-dim border-none cursor-pointer max-w-full break-words text-left sm:max-w-[280px] sm:truncate"
                  title={`${item.focus_label}${item.topic ? ` · ${topicBadgeLabel(item.topic, topics)}` : ""}`}
                >
                  {item.focus_label}{item.topic ? ` · ${topicBadgeLabel(item.topic, topics)}` : ""}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WeakPointDetailContent({ w, navigate, nextTone }) {
  return (
    <div className="space-y-2.5">
      <div className="text-[12px] leading-[1.7] text-dim">{strategyReason(w)}</div>
      {!!(w.review_count || w.repair_attempts || w.times_seen) && (
        <div className="text-[12px] text-dim leading-[1.7]">
          出现 {w.times_seen || 0} 次
          {w.review_count ? <span> · 复习 {w.review_count} 次</span> : null}
          {w.repair_attempts ? <span> · 修复尝试 {w.repair_attempts} 次</span> : null}
        </div>
      )}
      {w.semantic_bucket && w.topic && (
        <div>
          <button
            onClick={() => navigate("/knowledge", { state: { selectedTopic: w.topic, searchKeyword: bucketLabel(w.semantic_bucket) } })}
            className="px-2 py-0.5 rounded text-[11px] font-medium bg-accent/10 text-accent-light border-none cursor-pointer"
            title={w.semantic_bucket}
          >
            {bucketLabel(w.semantic_bucket)}
          </button>
        </div>
      )}
      {w.next_focus_recommendation && (
        <div className="rounded-lg border border-accent/20 bg-accent/5 px-3 py-2">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${nextTone.cls}`}>{nextTone.label}</span>
            <span className="text-[12px] font-medium text-text">下一次更建议练</span>
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-accent/15 text-accent-light max-w-full break-words sm:max-w-[220px] sm:truncate" title={w.next_focus_recommendation.focus_label}>
              {w.next_focus_recommendation.focus_label}
            </span>
          </div>
          <div className="text-[12px] text-dim leading-[1.7]">{w.next_focus_recommendation.reason}</div>
        </div>
      )}
      {w.best_focus && (
        <div className="rounded-lg border border-green/20 bg-green/5 px-3 py-2">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[12px] font-medium text-text">历史上更有效的修复 focus</span>
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-green/10 text-green max-w-full break-words sm:max-w-[220px] sm:truncate" title={w.best_focus.focus_label}>
              {w.best_focus.focus_label}
            </span>
            <span className="text-[11px] text-dim">命中率 {(Number(w.best_focus.focus_hit_rate || 0) * 100).toFixed(0)}%</span>
            <span className="text-[11px] text-dim">回升率 {(Number(w.best_focus.improvement_rate || 0) * 100).toFixed(0)}%</span>
          </div>
          {w.focus_effectiveness?.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {w.focus_effectiveness.slice(0, 3).map((f, idx) => (
                <button
                  key={`${f.focus_label}-${idx}`}
                  onClick={() => w.topic && navigate("/knowledge", { state: { selectedTopic: w.topic, searchKeyword: f.focus_label } })}
                  className="px-2 py-0.5 rounded text-[11px] font-medium bg-hover text-dim border-none cursor-pointer max-w-full break-words text-left sm:max-w-[220px] sm:truncate"
                  title={`${f.focus_label} · 命中率 ${(Number(f.focus_hit_rate || 0) * 100).toFixed(0)}% · 回升率 ${(Number(f.improvement_rate || 0) * 100).toFixed(0)}%`}
                >
                  {f.focus_label} · {(Number(f.improvement_rate || 0) * 100).toFixed(0)}%
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WeakPointDetailModal({ w, navigate, setStrategyFilter, topics, onClose }) {
  if (!w) return null;
  const badge = strategyBadge(w.adaptive_strategy);
  const nextTone = recommendationTone(w.next_focus_recommendation);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/45 px-3 py-3 md:px-6" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-3xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card/95 px-4 py-4 backdrop-blur md:px-5">
          <div className="min-w-0">
            <div className="text-base font-semibold leading-[1.6] text-text">{w.point}</div>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setStrategyFilter(w.adaptive_strategy || "stabilize")}
                className="px-2 py-0.5 rounded text-[11px] font-medium border-none cursor-pointer"
                style={{ background: badge.bg, color: badge.color }}
              >
                {badge.label}
              </button>
              {w.topic && (
                <button
                  onClick={() => navigate(`/profile/topic/${w.topic}`)}
                  className="px-2 py-0.5 rounded text-[11px] font-medium bg-accent/15 text-accent-light border-none cursor-pointer"
                >
                  {topicBadgeLabel(w.topic, topics)}
                </button>
              )}
              <span className="text-[11px] text-dim">优先级 {w.priority_score ?? "-"}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-xl border border-border bg-transparent text-dim cursor-pointer shrink-0"
            aria-label="关闭详情"
          >
            <X size={16} className="mx-auto" />
          </button>
        </div>

        <div className="px-4 py-4 md:px-5 md:py-5">
          <div className="mb-3 text-[12px] text-dim leading-[1.7]">
            {w.last_score != null && <span>最近得分 {w.last_score}</span>}
            {w.avg_recent_score != null && <span> · 近5次均分 {w.avg_recent_score}</span>}
            {w.recent_low_streak ? <span> · 连续低分 {w.recent_low_streak} 次</span> : null}
            {w.repair_success_rate != null && w.repair_attempts ? <span> · 修复率 {(Number(w.repair_success_rate) * 100).toFixed(0)}%</span> : null}
          </div>

          <div className="mb-4 flex items-center gap-2 flex-wrap">
            {w.next_focus_recommendation && (
              <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${nextTone.cls} max-w-full break-words sm:max-w-[220px] sm:truncate`} title={w.next_focus_recommendation.focus_label}>
                推荐 {w.next_focus_recommendation.focus_label}
              </span>
            )}
            {w.topic && (
              <button
                onClick={() => navigate("/", { state: { quickStartMode: "topic_drill", quickStartTopic: w.topic, quickStartFocusKeyword: w.next_focus_recommendation?.focus_keyword || w.best_focus?.focus_keyword || "", quickStartFocusLabel: w.next_focus_recommendation?.focus_label || w.best_focus?.focus_label || "" } })}
                className="px-2 py-0.5 rounded text-[11px] font-medium bg-green/10 text-green border-none cursor-pointer"
              >
                开始本轮训练
              </button>
            )}
            {w.topic && (
              <button
                onClick={() => navigate("/knowledge", { state: { selectedTopic: w.topic, searchKeyword: w.next_focus_recommendation?.focus_label || (w.semantic_bucket ? bucketLabel(w.semantic_bucket) : w.point) } })}
                className="px-2 py-0.5 rounded text-[11px] font-medium bg-hover text-dim border-none cursor-pointer"
              >
                先看题库
              </button>
            )}
          </div>

          <WeakPointDetailContent w={w} navigate={navigate} nextTone={nextTone} />
        </div>
      </div>
    </div>
  );
}

function WeakPointCard({ w, navigate, setStrategyFilter, topics, onOpenDetails }) {
  const badge = strategyBadge(w.adaptive_strategy);
  const nextTone = recommendationTone(w.next_focus_recommendation);

  return (
    <div className="px-3.5 py-3 rounded-lg bg-hover text-sm">
      <div className="flex justify-between items-start gap-3">
        <button
          onClick={() => onOpenDetails?.(w)}
          className="flex-1 text-left bg-transparent border-none p-0 cursor-pointer"
        >
          <div className="text-text leading-[1.7] font-medium">{w.point}</div>
          <div className="mt-1 text-[12px] text-dim leading-[1.7]">
            {w.last_score != null && <span>最近得分 {w.last_score}</span>}
            {w.avg_recent_score != null && <span> · 近5次均分 {w.avg_recent_score}</span>}
            {w.recent_low_streak ? <span> · 连续低分 {w.recent_low_streak} 次</span> : null}
            {w.repair_success_rate != null && w.repair_attempts ? <span> · 修复率 {(Number(w.repair_success_rate) * 100).toFixed(0)}%</span> : null}
          </div>
        </button>
        <div className="flex items-center gap-2 text-xs text-dim flex-wrap justify-start md:justify-end">
          {w.topic && (
            <button
              onClick={() => navigate(`/profile/topic/${w.topic}`)}
              className="px-2 py-0.5 rounded text-[11px] font-medium bg-accent/15 text-accent-light border-none cursor-pointer"
            >
              {topicBadgeLabel(w.topic, topics)}
            </button>
          )}
          <span>优先级 {w.priority_score ?? "-"}</span>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setStrategyFilter(w.adaptive_strategy || "stabilize")}
          className="px-2 py-0.5 rounded text-[11px] font-medium border-none cursor-pointer"
          style={{ background: badge.bg, color: badge.color }}
        >
          {badge.label}
        </button>
        {w.next_focus_recommendation && (
          <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${nextTone.cls} max-w-full break-words sm:max-w-[220px] sm:truncate`} title={w.next_focus_recommendation.focus_label}>
            推荐 {w.next_focus_recommendation.focus_label}
          </span>
        )}
        <button
          onClick={() => onOpenDetails?.(w)}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-transparent px-2 py-0.5 text-[11px] font-medium text-accent-light cursor-pointer transition-all hover:border-accent/40"
        >
          查看分析
        </button>
      </div>
    </div>
  );
}

function CompactWeakPointRow({ w, topics, onOpenDetails }) {
  const badge = strategyBadge(w.adaptive_strategy);
  const nextTone = recommendationTone(w.next_focus_recommendation);

  return (
    <div className="rounded-xl border border-border bg-card px-3.5 py-3">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm text-text leading-[1.7]">{w.point}</div>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded text-[11px] font-medium" style={{ background: badge.bg, color: badge.color }}>
              {badge.label}
            </span>
            {w.topic && <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-accent/15 text-accent-light">{topicBadgeLabel(w.topic, topics)}</span>}
            <span className="text-[11px] text-dim">优先级 {w.priority_score ?? "-"}</span>
            {w.next_focus_recommendation && (
              <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${nextTone.cls} max-w-full break-words sm:max-w-[220px] sm:truncate`} title={w.next_focus_recommendation.focus_label}>
                {w.next_focus_recommendation.focus_label}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => onOpenDetails?.(w)}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-transparent px-2 py-1 text-[11px] font-medium text-accent-light cursor-pointer shrink-0 transition-all hover:border-accent/40"
        >
          查看详情
        </button>
      </div>
    </div>
  );
}

function ScoreChart({ history, topics }) {
  if (!history || history.length < 2) return null;

  const W = 700, H = 200;
  const PAD = { top: 20, right: 20, bottom: 32, left: 36 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const points = history.map((h, i) => ({
    x: PAD.left + (i / (history.length - 1)) * innerW,
    y: PAD.top + innerH - (h.avg_score / 10) * innerH,
    score: h.avg_score,
    date: h.date,
    topic: topicBadgeLabel(h.topic, topics) || "简历",
    mode: h.mode,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${PAD.top + innerH} L${points[0].x},${PAD.top + innerH} Z`;

  const yLabels = [0, 5, 10];
  const xIndices = history.length <= 5
    ? history.map((_, i) => i)
    : [0, Math.floor(history.length / 2), history.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {yLabels.map((v) => {
        const y = PAD.top + innerH - (v / 10) * innerH;
        return (
          <g key={v}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y + 4} textAnchor="end" fill="var(--text-dim)" fontSize={11}>{v}</text>
          </g>
        );
      })}
      {xIndices.map((i) => (
        <text key={i} x={points[i].x} y={H - 6} textAnchor="middle" fill="var(--text-dim)" fontSize={11}>
          {history[i].date?.slice(5)}
        </text>
      ))}
      <path d={areaPath} fill="url(#chartGrad)" opacity={0.2} />
      <path d={linePath} fill="none" stroke="var(--accent-light)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={4} fill={p.mode === "resume" ? "var(--accent-light)" : "var(--green)"} stroke="var(--bg-card)" strokeWidth={2} />
          <title>{`${p.date} ${p.mode === "resume" ? "简历面试" : p.topic}: ${p.score}/10`}</title>
        </g>
      ))}
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent-light)" />
          <stop offset="100%" stopColor="var(--accent-light)" stopOpacity={0} />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [topics, setTopics] = useState({});
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [strategyFilter, setStrategyFilter] = useState("all");
  const [insightTab, setInsightTab] = useState("weak");
  const [analysisTab, setAnalysisTab] = useState("thinking");
  const [detailWeakPoint, setDetailWeakPoint] = useState(null);
  const statsRef = useRef(null);
  const trendRef = useRef(null);
  const masteryRef = useRef(null);
  const coachRef = useRef(null);
  const insightsRef = useRef(null);
  const analysisRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([getProfile(), getTopics().catch(() => ({}))])
      .then(([profileData, topicData]) => {
        setProfile(profileData);
        setTopics(topicData || {});
      })
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, []);

  const scrollToSection = (ref) => {
    ref?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleResetProfile = async () => {
    const ok = window.confirm("确定要清空当前画像吗？这会删除弱点、强项、掌握度和训练建议，但保留历史 session 记录。");
    if (!ok) return;
    setResetting(true);
    try {
      await resetProfile();
      setProfile(null);
      setStrategyFilter("all");
      alert("画像已清空，历史训练记录仍然保留。");
    } catch (err) {
      alert("清空画像失败: " + err.message);
    } finally {
      setResetting(false);
    }
  };

  if (loading) return <div className="text-center py-15 text-dim">加载中...</div>;

  const hasData = profile && (
    profile.stats?.total_sessions > 0 ||
    profile.stats?.total_answers > 0 ||
    (profile.weak_points || []).length > 0 ||
    (profile.strong_points || []).length > 0
  );

  if (!hasData) {
    return (
      <div className="flex-1 px-4 py-8 md:px-6 md:py-10 max-w-3xl mx-auto w-full">
        <PageTitle title="个人画像" className="mb-2" />
        <div className="text-center py-15 text-dim">
          <p>还没有面试数据</p>
          <p className="mt-3 text-sm">开始面试后，系统会实时分析你的每个回答，自动构建你的能力画像</p>
          <button className="mt-5 px-6 py-2.5 rounded-lg bg-accent text-white text-sm" onClick={() => navigate("/")}>
            开始第一场面试
          </button>
        </div>
      </div>
    );
  }

  const stats = profile.stats || {};
  const weakActiveAll = (profile.weak_points || []).filter((w) => !w.improved);
  const weakActive = strategyFilter === "all"
    ? weakActiveAll
    : weakActiveAll.filter((w) => (w.adaptive_strategy || "stabilize") === strategyFilter);
  const weakImproved = (profile.weak_points || []).filter((w) => w.improved);
  const coachPrimary = (profile.mini_training_plan || [])[0] || (profile.next_focus_recommendations || [])[0] || null;
  const coachAlternatives = [
    ...(profile.mini_training_plan || []).slice(1),
    ...(profile.next_focus_recommendations || []).filter((x, idx) => idx > 0 || !coachPrimary || x.focus_label !== coachPrimary.focus_label || x.topic !== coachPrimary.topic),
  ];

  return (
    <div className="flex-1 px-4 py-8 md:px-6 md:py-10 max-w-5xl mx-auto w-full">
      <PageTitle
        title="个人画像"
        subtitle={`${stats.total_answers || 0} 次回答分析${stats.total_sessions ? ` | ${stats.total_sessions} 次完整面试` : ""} | 上次更新: ${profile.updated_at?.slice(0, 16)}`}
        className="mb-4"
      />
      <div className="mb-8 flex flex-wrap gap-2 rounded-2xl border border-border bg-card px-3 py-3">
        <SubtleButton onClick={() => scrollToSection(coachRef)} className="bg-accent/10 py-1.5 text-[12px] text-accent-light hover:text-accent-light">现在该练什么</SubtleButton>
        <SubtleButton onClick={() => scrollToSection(insightsRef)} className="py-1.5 text-[12px]">画像重点</SubtleButton>
        <SubtleButton onClick={() => scrollToSection(trendRef)} className="py-1.5 text-[12px]">成长趋势</SubtleButton>
        <SubtleButton onClick={() => scrollToSection(masteryRef)} className="py-1.5 text-[12px]">掌握度</SubtleButton>
        <SubtleButton onClick={() => scrollToSection(analysisRef)} className="py-1.5 text-[12px]">表达与思维</SubtleButton>
        <SubtleButton onClick={() => scrollToSection(statsRef)} className="py-1.5 text-[12px]">练习统计</SubtleButton>
      </div>

      {/* Stats */}
      <div className="mb-7" ref={statsRef}>
        <SectionTitle>练习统计</SectionTitle>
        {/* Overview row */}
        <div className="flex gap-3 mb-3">
          <div className="flex-1 bg-hover rounded-lg p-4 text-center">
            <div className="text-[28px] font-bold text-accent-light">{stats.total_sessions}</div>
            <div className="text-xs text-dim mt-1">总练习次数</div>
          </div>
          <div className="flex-1 bg-hover rounded-lg p-4 text-center">
            <div className="text-[32px] font-bold text-green">{stats.avg_score || "-"}</div>
            <div className="text-xs text-dim mt-1">综合平均分</div>
          </div>
        </div>
        {/* Two mode columns */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 bg-hover rounded-lg p-3.5 border-l-[3px] border-l-accent-light">
            <div className="text-[13px] font-semibold text-accent-light mb-2.5">简历面试</div>
            <div className="flex gap-3">
              <div className="flex-1 text-center">
                <div className="text-[22px] font-bold text-accent-light">{stats.resume_sessions || 0}</div>
                <div className="text-[11px] text-dim mt-0.5">次数</div>
              </div>
              <div className="flex-1 text-center">
                <div className="text-[22px] font-bold text-accent-light">{stats.resume_avg_score ?? "-"}</div>
                <div className="text-[11px] text-dim mt-0.5">平均分</div>
              </div>
            </div>
          </div>
          <div className="flex-1 bg-hover rounded-lg p-3.5 border-l-[3px] border-l-green">
            <div className="text-[13px] font-semibold text-green mb-2.5">专项训练</div>
            <div className="flex gap-3">
              <div className="flex-1 text-center">
                <div className="text-[22px] font-bold text-green">{stats.drill_sessions || 0}</div>
                <div className="text-[11px] text-dim mt-0.5">次数</div>
              </div>
              <div className="flex-1 text-center">
                <div className="text-[22px] font-bold text-green">{stats.drill_avg_score ?? "-"}</div>
                <div className="text-[11px] text-dim mt-0.5">平均分</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Score Trend */}
      {(stats.score_history || []).length >= 2 && (
        <div className="mb-7" ref={trendRef}>
          <SectionTitle>成长趋势</SectionTitle>
          <div className="bg-card border border-border rounded-box px-4 py-5 md:px-6">
            <ScoreChart history={stats.score_history} topics={topics} />
          </div>
        </div>
      )}

      {/* Drill targeting stats */}
      {(stats.drill_targeting || []).length > 0 && (
        <div className="mb-7">
          <SectionTitle>针对性训练效果</SectionTitle>
          <div className="flex flex-col gap-2.5">
            {(stats.drill_targeting || []).slice(-5).reverse().map((item, idx) => (
              <div key={idx} className="px-4 py-3 rounded-lg bg-hover text-sm">
                <div className="flex justify-between items-center gap-3 flex-wrap">
                  <div className="font-medium">{topicBadgeLabel(item.topic, topics)}</div>
                  <div className="text-[12px] text-dim">{item.date}</div>
                </div>
                <div className="mt-1.5 text-[13px] text-dim leading-[1.7]">
                  命中率 {(Number(item.hit_rate || 0) * 100).toFixed(0)}% · 修复率 {(Number(item.repair_rate || 0) * 100).toFixed(0)}% · 命中 {item.hit_count || 0} 题 · 回升 {item.repaired_count || 0} 题
                  {item.focus_label ? ` · focus ${(Number(item.focus_hit_rate || 0) * 100).toFixed(0)}% · 前3 ${item.front3_focus_hits || 0} 次` : ""}
                </div>
                {item.focus_label && (
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-green/10 text-green max-w-full break-words sm:max-w-[220px] sm:truncate" title={item.focus_label}>{item.focus_label}</span>
                    <button
                      onClick={() => navigate("/", { state: { quickStartMode: "topic_drill", quickStartTopic: item.topic, quickStartFocusKeyword: item.focus_label, quickStartFocusLabel: item.focus_label } })}
                      className="px-2 py-0.5 rounded text-[11px] font-medium bg-hover text-dim border-none cursor-pointer"
                    >
                      开始本轮训练
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Topic Mastery */}
      {Object.keys(profile.topic_mastery || {}).length > 0 && (
        <div className="mb-7" ref={masteryRef}>
          <div className="text-base font-semibold mb-3 flex items-center gap-2">领域掌握度</div>
          <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">
            {Object.entries(profile.topic_mastery).map(([topic, data]) => (
              <div
                key={topic}
                className="px-4 py-3 rounded-lg bg-hover border border-transparent cursor-pointer transition-all hover:border-accent"
                onClick={() => navigate(`/profile/topic/${topic}`)}
              >
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-sm font-medium">{topicDisplayName(topic, topics)}</span>
                  <span className="text-xs text-dim">{data.score ?? (data.level ? data.level * 20 : 0)}/100 <ChevronRight size={14} className="inline align-middle" /></span>
                </div>
                <div className="h-1.5 rounded-sm bg-border overflow-hidden">
                  <div
                    className="h-full rounded-sm bg-gradient-to-r from-accent to-accent-light transition-[width] duration-500 ease-in-out"
                    style={{ width: `${data.score ?? (data.level ? data.level * 20 : 0)}%` }}
                  />
                </div>
                {data.notes && <div className="text-xs text-dim mt-1.5">{data.notes}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div ref={coachRef}>
        <CoachSuggestionCard primary={coachPrimary} alternatives={coachAlternatives} navigate={navigate} topics={topics} />
      </div>

      {/* Core insights tabs */}
      {(weakActive.length > 0 || (profile.strong_points || []).length > 0 || weakImproved.length > 0) && (
        <div className="mb-7 rounded-2xl border border-border bg-card px-4 py-4 md:px-5 md:py-5" ref={insightsRef}>
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div>
              <div className="text-base font-semibold text-text">画像重点</div>
              <div className="text-[12px] text-dim mt-1">按分区切换查看，避免所有内容同时展开导致页面过长。</div>
            </div>
            <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-hover/70 p-1 flex-wrap">
              <button
                onClick={() => setInsightTab("weak")}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${insightTab === "weak" ? "bg-red/10 text-red shadow-sm" : "text-dim hover:text-text"}`}
              >
                待改进 {weakActive.length > 0 ? `(${weakActive.length})` : ""}
              </button>
              <button
                onClick={() => setInsightTab("strong")}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${(insightTab === "strong") ? "bg-green/10 text-green shadow-sm" : "text-dim hover:text-text"}`}
              >
                强项 {(profile.strong_points || []).length > 0 ? `(${(profile.strong_points || []).length})` : ""}
              </button>
              <button
                onClick={() => setInsightTab("improved")}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${insightTab === "improved" ? "bg-accent/10 text-accent-light shadow-sm" : "text-dim hover:text-text"}`}
              >
                已改善 {weakImproved.length > 0 ? `(${weakImproved.length})` : ""}
              </button>
            </div>
          </div>

          {insightTab === "weak" && (
            <div>
              <div className="text-base font-semibold mb-3 flex items-center gap-2 flex-wrap">
                待改进 <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-red/15 text-red">{weakActive.length} / {weakActiveAll.length}</span>
                <button onClick={() => setStrategyFilter("all")} className={`px-2 py-0.5 rounded text-[11px] font-medium border ${strategyFilter === "all" ? "bg-hover border-accent text-accent-light" : "bg-transparent border-border text-dim"}`}>全部</button>
                <button onClick={() => setStrategyFilter("repair")} className={`px-2 py-0.5 rounded text-[11px] font-medium border ${strategyFilter === "repair" ? "bg-red/10 border-red text-red" : "bg-transparent border-border text-dim"}`}>攻坚</button>
                <button onClick={() => setStrategyFilter("stabilize")} className={`px-2 py-0.5 rounded text-[11px] font-medium border ${strategyFilter === "stabilize" ? "bg-accent/10 border-accent text-accent-light" : "bg-transparent border-border text-dim"}`}>稳固</button>
                <button onClick={() => setStrategyFilter("advance")} className={`px-2 py-0.5 rounded text-[11px] font-medium border ${strategyFilter === "advance" ? "bg-green/10 border-green text-green" : "bg-transparent border-border text-dim"}`}>进阶</button>
              </div>
              {weakActive.length > 0 ? (
                <CollapsibleList
                  items={weakActive}
                  limit={3}
                  expandedLabel="查看完整弱点详情"
                  expandedTitle="其余待处理弱点"
                  renderItem={(w, i) => (
                    <WeakPointCard key={i} w={w} navigate={navigate} setStrategyFilter={setStrategyFilter} topics={topics} onOpenDetails={setDetailWeakPoint} />
                  )}
                  renderExpandedItem={(w, i) => (
                    <CompactWeakPointRow key={i} w={w} topics={topics} onOpenDetails={setDetailWeakPoint} />
                  )}
                />
              ) : (
                <div className="rounded-xl bg-hover px-4 py-5 text-sm text-dim">当前筛选下暂无待改进项。</div>
              )}
            </div>
          )}

          {insightTab === "strong" && (
            <div>
              <div className="text-base font-semibold mb-3 flex items-center gap-2">
                强项 <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-green/15 text-green">{(profile.strong_points || []).length}</span>
              </div>
              {(profile.strong_points || []).length > 0 ? (
                <CollapsibleList items={profile.strong_points} limit={4} expandedLabel="查看全部强项" renderItem={(s, i) => (
                  <div key={i} className="flex justify-between items-center px-3.5 py-3 rounded-lg bg-hover text-sm border-l-[3px] border-l-green gap-3">
                    <span className="flex-1">{s.point}</span>
                    {s.topic && <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-accent/15 text-accent-light shrink-0">{topicBadgeLabel(s.topic, topics)}</span>}
                  </div>
                )} />
              ) : (
                <div className="rounded-xl bg-hover px-4 py-5 text-sm text-dim">暂时还没有稳定强项。</div>
              )}
            </div>
          )}

          {insightTab === "improved" && (
            <div>
              <div className="text-base font-semibold mb-3 flex items-center gap-2">
                已改善 <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-accent/15 text-accent-light">{weakImproved.length}</span>
              </div>
              {weakImproved.length > 0 ? (
                <CollapsibleList
                  items={weakImproved}
                  limit={4}
                  expandedLabel="查看全部已改善项"
                  expandedTitle="其余已改善项"
                  renderItem={(w, i) => (
                    <div key={i} className="px-3.5 py-3 rounded-lg bg-hover text-sm opacity-80">
                      <div className="flex justify-between items-center gap-3">
                        <span className="flex-1 line-through">{w.point}</span>
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-green/15 text-green shrink-0">已改善</span>
                      </div>
                      {(w.improved_reason || w.improved_at) && (
                        <div className="mt-1.5 text-[12px] text-dim leading-[1.7]">
                          {w.improved_reason || ""}
                          {w.improved_at ? ` · ${w.improved_at.slice(0, 10)}` : ""}
                        </div>
                      )}
                    </div>
                  )}
                />
              ) : (
                <div className="rounded-xl bg-hover px-4 py-5 text-sm text-dim">当前还没有进入“已改善”状态的薄弱点。</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Analysis panels */}
      {(((profile.thinking_patterns?.strengths || []).length > 0 ||
        (profile.thinking_patterns?.gaps || []).length > 0) || profile.communication?.style) && (
        <div className="mb-7 rounded-2xl border border-border bg-card px-4 py-4 md:px-5 md:py-5" ref={analysisRef}>
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div>
              <div className="text-base font-semibold text-text">表达与思维分析</div>
              <div className="text-[12px] text-dim mt-1">把较长的分析内容收进二级面板，避免主页面继续拉长。</div>
            </div>
            <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-hover/70 p-1 flex-wrap">
              <button
                onClick={() => setAnalysisTab("thinking")}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${analysisTab === "thinking" ? "bg-accent/10 text-accent-light shadow-sm" : "text-dim hover:text-text"}`}
              >
                思维模式
              </button>
              <button
                onClick={() => setAnalysisTab("communication")}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${analysisTab === "communication" ? "bg-accent/10 text-accent-light shadow-sm" : "text-dim hover:text-text"}`}
              >
                沟通风格
              </button>
            </div>
          </div>

          {analysisTab === "thinking" && (
            ((profile.thinking_patterns?.strengths || []).length > 0 || (profile.thinking_patterns?.gaps || []).length > 0) ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-green mb-1.5">优势</div>
                  {(profile.thinking_patterns?.strengths || []).length > 0 ? (
                    <CollapsibleList items={profile.thinking_patterns.strengths} limit={4} expandedLabel="查看完整优势" renderItem={(s, i) => (
                      <div key={i} className="px-3 py-2.5 rounded-lg text-sm bg-green/8 border-l-[3px] border-l-green mb-1.5">{s}</div>
                    )} />
                  ) : (
                    <div className="rounded-xl bg-hover px-4 py-5 text-sm text-dim">暂未识别出稳定优势。</div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-red mb-1.5">短板</div>
                  {(profile.thinking_patterns?.gaps || []).length > 0 ? (
                    <CollapsibleList items={profile.thinking_patterns.gaps} limit={4} expandedLabel="查看完整短板" renderItem={(g, i) => (
                      <div key={i} className="px-3 py-2.5 rounded-lg text-sm bg-red/8 border-l-[3px] border-l-red mb-1.5">{g}</div>
                    )} />
                  ) : (
                    <div className="rounded-xl bg-hover px-4 py-5 text-sm text-dim">暂未识别出明显短板。</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-hover px-4 py-5 text-sm text-dim">暂时还没有足够的思维模式分析数据。</div>
            )
          )}

          {analysisTab === "communication" && (
            profile.communication?.style ? (
              <div className="rounded-xl bg-hover px-4 py-4 text-sm leading-[1.8]">
                <div>{profile.communication.style}</div>
                {(profile.communication.habits || []).length > 0 && (
                  <div className="mt-3">
                    <strong className="text-[13px]">习惯</strong>
                    <ul className="mt-1.5 pl-4.5 leading-[1.8]">
                      {profile.communication.habits.map((h, i) => <li key={i}>{h}</li>)}
                    </ul>
                  </div>
                )}
                {(profile.communication.suggestions || []).length > 0 && (
                  <div className="mt-3">
                    <strong className="text-[13px]">建议</strong>
                    <ul className="mt-1.5 pl-4.5 leading-[1.8]">
                      {profile.communication.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl bg-hover px-4 py-5 text-sm text-dim">暂时还没有足够的沟通风格分析数据。</div>
            )
          )}
        </div>
      )}

      {detailWeakPoint && (
        <WeakPointDetailModal
          w={detailWeakPoint}
          navigate={navigate}
          setStrategyFilter={setStrategyFilter}
          topics={topics}
          onClose={() => setDetailWeakPoint(null)}
        />
      )}

      <div className="mt-10 rounded-2xl border border-red/25 bg-red/6 px-4 py-4 md:px-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-red">
              <AlertTriangle size={16} /> 危险区：清空当前画像
            </div>
            <div className="mt-2 text-sm text-dim leading-[1.8] max-w-[620px]">
              适合清理测试阶段积累的画像噪音。该操作会清空弱点、强项、掌握度、建议与画像统计，但保留历史训练记录与历史 session。
            </div>
          </div>
          <button
            onClick={handleResetProfile}
            disabled={resetting}
            className={`px-3.5 py-2 rounded-xl text-sm font-medium border transition-all ${resetting ? "border-border bg-hover text-dim cursor-not-allowed" : "border-red/35 bg-red/10 text-red hover:bg-red/15"}`}
          >
            {resetting ? "正在清空..." : "清空画像记录"}
          </button>
        </div>
      </div>
    </div>
  );
}
