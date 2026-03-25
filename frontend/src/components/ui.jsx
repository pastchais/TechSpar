import React from "react";

export function PageTitle({ title, subtitle, className = "" }) {
  return (
    <div className={className}>
      <div className="text-[28px] leading-tight md:text-[32px] font-display font-bold tracking-[-0.02em] mb-2">{title}</div>
      {subtitle ? <div className="text-[13px] leading-6 text-dim break-words max-w-3xl">{subtitle}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, className = "" }) {
  return <div className={`text-[17px] font-semibold tracking-[-0.01em] mb-3 text-text ${className}`}>{children}</div>;
}

export function Badge({ children, tone = "muted", className = "", title, as = "span", ...props }) {
  const toneClass = {
    muted: "bg-hover text-dim border border-border/70",
    accent: "bg-accent/12 text-accent-light border border-accent/20",
    green: "bg-green/10 text-green border border-green/20",
    orange: "bg-orange/12 text-orange border border-orange/20",
    red: "bg-red/10 text-red border border-red/20",
  }[tone] || "bg-hover text-dim border border-border/70";

  const Comp = as;

  return (
    <Comp
      title={title}
      className={`inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-[11px] font-medium leading-4 break-words ${toneClass} ${className}`}
      {...props}
    >
      {children}
    </Comp>
  );
}

export function SurfaceCard({ children, className = "", elevated = false, ...props }) {
  return (
    <div
      className={`rounded-[24px] border border-border bg-card ${elevated ? "shadow-[0_20px_48px_-32px_rgba(0,0,0,0.45)]" : ""} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function AppSection({ title, subtitle, action = null, className = "", children }) {
  return (
    <section className={className}>
      {(title || subtitle || action) && (
        <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
          <div>
            {title ? <div className="text-[17px] font-semibold tracking-[-0.01em] text-text">{title}</div> : null}
            {subtitle ? <div className="mt-1 text-[13px] leading-6 text-dim max-w-3xl">{subtitle}</div> : null}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PrimaryButton({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-orange px-5 py-2.5 text-[13px] font-semibold text-black transition-all hover:shadow-[0_0_24px_rgba(245,158,11,0.22)] disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function SubtleButton({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-2 rounded-xl border border-border bg-hover px-4 py-2 text-[13px] font-medium text-dim transition-all hover:border-accent/25 hover:text-accent-light ${className}`}
    >
      {children}
    </button>
  );
}

export function OutlineButton({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-2 rounded-lg border border-border bg-transparent px-2 py-0.5 text-[11px] font-medium text-accent-light transition-all hover:border-accent/40 ${className}`}
    >
      {children}
    </button>
  );
}

export function TextInput({ className = "", ...props }) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-border bg-input px-3.5 py-2.5 text-[14px] text-text outline-none transition-all placeholder:text-dim/60 focus:border-accent/55 focus:shadow-[0_0_0_4px_rgba(245,158,11,0.08)] ${className}`}
    />
  );
}

export function PanelHeader({ title, subtitle, action = null, className = "" }) {
  return (
    <div className={`mb-4 flex items-start justify-between gap-3 flex-wrap ${className}`}>
      <div>
        {title ? <div className="text-[15px] font-semibold tracking-[-0.01em] text-text">{title}</div> : null}
        {subtitle ? <div className="mt-1 text-[12px] leading-6 text-dim">{subtitle}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function MetricCard({ label, value, hint = null, tone = "default", className = "" }) {
  const toneClass = {
    default: "text-text",
    accent: "text-accent-light",
    green: "text-green",
    red: "text-red",
    orange: "text-orange",
  }[tone] || "text-text";

  return (
    <SurfaceCard className={`px-4 py-4 bg-card/85 ${className}`}>
      <div className="text-[12px] text-dim">{label}</div>
      <div className={`mt-2 text-[24px] font-bold ${toneClass}`}>{value}</div>
      {hint ? <div className="mt-1 text-[12px] leading-6 text-dim">{hint}</div> : null}
    </SurfaceCard>
  );
}

export function EmptyState({ title, description, action = null, className = "" }) {
  return (
    <SurfaceCard className={`px-6 py-8 text-center ${className}`}>
      <div className="text-[16px] font-semibold text-text">{title}</div>
      {description ? <div className="mt-2 text-[13px] leading-7 text-dim max-w-xl mx-auto">{description}</div> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </SurfaceCard>
  );
}

export function SectionNav({ items = [], className = "" }) {
  return (
    <SurfaceCard className={`px-3 py-3 ${className}`}>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <SubtleButton
            key={item.label}
            onClick={item.onClick}
            className={`${item.active ? "bg-accent/10 text-accent-light hover:text-accent-light" : ""} py-1.5 text-[12px]`}
          >
            {item.label}
          </SubtleButton>
        ))}
      </div>
    </SurfaceCard>
  );
}

export function InsightCard({ title, subtitle = null, action = null, children, className = "" }) {
  return (
    <SurfaceCard className={`px-5 py-5 md:px-6 md:py-6 ${className}`}>
      <PanelHeader title={title} subtitle={subtitle} action={action} />
      {children}
    </SurfaceCard>
  );
}

export function ScoreRows({ items = [], labelWidth = "w-[72px] md:w-[110px]", className = "" }) {
  return (
    <div className={className}>
      {items.map((item, idx) => (
        <div key={item.key || idx} className="flex items-center gap-2.5 mb-2.5">
          <div className={`${labelWidth} text-[12px] md:text-[13px] text-dim text-right shrink-0 leading-4`}>{item.label}</div>
          <div className="flex-1 h-2 rounded bg-border overflow-hidden">
            <div
              className="h-full rounded transition-[width] duration-500 ease-in-out"
              style={{ width: `${item.percent}%`, background: item.color }}
            />
          </div>
          <div className="w-10 text-sm font-semibold text-right shrink-0" style={{ color: item.color }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export function InsightList({ title = null, items = [], tone = "muted", className = "" }) {
  if (!items?.length) return null;

  const toneClass = {
    muted: "bg-hover border-border text-text",
    green: "bg-green/6 border-green/15 text-text",
    red: "bg-red/8 border-red/20 text-text",
    accent: "bg-accent/8 border-accent/20 text-text",
  }[tone] || "bg-hover border-border text-text";

  return (
    <div className={className}>
      {title ? <div className="text-[15px] font-medium mb-2">{title}</div> : null}
      <div className="flex flex-col gap-1.5">
        {items.map((item, idx) => (
          <div key={idx} className={`px-3 py-2 rounded-lg text-[13px] border ${toneClass}`}>
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ObservationColumn({ title, items = [], tone = "muted", emptyText = "暂无内容。", className = "" }) {
  return (
    <div className={className}>
      <div className="text-[12px] font-medium text-dim mb-2">{title}</div>
      {items?.length ? (
        <InsightList items={items} tone={tone} />
      ) : (
        <div className="text-[12px] text-dim">{emptyText}</div>
      )}
    </div>
  );
}

export function CalloutCard({ title, children, className = "" }) {
  return (
    <div className={`rounded-xl bg-card px-3 py-3 border border-border/70 ${className}`}>
      {title ? <div className="text-[12px] font-medium text-dim mb-1.5">{title}</div> : null}
      <div className="text-[13px] leading-[1.8] text-text">{children}</div>
    </div>
  );
}

export function ExpandableReviewSection({
  title,
  icon = null,
  open = false,
  onToggle,
  children,
  className = "",
  tone = "default",
}) {
  const toneClass = {
    default: "border-border/70 bg-card/70",
    green: "border-green/20 bg-green/5",
  }[tone] || "border-border/70 bg-card/70";

  return (
    <details className={`rounded-2xl border px-3.5 py-3 group ${toneClass} ${className}`} open={open} onToggle={onToggle}>
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-text flex items-center gap-1.5">{icon}{title}</span>
        <>
          <span className="text-[11px] text-dim group-open:hidden">展开</span>
          <span className="text-[11px] text-dim hidden group-open:inline">收起</span>
        </>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
