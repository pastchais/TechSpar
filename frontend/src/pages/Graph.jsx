import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getTopics, getGraphData } from "../api/interview";
import { getTopicIcon } from "../utils/topicIcons";
import { Badge, EmptyState, PageTitle, SubtleButton, SurfaceCard } from "../components/ui.jsx";

const SIMILARITY_THRESHOLD = 0.65;

function scoreToColor(score) {
  if (score >= 8) return "#22C55E";
  if (score >= 6) return "#FBBF24";
  if (score >= 4) return "#FB923C";
  return "#EF4444";
}

export default function Graph() {
  const navigate = useNavigate();
  const [topics, setTopics] = useState({});
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [graphLibLoading, setGraphLibLoading] = useState(false);
  const [ForceGraphComponent, setForceGraphComponent] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const containerRef = useRef(null);
  const fgRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  useEffect(() => {
    getTopics().then(setTopics).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedTopic || ForceGraphComponent) return;
    setGraphLibLoading(true);
    import("react-force-graph-2d")
      .then((mod) => setForceGraphComponent(() => mod.default))
      .catch(() => {})
      .finally(() => setGraphLibLoading(false));
  }, [selectedTopic, ForceGraphComponent]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setDimensions({ width, height: Math.max(400, Math.min(width * 0.65, 600)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleSelectTopic = async (key) => {
    setSelectedTopic(key);
    setGraphData(null);
    setLoading(true);
    try {
      const data = await getGraphData(key);
      setGraphData(data);
      setTimeout(() => fgRef.current?.zoomToFit(400, 40), 300);
    } catch {
      setGraphData({ nodes: [], links: [] });
    } finally {
      setLoading(false);
    }
  };

  const paintNode = useCallback((node, ctx) => {
    const r = 5 + (node.difficulty || 3) * 1.2;
    const color = scoreToColor(node.score);
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    const textColor = isLight ? "#18181B" : "#FAFAF9";

    if (hoveredNode === node) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
    }

    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.shadowBlur = 0;

    if (hoveredNode === node) {
      ctx.strokeStyle = textColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    const label = node.focus_area || node.question.slice(0, 20);
    ctx.font = `${hoveredNode === node ? 12 : 10}px DM Sans, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = textColor;
    ctx.globalAlpha = hoveredNode === node ? 1 : 0.7;
    ctx.fillText(label, node.x, node.y - r - 5);
    ctx.globalAlpha = 1;
  }, [hoveredNode]);

  const paintLink = useCallback((link, ctx) => {
    const alpha = Math.max(0.08, (link.similarity - SIMILARITY_THRESHOLD) * 3);
    ctx.strokeStyle = `rgba(161, 161, 170, ${alpha})`;
    ctx.lineWidth = 0.5 + link.similarity * 1.5;
    ctx.beginPath();
    ctx.moveTo(link.source.x, link.source.y);
    ctx.lineTo(link.target.x, link.target.y);
    ctx.stroke();
  }, []);

  const topicEntries = Object.entries(topics);
  const nodeCount = graphData?.nodes?.length || 0;
  const linkCount = graphData?.links?.length || 0;
  const graphIsSparse = selectedTopic && graphData && nodeCount > 0 && linkCount === 0;

  return (
    <div className="flex-1 px-4 py-8 md:px-6 md:py-10 max-w-5xl mx-auto w-full">
      <PageTitle
        title="题目图谱"
        subtitle="把同一专题下已经练过并完成复盘的题目连成图，帮助你看清哪些题在考同一类能力，哪些薄弱点在反复出现。"
      />

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-dim">
        <Badge tone="muted">仅统计已完成复盘的专项训练</Badge>
        <Badge tone="muted">颜色表示得分区间</Badge>
        <Badge tone="muted">连线表示题目语义相近</Badge>
      </div>

      <SurfaceCard className="mt-6 px-4 py-4 md:px-5">
        <div className="mb-3 text-[14px] font-semibold text-text">选择一个专题查看图谱</div>
        <div className="flex flex-wrap gap-2">
          {topicEntries.map(([key, info]) => (
            <button
              key={key}
              className={`px-4 py-2 rounded-lg text-sm transition-all border ${
                selectedTopic === key
                  ? "bg-accent/15 border-accent text-accent-light"
                  : "bg-card border-border text-dim hover:text-text hover:border-accent/50"
              }`}
              onClick={() => handleSelectTopic(key)}
            >
              <span className="inline-flex align-middle mr-1">{getTopicIcon(info.icon, 14)}</span>{info.name}
            </button>
          ))}
        </div>
      </SurfaceCard>

      <div
        ref={containerRef}
        className="mt-4 bg-card border border-border rounded-box overflow-hidden relative"
        style={{ minHeight: 400 }}
      >
        {!selectedTopic && (
          <div className="p-6 md:p-8">
            <EmptyState
              title="先选择一个专题"
              description="图谱不会展示全部题库，而是基于你已经完成复盘的专项训练记录生成。先选一个领域，看看哪些题在考同一类能力。"
            />
          </div>
        )}

        {(loading || graphLibLoading) && (
          <div className="flex items-center justify-center h-[400px] text-dim text-sm">
            {loading ? "正在构建图谱..." : "正在加载图谱引擎..."}
          </div>
        )}

        {selectedTopic && !loading && graphData && graphData.nodes.length === 0 && (
          <div className="p-6 md:p-8">
            <EmptyState
              title="这个专题的数据还不够生成图谱"
              description="图谱只会读取当前专题下已经完成复盘的专项训练记录。先做几轮专项训练并完成评分复盘，再回来这里看题目之间的关联。"
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <SubtleButton onClick={() => navigate("/")}>去开始专项训练</SubtleButton>
                  <SubtleButton onClick={() => navigate("/history")}>查看历史记录</SubtleButton>
                </div>
              }
            />
          </div>
        )}

        {selectedTopic && !loading && !graphLibLoading && graphData && graphData.nodes.length > 0 && ForceGraphComponent && (
          <ForceGraphComponent
            ref={fgRef}
            graphData={graphData}
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor="transparent"
            nodeCanvasObject={paintNode}
            nodePointerAreaPaint={(node, color, ctx) => {
              const r = 5 + (node.difficulty || 3) * 1.2;
              ctx.beginPath();
              ctx.arc(node.x, node.y, r + 4, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
            }}
            linkCanvasObject={paintLink}
            onNodeHover={setHoveredNode}
            cooldownTicks={80}
            d3AlphaDecay={0.03}
            d3VelocityDecay={0.3}
          />
        )}

        {hoveredNode && (
          <div className="absolute top-3 right-3 bg-hover border border-border rounded-lg px-4 py-3 max-w-[280px] text-sm pointer-events-none animate-fade-in z-10">
            <div className="font-medium text-text leading-snug mb-2">{hoveredNode.question}</div>
            <div className="flex items-center gap-3 text-[13px] text-dim">
              <span style={{ color: scoreToColor(hoveredNode.score) }}>
                {hoveredNode.score}/10
              </span>
              {hoveredNode.focus_area && <span>{hoveredNode.focus_area}</span>}
              {hoveredNode.date && <span>{hoveredNode.date}</span>}
            </div>
          </div>
        )}
      </div>

      {selectedTopic && graphData && graphData.nodes.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-5 mt-4 text-[13px] text-dim">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-green inline-block" />
              <span>8+</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-accent-light inline-block" />
              <span>6-8</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-orange inline-block" />
              <span>4-6</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red inline-block" />
              <span>&lt;4</span>
            </div>
            <span className="ml-auto">共 {nodeCount} 题 · {linkCount} 条关联</span>
          </div>

          {graphIsSparse && (
            <SurfaceCard className="mt-4 px-4 py-3 border-orange/20 bg-orange/5">
              <div className="text-[13px] font-semibold text-text">当前图谱仍然偏稀疏</div>
              <div className="mt-1 text-[12px] leading-[1.7] text-dim">
                已经有题目节点，但暂时还没有达到相似度阈值的关联边。通常是因为这个专题下的已复盘题目还不够多，或者题目分布还比较分散。继续做几轮专项训练后，这里会更有参考价值。
              </div>
            </SurfaceCard>
          )}
        </>
      )}
    </div>
  );
}
