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

export default function TopicCard({ topicKey, name, icon, onClick, selected, recommended = false }) {
  const meta = getTopicMeta(topicKey, name, selected);

  return (
    <button
      type="button"
      className={`group relative w-full min-h-[148px] flex flex-col rounded-2xl border text-left transition-all active:scale-[0.99]
        ${selected
          ? "border-green bg-green/5 shadow-[0_0_0_1px_rgba(34,197,94,0.2),0_18px_30px_-18px_rgba(34,197,94,0.32)]"
          : "border-border bg-card hover:-translate-y-px hover:border-accent/40 hover:shadow-[0_10px_24px_-18px_rgba(245,158,11,0.28)]"}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      <div className="flex items-start gap-3 px-4 pt-4">
        <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${selected ? "bg-green text-white" : "bg-hover text-dim group-hover:text-accent-light"}`}>
          {getTopicIcon(icon, 20)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="line-clamp-2 text-[15px] font-semibold leading-6 text-text break-words">{name}</div>
              <div className="mt-1 text-[12px] leading-5 text-dim line-clamp-2 break-words">{meta.summary}</div>
            </div>
            <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${selected ? "border-green bg-green" : "border-border bg-transparent"}`}>
              {selected && <div className="h-2 w-2 rounded-full bg-white" />}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-auto px-4 pb-4 pt-3">
        <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`inline-flex max-w-full items-center rounded px-2 py-0.5 text-[11px] font-medium leading-4 ${selected ? "bg-green/10 text-green" : recommended ? "bg-orange/15 text-orange" : "bg-hover text-dim"}`}>
              {recommended && !selected ? "推荐" : meta.tag}
            </span>
            <span className={`min-w-0 text-[11px] leading-4 ${selected ? "text-green" : "text-dim"}`}>
              {meta.cue}
            </span>
          </div>
        </div>
      </div>

      <div className={`absolute inset-x-0 bottom-0 h-1 rounded-b-2xl transition-opacity ${selected ? "bg-green opacity-100" : recommended ? "bg-orange/60 opacity-100" : "opacity-0"}`} />
    </button>
  );
}
