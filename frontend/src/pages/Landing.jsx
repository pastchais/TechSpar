import { useNavigate } from "react-router-dom";
import { Sun, Moon, ArrowRight, Brain, Target, Mic, BarChart3, Repeat, BookOpen, Sparkles, CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";
import { Badge, PrimaryButton, SubtleButton, SurfaceCard } from "../components/ui.jsx";

const FEATURES = [
  {
    icon: <Target size={20} />,
    color: "text-accent bg-accent/12",
    title: "简历模拟面试",
    desc: "AI 读取简历，模拟真实面试官。从自我介绍到项目深挖，完整走一遍。",
  },
  {
    icon: <BookOpen size={20} />,
    color: "text-green bg-green/12",
    title: "专项强化训练",
    desc: "围绕薄弱点集中刷题，动态调节难度，不再盲目重复熟题。",
  },
  {
    icon: <Mic size={20} />,
    color: "text-teal bg-teal/12",
    title: "录音复盘",
    desc: "上传真实面试录音或粘贴文字，自动转写分析并生成下一轮训练重点。",
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="TechSpar" className="h-9 w-9 rounded-xl object-contain" />
            <div>
              <div className="text-[17px] font-display font-bold tracking-[-0.02em] text-text">TechSpar</div>
              <div className="text-[11px] text-dim">AI Mock Interview Coach</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-hover transition-all hover:border-accent/25 hover:text-accent-light"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <SubtleButton onClick={() => navigate("/login")} className="hidden sm:inline-flex">登录</SubtleButton>
            <PrimaryButton onClick={() => navigate("/login")}>
              免费开始
              <ArrowRight size={16} />
            </PrimaryButton>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden px-6 pb-14 pt-12 md:px-8 md:pb-20 md:pt-20">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[320px] w-[680px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.14),transparent_62%)] blur-3xl" />

        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] md:gap-12">
          <div>
            <Badge tone="accent" className="mb-5 gap-1.5 px-3 py-1.5 text-[12px]">
              <Brain size={14} />
              AI-Powered Mock Interview
            </Badge>

            <h1 className="max-w-3xl text-4xl font-display font-bold leading-[1.06] tracking-[-0.04em] text-text md:text-[56px]">
              不再盲目刷题，
              <span className="bg-gradient-to-r from-accent-light via-accent to-orange bg-clip-text text-transparent">每一次练习都真正接上一次进步。</span>
            </h1>

            <p className="mt-5 max-w-2xl text-[15px] leading-8 text-dim md:text-[17px]">
              TechSpar 会记录你的表达轨迹、识别总是答不稳的薄弱点，并把下一轮训练精准对准真正需要修复的地方。
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <PrimaryButton onClick={() => navigate("/login")} className="px-6 py-3 text-sm">
                立即开始训练
                <ArrowRight size={16} />
              </PrimaryButton>
              <div className="text-[13px] text-dim">适合前端 / 后端 / 算法 / 系统设计等面试准备</div>
            </div>

            <div className="mt-7 flex flex-wrap gap-2.5">
              {[
                { icon: <BarChart3 size={14} />, text: "个性化画像" },
                { icon: <Repeat size={14} />, text: "智能复练节奏" },
                { icon: <Sparkles size={14} />, text: "语义级薄弱点追踪" },
              ].map((p) => (
                <Badge key={p.text} tone="muted" className="gap-1.5 px-3 py-1.5 text-[12px]">
                  {p.icon}
                  {p.text}
                </Badge>
              ))}
            </div>
          </div>

          <SurfaceCard elevated className="overflow-hidden rounded-[28px] border-border/80">
            <div className="border-b border-border/80 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-red/80" />
                  <div className="h-2.5 w-2.5 rounded-full bg-accent/80" />
                  <div className="h-2.5 w-2.5 rounded-full bg-green/80" />
                  <span className="ml-2 text-[11px] font-mono text-dim">mock interview workspace</span>
                </div>
                <Badge tone="green" className="text-[10px]">本轮 focus：RAG 架构表达</Badge>
              </div>
            </div>

            <div className="grid gap-4 px-5 py-5 md:grid-cols-[minmax(0,1fr)_156px]">
              <div className="rounded-2xl border border-border/70 bg-hover/70 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-[13px] font-semibold text-text">模拟面试进行中</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-dim">
                    <span className="inline-block h-2 w-2 rounded-full bg-green animate-pulse-dot" />
                    实时分析
                  </div>
                </div>
                <div className="space-y-3 text-[13px] leading-[1.8]">
                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-light/90">INTERVIEWER</div>
                    <div className="text-text">请介绍一下你在 RAG 项目中的架构设计，以及为什么这样分层。</div>
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-teal">CANDIDATE</div>
                    <div className="text-dim">我们采用了两阶段检索架构，先用向量召回拉高覆盖率，再用 rerank 提升语义相关性…</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="rounded-2xl border border-green/20 bg-green/8 p-3.5">
                  <div className="text-[11px] text-dim mb-1">本题得分</div>
                  <div className="text-2xl font-bold text-green">7.5 / 10</div>
                  <div className="mt-1 text-[12px] leading-6 text-dim">结构清晰，但缺少性能指标与 trade-off 说明。</div>
                </div>
                <div className="rounded-2xl border border-border/70 bg-card p-3.5">
                  <div className="text-[11px] text-dim mb-2">实时反馈</div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="green" className="text-[10px]">逻辑清晰 +1</Badge>
                    <Badge tone="orange" className="text-[10px]">缺少量化指标</Badge>
                    <Badge tone="muted" className="text-[10px]">建议补充 trade-off</Badge>
                  </div>
                </div>
                <div className="rounded-2xl border border-border/70 bg-card p-3.5">
                  <div className="text-[11px] text-dim mb-2">下一轮训练重点</div>
                  <div className="space-y-2 text-[12px] text-text">
                    {[
                      "补齐性能指标表达",
                      "说明方案取舍依据",
                      "练 1 分钟口语化版本",
                    ].map((item) => (
                      <div key={item} className="flex items-center gap-2">
                        <CheckCircle2 size={13} className="text-accent-light" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </SurfaceCard>
        </div>
      </section>

      <section className="px-6 pb-16 md:px-8 md:pb-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-5 text-center">
            <div className="text-[13px] font-medium uppercase tracking-[0.16em] text-dim">How it helps</div>
            <h2 className="mt-2 text-[28px] font-display font-bold tracking-[-0.03em] text-text md:text-[34px]">从一次练习，延伸成一整套进步闭环</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {FEATURES.map((f) => (
              <SurfaceCard
                key={f.title}
                className="px-5 py-5 transition-all hover:-translate-y-[2px] hover:border-accent/30 hover:shadow-[0_18px_36px_-28px_rgba(245,158,11,0.26)]"
              >
                <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-2xl ${f.color}`}>
                  {f.icon}
                </div>
                <h3 className="mb-2 text-[16px] font-semibold tracking-[-0.01em] text-text">{f.title}</h3>
                <p className="text-[14px] leading-7 text-dim">{f.desc}</p>
              </SurfaceCard>
            ))}
          </div>
        </div>
      </section>

      <footer className="mt-auto border-t border-border/80">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-6 text-[12px] text-dim md:flex-row md:items-center md:justify-between md:px-8">
          <div>
            <div className="font-medium text-text">TechSpar</div>
            <div className="mt-1">AI Mock Interview Coach · 更像训练系统，而不只是聊天工具。</div>
          </div>
          <div className="flex items-center gap-4">
            <span>关于产品</span>
            <span>服务协议</span>
            <span>隐私说明</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
