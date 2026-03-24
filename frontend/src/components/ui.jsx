import React from "react";

export function PageTitle({ title, subtitle, className = "" }) {
  return (
    <div className={className}>
      <div className="text-[26px] leading-tight md:text-[28px] font-display font-bold mb-2">{title}</div>
      {subtitle ? <div className="text-[13px] leading-6 text-dim break-words">{subtitle}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, className = "" }) {
  return <div className={`text-base font-semibold mb-3 text-text ${className}`}>{children}</div>;
}

export function Badge({ children, tone = "muted", className = "", title, as = "span", ...props }) {
  const toneClass = {
    muted: "bg-hover text-dim",
    accent: "bg-accent/15 text-accent-light",
    green: "bg-green/10 text-green",
    orange: "bg-orange/15 text-orange",
    red: "bg-red/10 text-red",
  }[tone] || "bg-hover text-dim";

  const Comp = as;

  return (
    <Comp
      title={title}
      className={`inline-flex max-w-full items-center rounded px-2 py-0.5 text-[11px] font-medium leading-4 break-words ${toneClass} ${className}`}
      {...props}
    >
      {children}
    </Comp>
  );
}

export function SubtleButton({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-2 rounded-xl bg-hover px-4 py-2 text-[13px] font-medium text-dim transition-all hover:text-accent-light ${className}`}
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
