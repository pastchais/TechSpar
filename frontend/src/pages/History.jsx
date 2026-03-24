import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { getHistory, deleteSession, getInterviewTopics } from "../api/interview";
import { formatTopicKey } from "../utils/topicLabels";

const PAGE_SIZE = 15;

function getScoreColor(score) {
  if (score >= 8) return { bg: "rgba(0,184,148,0.15)", color: "var(--green)" };
  if (score >= 6) return { bg: "rgba(245,158,11,0.15)", color: "var(--accent-light)" };
  if (score >= 4) return { bg: "rgba(253,203,110,0.2)", color: "#e2b93b" };
  return { bg: "rgba(225,112,85,0.15)", color: "var(--red)" };
}

const MODE_BADGES = {
  resume: { text: "简历面试", cls: "bg-accent/15 text-accent-light" },
  topic_drill: { text: "专项训练", cls: "bg-green/15 text-green" },
  recording: { text: "录音复盘", cls: "bg-blue-500/15 text-blue-400" },
};

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

export default function History() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [modeFilter, setModeFilter] = useState("all");
  const [topicFilter, setTopicFilter] = useState("all");
  const [bucketFilter, setBucketFilter] = useState("all");
  const [focusFilter, setFocusFilter] = useState("all");
  const [topics, setTopics] = useState([]);

  useEffect(() => { getInterviewTopics().then(setTopics).catch(() => {}); }, []);

  const fetchSessions = useCallback((reset) => {
    const offset = reset ? 0 : sessions.length;
    const setter = reset ? setLoading : setLoadingMore;
    setter(true);
    const mode = modeFilter === "all" ? null : modeFilter;
    const topic = topicFilter === "all" ? null : topicFilter;
    getHistory(PAGE_SIZE, offset, mode, topic)
      .then((data) => {
        setSessions((prev) => (reset ? data.items : [...prev, ...data.items]));
        setTotal(data.total);
      })
      .catch(() => {})
      .finally(() => setter(false));
  }, [modeFilter, topicFilter, sessions.length]);

  useEffect(() => { fetchSessions(true); }, [modeFilter, topicFilter]); // eslint-disable-line

  const bucketOptions = Array.from(new Set(
    sessions.flatMap((s) => Array.isArray(s.semantic_buckets) ? s.semantic_buckets : [])
  ));

  const focusOptions = Array.from(new Set(
    sessions.map((s) => s.focus_label).filter(Boolean)
  ));

  const visibleSessions = sessions.filter((s) => {
    const bucketOk = bucketFilter === "all" || (s.semantic_buckets || []).includes(bucketFilter);
    const focusOk = focusFilter === "all" || s.focus_label === focusFilter;
    return bucketOk && focusOk;
  });

  const bucketStats = bucketOptions
    .map((bucket) => {
      const matched = sessions.filter((s) => (s.semantic_buckets || []).includes(bucket));
      const scores = matched.map((s) => s.avg_score).filter((v) => typeof v === "number");
      return {
        bucket,
        count: matched.length,
        avgScore: scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)) : null,
      };
    })
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      const as = a.avgScore == null ? 999 : a.avgScore;
      const bs = b.avgScore == null ? 999 : b.avgScore;
      return as - bs;
    });

  const focusStats = focusOptions
    .map((label) => {
      const matched = sessions.filter((s) => s.focus_label === label);
      const scores = matched.map((s) => s.avg_score).filter((v) => typeof v === "number");
      const hitRates = matched.map((s) => s.focus_hit_rate).filter((v) => typeof v === "number");
      return {
        label,
        count: matched.length,
        avgScore: scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)) : null,
        avgHitRate: hitRates.length ? Number((hitRates.reduce((a, b) => a + b, 0) / hitRates.length).toFixed(2)) : null,
      };
    })
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      const as = a.avgHitRate == null ? -1 : a.avgHitRate;
      const bs = b.avgHitRate == null ? -1 : b.avgHitRate;
      return bs - as;
    });

  const handleModeChange = (mode) => {
    if (mode === "resume") setTopicFilter("all");
    setModeFilter(mode);
  };

  const handleDelete = async (e, sessionId) => {
    e.stopPropagation();
    if (!window.confirm("确定要删除这条记录吗？")) return;
    try {
      await deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
      setTotal((prev) => prev - 1);
    } catch (err) {
      alert("删除失败: " + err.message);
    }
  };

  if (loading) return <div className="text-center py-15 text-dim">加载中...</div>;

  const hasFilters = modeFilter !== "all" || topicFilter !== "all" || bucketFilter !== "all" || focusFilter !== "all";

  return (
    <div className="flex-1 px-4 py-8 md:px-6 md:py-10 max-w-3xl mx-auto w-full">
      {/* Title row */}
      <div className="flex items-baseline justify-between mb-5">
        <div className="text-2xl md:text-[28px] font-display font-bold">历史记录</div>
        <div className="text-sm text-dim">共 {total} 条记录</div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {[
          { key: "all", label: "全部" },
          { key: "resume", label: "简历面试" },
          { key: "topic_drill", label: "专项训练" },
          { key: "recording", label: "录音复盘" },
        ].map((m) => (
          <button
            key={m.key}
            className={`px-3.5 py-1.5 rounded-lg text-[13px] font-medium border transition-all cursor-pointer
              ${modeFilter === m.key ? "bg-hover text-text border-accent" : "bg-transparent text-dim border-border hover:bg-hover"}`}
            onClick={() => handleModeChange(m.key)}
          >
            {m.label}
          </button>
        ))}

        {modeFilter !== "resume" && topics.length > 0 && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            <select
              className="px-3.5 py-1.5 rounded-lg text-[13px] bg-input text-text border border-border outline-none cursor-pointer"
              value={topicFilter}
              onChange={(e) => setTopicFilter(e.target.value)}
            >
              <option value="all">全部领域</option>
              {topics.map((t) => <option key={t} value={t}>{formatTopicKey(t)}</option>)}
            </select>
          </>
        )}

        {bucketOptions.length > 0 && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            <select
              className="px-3.5 py-1.5 rounded-lg text-[13px] bg-input text-text border border-border outline-none cursor-pointer"
              value={bucketFilter}
              onChange={(e) => setBucketFilter(e.target.value)}
            >
              <option value="all">全部语义类目</option>
              {bucketOptions.map((b) => <option key={b} value={b}>{bucketLabel(b)}</option>)}
            </select>
          </>
        )}

        {focusOptions.length > 0 && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            <select
              className="px-3.5 py-1.5 rounded-lg text-[13px] bg-input text-text border border-border outline-none cursor-pointer max-w-[240px]"
              value={focusFilter}
              onChange={(e) => setFocusFilter(e.target.value)}
            >
              <option value="all">全部 focus 目标</option>
              {focusOptions.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </>
        )}
      </div>

      {bucketStats.length > 0 && (
        <div className="mb-5">
          <div className="text-sm font-medium text-dim mb-2">最近记录的语义薄弱点分布</div>
          <div className="flex flex-wrap gap-2">
            {bucketStats.slice(0, 8).map((item) => {
              const active = bucketFilter === item.bucket;
              const sc = item.avgScore != null ? getScoreColor(item.avgScore) : { bg: "var(--bg-hover)", color: "var(--text-dim)" };
              return (
                <button
                  key={item.bucket}
                  onClick={() => setBucketFilter(active ? "all" : item.bucket)}
                  className={`px-3 py-2 rounded-lg text-left border cursor-pointer transition-all ${active ? "border-accent bg-hover" : "border-border bg-card hover:border-accent"}`}
                  title={item.bucket}
                >
                  <div className="text-[13px] font-medium text-text">{bucketLabel(item.bucket)}</div>
                  <div className="text-[12px] text-dim mt-0.5">{item.count} 条记录{item.avgScore != null ? ` · 均分 ${item.avgScore}` : ""}</div>
                  {item.avgScore != null && (
                    <div className="mt-1 inline-flex px-2 py-0.5 rounded text-[11px] font-medium" style={{ background: sc.bg, color: sc.color }}>
                      {item.avgScore < 6 ? "优先修复" : item.avgScore < 7.5 ? "继续稳定" : "可做验收"}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {focusStats.length > 0 && (
        <div className="mb-5">
          <div className="text-sm font-medium text-dim mb-2">最近的 focus-driven drill 目标</div>
          <div className="flex flex-wrap gap-2">
            {focusStats.slice(0, 6).map((item) => {
              const active = focusFilter === item.label;
              const sc = item.avgScore != null ? getScoreColor(item.avgScore) : { bg: "var(--bg-hover)", color: "var(--text-dim)" };
              return (
                <button
                  key={item.label}
                  onClick={() => setFocusFilter(active ? "all" : item.label)}
                  className={`px-3 py-2 rounded-lg text-left border cursor-pointer transition-all max-w-full ${active ? "border-green bg-green/5" : "border-border bg-card hover:border-green"}`}
                  title={item.label}
                >
                  <div className="text-[13px] font-medium text-text truncate max-w-[220px]">{item.label}</div>
                  <div className="text-[12px] text-dim mt-0.5">
                    {item.count} 次训练
                    {item.avgHitRate != null ? ` · 平均命中率 ${(item.avgHitRate * 100).toFixed(0)}%` : ""}
                  </div>
                  {item.avgScore != null && (
                    <div className="mt-1 inline-flex px-2 py-0.5 rounded text-[11px] font-medium" style={{ background: sc.bg, color: sc.color }}>
                      均分 {item.avgScore}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Session list */}
      {visibleSessions.length === 0 ? (
        <div className="text-center py-15 text-dim">
          {hasFilters ? "没有匹配的记录，试试调整筛选条件" : "还没有面试记录，去首页开始一场面试吧"}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2.5">
            {visibleSessions.map((s) => {
              const badge = MODE_BADGES[s.mode] || MODE_BADGES.resume;
              const hasScore = s.avg_score != null;
              const sc = hasScore ? getScoreColor(s.avg_score) : null;

              return (
                <div
                  key={s.session_id}
                  className="flex items-center justify-between px-4 py-3.5 md:px-5 bg-card border border-border rounded-box cursor-pointer transition-all hover:border-accent"
                  onClick={() => navigate(`/review/${s.session_id}`)}
                >
                  <div className="flex items-center gap-2 md:gap-2.5 min-w-0 flex-1 flex-wrap">
                    <span className={`px-2.5 py-1 rounded-md text-xs font-medium shrink-0 ${badge.cls}`}>{badge.text}</span>
                    {s.topic && <span className="text-sm text-text font-medium truncate">{formatTopicKey(s.topic)}</span>}
                    {(s.semantic_buckets || []).slice(0, 2).map((b) => (
                      <button
                        key={b}
                        onClick={(e) => {
                          e.stopPropagation();
                          setBucketFilter(b);
                        }}
                        className="px-2 py-0.5 rounded text-[11px] font-medium bg-accent/10 text-accent-light border-none cursor-pointer"
                        title={b}
                      >
                        {bucketLabel(b)}
                      </button>
                    ))}
                    {s.focus_label && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFocusFilter(s.focus_label);
                        }}
                        className="px-2 py-0.5 rounded text-[11px] font-medium bg-green/10 text-green border-none cursor-pointer max-w-[220px] truncate"
                        title={s.focus_label}
                      >
                        focus: {s.focus_label}
                      </button>
                    )}
                    <span className="text-xs text-dim shrink-0 hidden md:inline">#{s.session_id}</span>
                  </div>
                  <div className="flex items-center gap-2 md:gap-3 shrink-0 flex-wrap justify-end">
                    {hasScore ? (
                      <span className="px-2.5 py-1 rounded-md text-[13px] font-semibold min-w-[52px] text-center" style={{ background: sc.bg, color: sc.color }}>
                        {s.avg_score}/10
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-md text-[13px] text-dim bg-hover min-w-[52px] text-center">--</span>
                    )}
                    {s.focus_label && (
                      <span className="px-2.5 py-1 rounded-md text-[12px] bg-hover text-dim text-center">
                        focus {(Number(s.focus_hit_rate || 0) * 100).toFixed(0)}% · 前3 {s.front3_focus_hits || 0}
                      </span>
                    )}
                    {s.topic && ((s.semantic_buckets || []).length > 0 || s.focus_label) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate("/knowledge", { state: { selectedTopic: s.topic, searchKeyword: s.focus_label || bucketLabel(s.semantic_buckets[0]) } });
                        }}
                        className="px-2 py-1 rounded-md text-[12px] bg-hover text-dim border-none cursor-pointer"
                      >
                        先看题库
                      </button>
                    )}
                    {s.topic && s.mode === "topic_drill" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate("/", {
                            state: {
                              quickStartMode: "topic_drill",
                              quickStartTopic: s.topic,
                              quickStartFocusKeyword: s.focus_keyword || s.focus_label || "",
                              quickStartFocusLabel: s.focus_label || "",
                            },
                          });
                        }}
                        className="px-2 py-1 rounded-md text-[12px] bg-green/10 text-green border-none cursor-pointer"
                      >
                        开始本轮训练
                      </button>
                    )}
                    <span className="text-[13px] text-dim whitespace-nowrap hidden md:inline">{s.created_at?.slice(0, 10)}</span>
                    <button
                      className="px-2 py-1 rounded-md bg-transparent text-dim text-[15px] opacity-50 transition-all hover:text-red hover:opacity-100"
                      title="删除"
                      onClick={(e) => handleDelete(e, s.session_id)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {sessions.length < total && (
            <button
              className="block w-full py-3 mt-4 rounded-box bg-hover text-dim text-sm border border-border cursor-pointer transition-all hover:bg-card"
              onClick={() => fetchSessions(false)}
              disabled={loadingMore}
            >
              {loadingMore ? "加载中..." : `加载更多 (${sessions.length}/${total})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
