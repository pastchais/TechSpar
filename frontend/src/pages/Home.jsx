import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FileText, ChevronRight, Mic } from "lucide-react";
import TopicCard from "../components/TopicCard";
import { getTopics, startInterview, getResumeStatus, uploadResume, getProfile } from "../api/interview";
import { Badge, SubtleButton, SectionTitle, OutlineButton } from "../components/ui.jsx";

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
    <div className="flex-1 flex flex-col items-center px-4 pt-8 pb-10 md:px-6 md:pt-15">
      {/* Hero */}
      <div className="text-center mb-8 md:mb-12 relative animate-fade-in px-2">
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-[300px] h-[180px] md:w-[500px] md:h-[250px] bg-gradient-to-b from-accent/10 via-accent/5 to-transparent rounded-full blur-3xl pointer-events-none" />
        <h1 className="text-[28px] leading-tight md:text-[44px] font-display font-bold mb-2.5 bg-gradient-to-r from-accent-light via-accent to-orange bg-clip-text text-transparent relative">
          TechSpar
        </h1>
        <p className="text-[14px] leading-6 md:text-base text-dim max-w-[500px] relative mx-auto">
          AI 面试训练系统——追踪成长轨迹，定位薄弱点
        </p>
      </div>

      {/* Mode switch - Refined Interactivity */}
      <div className="w-full max-w-[700px] mb-8 animate-slide-up" ref={modeSectionRef}>
        <div className="mb-4 rounded-2xl border border-border bg-card px-4 py-4 md:px-5">
          <div className="text-[18px] font-semibold text-text">选择本轮训练模式</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <div className="mt-3 rounded-xl border border-accent/15 bg-accent/5 px-4 py-3 text-[12px] text-dim leading-[1.7]">
            已选择：<span className="font-medium text-text">{mode === "resume" ? "简历模拟面试" : "专题强化训练"}</span>。
            {mode === "resume" ? " 下一步上传简历。" : " 下一步选择训练专题。"}
          </div>
        )}

        <div className="mt-4 flex justify-center">
          <SubtleButton onClick={() => navigate("/recording")}>
            录音复盘工具 <ChevronRight size={14} />
          </SubtleButton>
        </div>

      </div>

      {/* Quick stats + recommendation */}
      {profile?.stats?.total_sessions > 0 && (
        <div className="w-full max-w-[700px] mb-8 flex flex-col gap-3">
          <div className={`${panelTone("summary")} rounded-xl px-5 py-5 md:px-6 transition-all ${mode ? "opacity-95" : ""}`}>
            <div className="flex justify-between items-center mb-3.5 gap-3 flex-wrap">
              <span className="text-[15px] font-semibold">先看当前状态</span>
              <span
                className="text-[13px] text-accent-light cursor-pointer"
                onClick={() => navigate("/profile")}
              >
                查看画像 <ChevronRight size={14} className="inline align-middle" />
              </span>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4 md:gap-6">
              <div className="text-center sm:text-left min-w-[60px]">
                <div className="text-2xl font-bold text-accent-light">{stats.total_sessions}</div>
                <div className="text-[11px] text-dim mt-0.5">总练习</div>
              </div>
              <div className="text-center sm:text-left min-w-[60px]">
                <div className="text-2xl font-bold text-green">{stats.avg_score || "-"}</div>
                <div className="text-[11px] text-dim mt-0.5">综合平均</div>
              </div>
              {topTopics.length > 0 && (
                <div className="flex-1 min-w-0 sm:min-w-[180px]">
                  <div className="text-[11px] text-dim mb-1.5">当前更该关注</div>
                  {topTopics.map(([t, d], idx) => (
                    <div key={t} className="flex items-center gap-2 mb-1">
                      <span className={`text-xs w-[84px] sm:w-[90px] break-words leading-4 ${idx === 0 ? "text-orange" : "text-text"}`}>{topics[t]?.name || t}</span>
                      <div className="flex-1 h-1 rounded-sm bg-border overflow-hidden">
                        <div className={`h-full rounded-sm ${idx === 0 ? "bg-orange" : "bg-accent-light"}`} style={{ width: `${d.score || 0}%` }} />
                      </div>
                      <span className="text-[11px] text-dim w-7">{d.score || 0}</span>
                    </div>
                  ))}
                </div>
              )}
              {lastEntry && (
                <div className="text-center sm:text-left min-w-[80px]">
                  <div className={`text-2xl font-bold ${lastEntry.avg_score >= 6 ? "text-green" : "text-orange"}`}>
                    {lastEntry.avg_score}
                  </div>
                  <div className="text-[11px] text-dim mt-0.5">上次得分</div>
                </div>
              )}
            </div>
          </div>

          {primaryRecommendation && (
            <div className={`${panelTone("recommend")} rounded-xl px-5 py-4 md:px-6`}>
              <div className="flex justify-between items-start gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="text-[15px] font-semibold">推荐起点</span>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${recommendationBadge(primaryRecommendation.confidence)}`}>
                      {primaryRecommendation.confidence === "high" ? "高置信推荐" : primaryRecommendation.confidence === "medium" ? "可尝试" : "探索建议"}
                    </span>
                    {primaryRecommendation.topic && <Badge tone="accent">{topics[primaryRecommendation.topic]?.name || primaryRecommendation.topic}</Badge>}
                  </div>
                  <div className="text-sm font-medium text-text">{primaryRecommendation.focus_label || primaryRecommendation.title}</div>
                  {recommendationTrend && (
                    <div className="mt-1 text-[12px] font-medium text-accent-light">{recommendationActionText} · {recommendationTrend}</div>
                  )}
                  <div className="mt-1 text-[12px] text-dim leading-[1.7]">
                    {primaryRecommendation.why_now || primaryRecommendation.reason || "根据你的近期画像，优先从这个目标开始更划算。"}
                    {recommendationSecondaryHint ? ` ${recommendationSecondaryHint}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {primaryRecommendation.topic && (
                    <SubtleButton
                      onClick={() => launchInterview(
                        "topic_drill",
                        primaryRecommendation.topic,
                        primaryRecommendation.focus_keyword || primaryRecommendation.focus_label || "",
                        primaryRecommendation.focus_label || "",
                        primaryRecommendation.trend_label || "",
                      )}
                      className="bg-green/10 py-1.5 text-[12px] text-green hover:text-green"
                    >
                      {recommendationPrimaryButton}
                    </SubtleButton>
                  )}
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
                      先按推荐配置
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
      )}

      {/* Resume upload */}
      {mode === "resume" && (
        <div className="w-full max-w-[700px] mb-8" ref={resumeSectionRef}>
                    <div className="mb-2 text-[15px] font-semibold text-text">上传简历以生成模拟面试</div>
          <div className="mb-3 text-[12px] text-dim leading-[1.7]">上传后，系统会基于你的项目和技术栈生成追问路径。</div>
          {resumeFile ? (
            <div className="flex items-center justify-between px-4 py-4 md:px-5 bg-card border border-border rounded-xl">
              <div className="flex items-center gap-2.5 text-sm text-text">
                <FileText size={18} className="text-dim shrink-0" />
                <span className="font-medium">{resumeFile.filename}</span>
                <span className="text-xs text-dim">
                  ({(resumeFile.size / 1024).toFixed(0)} KB)
                </span>
              </div>
              <label className={`px-4 py-2 rounded-lg bg-accent/12 text-accent-light text-[13px] font-medium cursor-pointer transition-opacity ${uploading ? "opacity-40" : ""}`}>
                {uploading ? "上传中..." : "重新上传"}
                <input type="file" accept=".pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
              </label>
            </div>
          ) : (
            <label className={`flex flex-col items-center gap-2 px-5 py-7 bg-card border-2 border-dashed border-border rounded-xl cursor-pointer transition-colors text-sm text-dim hover:border-accent/50 ${uploading ? "opacity-50" : ""}`}>
              <FileText size={28} className="text-dim" />
              <span>{uploading ? "正在上传..." : "点击上传简历（PDF）"}</span>
              <input type="file" accept=".pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          )}
        </div>
      )}

      {/* Topic selection */}
      {mode === "topic_drill" && (
        <div className="w-full max-w-[700px]" ref={topicSectionRef}>
                    {presetNotice && (
            <div className={`${panelTone("preset")} mb-4 rounded-xl px-4 py-3`}>
              <div className="text-[13px] font-semibold text-text mb-1">已应用推荐训练目标</div>
              <div className="text-[12px] text-dim">
                {presetNotice}
                {selectedTopic ? `：当前已选「${selectedTopicInfo?.name || selectedTopic}」` : "。"}
                {quickFocusLabel || quickFocus ? `，重点为「${quickFocusLabel || quickFocus}」。` : ""}
              </div>
            </div>
          )}
          {(quickFocus || primaryRecommendation?.topic) && (
            <div className={`${panelTone("recommend")} mb-4 rounded-xl px-4 py-3`}>
              <div className="text-[13px] font-semibold text-text mb-1">当前训练目标</div>
              <div className="text-[12px] text-dim">
                {quickFocus
                  ? `优先围绕「${quickFocusLabel || quickFocus}」${recommendationTrend === "进入平台期" ? "升级追问与场景题验证" : recommendationTrend === "出现回退" ? "先做降阶稳固训练" : recommendationTrend === "持续上升" ? "做更深一层的验收" : "修复薄弱点"}，再进入当前专题训练。`
                  : `建议优先训练「${topics[primaryRecommendation?.topic]?.name || primaryRecommendation?.topic || "当前推荐专题"}」${primaryRecommendation?.focus_label ? `，并从「${primaryRecommendation.focus_label}」切入。` : "。"}${recommendationTrend ? ` 当前轨迹为「${recommendationTrend}」。` : ""}`}
              </div>
            </div>
          )}
          <div className="flex justify-between items-center gap-3 mb-4 flex-wrap">
            <div>
              <div className="text-lg font-semibold text-left">选择或调整训练专题</div>
              <div className="mt-1 text-[12px] text-dim">先快速选专题，详细说明会在下方展开。</div>
            </div>
            {primaryRecommendation?.topic && !selectedTopic && (
              <button
                onClick={() => {
                  setSelectedTopic(primaryRecommendation.topic);
                  setQuickFocus(primaryRecommendation.focus_keyword || primaryRecommendation.focus_label || "");
                  setQuickFocusLabel(primaryRecommendation.focus_label || "");
                  setQuickFocusTrend(primaryRecommendation.trend_label || "");
                  setPresetNotice("已应用推荐训练目标");
                  setTimeout(() => scrollToSummary(), 120);
                }}
                className="bg-accent/10 py-1.5 text-[12px] text-accent-light hover:text-accent-light"
              >
                使用当前推荐
              </button>
            )}
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge tone="muted">按当前薄弱程度排序</Badge>
            {recommendedTopicKey && <Badge tone="orange">橙色表示当前建议优先</Badge>}
            <Badge tone="green">绿色表示当前已选中</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 mb-4">
            {rankedTopics.map(([key, info], idx) => {
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

          {selectedTopic && (
            <div className="mb-8 rounded-2xl border border-border bg-card px-4 py-4 md:px-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <div className="text-[16px] font-semibold text-text">已选择：{selectedTopicInfo?.name || selectedTopic}</div>
                    <Badge tone="green">当前训练专题</Badge>
                    {selectedTopic === recommendedTopicKey && <Badge tone="orange">推荐优先</Badge>}
                  </div>
                  <div className="text-[12px] leading-[1.7] text-dim">
                    {quickFocusLabel || quickFocus
                      ? `建议从「${quickFocusLabel || quickFocus}」切入，先做定向修复，再进入专题强化。`
                      : selectedTopic === recommendedTopicKey
                        ? `这是当前更值得优先处理的专题。${recommendationTrend ? ` 当前轨迹为「${recommendationTrend}」。` : ""}`
                        : "你可以直接开始本专题训练，系统会围绕该主题持续追问。"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedTopic && (
                    <OutlineButton
                      onClick={() => navigate("/knowledge", { state: { selectedTopic, searchKeyword: quickFocusLabel || quickFocus || "" } })}
                      className="px-3 py-2 text-[12px]"
                    >
                      先看知识库
                    </OutlineButton>
                  )}
                  <SubtleButton
                    onClick={() => setTimeout(() => scrollToSummary(), 60)}
                    className="px-3 py-2 text-[12px]"
                  >
                    查看开始配置
                  </SubtleButton>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Badge tone="accent">模式：专项强化训练</Badge>
                {quickFocusLabel || quickFocus ? (
                  <Badge tone="orange" title={quickFocusLabel || quickFocus}>重点：{quickFocusLabel || quickFocus}</Badge>
                ) : (
                  <Badge tone="muted">重点：进入专题后自动追问</Badge>
                )}
                {currentStrategyLabel && <Badge tone="muted">训练意图：{currentStrategyLabel}</Badge>}
                {selectedMastery?.score != null && <Badge tone="muted">当前分数：{Math.round(selectedMastery.score)}/100</Badge>}
                {selectedTopic && rankedTopics.findIndex(([key]) => key === selectedTopic) > -1 && (
                  <Badge tone="muted">当前排序：第 {rankedTopics.findIndex(([key]) => key === selectedTopic) + 1} 位</Badge>
                )}
              </div>

              {(selectedTopic === recommendedTopicKey || quickFocusLabel || quickFocus) && (
                <div className="mt-4 rounded-xl bg-orange/8 px-3 py-3 text-[12px] leading-[1.8] text-dim">
                  <span className="font-medium text-text">训练建议：</span>
                  {quickFocusLabel || quickFocus
                    ? `先围绕「${quickFocusLabel || quickFocus}」做一轮针对性修复。`
                    : "优先从当前推荐专题开始。"}
                  {recommendationSecondaryHint ? ` ${recommendationSecondaryHint}` : " 先用一轮训练确认真实薄弱点，再决定是否继续深入。"}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Start summary + button */}
      {mode && (
        <div className="w-full max-w-[700px]" ref={summarySectionRef}>
                    <div className={`${panelTone("summary")} mb-4 rounded-xl px-4 py-3 transition-all ${summaryFlash ? "ring-2 ring-accent/30 shadow-[0_0_0_1px_rgba(245,158,11,0.15)]" : ""}`}>
            <div className="text-[13px] font-semibold text-text mb-2">开始前确认</div>
            <div className="flex flex-wrap gap-2 mb-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-accent/15 text-accent-light">
                模式：{mode === "topic_drill" ? "专项强化训练" : "简历模拟面试"}
              </span>
              {selectedTopic && (
                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-green/10 text-green">
                  专题：{selectedTopicInfo?.name || selectedTopic}
                </span>
              )}
              {(quickFocusLabel || quickFocus) && (
                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-orange/15 text-orange max-w-full sm:max-w-[260px] break-words sm:truncate" title={quickFocusLabel || quickFocus}>
                  重点：{quickFocusLabel || quickFocus}
                </span>
              )}
              {currentStrategyLabel && mode === "topic_drill" && (
                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-hover text-dim">
                  训练意图：{currentStrategyLabel}
                </span>
              )}
            </div>
            <div className="text-[12px] text-dim leading-[1.7]">
              {mode === "resume"
                ? (resumeFile ? `将基于简历「${resumeFile.filename}」进行完整模拟面试。` : "请先上传简历，系统会据此生成完整模拟面试。")
                : selectedTopic
                  ? `${quickFocusLabel || quickFocus ? `本轮会先围绕「${quickFocusLabel || quickFocus}」做定向修复，` : ""}随后进入「${selectedTopicInfo?.name || selectedTopic}」专题训练。`
                  : "请先选择一个训练专题。"}
            </div>
          </div>
          <div className="mb-2 text-[13px] font-semibold text-dim">确认后开始</div>
          <div className="rounded-2xl border border-border bg-card px-4 py-4 md:px-5">
            <button
              className={`w-full py-3.5 rounded-box bg-gradient-to-r from-accent to-orange text-white text-base font-semibold transition-all ${!canStart || loading ? "opacity-40 cursor-not-allowed" : "hover:shadow-[0_0_24px_rgba(245,158,11,0.2)]"}`}
              disabled={!canStart || loading}
              onClick={handleStart}
              title={!canStart && !loading ? disabledReason : ""}
            >
              {loading ? "正在初始化训练..." : mode === "topic_drill" ? "开始本轮训练" : "开始简历模拟"}
            </button>
            {!canStart && !loading && disabledReason && (
              <div className="mt-2 text-[12px] text-dim leading-[1.7]">{disabledReason}</div>
            )}
            {canStart && !loading && (
              <div className="mt-2 text-[12px] text-dim leading-[1.7]">配置已完成，可以直接开始。</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
