import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FileText, ChevronRight, Mic, Sparkles, ArrowRight } from "lucide-react";
import TopicCard from "../components/TopicCard";
import { getTopics, startInterview, getResumeStatus, uploadResume, getProfile } from "../api/interview";
import { AppSection, Badge, OutlineButton, PageTitle, PrimaryButton, SectionTitle, SubtleButton, SurfaceCard } from "../components/ui.jsx";

function recommendationBadge(confidence) {
  if (confidence === "high") return "bg-green/10 text-green";
  if (confidence === "medium") return "bg-blue-500/15 text-blue-400";
  return "bg-hover text-dim";
}

function panelTone(kind = "neutral") {
  if (kind === "recommend") return "border-green/20 bg-card";
  if (kind === "preset") return "border-accent/20 bg-card";
  if (kind === "summary") return "border-border bg-card";
  return "border-border bg-card";
}

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState(null);
  const [topics, setTopics] = useState({});
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resumeFile, setResumeFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [quickFocus, setQuickFocus] = useState("");
  const [quickFocusLabel, setQuickFocusLabel] = useState("");
  const [quickFocusTrend, setQuickFocusTrend] = useState("");
  const [presetNotice, setPresetNotice] = useState("");
  const [summaryFlash, setSummaryFlash] = useState(false);
  const [showAllTopics, setShowAllTopics] = useState(false);
  const [topicView, setTopicView] = useState("priority");
  const topicSectionRef = useRef(null);
  const summarySectionRef = useRef(null);
  const resumeSectionRef = useRef(null);
  const modeSectionRef = useRef(null);

  useEffect(() => {
    getTopics().then(setTopics).catch(() => {});
    getResumeStatus().then((s) => {
      if (s.has_resume) setResumeFile({ filename: s.filename, size: s.size });
    }).catch(() => {});
    getProfile().then(setProfile).catch(() => {});
  }, []);

  useEffect(() => {
    const quickMode = location.state?.quickStartMode;
    const quickTopic = location.state?.quickStartTopic;
    const quickFocusKeyword = location.state?.quickStartFocusKeyword || "";
    const quickFocusLabelText = location.state?.quickStartFocusLabel || "";
    const quickFocusTrendText = location.state?.quickStartFocusTrend || "";
    if (quickMode === "topic_drill") {
      setMode("topic_drill");
      if (quickTopic) setSelectedTopic(quickTopic);
      setQuickFocus(quickFocusKeyword);
      setQuickFocusLabel(quickFocusLabelText);
      setQuickFocusTrend(quickFocusTrendText);
      setPresetNotice(quickFocusKeyword || quickTopic ? "已应用推荐训练目标" : "");
      setTimeout(() => scrollToSummary(), 120);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const data = await uploadResume(file);
      setResumeFile({ filename: data.filename, size: data.size });
    } catch (err) {
      alert("上传失败: " + err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const launchInterview = async (launchMode, launchTopic, focusKeyword = "", focusLabel = "", focusTrend = "") => {
    setLoading(true);
    try {
      const data = await startInterview(launchMode, launchTopic, {
        focusKeyword,
        focusLabel,
        focusTrend,
      });
      navigate(`/interview/${data.session_id}`, {
        state: {
          ...data,
          quickFocusKeyword: focusKeyword,
          quickFocusLabel: focusLabel,
          quickFocusTrend: focusTrend,
        },
      });
    } catch (err) {
      alert("启动失败: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    if (!mode) return;
    if (mode === "topic_drill" && !selectedTopic) return;
    await launchInterview(mode, selectedTopic, quickFocus, quickFocusLabel, quickFocusTrend);
  };

  const scrollToSummary = () => {
    requestAnimationFrame(() => {
      summarySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setSummaryFlash(true);
    });
  };

  const scrollToTopicSection = () => {
    requestAnimationFrame(() => {
      topicSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const canStart = (mode === "resume" && resumeFile) || (mode === "topic_drill" && selectedTopic);
  const stats = profile?.stats || {};
  const mastery = profile?.topic_mastery || {};
  const rankedTopics = Object.entries(topics).sort((a, b) => {
    const aScore = mastery[a[0]]?.score ?? 50;
    const bScore = mastery[b[0]]?.score ?? 50;
    return aScore - bScore;
  });
  const topTopics = Object.entries(mastery)
    .sort((a, b) => (a[1]?.score ?? 0) - (b[1]?.score ?? 0))
    .slice(0, 3);
  const lastEntry = (stats.score_history || []).slice(-1)[0];
  const primaryRecommendation = (profile?.mini_training_plan || [])[0] || (profile?.next_focus_recommendations || [])[0] || null;
  const recommendedTopicKey = primaryRecommendation?.topic || null;
  const selectedTopicInfo = selectedTopic ? topics[selectedTopic] : null;
  const selectedMastery = selectedTopic ? mastery[selectedTopic] : null;
  const currentStrategyLabel = primaryRecommendation?.adaptive_strategy === "repair"
    ? "攻坚"
    : primaryRecommendation?.adaptive_strategy === "advance"
      ? "进阶"
      : primaryRecommendation?.adaptive_strategy
        ? "稳固"
        : null;
  const recommendationTrend = primaryRecommendation?.trend_label || "";
  const recommendationActionText = recommendationTrend === "进入平台期"
    ? "建议升级题型"
    : recommendationTrend === "出现回退"
      ? "建议先稳住基础"
      : recommendationTrend === "持续上升"
        ? "可以直接进阶训练"
        : recommendationTrend === "波动明显"
          ? "建议先做稳定性验收"
          : "建议优先处理";
  const recommendationPrimaryButton = recommendationTrend === "进入平台期"
    ? "开始升级训练"
    : recommendationTrend === "出现回退"
      ? "开始稳固训练"
      : recommendationTrend === "持续上升"
        ? "开始进阶训练"
        : "立即开始推荐训练";
  const recommendationSecondaryHint = recommendationTrend === "进入平台期"
    ? "当前同类 focus 已接近平台期，别再刷同层题，建议直接进入更深的追问和场景题。"
    : recommendationTrend === "出现回退"
      ? "最近这类 focus 有回退迹象，建议先回到概念边界和稳定表达，再恢复强度。"
      : recommendationTrend === "持续上升"
        ? "这类 focus 正在稳定变好，可以直接带着当前状态进入更深一轮验收。"
        : recommendationTrend === "波动明显"
          ? "这类 focus 还不够稳定，建议先固定结构，再做一轮验收型训练。"
          : null;

  const getTopicCategory = (key, info) => {
    const raw = `${key || ""} ${info?.name || ""}`.toLowerCase();
    if (raw.includes("frontend") || raw.includes("react") || raw.includes("web") || raw.includes("前端")) return "前端";
    if (raw.includes("backend") || raw.includes("api") || raw.includes("服务端") || raw.includes("后端")) return "后端";
    if (raw.includes("db") || raw.includes("database") || raw.includes("sql") || raw.includes("数据")) return "数据";
    if (raw.includes("system") || raw.includes("design") || raw.includes("架构")) return "系统设计";
    if (raw.includes("network") || raw.includes("infra") || raw.includes("cloud") || raw.includes("deploy") || raw.includes("运维") || raw.includes("网络")) return "基础设施";
    return "其他";
  };

  const categoryOrder = ["前端", "后端", "数据", "系统设计", "基础设施", "其他"];
  const categorizedTopics = useMemo(() => {
    const groups = new Map();
    categoryOrder.forEach((name) => groups.set(name, []));
    rankedTopics.forEach(([key, info], idx) => {
      const category = getTopicCategory(key, info);
      groups.get(category)?.push({ key, info, idx });
    });
    return categoryOrder
      .map((name) => ({ name, items: groups.get(name) || [] }))
      .filter((group) => group.items.length > 0);
  }, [rankedTopics]);

  const priorityTopics = useMemo(() => {
    const recommended = rankedTopics.filter(([key]) => key === recommendedTopicKey);
    const topRanked = rankedTopics.slice(0, 6);
    const merged = [...recommended, ...topRanked];
    const seen = new Set();
    return merged.filter(([key]) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [rankedTopics, recommendedTopicKey]);

  const visiblePriorityTopics = showAllTopics ? rankedTopics : priorityTopics;
  const modeMeta = {
    resume: {
      label: "简历模拟面试",
      icon: <FileText size={22} />,
      color: "accent",
      hint: "基于简历生成模拟面试与追问。",
    },
    topic_drill: {
      label: "专题强化训练",
      icon: <Mic size={22} />,
      color: "green",
      hint: "围绕单个专题集中训练。",
    },
  };

  useEffect(() => {
    if (!presetNotice) return;
    const timer = setTimeout(() => setPresetNotice(""), 3200);
    return () => clearTimeout(timer);
  }, [presetNotice]);

  useEffect(() => {
    if (!summaryFlash) return;
    const timer = setTimeout(() => setSummaryFlash(false), 1600);
    return () => clearTimeout(timer);
  }, [summaryFlash]);

  const disabledReason = !mode
    ? "请先选择训练模式。"
    : mode === "resume"
      ? (!resumeFile ? "请先上传简历，系统才能生成完整模拟面试。" : "")
      : (!selectedTopic ? "请先选择一个训练专题。" : "");

  return (
    <div className="flex-1 px-4 pb-10 pt-6 md:px-6 md:pb-12 md:pt-8">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8">
        <section className="relative overflow-hidden rounded-[28px] border border-border/80 bg-[linear-gradient(180deg,rgba(245,158,11,0.08),rgba(245,158,11,0.015))] px-5 py-5 md:px-6 md:py-6 animate-fade-in">
          <div className="pointer-events-none absolute right-[-40px] top-[-70px] h-[180px] w-[180px] rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.16),transparent_62%)] blur-3xl" />
          <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <Badge tone="accent" className="mb-3 gap-1.5 px-3 py-1 text-[11px]">
                <Sparkles size={13} />
                Training launcher
              </Badge>
              <PageTitle
                title="开始下一轮训练。"
                subtitle="先从当前最值得修的点开始，不必自己在专题和状态里来回找入口。"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-dim">
                <Badge tone="muted">建议 focus：{primaryRecommendation?.focus_label || "等待推荐"}</Badge>
                {recommendationTrend ? <Badge tone="orange">当前轨迹：{recommendationTrend}</Badge> : null}
                <Badge tone={canStart ? "green" : "muted"}>{canStart ? "配置已就绪" : "等待完成配置"}</Badge>
              </div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card/75 px-4 py-3 lg:min-w-[320px]">
              <div className="text-[12px] font-medium text-dim">当前启动摘要</div>
              <div className="mt-2 text-[14px] font-semibold text-text">{mode ? modeMeta[mode]?.label : "先选择训练模式"}</div>
              <div className="mt-1 text-[12px] leading-[1.7] text-dim">
                {mode === "resume"
                  ? (resumeFile ? `将基于「${resumeFile.filename}」进入完整模拟面试。` : "上传简历后即可开始完整模拟面试。")
                  : mode === "topic_drill"
                    ? (selectedTopic
                        ? `${quickFocusLabel || quickFocus ? `先修「${quickFocusLabel || quickFocus}」，` : ""}再进入「${selectedTopicInfo?.name || selectedTopic}」专题训练。`
                        : "选择专题后，系统会收束成一轮定向训练。")
                    : "先选模式，再决定这一轮从哪里切入。"}
              </div>
            </div>
          </div>
        </section>

        <AppSection
          title="1. 配置本轮训练"
          subtitle="先选练法，再按系统推荐决定从哪里切入。"
          className="animate-slide-up"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" ref={modeSectionRef}>
          {Object.entries(modeMeta).map(([key, meta]) => {
            const isSelected = mode === key;
            const themeColor = meta.color === "accent" ? "var(--accent)" : "var(--green)";
            const themeBg = meta.color === "accent" ? "rgba(245,158,11,0.08)" : "rgba(34,197,94,0.08)";
            
            return (
              <button
                key={key}
                onClick={() => {
                  setMode(key);
                  if (key === "resume") {
                    setSelectedTopic(null);
                    setQuickFocus("");
                    setQuickFocusLabel("");
                    setTimeout(() => {
                      requestAnimationFrame(() => {
                        resumeSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      });
                    }, 120);
                  }
                  if (key === "topic_drill") {
                    setTimeout(() => scrollToTopicSection(), 120);
                  }
                }}
                className={`relative overflow-hidden group flex flex-col items-start text-left p-5 md:p-6 rounded-2xl border-2 transition-all duration-500 transform active:scale-[0.98] ${
                  isSelected 
                    ? `border-opacity-100 bg-opacity-10 shadow-xl` 
                    : `border-transparent bg-card hover:bg-hover/60 hover:border-border`
                }`}
                style={{ 
                  borderColor: isSelected ? themeColor : "var(--border)",
                  backgroundColor: isSelected ? themeBg : "var(--bg-card)",
                  boxShadow: isSelected ? `0 12px 30px -10px ${themeColor}33` : "none"
                }}
              >
                <div className={`p-2.5 rounded-xl mb-3 transition-all duration-300 ${
                  isSelected ? "scale-110" : "bg-hover text-dim group-hover:text-text"
                }`}
                style={{ 
                  backgroundColor: isSelected ? themeColor : "var(--bg-hover)",
                  color: isSelected ? "#fff" : "var(--text-dim)"
                }}>
                  {meta.icon}
                </div>
                
                <div className={`text-[17px] md:text-lg font-bold mb-1.5 transition-colors ${isSelected ? "text-text" : "text-dim group-hover:text-text"}`}>
                  {meta.label}
                </div>
                <div className="text-[13px] text-dim leading-[1.7] opacity-80 group-hover:opacity-100 break-words">
                  {meta.hint}
                </div>

                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                    isSelected
                      ? (meta.color === "accent" ? "bg-accent border-accent" : "bg-green border-green")
                      : "border-border group-hover:border-accent/50"
                  }`}>
                    {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                  </span>
                  <span className={`text-[12px] font-medium ${isSelected ? "text-text" : "text-dim"}`}>
                    {isSelected ? "当前已选中" : "点击选择"}
                  </span>
                </div>

                {/* Focus indicator bar */}
                <div
                  className={`pointer-events-none absolute inset-x-0 bottom-0 h-1 transition-opacity duration-300 ${isSelected ? "opacity-100" : "opacity-0"}`}
                  style={{ backgroundColor: themeColor }}
                />
              </button>
            );
          })}
        </div>

        {mode && (
          <SurfaceCard className="mt-3 px-4 py-3 bg-accent/5 border-accent/15">
            <div className="text-[12px] text-dim leading-[1.7]">
              已选择：<span className="font-medium text-text">{mode === "resume" ? "简历模拟面试" : "专题强化训练"}</span>。
              {mode === "resume" ? " 现在补齐简历即可开始。" : " 现在选择训练专题并确认切入点。"}
            </div>
          </SurfaceCard>
        )}

        {profile?.stats?.total_sessions > 0 && (
          <SurfaceCard className="mt-4 px-4 py-4 md:px-5 md:py-5 border-border/80 bg-card/75">
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-[15px] font-semibold text-text">当前状态与推荐起点</div>
                  <div className="mt-1 text-[12px] leading-[1.7] text-dim">模式和起点一起决定本轮训练从哪里切入，不再拆成两个入口。</div>
                </div>
                <SubtleButton onClick={() => navigate("/profile")} className="py-1.5 text-[12px]">
                  查看画像 <ChevronRight size={14} />
                </SubtleButton>
              </div>

              <div className="rounded-2xl border border-border/70 bg-card/55 px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-dim">
                  <span><span className="text-text font-medium">{stats.total_sessions || 0}</span> 次练习</span>
                  <span><span className="text-text font-medium">{stats.avg_score || "-"}</span> 综合平均</span>
                  <span><span className={`font-medium ${lastEntry?.avg_score >= 6 ? "text-green" : "text-orange"}`}>{lastEntry?.avg_score ?? "-"}</span> 上次得分</span>
                  <span>当前更该关注 <span className="text-text font-medium">{topTopics[0] ? (topics[topTopics[0][0]]?.name || topTopics[0][0]) : "等待更多练习"}</span></span>
                </div>
              </div>

              {primaryRecommendation && (
                <div className="rounded-2xl border border-green/20 bg-green/5 px-4 py-4 md:px-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex items-center gap-2 flex-wrap">
                        <span className="text-[15px] font-semibold text-text">推荐起点</span>
                        <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${recommendationBadge(primaryRecommendation.confidence)}`}>
                          {primaryRecommendation.confidence === "high" ? "高置信推荐" : primaryRecommendation.confidence === "medium" ? "可尝试" : "探索建议"}
                        </span>
                        {primaryRecommendation.topic && <Badge tone="accent">{topics[primaryRecommendation.topic]?.name || primaryRecommendation.topic}</Badge>}
                      </div>
                      <div className="text-[14px] font-medium text-text">{primaryRecommendation.focus_label || primaryRecommendation.title}</div>
                      {recommendationTrend && <div className="mt-1 text-[12px] font-medium text-accent-light">{recommendationActionText} · {recommendationTrend}</div>}
                      <div className="mt-1 text-[12px] leading-[1.7] text-dim">
                        {primaryRecommendation.why_now || primaryRecommendation.reason || "根据你的近期画像，优先从这个目标开始更划算。"}
                        {recommendationSecondaryHint ? ` ${recommendationSecondaryHint}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {primaryRecommendation.topic && (
                        <SubtleButton
                          onClick={() => {
                            setMode("topic_drill");
                            setSelectedTopic(primaryRecommendation.topic);
                            setQuickFocus(primaryRecommendation.focus_keyword || primaryRecommendation.focus_label || "");
                            setQuickFocusLabel(primaryRecommendation.focus_label || "");
                            setQuickFocusTrend(primaryRecommendation.trend_label || "");
                            setPresetNotice("已应用推荐训练目标");
                            setTimeout(() => scrollToSummary(), 100);
                          }}
                          className="bg-accent/10 py-1.5 text-[12px] text-accent-light hover:text-accent-light"
                        >
                          用它作为本轮起点
                        </SubtleButton>
                      )}
                      {primaryRecommendation.topic && (
                        <SubtleButton
                          onClick={() => navigate("/knowledge", { state: { selectedTopic: primaryRecommendation.topic, searchKeyword: primaryRecommendation.pre_read_keyword || primaryRecommendation.focus_label } })}
                          className="py-1.5 text-[12px]"
                        >
                          先看题库
                        </SubtleButton>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </SurfaceCard>
        )}

        <div className="mt-4 flex justify-center">
          <SubtleButton onClick={() => navigate("/recording")}>
            录音复盘工具 <ChevronRight size={14} />
          </SubtleButton>
        </div>

        </AppSection>

      {mode === "resume" && (
        <AppSection
          title="2. 上传简历并开始"
          subtitle="上传后，系统会基于你的项目经历和技术栈生成更真实的模拟追问。"
          className="w-full max-w-[700px]"
        >
          <div ref={resumeSectionRef}>
          {resumeFile ? (
            <SurfaceCard className="flex items-center justify-between px-4 py-4 md:px-5">
              <div className="flex items-center gap-2.5 text-sm text-text">
                <FileText size={18} className="text-dim shrink-0" />
                <span className="font-medium">{resumeFile.filename}</span>
                <span className="text-xs text-dim">
                  ({(resumeFile.size / 1024).toFixed(0)} KB)
                </span>
              </div>
              <label className={`px-4 py-2 rounded-xl bg-accent/12 text-accent-light text-[13px] font-medium cursor-pointer transition-opacity ${uploading ? "opacity-40" : ""}`}>
                {uploading ? "上传中..." : "重新上传"}
                <input type="file" accept=".pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
              </label>
            </SurfaceCard>
          ) : (
            <label className={`flex flex-col items-center gap-2 rounded-[24px] border-2 border-dashed border-border bg-card px-5 py-8 text-sm text-dim cursor-pointer transition-colors hover:border-accent/50 ${uploading ? "opacity-50" : ""}`}>
              <FileText size={28} className="text-dim" />
              <span>{uploading ? "正在上传..." : "点击上传简历（PDF）"}</span>
              <input type="file" accept=".pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          )}

          <SurfaceCard ref={summarySectionRef} className={`mt-4 px-4 py-4 md:px-5 transition-all ${summaryFlash ? "ring-2 ring-accent/30 shadow-[0_0_0_1px_rgba(245,158,11,0.15)]" : ""}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-[14px] font-semibold text-text">本轮启动配置</div>
                <div className="mt-1 text-[12px] leading-[1.7] text-dim">
                  {resumeFile ? `将基于简历「${resumeFile.filename}」进行完整模拟面试。` : "请先上传简历，系统会据此生成完整模拟面试。"}
                </div>
              </div>
              <Badge tone={canStart ? "green" : "muted"}>{canStart ? "可以开始" : "等待简历"}</Badge>
            </div>
            <div className="mt-4">
              <PrimaryButton
                className={`w-full py-3.5 text-base ${!canStart || loading ? "opacity-40 cursor-not-allowed hover:shadow-none" : ""}`}
                disabled={!canStart || loading}
                onClick={handleStart}
                title={!canStart && !loading ? disabledReason : ""}
              >
                {loading ? "正在初始化训练..." : "开始简历模拟"}
                {!loading && <ArrowRight size={16} />}
              </PrimaryButton>
              {!canStart && !loading && disabledReason && (
                <div className="mt-2 text-[12px] text-dim leading-[1.7]">{disabledReason}</div>
              )}
            </div>
          </SurfaceCard>
          </div>
        </AppSection>
      )}

      {mode === "topic_drill" && (
        <AppSection
          title="2. 选择训练专题并开始"
          subtitle="优先展示当前更值得先练的专题；如果你已经知道方向，也可以切换到分类视图。"
          className="w-full max-w-[700px]"
        >
          <div ref={topicSectionRef}>
            {(presetNotice || quickFocus || primaryRecommendation?.topic) && (
              <SurfaceCard className="mb-4 px-4 py-3 border-green/20 bg-green/5">
                <div className="text-[13px] font-semibold text-text mb-1">系统建议的切入方式</div>
                <div className="text-[12px] text-dim leading-[1.7]">
                  {quickFocus
                    ? `已应用推荐训练目标：优先围绕「${quickFocusLabel || quickFocus}」${recommendationTrend === "进入平台期" ? "升级追问与场景题验证" : recommendationTrend === "出现回退" ? "先做降阶稳固训练" : recommendationTrend === "持续上升" ? "做更深一层的验收" : "修复薄弱点"}，再进入当前专题训练。`
                    : `建议优先训练「${topics[primaryRecommendation?.topic]?.name || primaryRecommendation?.topic || "当前推荐专题"}」${primaryRecommendation?.focus_label ? `，并从「${primaryRecommendation.focus_label}」切入。` : "。"}${recommendationTrend ? ` 当前轨迹为「${recommendationTrend}」。` : ""}`}
                </div>
              </SurfaceCard>
            )}
          <div className="flex justify-between items-center gap-3 mb-3 flex-wrap">
            <div>
              <div className="text-lg font-semibold text-left">选择训练专题</div>
              <div className="mt-1 text-[12px] text-dim">先选专题，系统会在底部自动收束成这一轮训练配置。</div>
            </div>
            {primaryRecommendation?.topic && !selectedTopic && (
              <SubtleButton
                onClick={() => {
                  setSelectedTopic(primaryRecommendation.topic);
                  setQuickFocus(primaryRecommendation.focus_keyword || primaryRecommendation.focus_label || "");
                  setQuickFocusLabel(primaryRecommendation.focus_label || "");
                  setQuickFocusTrend(primaryRecommendation.trend_label || "");
                  setPresetNotice("已应用推荐训练目标");
                  setTimeout(() => scrollToSummary(), 120);
                }}
                className="py-2 text-[12px]"
              >
                使用当前推荐
              </SubtleButton>
            )}
          </div>
          <SurfaceCard className="mb-3 px-3 py-3 bg-card/70 backdrop-blur-sm border-border/70">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-dim">
                <Badge tone="muted">按当前薄弱程度排序</Badge>
                {recommendedTopicKey && <Badge tone="orange">橙色优先</Badge>}
                <Badge tone="green">绿色已选</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <OutlineButton
                  onClick={() => setTopicView("priority")}
                  className={topicView === "priority" ? "border-accent/40 bg-accent/10" : ""}
                >
                  聚焦视图
                </OutlineButton>
                <OutlineButton
                  onClick={() => setTopicView("category")}
                  className={topicView === "category" ? "border-accent/40 bg-accent/10" : ""}
                >
                  分类视图
                </OutlineButton>
              </div>
            </div>
            <div className="mt-2 text-[11px] leading-[1.7] text-dim">
              {topicView === "priority"
                ? "默认先只看当前最值得先练的专题。"
                : "按专题类型分组浏览。"}
            </div>
          </SurfaceCard>

          {topicView === "priority" ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 mb-4">
                {visiblePriorityTopics.map(([key, info]) => {
                  const fullRank = rankedTopics.findIndex(([topicKey]) => topicKey === key);
                  const isRecommendedTopic = key === recommendedTopicKey;
                  const isSelected = selectedTopic === key;
                  const masteryScore = mastery[key]?.score ?? null;
                  const cardFocusLabel = isRecommendedTopic ? (primaryRecommendation?.focus_label || "") : "";
                  const cardTrendLabel = isRecommendedTopic ? (primaryRecommendation?.trend_label || "") : "";
                  return (
                    <TopicCard
                      key={key}
                      topicKey={key}
                      name={info.name || key}
                      icon={info.icon}
                      recommended={isRecommendedTopic}
                      selected={isSelected}
                      score={masteryScore}
                      focusLabel={cardFocusLabel}
                      trendLabel={cardTrendLabel}
                      rank={fullRank < 3 ? fullRank : null}
                      onClick={() => {
                        setSelectedTopic(key);
                        if (primaryRecommendation?.topic === key) {
                          setQuickFocus(primaryRecommendation.focus_keyword || primaryRecommendation.focus_label || "");
                          setQuickFocusLabel(primaryRecommendation.focus_label || "");
                          setQuickFocusTrend(primaryRecommendation.trend_label || "");
                          setPresetNotice("已应用推荐训练目标");
                        } else {
                          setQuickFocus("");
                          setQuickFocusLabel("");
                          setQuickFocusTrend("");
                          setPresetNotice("");
                        }
                        setTimeout(() => scrollToSummary(), 100);
                      }}
                    />
                  );
                })}
              </div>
              {rankedTopics.length > priorityTopics.length && (
                <div className="mb-4 flex justify-center">
                  <SubtleButton onClick={() => setShowAllTopics((v) => !v)}>
                    {showAllTopics ? "收起到高优先专题" : `展开全部专题（共 ${rankedTopics.length} 个）`}
                  </SubtleButton>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-5 mb-4">
              {categorizedTopics.map((group) => (
                <div key={group.name} className="rounded-2xl border border-border/70 bg-card/60 px-3 py-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="text-[14px] font-semibold text-text">{group.name}</div>
                      <Badge tone="muted">{group.items.length} 个专题</Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                    {group.items.map(({ key, info, idx }) => {
                      const isRecommendedTopic = key === recommendedTopicKey;
                      const isSelected = selectedTopic === key;
                      const masteryScore = mastery[key]?.score ?? null;
                      const cardFocusLabel = isRecommendedTopic ? (primaryRecommendation?.focus_label || "") : "";
                      const cardTrendLabel = isRecommendedTopic ? (primaryRecommendation?.trend_label || "") : "";
                      return (
                        <TopicCard
                          key={key}
                          topicKey={key}
                          name={info.name || key}
                          icon={info.icon}
                          recommended={isRecommendedTopic}
                          selected={isSelected}
                          score={masteryScore}
                          focusLabel={cardFocusLabel}
                          trendLabel={cardTrendLabel}
                          rank={idx < 3 ? idx : null}
                          onClick={() => {
                            setSelectedTopic(key);
                            if (primaryRecommendation?.topic === key) {
                              setQuickFocus(primaryRecommendation.focus_keyword || primaryRecommendation.focus_label || "");
                              setQuickFocusLabel(primaryRecommendation.focus_label || "");
                              setQuickFocusTrend(primaryRecommendation.trend_label || "");
                              setPresetNotice("已应用推荐训练目标");
                            } else {
                              setQuickFocus("");
                              setQuickFocusLabel("");
                              setQuickFocusTrend("");
                              setPresetNotice("");
                            }
                            setTimeout(() => scrollToSummary(), 100);
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {mode === "topic_drill" && (
            <SurfaceCard ref={summarySectionRef} className={`mb-2 px-4 py-4 md:px-5 transition-all ${summaryFlash ? "ring-2 ring-accent/30 shadow-[0_0_0_1px_rgba(245,158,11,0.15)]" : ""}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap gap-2">
                    <Badge tone="accent">模式：专项强化训练</Badge>
                    {selectedTopic && <Badge tone="green">专题：{selectedTopicInfo?.name || selectedTopic}</Badge>}
                    {(quickFocusLabel || quickFocus) && <Badge tone="orange">重点：{quickFocusLabel || quickFocus}</Badge>}
                    {currentStrategyLabel && <Badge tone="muted">训练意图：{currentStrategyLabel}</Badge>}
                  </div>
                  <div className="text-[14px] font-semibold text-text">本轮启动配置</div>
                  <div className="mt-1 text-[12px] leading-[1.7] text-dim">
                    {selectedTopic
                      ? `${quickFocusLabel || quickFocus ? `本轮会先围绕「${quickFocusLabel || quickFocus}」做定向修复，` : ""}随后进入「${selectedTopicInfo?.name || selectedTopic}」专题训练。`
                      : "请先选择一个训练专题。"}
                  </div>
                </div>
                <Badge tone={canStart ? "green" : "muted"}>{canStart ? "可以开始" : "等待选择专题"}</Badge>
              </div>

              <div className="mt-4">
                <PrimaryButton
                  className={`w-full py-3.5 text-base ${!canStart || loading ? "opacity-40 cursor-not-allowed hover:shadow-none" : ""}`}
                  disabled={!canStart || loading}
                  onClick={handleStart}
                  title={!canStart && !loading ? disabledReason : ""}
                >
                  {loading ? "正在初始化训练..." : "开始本轮训练"}
                  {!loading && <ArrowRight size={16} />}
                </PrimaryButton>
                {!canStart && !loading && disabledReason && (
                  <div className="mt-2 text-[12px] text-dim leading-[1.7]">{disabledReason}</div>
                )}
                {canStart && !loading && (
                  <div className="mt-2 text-[12px] text-dim leading-[1.7]">配置已完成，可以直接开始。</div>
                )}
              </div>
            </SurfaceCard>
          )}
          </div>
        </AppSection>
      )}
      </div>
    </div>
  );
}
