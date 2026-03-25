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
