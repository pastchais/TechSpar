import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Home, User, BookOpen, GitFork, Clock, Mic, Settings as SettingsIcon,
  Sun, Moon, LogOut, Menu, X,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const NAV_ITEMS = [
  { path: "/", label: "首页", icon: Home },
  { path: "/profile", label: "我的画像", icon: User },
  { path: "/knowledge", label: "题库", icon: BookOpen },
  { path: "/graph", label: "图谱", icon: GitFork },
  { path: "/history", label: "历史记录", icon: Clock },
  { path: "/recording", label: "录音复盘", icon: Mic },
  { path: "/settings", label: "设置", icon: SettingsIcon },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Close on route change
  useEffect(() => { setOpen(false); }, [location.pathname]);

  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");
  const isActive = (path) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const nav = (
    <aside className="flex h-full w-[224px] flex-col border-r border-border/80 bg-card/96 backdrop-blur-xl">
      <button
        type="button"
        className="shrink-0 border-none bg-transparent px-5 py-5 text-left"
        onClick={() => navigate("/")}
        aria-label="返回首页"
      >
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="TechSpar" className="h-9 w-9 rounded-xl object-contain" />
          <div>
            <div className="text-[16px] font-display font-bold tracking-[-0.02em] text-text">TechSpar</div>
            <div className="text-[11px] text-dim">Interview Training OS</div>
          </div>
        </div>
      </button>

      <nav className="flex flex-1 flex-col gap-1 px-3 pb-3 overflow-y-auto">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
          const active = isActive(path);
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-[13px] transition-all
                ${active
                  ? "border border-accent/20 bg-accent/10 font-medium text-text shadow-[0_12px_28px_-24px_rgba(245,158,11,0.55)]"
                  : "border border-transparent text-dim hover:border-border hover:bg-hover hover:text-text"
                }`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-accent/14 text-accent-light" : "bg-hover text-dim"}`}>
                <Icon size={16} className={active ? "text-accent-light" : ""} />
              </span>
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto shrink-0 border-t border-border/80 px-3 pb-4 pt-3 space-y-2">
        <button
          onClick={toggleTheme}
          className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3.5 py-2.5 text-[13px] text-dim transition-all hover:border-border hover:bg-hover hover:text-text"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-hover">
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </span>
          {theme === "dark" ? "浅色模式" : "深色模式"}
        </button>

        {user && (
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3.5 py-2.5 text-[13px] text-dim transition-all hover:border-border hover:bg-hover hover:text-text"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-hover">
              <LogOut size={16} />
            </span>
            <span className="truncate">{user.name || user.email}</span>
          </button>
        )}
      </div>
    </aside>
  );

  return (
    <>
      {/* Mobile topbar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-card border-b border-border shrink-0">
        <button
          type="button"
          className="flex items-center gap-2 bg-transparent border-none p-0 text-left"
          onClick={() => navigate("/")}
          aria-label="返回首页"
        >
          <img src="/favicon.svg" alt="TechSpar" className="w-7 h-7 rounded-lg object-contain" />
          <span className="text-base font-display font-bold text-text">TechSpar</span>
        </button>
        <button
          onClick={() => setOpen(o => !o)}
          className="w-9 h-9 rounded-lg bg-hover border border-border flex items-center justify-center"
          aria-label="菜单"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Desktop sidebar — always visible */}
      <div className="hidden md:flex shrink-0">
        {nav}
      </div>

      {/* Mobile sidebar — slide overlay */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="animate-fade-in">{nav}</div>
          <button
            type="button"
            className="flex-1 bg-black/50 border-none p-0"
            onClick={() => setOpen(false)}
            aria-label="关闭侧边栏"
          />
        </div>
      )}
    </>
  );
}
