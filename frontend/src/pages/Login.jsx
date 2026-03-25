import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ArrowLeft, Sparkles, CheckCircle2 } from "lucide-react";
import { Badge, PrimaryButton, SurfaceCard, TextInput } from "../components/ui.jsx";

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [allowReg, setAllowReg] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetch("/api/auth/config")
      .then((r) => r.json())
      .then((d) => setAllowReg(d.allow_registration))
      .catch(() => setAllowReg(false));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (isRegister && password.length < 6) {
      setError("密码至少 6 个字符");
      return;
    }

    setLoading(true);
    try {
      const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
      const body = isRegister ? { email, password, name } : { email, password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "操作失败");
      }

      const data = await res.json();
      login(data.token, data.user);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg px-4 py-8 md:px-6">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[320px] w-[680px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.12),transparent_62%)] blur-3xl" />

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center">
        <div className="grid w-full items-center gap-8 lg:grid-cols-[minmax(320px,0.9fr)_minmax(360px,420px)]">
          <div className="hidden lg:block pr-8">
            <Badge tone="accent" className="mb-5 gap-1.5 px-3 py-1.5 text-[12px]">
              <Sparkles size={14} />
              Continue your interview training
            </Badge>
            <h1 className="max-w-xl text-[44px] font-display font-bold leading-[1.06] tracking-[-0.04em] text-text">
              登录后，继续你上一次没有练完的进步轨迹。
            </h1>
            <p className="mt-5 max-w-lg text-[15px] leading-8 text-dim">
              不是单次问答，而是持续记录、复盘和定向强化。TechSpar 会把你的薄弱点、改进建议与下一轮训练连接起来。
            </p>
            <div className="mt-8 space-y-3 text-[14px] text-dim">
              {[
                "记录每次训练后的薄弱点与改进方向",
                "根据历史表现自动推荐下一轮练习重点",
                "支持专项训练、简历模拟与真实录音复盘",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <CheckCircle2 size={16} className="mt-1 text-accent-light" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <SurfaceCard elevated className="w-full px-6 py-6 md:px-7 md:py-7">
            <button
              onClick={() => navigate("/")}
              className="mb-6 flex items-center gap-1.5 text-[13px] text-dim transition-colors hover:text-text"
            >
              <ArrowLeft size={16} />
              返回首页
            </button>

            <div className="mb-7 flex items-center gap-3">
              <img src="/favicon.svg" alt="TechSpar" className="h-11 w-11 rounded-2xl" />
              <div>
                <h1 className="text-[24px] font-display font-bold tracking-[-0.02em] text-text">
                  {isRegister ? "创建账号" : "欢迎回来"}
                </h1>
                <p className="text-[13px] leading-6 text-dim">
                  {isRegister ? "注册后开始你的第一轮面试训练" : "登录继续你的面试训练与复盘"}
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {isRegister && (
                <div>
                  <label className="mb-1.5 block text-[13px] text-dim">昵称</label>
                  <TextInput
                    type="text"
                    placeholder="你的称呼（选填）"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-[13px] text-dim">邮箱</label>
                <TextInput
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] text-dim">密码</label>
                <TextInput
                  type="password"
                  placeholder={isRegister ? "至少 6 个字符" : "输入密码"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {error && (
                <div className="rounded-xl border border-red/20 bg-red/10 px-3.5 py-2.5 text-[13px] text-red">
                  {error}
                </div>
              )}

              <PrimaryButton type="submit" disabled={loading} className="mt-2 w-full py-3 text-sm">
                {loading ? "处理中..." : isRegister ? "注册" : "登录"}
              </PrimaryButton>
            </form>

            {allowReg && (
              <div className="mt-6 border-t border-border pt-5 text-center">
                <span className="text-[13px] text-dim">
                  {isRegister ? "已有账号？" : "还没有账号？"}
                </span>
                <button
                  onClick={() => {
                    setIsRegister(!isRegister);
                    setError("");
                  }}
                  className="ml-1.5 text-[13px] font-medium text-accent hover:underline"
                >
                  {isRegister ? "去登录" : "注册"}
                </button>
              </div>
            )}
          </SurfaceCard>
        </div>
      </div>
    </div>
  );
}
