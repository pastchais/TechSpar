import { useEffect, useState } from "react";
import { getAdminSettings, updateAdminSettings } from "../api/interview";

export default function Settings() {
  const [form, setForm] = useState({
    model: "",
    temperature: 0.7,
    min_confidence_to_persist: 0.6,
    allow_registration: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getAdminSettings()
      .then((data) => setForm(data))
      .catch((e) => setError(e.message || "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const setField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setMessage("");
    setError("");
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await updateAdminSettings({
        model: form.model,
        temperature: Number(form.temperature),
        min_confidence_to_persist: Number(form.min_confidence_to_persist),
        allow_registration: !!form.allow_registration,
      });
      setForm(res.settings);
      setMessage("设置已保存")
    } catch (e) {
      setError(e.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-15 text-dim">加载中...</div>;

  return (
    <div className="flex-1 px-4 py-8 md:px-6 md:py-10 max-w-3xl mx-auto w-full">
      <div className="text-2xl md:text-[28px] font-display font-bold mb-2">管理员设置</div>
      <div className="text-sm text-dim mb-8">这里只管理运行参数，不包含 API Key / Secret。</div>

      <form onSubmit={onSubmit} className="bg-card border border-border rounded-box p-5 md:p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium mb-2">模型名</label>
          <input
            value={form.model}
            onChange={(e) => setField("model", e.target.value)}
            className="w-full rounded-lg bg-hover border border-border px-3 py-2.5 outline-none focus:border-accent"
            placeholder="例如 gpt-5.4"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">温度</label>
          <input
            type="number"
            min="0"
            max="2"
            step="0.1"
            value={form.temperature}
            onChange={(e) => setField("temperature", e.target.value)}
            className="w-full rounded-lg bg-hover border border-border px-3 py-2.5 outline-none focus:border-accent"
          />
          <div className="text-xs text-dim mt-1.5">建议 0.2 ~ 0.7。越低越稳定，越高越发散。</div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">评估阈值</label>
          <input
            type="number"
            min="0"
            max="1"
            step="0.05"
            value={form.min_confidence_to_persist}
            onChange={(e) => setField("min_confidence_to_persist", e.target.value)}
            className="w-full rounded-lg bg-hover border border-border px-3 py-2.5 outline-none focus:border-accent"
          />
          <div className="text-xs text-dim mt-1.5">低于该置信度的评估结果，不直接写入长期画像。</div>
        </div>

        <label className="flex items-center gap-3 rounded-lg bg-hover border border-border px-3 py-3 cursor-pointer">
          <input
            type="checkbox"
            checked={!!form.allow_registration}
            onChange={(e) => setField("allow_registration", e.target.checked)}
          />
          <div>
            <div className="text-sm font-medium">开放注册</div>
            <div className="text-xs text-dim mt-0.5">关闭后仅允许已有账号登录。</div>
          </div>
        </label>

        {message && <div className="text-sm text-green">{message}</div>}
        {error && <div className="text-sm text-red">{error}</div>}

        <div className="pt-1">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-accent text-white text-sm disabled:opacity-60"
          >
            {saving ? "保存中..." : "保存设置"}
          </button>
        </div>
      </form>
    </div>
  );
}
