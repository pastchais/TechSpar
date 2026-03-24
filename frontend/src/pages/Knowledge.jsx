import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Menu, X, Sparkles, ChevronRight, ChevronDown } from "lucide-react";
import { getTopicIcon, ICON_OPTIONS } from "../utils/topicIcons";
import {
  getTopics,
  getCoreKnowledge,
  updateCoreKnowledge,
  createCoreKnowledge,
  deleteCoreKnowledge,
  getHighFreq,
  updateHighFreq,
  createTopic,
  deleteTopic,
  generateKnowledge,
  getKnowledgeQueryHints,
} from "../api/interview";

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findFirstMatchIndex(content, terms) {
  const lower = (content || "").toLowerCase();
  let best = -1;
  for (const term of terms) {
    const idx = lower.indexOf(String(term).toLowerCase());
    if (idx >= 0 && (best < 0 || idx < best)) best = idx;
  }
  return best;
}

function getMatchPreview(content, terms, radius = 60) {
  if (!terms?.length || !content) return "";
  const idx = findFirstMatchIndex(content, terms);
  if (idx < 0) return "";
  const primary = terms.find((t) => content.toLowerCase().includes(String(t).toLowerCase())) || terms[0];
  const start = Math.max(0, idx - radius);
  const end = Math.min(content.length, idx + String(primary).length + radius);
  return `${start > 0 ? "..." : ""}${content.slice(start, end).replace(/\n+/g, " ")}${end < content.length ? "..." : ""}`;
}

function HighlightText({ text, terms, className = "" }) {
  if (!text) return null;
  if (!terms?.length) return <span className={className}>{text}</span>;
  const pattern = terms
    .slice()
    .sort((a, b) => String(b).length - String(a).length)
    .map((t) => escapeRegExp(String(t)))
    .join("|");
  const splitRegex = new RegExp(`(${pattern})`, "ig");
  const matchRegex = new RegExp(`^(?:${pattern})$`, "i");
  const parts = String(text).split(splitRegex);
  return (
    <span className={className}>
      {parts.map((part, idx) => (
        matchRegex.test(part)
          ? <mark key={idx} className="bg-accent/20 text-accent-light px-0.5 rounded">{part}</mark>
          : <span key={idx}>{part}</span>
      ))}
    </span>
  );
}

function scoreKnowledgeFile(file, aliases, semanticBucket, semanticBucketTerms = [], semanticBucketDocHints = []) {
  const filename = String(file?.filename || "").toLowerCase();
  const content = String(file?.content || "").toLowerCase();
  let score = 0;
  let reason = "";

  const aliasTerms = (aliases || []).map((t) => String(t).toLowerCase()).filter(Boolean);
  const strongHits = aliasTerms.filter((term) => filename.includes(term));
  const contentHits = aliasTerms.filter((term) => content.includes(term));

  if (strongHits.length) {
    score += 10 + strongHits.length * 3;
    reason = "文件名直接命中语义关键词";
  }
  if (contentHits.length) {
    score += 6 + Math.min(contentHits.length, 4) * 2;
    if (!reason) reason = "正文命中语义关键词";
  }

  const bucketMatched = (semanticBucketTerms || []).some((term) => filename.includes(String(term).toLowerCase()) || content.includes(String(term).toLowerCase()));
  if (bucketMatched) {
    score += 8;
    if (!reason) reason = semanticBucket ? "命中当前 semantic bucket" : "命中组合 semantic buckets";
  }

  const docHintHit = (semanticBucketDocHints || []).find((hint) => filename.includes(String(hint).toLowerCase()));
  if (docHintHit) {
    score += 14;
    reason = semanticBucket ? "命中该 bucket 的优先推荐文档" : "命中组合 buckets 的优先推荐文档";
  }

  return { score, reason };
}

export default function Knowledge() {
  const location = useLocation();
  const navigate = useNavigate();
  const [topics, setTopics] = useState({});
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("core");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchAliases, setSearchAliases] = useState([]);
  const [searchBucket, setSearchBucket] = useState("");
  const [searchBucketLabel, setSearchBucketLabel] = useState("");
  const [searchBucketLabels, setSearchBucketLabels] = useState([]);
  const [searchBucketTerms, setSearchBucketTerms] = useState([]);
  const [searchBucketDocHints, setSearchBucketDocHints] = useState([]);

  const [coreFiles, setCoreFiles] = useState([]);
  const [expandedFile, setExpandedFile] = useState(null);
  const [editContent, setEditContent] = useState({});
  const [coreSaving, setCoreSaving] = useState(null);

  const [highFreq, setHighFreq] = useState("");
  const [highFreqDraft, setHighFreqDraft] = useState("");
  const [hfSaving, setHfSaving] = useState(false);

  const [newFileName, setNewFileName] = useState("");
  const [showNewFile, setShowNewFile] = useState(false);

  const [generating, setGenerating] = useState(false);

  const [showAddTopic, setShowAddTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [newTopicIcon, setNewTopicIcon] = useState("FileText");

  const refreshTopics = useCallback(async () => {
    const t = await getTopics();
    setTopics(t);
    return t;
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshTopics().then((t) => {
      const keys = Object.keys(t);
      const requested = location.state?.selectedTopic;
      const requestedKeyword = location.state?.searchKeyword || "";
      if (requestedKeyword) setSearchTerm(requestedKeyword);
      if (requested && t[requested]) {
        setSelected(requested);
      } else if (keys.length > 0) {
        setSelected(keys[0]);
      }
    });
  }, [refreshTopics, location.state]);

  const loadCore = useCallback(async (topic) => {
    try {
      const files = await getCoreKnowledge(topic);
      setCoreFiles(files);
      setExpandedFile(null);
      const buf = {};
      files.forEach((f) => { buf[f.filename] = f.content; });
      setEditContent(buf);
    } catch { setCoreFiles([]); }
  }, []);

  const loadHighFreq = useCallback(async (topic) => {
    try {
      const data = await getHighFreq(topic);
      setHighFreq(data.content || "");
      setHighFreqDraft(data.content || "");
    } catch { setHighFreq(""); setHighFreqDraft(""); }
  }, []);

  useEffect(() => {
    if (!selected) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCore(selected);
    loadHighFreq(selected);
  }, [selected, loadCore, loadHighFreq]);

  useEffect(() => {
    const raw = (searchTerm || "").trim();
    if (!raw) {
      setSearchAliases([]);
      setSearchBucket("");
      setSearchBucketLabel("");
      setSearchBucketLabels([]);
      setSearchBucketTerms([]);
      setSearchBucketDocHints([]);
      return;
    }
    getKnowledgeQueryHints(raw)
      .then((res) => {
        setSearchAliases(res.aliases || (res.canonical_query ? [res.canonical_query] : [raw]));
        setSearchBucket(res.semantic_bucket || "");
        setSearchBucketLabel(res.semantic_bucket_label || "");
        setSearchBucketLabels(res.semantic_bucket_labels || []);
        setSearchBucketTerms(res.semantic_bucket_terms || []);
        setSearchBucketDocHints(res.semantic_bucket_doc_hints || []);
      })
      .catch(() => {
        setSearchAliases([raw]);
        setSearchBucket("");
        setSearchBucketLabel("");
        setSearchBucketLabels([]);
        setSearchBucketTerms([]);
        setSearchBucketDocHints([]);
      });
  }, [searchTerm]);

  useEffect(() => {
    if (!searchAliases.length || !coreFiles.length) return;
    const matched = coreFiles.find((f) => searchAliases.some((term) =>
      (f.filename || "").toLowerCase().includes(String(term).toLowerCase()) ||
      (f.content || "").toLowerCase().includes(String(term).toLowerCase())
    ));
    if (matched) setExpandedFile(matched.filename);
  }, [searchAliases, coreFiles]);

  const handleSaveCore = async (filename) => {
    setCoreSaving(filename);
    try {
      await updateCoreKnowledge(selected, filename, editContent[filename] || "");
      setCoreFiles((prev) => prev.map((f) => f.filename === filename ? { ...f, content: editContent[filename] } : f));
    } catch (e) { alert("保存失败: " + e.message); }
    setTimeout(() => setCoreSaving(null), 1500);
  };

  const handleSaveHighFreq = async () => {
    setHfSaving(true);
    try {
      await updateHighFreq(selected, highFreqDraft);
      setHighFreq(highFreqDraft);
    } catch (e) { alert("保存失败: " + e.message); }
    setTimeout(() => setHfSaving(false), 1500);
  };

  const handleCreateFile = async () => {
    const name = newFileName.trim();
    if (!name) return;
    const fname = name.endsWith(".md") ? name : name + ".md";
    try {
      await createCoreKnowledge(selected, fname, "");
      setNewFileName("");
      setShowNewFile(false);
      loadCore(selected);
    } catch (e) { alert("创建失败: " + e.message); }
  };

  const handleDeleteFile = async (filename) => {
    if (!confirm(`确定删除「${filename}」？此操作不可撤销。`)) return;
    try {
      await deleteCoreKnowledge(selected, filename);
      setCoreFiles((prev) => prev.filter((f) => f.filename !== filename));
      if (expandedFile === filename) setExpandedFile(null);
    } catch (e) { alert("删除失败: " + e.message); }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await generateKnowledge(selected);
      await loadCore(selected);
      setExpandedFile("README.md");
    } catch (e) { alert("生成失败: " + e.message); }
    setGenerating(false);
  };

  const coreIsEmpty = coreFiles.length === 0 ||
    (coreFiles.length === 1 && coreFiles[0].filename === "README.md" && (coreFiles[0].content?.length || 0) <= 20);

  const handleAddTopic = async () => {
    const name = newTopicName.trim();
    if (!name) return;
    try {
      const result = await createTopic(name, newTopicIcon);
      setNewTopicName(""); setNewTopicIcon("FileText");
      setShowAddTopic(false);
      await refreshTopics();
      setSelected(result.key);
    } catch (e) { alert("添加失败: " + e.message); }
  };

  const handleDeleteTopic = async (key) => {
    if (!confirm(`确定删除「${topics[key]?.name || key}」？`)) return;
    try {
      await deleteTopic(key);
      const t = await refreshTopics();
      const keys = Object.keys(t);
      if (selected === key) setSelected(keys.length > 0 ? keys[0] : null);
    } catch (e) { alert("删除失败: " + e.message); }
  };

  const topicKeys = Object.keys(topics);

  const rankedCoreFiles = coreFiles
    .map((f) => ({
      ...f,
      __rank: scoreKnowledgeFile(f, searchAliases, searchBucket, searchBucketTerms, searchBucketDocHints),
    }))
    .filter((f) => {
      if (!searchTerm.trim()) return true;
      const terms = searchAliases;
      return terms.some((term) =>
        (f.filename || "").toLowerCase().includes(String(term).toLowerCase()) ||
        (f.content || "").toLowerCase().includes(String(term).toLowerCase())
      );
    })
    .sort((a, b) => {
      if (!searchTerm.trim()) return String(a.filename).localeCompare(String(b.filename));
      if ((b.__rank?.score || 0) !== (a.__rank?.score || 0)) return (b.__rank?.score || 0) - (a.__rank?.score || 0);
      return String(a.filename).localeCompare(String(b.filename));
    });

  const readingPlan = searchTerm.trim()
    ? rankedCoreFiles.filter((f) => (f.__rank?.score || 0) > 0).slice(0, 3)
    : [];

  const handleGoTrain = () => {
    if (!selected) return;
    const focusLabel = searchBucket
      ? (searchBucketLabel || searchBucket)
      : searchBucketLabels.length > 1
        ? searchBucketLabels.join(' + ')
        : searchTerm.trim();
    navigate("/", {
      state: {
        quickStartMode: "topic_drill",
        quickStartTopic: selected,
        quickStartFocusKeyword: searchTerm.trim(),
        quickStartFocusLabel: focusLabel,
      },
    });
  };

  const selectTopic = (key) => {
    setSelected(key);
    setSidebarOpen(false);
  };

  return (
    <div className="flex flex-1 overflow-hidden h-full">
      {/* Mobile sidebar toggle */}
      <button
        className="fixed bottom-4 right-4 z-40 md:hidden w-12 h-12 rounded-full bg-accent text-white text-xl flex items-center justify-center shadow-lg"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
{sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-30 w-[220px] border-r border-border bg-bg p-4 flex flex-col transition-transform duration-200
        md:static md:translate-x-0 md:shrink-0
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="flex justify-between items-center mb-3 px-2">
          <div className="text-[13px] font-semibold text-dim">专项领域</div>
          <button
            className="w-6 h-6 rounded-md border border-border bg-transparent text-dim text-base flex items-center justify-center transition-all hover:bg-hover hover:text-text leading-none"
            title="新增领域"
            onClick={() => setShowAddTopic(true)}
          >+</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {topicKeys.map((key) => (
            <div key={key} className="relative mb-0.5 group">
              <button
                className={`w-full px-3 py-2.5 rounded-lg border-none text-sm text-left cursor-pointer flex items-center gap-2 transition-all
                  ${selected === key ? "bg-hover text-text" : "bg-transparent text-dim hover:bg-hover"}`}
                onClick={() => selectTopic(key)}
              >
                <span className="text-dim">{getTopicIcon(topics[key]?.icon, 16)}</span>
                <span className="flex-1 min-w-0 break-words leading-5">{topics[key]?.name || key}</span>
              </button>
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none text-dim cursor-pointer text-sm px-1.5 py-1 rounded opacity-0 group-hover:opacity-100 transition-all hover:text-red hover:bg-red/10"
                title="删除领域"
                onClick={() => handleDeleteTopic(key)}
              ><X size={14} /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Backdrop for mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Add topic modal */}
      {showAddTopic && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddTopic(false)}>
          <div className="bg-card border border-border rounded-2xl px-6 py-7 md:px-8 w-[380px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-semibold mb-5">新增训练领域</div>
            <div className="mb-3.5">
              <label className="text-[13px] text-dim mb-1.5 block">名称</label>
              <input className="w-full px-3 py-2.5 rounded-lg border border-border bg-bg text-text text-sm" placeholder="Docker 容器化" value={newTopicName} onChange={(e) => setNewTopicName(e.target.value)} autoFocus />
            </div>
            <div className="mb-3.5">
              <label className="text-[13px] text-dim mb-1.5 block">图标</label>
              <div className="grid grid-cols-8 gap-1.5">
                {ICON_OPTIONS.map(({ name, Icon }) => ( // eslint-disable-line no-unused-vars
                  <button
                    key={name}
                    type="button"
                    className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                      newTopicIcon === name ? "bg-accent/20 text-accent-light border border-accent" : "bg-hover text-dim border border-transparent hover:text-text"
                    }`}
                    onClick={() => setNewTopicIcon(name)}
                    title={name}
                  >
                    <Icon size={16} />
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2.5 justify-end mt-6">
              <button className="px-5 py-2 rounded-lg border border-border bg-hover text-text text-[13px] cursor-pointer" onClick={() => { setShowAddTopic(false); setNewTopicName(""); setNewTopicIcon("FileText"); }}>取消</button>
              <button className="px-5 py-2 rounded-lg bg-accent text-white text-[13px] cursor-pointer disabled:opacity-40" onClick={handleAddTopic} disabled={!newTopicName.trim()}>添加</button>
            </div>
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-border px-4 md:px-6 bg-card items-start md:items-center justify-between gap-3 flex-wrap">
          <div className="flex flex-wrap">
            <button
              className={`px-4 py-3 md:px-5 text-sm border-b-2 transition-all cursor-pointer whitespace-nowrap ${tab === "core" ? "text-text border-b-accent" : "text-dim border-b-transparent bg-transparent"}`}
              onClick={() => setTab("core")}
            >核心知识库</button>
            <button
              className={`px-4 py-3 md:px-5 text-sm border-b-2 transition-all cursor-pointer whitespace-nowrap ${tab === "high_freq" ? "text-text border-b-accent" : "text-dim border-b-transparent bg-transparent"}`}
              onClick={() => setTab("high_freq")}
            >高频题库</button>
          </div>
          <div className="px-0 md:px-0 pb-3 md:pb-0 w-full md:w-[280px]">
            <input
              className="w-full px-3 py-2 rounded-lg border border-border bg-bg text-text text-[13px]"
              placeholder="按 weak point / 关键词定位内容"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm.trim() && (
              <div className="mt-1 text-[12px] text-dim">
                {searchBucket
                  ? `已按 semantic bucket「${searchBucketLabel || searchBucket}」做推荐排序`
                  : searchBucketLabels.length > 1
                    ? `已按组合 semantic buckets「${searchBucketLabels.join(' + ')}」做推荐排序`
                    : "已按关键词相关性做推荐排序"}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {!selected ? (
            <div className="text-center py-15 text-dim text-sm">选择一个领域</div>
          ) : tab === "core" ? (
            <div>
              <div className="text-[13px] text-dim mb-3">
                AI 出题和评分的参考依据，编辑后影响该领域的题目质量。支持 Markdown 格式。
              </div>

              {readingPlan.length > 0 && (
                <div className="mb-4 rounded-box border border-accent/30 bg-accent/5 p-4">
                  <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                    <div>
                      <div className="text-sm font-semibold text-text mb-1">推荐阅读顺序</div>
                      <div className="text-[12px] text-dim">
                        {searchBucket
                          ? `围绕「${searchBucketLabel || searchBucket}」优先阅读下面几份材料`
                          : searchBucketLabels.length > 1
                            ? `围绕「${searchBucketLabels.join(' + ')}」的组合薄弱点，建议按下面顺序补`
                            : "根据当前关键词相关性，建议优先阅读下面几份材料"}
                      </div>
                    </div>
                    <button
                      onClick={handleGoTrain}
                      className="px-3 py-2 rounded-lg bg-accent text-white text-[12px] font-medium cursor-pointer hover:opacity-90"
                    >
                      开始本轮训练
                    </button>
                  </div>
                  <div className="grid gap-2 md:grid-cols-3">
                    {readingPlan.map((f, idx) => {
                      const labels = ["先看", "再看", "补充看"];
                      return (
                        <button
                          key={f.filename}
                          onClick={() => setExpandedFile(f.filename)}
                          className="text-left rounded-lg border border-border bg-card px-3 py-3 cursor-pointer hover:border-accent transition-all"
                        >
                          <div className="text-[11px] font-medium text-accent-light mb-1">{labels[idx] || `第 ${idx + 1} 份`}</div>
                          <div className="text-[13px] font-medium text-text break-all">{f.filename}</div>
                          {f.__rank?.reason && (
                            <div className="mt-1 text-[12px] text-dim">{f.__rank.reason}</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-2 mb-4">
                {showNewFile ? (
                  <>
                    <input className="flex-1 px-3 py-2 rounded-lg border border-border bg-bg text-text text-[13px]" placeholder="文件名 (例: 装饰器.md)" value={newFileName} onChange={(e) => setNewFileName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreateFile()} />
                    <button className="px-5 py-2 rounded-lg bg-accent text-white text-[13px] cursor-pointer" onClick={handleCreateFile}>创建</button>
                    <button className="px-5 py-2 rounded-lg border border-border bg-hover text-text text-[13px] cursor-pointer" onClick={() => { setShowNewFile(false); setNewFileName(""); }}>取消</button>
                  </>
                ) : (
                  <>
                    <button className="px-5 py-2 rounded-lg border border-border bg-hover text-text text-[13px] cursor-pointer" onClick={() => setShowNewFile(true)}>+ 新增文件</button>
                    {coreIsEmpty && (
                      <button
                        className="px-5 py-2 rounded-lg bg-accent/15 border border-accent/40 text-accent-light text-[13px] cursor-pointer disabled:opacity-50"
                        onClick={handleGenerate}
                        disabled={generating}
                      >
                        {generating ? "正在生成..." : <><Sparkles size={14} className="inline -mt-0.5" /> AI 生成基础内容</>}
                      </button>
                    )}
                  </>
                )}
              </div>

              {coreFiles.length === 0 ? (
                <div className="text-center py-15 text-dim text-sm">该领域暂无知识文件</div>
              ) : (
                <div className="flex flex-col gap-3">
                  {rankedCoreFiles.map((f) => (
                    <div key={f.filename} className="bg-card border border-border rounded-box overflow-hidden">
                      <div
                        className="flex justify-between items-start px-4 py-3 cursor-pointer text-sm font-medium gap-3"
                        onClick={() => setExpandedFile(expandedFile === f.filename ? null : f.filename)}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <HighlightText text={f.filename} terms={searchAliases} />
                            {searchTerm.trim() && (searchBucket || searchBucketLabels.length > 1) && f.__rank?.score > 0 && (
                              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-accent/10 text-accent-light">
                                bucket: {searchBucket ? (searchBucketLabel || searchBucket) : searchBucketLabels.join(' + ')}
                              </span>
                            )}
                          </div>
                          {searchTerm.trim() && f.__rank?.reason && (
                            <div className="mt-1 text-[12px] text-dim font-normal leading-[1.5]">
                              推荐原因：{f.__rank.reason}
                            </div>
                          )}
                          {searchTerm.trim() && getMatchPreview(f.content, searchAliases) && (
                            <div className="mt-1 text-[12px] text-dim font-normal leading-[1.6]">
                              <HighlightText text={getMatchPreview(f.content, searchAliases)} terms={searchAliases} />
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-dim flex items-center gap-1">{expandedFile === f.filename ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {(f.content?.length || 0)} 字</span>
                          <button
                            className="bg-transparent border-none text-dim cursor-pointer text-sm px-1.5 py-0.5 rounded opacity-50 transition-all hover:text-red hover:opacity-100"
                            title="删除文件"
                            onClick={(e) => { e.stopPropagation(); handleDeleteFile(f.filename); }}
                          ><X size={14} /></button>
                        </div>
                      </div>
                      {expandedFile === f.filename && (
                        <div className="border-t border-border p-4">
                          {searchTerm.trim() && (
                            <div className="mb-3 text-[12px] text-dim">
                              当前定位关键词：<HighlightText text={searchTerm} terms={searchAliases} />
                            </div>
                          )}
                          <textarea
                            className="w-full min-h-[300px] p-3 rounded-lg border border-border bg-bg text-text text-[13px] font-mono leading-relaxed resize-y"
                            value={editContent[f.filename] ?? f.content}
                            onChange={(e) => setEditContent((prev) => ({ ...prev, [f.filename]: e.target.value }))}
                          />
                          <div className="flex gap-2 mt-3 justify-end">
                            {coreSaving === f.filename && <span className="text-xs text-green self-center mr-3">已保存</span>}
                            <button className="px-5 py-2 rounded-lg bg-accent text-white text-[13px] cursor-pointer" onClick={() => handleSaveCore(f.filename)}>保存</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="text-[13px] text-dim mb-3">
                标记的高频面试考点，出题时会优先覆盖。支持 Markdown 格式。
              </div>
              <textarea
                className="w-full min-h-[500px] p-3 rounded-lg border border-border bg-bg text-text text-[13px] font-mono leading-relaxed resize-y"
                value={highFreqDraft}
                onChange={(e) => setHighFreqDraft(e.target.value)}
                placeholder={"# 高频题\n\n## 1. xxx原理是什么？为什么这样设计？\n\n## 2. 实际项目中遇到xxx问题怎么解决？"}
              />
              <div className="flex gap-2 mt-3 justify-end">
                {hfSaving && <span className="text-xs text-green self-center mr-3">已保存</span>}
                {highFreqDraft !== highFreq && (
                  <button className="px-5 py-2 rounded-lg border border-border bg-hover text-text text-[13px] cursor-pointer" onClick={() => setHighFreqDraft(highFreq)}>撤销修改</button>
                )}
                <button className="px-5 py-2 rounded-lg bg-accent text-white text-[13px] cursor-pointer disabled:opacity-40" onClick={handleSaveHighFreq} disabled={highFreqDraft === highFreq}>保存</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
