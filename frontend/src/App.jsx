import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";

const Sidebar = lazy(() => import("./components/Sidebar"));
const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));
const Home = lazy(() => import("./pages/Home"));
const Interview = lazy(() => import("./pages/Interview"));
const Review = lazy(() => import("./pages/Review"));
const History = lazy(() => import("./pages/History"));
const Profile = lazy(() => import("./pages/Profile"));
const Knowledge = lazy(() => import("./pages/Knowledge"));
const TopicDetail = lazy(() => import("./pages/TopicDetail"));
const Graph = lazy(() => import("./pages/Graph"));
const RecordingAnalysis = lazy(() => import("./pages/RecordingAnalysis"));
const Settings = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));

function ProtectedRoute({ children }) {
  const { token, loading } = useAuth();
  if (loading) return null;
  if (!token) return <Navigate to="/" replace />;
  return children;
}

function PublicHome() {
  const { token, loading } = useAuth();
  if (loading) return null;
  if (token)
    return (
      <AppShell>
        <Home />
      </AppShell>
    );
  return <Landing />;
}

function AuthPage() {
  const { token, loading } = useAuth();
  if (loading) return null;
  if (token) return <Navigate to="/" replace />;
  return <Login />;
}

function AppShell({ children }) {
  return (
    <div className="flex flex-col md:flex-row h-screen">
      <Suspense fallback={<div className="hidden md:block w-[200px] shrink-0 border-r border-border bg-card" />}>
        <Sidebar />
      </Suspense>
      <main className="flex-1 overflow-y-auto flex flex-col">{children}</main>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PublicHome />} />
      <Route path="/login" element={<AuthPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppShell>
              <Routes>
                <Route path="/interview/:sessionId" element={<Interview />} />
                <Route path="/review/:sessionId" element={<Review />} />
                <Route path="/history" element={<History />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/profile/topic/:topic" element={<TopicDetail />} />
                <Route path="/knowledge" element={<Knowledge />} />
                <Route path="/graph" element={<Graph />} />
                <Route path="/recording" element={<RecordingAnalysis />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AppShell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ErrorBoundary>
          <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-dim">加载中...</div>}>
            <AppRoutes />
          </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
