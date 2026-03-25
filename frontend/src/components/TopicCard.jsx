import { getTopicIcon } from "../utils/topicIcons";
import { formatTopicKey } from "../utils/topicLabels";

function getTopicMeta(topicKey, name, selected) {
  const raw = String(topicKey || name || "").toLowerCase();

  if (raw.includes("system") || raw.includes("design") || raw.includes("架构")) {
    return {
      summary: "围绕系统拆解、权衡与设计决策。",
      tag: "系统设计",
      cue: selected ? "已选中，适合做结构化深挖" : "适合做框架化表达训练",
    };
  }

  if (raw.includes("frontend") || raw.includes("react") || raw.includes("web") || raw.includes("前端")) {
    return {
      summary: "聚焦页面交互、状态管理与性能取舍。",
      tag: "前端",
      cue: selected ? "已选中，可直接开始页面场景训练" : "适合练交互与工程化表达",
    };
  }

  if (raw.includes("backend") || raw.includes("api") || raw.includes("服务端") || raw.includes("后端")) {
    return {
      summary: "聚焦接口设计、稳定性与服务治理。",
      tag: "后端",
      cue: selected ? "已选中，可直接进入服务端追问" : "适合练接口与稳定性思路",
    };
  }

  if (raw.includes("db") || raw.includes("database") || raw.includes("sql") || raw.includes("数据")) {
    return {
      summary: "围绕数据建模、查询优化与一致性。",
      tag: "数据",
      cue: selected ? "已选中，可直接进入数据题训练" : "适合练建模与性能分析",
    };
  }

  if (raw.includes("network") || raw.includes("infra") || raw.includes("cloud") || raw.includes("deploy") || raw.includes("运维") || raw.includes("网络")) {
    return {
      summary: "聚焦部署链路、网络基础与线上稳定性。",
      tag: "工程",
      cue: selected ? "已选中，适合做真实线上场景验证" : "适合练排障与上线思路",
    };
  }

  const subtitle = topicKey && topicKey !== name ? formatTopicKey(topicKey) : "";
  return {
    summary: subtitle || "围绕该专题做定向强化训练。",
    tag: "专题",
    cue: selected ? "已选中，可直接开始训练" : "点击选择该专题",
  };
}

function scoreMeta(score) {
  if (score == null || Number.isNaN(Number(score))) return null;
  const value = Math.round(Number(score));
  if (value < 60) return { label: `待强化 ${value}`, tone: "text-red bg-red/10 border-red/20" };
  if (value < 75) return { label: `可提升 ${value}`, tone: "text-orange bg-orange/10 border-orange/20" };
  if (value < 90) return { label: `较稳定 ${value}`, tone: "text-accent-light bg-accent/10 border-accent/20" };
  return { label: `已掌握 ${value}`, tone: "text-green bg-green/10 border-green/20" };
}

export default function TopicCard({
  topicKey,
  name,
  icon,
  onClick,
  selected,
  recommended = false,
  score = null,
  focusLabel = "",
  trendLabel = "",
  rank = null,
}) {
  const meta = getTopicMeta(topicKey, name, selected);
  const scoreBadge = scoreMeta(score);
  const topLabel = rank === 0 ? "最该先练" : rank === 1 ? "次优先" : rank === 2 ? "第三优先" : "";

  return (
    <button
      type="button"
      className={`group relative w-full min-h-[172px] flex flex-col rounded-2xl border text-left transition-all active:scale-[0.99]
        ${selected
          ? "border-green bg-green/5 shadow-[0_0_0_1px_rgba(34,197,94,0.2),0_18px_30px_-18px_rgba(34,197,94,0.32)]"
          : recommended
            ? "border-orange/30 bg-orange/5 hover:-translate-y-px hover:border-orange/50 hover:shadow-[0_10px_24px_-18px_rgba(249,115,22,0.35)]"
            : "border-border bg-card hover:-translate-y-px hover:border-accent/40 hover:shadow-[0_10px_24px_-18px_rgba(245,158,11,0.28)]"}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold leading-4 ${selected ? "bg-green/12 text-green" : recommended ? "bg-orange/15 text-orange" : "bg-hover text-dim"}`}>
            {selected ? "当前选择" : recommended ? (topLabel || "建议优先") : meta.tag}
          </span>
          {trendLabel && (
            <span className="inline-flex max-w-[110px] truncate rounded-full bg-hover px-2 py-0.5 text-[10px] font-medium leading-4 text-dim" title={trendLabel}>
              轨迹：{trendLabel}
            </span>
          )}
        </div>
        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${selected ? "border-green bg-green" : "border-border bg-transparent"}`}>
          {selected && <div className="h-2 w-2 rounded-full bg-white" />}
        </div>
      </div>

      <div className="flex items-start gap-3 px-4 pt-3">
        <div className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all ${selected ? "bg-green text-white" : recommended ? "bg-orange/12 text-orange" : "bg-hover text-dim group-hover:text-accent-light"}`}>
          {getTopicIcon(icon, 20)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-[15px] font-semibold leading-6 text-text break-words">{name}</div>
          <div className="mt-1 text-[12px] leading-5 text-dim line-clamp-2 break-words">{meta.summary}</div>
        </div>
      </div>

      <div className="mt-3 px-4">
        <div className="flex flex-wrap gap-2">
          {scoreBadge && (
            <span className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-medium leading-4 ${scoreBadge.tone}`}>
              {scoreBadge.label}
            </span>
          )}
          {focusLabel && (
            <span className="inline-flex max-w-full rounded-md bg-accent/10 px-2 py-1 text-[11px] font-medium leading-4 text-accent-light break-words" title={focusLabel}>
              切入点：{focusLabel}
            </span>
          )}
        </div>
      </div>

      <div className="mt-auto px-4 pb-4 pt-3">
        <div className="border-t border-border/70 pt-3">
          <div className={`text-[11px] leading-[1.6] ${selected ? "text-green" : "text-dim"}`}>
            {focusLabel
              ? `建议先从「${focusLabel}」切入，再进入专题强化。`
              : recommended
                ? "这是当前更值得优先处理的专题。"
                : meta.cue}
          </div>
        </div>
      </div>

      <div className={`absolute inset-x-0 bottom-0 h-1 rounded-b-2xl transition-opacity ${selected ? "bg-green opacity-100" : recommended ? "bg-orange/70 opacity-100" : "opacity-0"}`} />
    </button>
  );
}
