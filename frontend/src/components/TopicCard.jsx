import { getTopicIcon } from "../utils/topicIcons";
import { formatTopicKey } from "../utils/topicLabels";

export default function TopicCard({ topicKey, name, icon, onClick, selected }) {
  const subtitle = topicKey && topicKey !== name ? formatTopicKey(topicKey) : "";
  return (
    <button
      type="button"
      className={`w-full relative flex items-center gap-3 px-5 py-4 rounded-box cursor-pointer transition-all text-left border active:scale-[0.99]
        ${selected ? "border-green bg-green/5 shadow-[0_0_0_1px_rgba(34,197,94,0.22),0_12px_24px_-14px_rgba(34,197,94,0.28)]" : "border-border bg-card hover:border-accent/40 hover:-translate-y-px hover:shadow-[0_0_16px_rgba(245,158,11,0.08)]"}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      <div className={`absolute top-3 right-3 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${selected ? "border-green bg-green" : "border-border"}`}>
        {selected && <div className="w-2 h-2 rounded-full bg-white" />}
      </div>
      <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${selected ? "bg-green text-white" : "bg-hover text-dim"}`}>
        {getTopicIcon(icon, 22)}
      </div>
      <div className="min-w-0 pr-7">
        <div className="text-[15px] font-medium text-text">{name}</div>
        {subtitle && <div className="text-xs text-dim mt-0.5">{subtitle}</div>}
        <div className={`mt-1 text-[11px] font-medium ${selected ? "text-green" : "text-dim"}`}>
          {selected ? "已选中，继续下滑开始训练" : "点击选择该专题"}
        </div>
      </div>
    </button>
  );
}
