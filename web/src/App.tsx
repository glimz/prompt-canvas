import { FormEvent, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "./supabase";

type ManifestItem = {
  id: string;
  parentId?: string;
  title: string;
  slug: string;
  attempt: number;
  retryType: "initial" | "transport" | "creative";
  promptRevisionNote?: string;
  outputFile: string;
  outputUrl?: string;
  provider?: "openai" | "pollinations";
  model?: string;
  prompt?: string;
  concept?: string;
};

type AuditLogEntry = {
  id: string;
  timestamp: string;
  action: string;
  email: string;
  ip: string;
  details: Record<string, unknown>;
};

type BrandStyle = {
  brandName: string;
  audience: string;
  visualStyle: string[];
  palette: string[];
  restrictions: string[];
  compositionRules: string[];
};

type UITheme = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  surfaceColor: string;
  backgroundFrom: string;
  backgroundTo: string;
};

type AppSettings = {
  appName: string;
  companyName: string;
  branding: BrandStyle;
  uiTheme: UITheme;
  generation: {
    defaultProvider: "openai" | "pollinations";
  };
};

type ProviderInfo = {
  openaiModel: string;
  pollinationsModel: string;
};

type SystemRequirements = {
  openAiKeySet: boolean;
  authEnabled: boolean;
  supabaseJwtSecretSet: boolean;
  allowedOriginSet: boolean;
  adminEmailsSet: boolean;
  ready: boolean;
};

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8787";

type AuthState = {
  token: string;
  email: string;
  source: "supabase" | "test-login";
};

type IconName =
  | "dashboard"
  | "admin"
  | "image"
  | "settings"
  | "logs"
  | "preview"
  | "download"
  | "empty"
  | "spark"
  | "check";

const fallbackTheme: UITheme = {
  primaryColor: "#8f1f5d",
  secondaryColor: "#5f4b56",
  accentColor: "#d6a6bf",
  surfaceColor: "#ffffff",
  backgroundFrom: "#fff9fc",
  backgroundTo: "#f2e4ec"
};

const fallbackBranding: BrandStyle = {
  brandName: "PromptCanvas Demo",
  audience: "women seeking evidence-based digital health support",
  visualStyle: [],
  palette: [],
  restrictions: [],
  compositionRules: []
};

function Icon({ name }: { name: IconName }) {
  const icons: Record<IconName, ReactNode> = {
    dashboard: (
      <path d="M3 3h8v8H3V3Zm10 0h8v5h-8V3ZM3 13h5v8H3v-8Zm7 4h11v4H10v-4Z" />
    ),
    admin: <path d="M12 2 3 6v6c0 5 3.8 9.7 9 10 5.2-.3 9-5 9-10V6l-9-4Zm0 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm0 13a7 7 0 0 1-5.8-3.1c.1-1.9 3.9-2.9 5.8-2.9s5.7 1 5.8 2.9A7 7 0 0 1 12 20Z" />,
    image: <path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm2 10 3-3 2 2 4-4 5 5v2H6v-2Zm2-6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />,
    settings: (
      <path d="M19.4 13a7.8 7.8 0 0 0 .1-2l2.1-1.6-2-3.5-2.5 1a7.9 7.9 0 0 0-1.7-1L15 3h-4l-.4 2.9a8 8 0 0 0-1.7 1l-2.5-1-2 3.5L6.5 11a7.8 7.8 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.9 7.9 0 0 0 1.7 1L11 21h4l.4-2.9a8 8 0 0 0 1.7-1l2.5 1 2-3.5-2.1-1.6ZM13 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z" />
    ),
    logs: <path d="M4 4h16v3H4V4Zm0 6h16v3H4v-3Zm0 6h10v3H4v-3Zm12.5 1.5L19 20l3-3" />,
    preview: <path d="M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z" />,
    download: <path d="M12 3v10m0 0 4-4m-4 4-4-4M4 18v3h16v-3" />,
    empty: <path d="M4 5h16l-2 13H6L4 5Zm4-2h8l1 2H7l1-2Z" />,
    spark: <path d="m12 2 1.8 4.2L18 8l-4.2 1.8L12 14l-1.8-4.2L6 8l4.2-1.8L12 2Zm7 11 .8 2.2L22 16l-2.2.8L19 19l-.8-2.2L16 16l2.2-.8.8-2.2ZM5 13l.8 2.2L8 16l-2.2.8L5 19l-.8-2.2L2 16l2.2-.8L5 13Z" />,
    check: <path d="M3 12.5 9 18l12-12" />
  };

  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name]}
    </svg>
  );
}

function TitleWithIcon({ icon, title, subtitle }: { icon: IconName; title: string; subtitle?: string }) {
  return (
    <div>
      <div className="title-row">
        <Icon name={icon} />
        <h2>{title}</h2>
      </div>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  );
}

function EmptyState({ icon, title, description }: { icon: IconName; title: string; description: string }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon name={icon} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function toLines(list: string[]) {
  return list.join("\n");
}

function fromLines(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [session, setSession] = useState<Session | null>(null);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [titlesText, setTitlesText] = useState(
    "Understanding Endometriosis Pain: What Your Body Is Telling You\nPMS or PMDD? How to Recognize the Difference"
  );
  const [loading, setLoading] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ completed: number; total: number }>({
    completed: 0,
    total: 0
  });
  const [retryingItemId, setRetryingItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ManifestItem[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [testLoginEnabled, setTestLoginEnabled] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ManifestItem | null>(null);
  const [publicSettings, setPublicSettings] = useState<AppSettings>({
    appName: "PromptCanvas",
    companyName: "PromptCanvas Demo",
    branding: fallbackBranding,
    uiTheme: fallbackTheme,
    generation: {
      defaultProvider: "openai"
    }
  });
  const [providerInfo, setProviderInfo] = useState<ProviderInfo>({
    openaiModel: "gpt-image-1",
    pollinationsModel: "flux"
  });

  const [adminSettings, setAdminSettings] = useState<AppSettings | null>(null);
  const [systemRequirements, setSystemRequirements] = useState<SystemRequirements | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<"openai" | "pollinations">("openai");

  const [logActionFilter, setLogActionFilter] = useState("all");
  const [logSearchFilter, setLogSearchFilter] = useState("");
  const [logFromDate, setLogFromDate] = useState("");
  const [logLimit, setLogLimit] = useState(100);

  const parsedTitles = useMemo(
    () =>
      titlesText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    [titlesText]
  );

  const logActions = useMemo(() => {
    const unique = new Set(logs.map((log) => log.action));
    return ["all", ...Array.from(unique)];
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const search = logSearchFilter.trim().toLowerCase();
    const fromTs = logFromDate ? new Date(logFromDate).getTime() : null;

    return logs
      .filter((log) => (logActionFilter === "all" ? true : log.action === logActionFilter))
      .filter((log) => {
        if (!search) {
          return true;
        }
        const details = JSON.stringify(log.details).toLowerCase();
        return log.email.toLowerCase().includes(search) || log.ip.toLowerCase().includes(search) || details.includes(search);
      })
      .filter((log) => {
        if (!fromTs) {
          return true;
        }
        const ts = new Date(log.timestamp).getTime();
        return !Number.isNaN(ts) && ts >= fromTs;
      })
      .slice(0, logLimit);
  }, [logs, logActionFilter, logSearchFilter, logFromDate, logLimit]);

  useEffect(() => {
    void loadAuthMode();
    void loadPublicConfig();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.access_token) {
      if (!auth || auth.source !== "supabase") {
        setIsAdmin(false);
      }
      return;
    }

    setAuth({
      token: session.access_token,
      email: session.user.email || "unknown",
      source: "supabase"
    });
  }, [session?.access_token, session?.user.email]);

  useEffect(() => {
    if (!auth?.token) {
      setIsAdmin(false);
      return;
    }

    void notifyLogin(auth.token);
    void loadCurrentUser(auth.token);
  }, [auth?.token]);

  useEffect(() => {
    if (!auth && location.pathname !== "/login") {
      navigate("/login", { replace: true });
      return;
    }

    if (auth && location.pathname === "/login") {
      navigate("/dashboard", { replace: true });
      return;
    }

    if (auth && !isAdmin && location.pathname.startsWith("/admin")) {
      navigate("/dashboard", { replace: true });
    }
  }, [auth, isAdmin, location.pathname, navigate]);

  useEffect(() => {
    if (location.pathname.startsWith("/admin") && auth?.token && isAdmin) {
      void loadAdminLogs();
      void loadAdminSettings(auth.token);
    }
  }, [location.pathname, auth?.token, isAdmin]);

  useEffect(() => {
    if (!selectedItem) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedItem(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedItem]);

  async function loadAuthMode() {
    try {
      const res = await fetch(`${API_BASE}/api/auth/mode`);
      if (!res.ok) {
        return;
      }
      const body = (await res.json()) as { testLoginEnabled?: boolean };
      setTestLoginEnabled(Boolean(body.testLoginEnabled));
    } catch {
      // Non-blocking.
    }
  }

  async function loadPublicConfig() {
    try {
      const res = await fetch(`${API_BASE}/api/config/public`);
      if (!res.ok) {
        return;
      }
      const body = (await res.json()) as Partial<AppSettings> & { providerInfo?: ProviderInfo };
      if (!body.appName || !body.companyName || !body.uiTheme || !body.branding || !body.generation) {
        return;
      }
      const typed = body as AppSettings;
      setPublicSettings(typed);
      setSelectedProvider(typed.generation.defaultProvider);
      if (body.providerInfo) {
        setProviderInfo(body.providerInfo);
      }
    } catch {
      // Non-blocking.
    }
  }

  async function notifyLogin(token: string) {
    await fetch(`${API_BASE}/api/auth/login-event`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  async function loadCurrentUser(token: string) {
    try {
      const res = await fetch(`${API_BASE}/api/me`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) {
        return;
      }

      const body = (await res.json()) as { isAdmin: boolean };
      setIsAdmin(Boolean(body.isAdmin));

      if (body.isAdmin) {
        await loadAdminSettings(token);
      }
    } catch {
      // Non-blocking.
    }
  }

  async function loadAdminSettings(token: string) {
    try {
      const res = await fetch(`${API_BASE}/api/admin/settings`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) {
        return;
      }

      const body = (await res.json()) as {
        settings: AppSettings;
        system: SystemRequirements;
      };

      setAdminSettings(body.settings);
      setSystemRequirements(body.system);
    } catch {
      // Non-blocking.
    }
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) {
        setError(signInError.message);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-in request failed";
      setError(`${message}. Check VITE_SUPABASE_URL and Supabase auth reachability.`);
    }
  }

  async function signUp() {
    setError(null);
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      setError("Sign-up successful. Confirm email if your Supabase config requires it.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-up request failed";
      setError(`${message}. Check VITE_SUPABASE_URL and Supabase auth reachability.`);
    }
  }

  async function testLogin() {
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/auth/test-login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      const body = (await res.json()) as { error?: string; token?: string; user?: { email?: string } };

      if (!res.ok || !body.token) {
        throw new Error(body.error || "Test login failed");
      }

      setAuth({
        token: body.token,
        email: body.user?.email || email,
        source: "test-login"
      });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Test login failed";
      setError(message);
    }
  }

  async function signOut() {
    if (auth?.source === "supabase") {
      await supabase.auth.signOut();
    }

    setAuth(null);
    setSession(null);
    setItems([]);
    setLogs([]);
    setIsAdmin(false);
    setSelectedItem(null);
    navigate("/login", { replace: true });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!auth?.token) {
      setError("Please sign in first.");
      return;
    }

    setLoading(true);
    setGenerationProgress({ completed: 0, total: 0 });
    setItems([]);
    setSelectedItem(null);

    try {
      const res = await fetch(`${API_BASE}/api/generate/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.token}`
        },
        body: JSON.stringify({ titles: parsedTitles, provider: selectedProvider })
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error || "Generation failed");
      }

      if (!res.body) {
        throw new Error("No stream body returned");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }
          const eventData = JSON.parse(line) as
            | { type: "start"; total: number }
            | { type: "item"; item: ManifestItem }
            | { type: "done"; count: number }
            | { type: "error"; error: string };

          if (eventData.type === "start") {
            setGenerationProgress({ completed: 0, total: eventData.total });
            continue;
          }
          if (eventData.type === "item") {
            setItems((prev) => [...prev, eventData.item]);
            setGenerationProgress((prev) => ({
              completed: prev.completed + 1,
              total: prev.total
            }));
            continue;
          }
          if (eventData.type === "error") {
            throw new Error(eventData.error || "Generation stream failed");
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function loadAdminLogs() {
    if (!auth?.token || !isAdmin) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/admin/logs`, {
        headers: {
          Authorization: `Bearer ${auth.token}`
        }
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error || "Failed to load admin logs");
      }

      const body = (await res.json()) as { logs: AuditLogEntry[] };
      setLogs(body.logs || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    }
  }

  async function retryItem(item: ManifestItem, mode: "transport" | "creative") {
    if (!auth?.token) {
      setError("Please sign in first.");
      return;
    }

    let note = "";
    if (mode === "creative") {
      note = window.prompt(
        "Add refinement note for this retry (optional):",
        "Increase subject clarity, reduce visual clutter, and enforce stronger palette consistency."
      ) || "";
    }

    setRetryingItemId(item.id);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/retry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.token}`
        },
        body: JSON.stringify({
          source: {
            id: item.id,
            title: item.title,
            slug: item.slug,
            concept: item.concept,
            prompt: item.prompt,
            provider: item.provider
          },
          mode,
          note,
          provider: selectedProvider
        })
      });

      const body = (await res.json()) as { error?: string; item?: ManifestItem };
      if (!res.ok || !body.item) {
        throw new Error(body.error || "Retry failed");
      }

      setItems((prev) => [body.item!, ...prev]);
      setSelectedItem(body.item);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Retry failed";
      setError(message);
    } finally {
      setRetryingItemId(null);
    }
  }

  async function downloadManifest() {
    if (!auth?.token) {
      setError("Please sign in first.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/manifest`, {
        headers: {
          Authorization: `Bearer ${auth.token}`
        }
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error || "Manifest fetch failed");
      }

      const text = await res.text();
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "manifest.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    }
  }

  async function saveAdminSettings() {
    if (!auth?.token || !adminSettings) {
      return;
    }

    setSettingsSaving(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/admin/settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.token}`
        },
        body: JSON.stringify(adminSettings)
      });

      const body = (await res.json()) as { error?: string; settings?: AppSettings };

      if (!res.ok || !body.settings) {
        throw new Error(body.error || "Failed to save settings");
      }

      setAdminSettings(body.settings);
      setPublicSettings(body.settings);
      setSelectedProvider(body.settings.generation.defaultProvider);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save settings";
      setError(message);
    } finally {
      setSettingsSaving(false);
    }
  }

  function updateAdminBrandingField<K extends keyof BrandStyle>(key: K, value: BrandStyle[K]) {
    setAdminSettings((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        branding: {
          ...prev.branding,
          [key]: value
        }
      };
    });
  }

  function updateAdminThemeField<K extends keyof UITheme>(key: K, value: UITheme[K]) {
    setAdminSettings((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        uiTheme: {
          ...prev.uiTheme,
          [key]: value
        }
      };
    });
  }

  const theme = publicSettings.uiTheme || fallbackTheme;
  const shellStyle = {
    "--pc-primary": theme.primaryColor,
    "--pc-secondary": theme.secondaryColor,
    "--pc-accent": theme.accentColor,
    "--pc-surface": theme.surfaceColor,
    "--pc-bg-from": theme.backgroundFrom,
    "--pc-bg-to": theme.backgroundTo
  } as CSSProperties;

  return (
    <main className="shell" style={shellStyle}>
      <Routes>
        <Route
          path="/login"
          element={
            auth ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <section className="panel auth-panel">
                <div className="title-row">
                  <Icon name="spark" />
                  <h1>{publicSettings.appName}</h1>
                </div>
                <p>
                  {publicSettings.companyName} demo. Sign in with Supabase, or use test login if enabled.
                </p>
                <form onSubmit={signIn}>
                  <label htmlFor="email">Email</label>
                  <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

                  <label htmlFor="password">Password</label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />

                  <div className="row">
                    <button type="submit">Sign In</button>
                    {!testLoginEnabled ? (
                      <button type="button" className="secondary" onClick={signUp}>
                        Sign Up
                      </button>
                    ) : null}
                    {testLoginEnabled ? (
                      <button type="button" className="secondary" onClick={testLogin}>
                        Test Login
                      </button>
                    ) : null}
                  </div>
                </form>
                {error ? <p className="error">{error}</p> : null}
              </section>
            )
          }
        />

        <Route
          path="/*"
          element={
            !auth ? (
              <Navigate to="/login" replace />
            ) : (
              <div className="app-layout">
                <aside className="sidebar panel">
                  <div className="title-row">
                    <Icon name="spark" />
                    <h2>{publicSettings.appName}</h2>
                  </div>
                  <p className="sidebar-sub">{publicSettings.companyName}</p>
                  <nav className="sidebar-nav">
                    <NavLink to="/dashboard" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
                      <Icon name="dashboard" />
                      <span>Dashboard</span>
                    </NavLink>
                    {isAdmin ? (
                      <NavLink to="/admin" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
                        <Icon name="admin" />
                        <span>Admin</span>
                      </NavLink>
                    ) : null}
                  </nav>
                  <div className="sidebar-meta">
                    <p>
                      {auth.email} ({auth.source})
                    </p>
                    <button type="button" className="secondary" onClick={signOut}>
                      Sign Out
                    </button>
                  </div>
                </aside>

                <section className="content">
                  {error ? <p className="error">{error}</p> : null}
                  <Routes>
                    <Route
                      path="/dashboard"
                      element={
                        <>
                          <section className="panel dashboard-hero">
                            <div className="preview-header">
                              <TitleWithIcon
                                icon="spark"
                                title="Content Generation"
                                subtitle={`Active prompt branding: ${publicSettings.branding.brandName}`}
                              />
                              <button type="button" className="secondary" onClick={downloadManifest}>
                                <Icon name="download" />
                                <span>Download Manifest</span>
                              </button>
                            </div>

                            <form onSubmit={onSubmit}>
                              <label htmlFor="titles">Blog titles (one per line)</label>
                              <textarea
                                id="titles"
                                value={titlesText}
                                onChange={(e) => setTitlesText(e.target.value)}
                                rows={8}
                              />
                              <label htmlFor="providerSelect">Image Provider</label>
                              <select
                                id="providerSelect"
                                value={selectedProvider}
                                onChange={(e) =>
                                  setSelectedProvider(e.target.value === "pollinations" ? "pollinations" : "openai")
                                }
                              >
                                <option value="openai">OpenAI</option>
                                <option value="pollinations">Pollinations</option>
                              </select>
                              <p className="provider-hint">
                                Active model:{" "}
                                <strong>
                                  {selectedProvider === "openai"
                                    ? providerInfo.openaiModel
                                    : providerInfo.pollinationsModel}
                                </strong>
                                {selectedProvider === "openai" && providerInfo.openaiModel === "dall-e-2"
                                  ? " - lower-cost test mode, expect less consistency than newer models."
                                  : " - quality and style may vary by provider/model."}
                              </p>
                              <button type="submit" disabled={loading || parsedTitles.length === 0}>
                                <Icon name="image" />
                                <span>
                                  {loading
                                    ? `Generating ${generationProgress.completed}/${generationProgress.total || parsedTitles.length}...`
                                    : "Generate Images"}
                                </span>
                              </button>
                            </form>
                          </section>

                          {items.length > 0 ? (
                            <section className="panel media-panel">
                              <TitleWithIcon icon="image" title="Generated Images" />
                              <div className="grid">
                                {items.map((item) => (
                                  <article key={item.slug}>
                                    <img
                                      src={`${API_BASE}${item.outputUrl || `/images/${item.slug}.png`}`}
                                      alt={item.title}
                                      loading="lazy"
                                    />
                                    <p>{item.title}</p>
                                    <p className="muted-line">
                                      Provider: {item.provider || "openai"} | Attempt: {item.attempt || 1} | Type: {item.retryType || "initial"}
                                    </p>
                                    {item.model ? <p className="muted-line">Model: {item.model}</p> : null}
                                    <div className="row">
                                      <button type="button" className="secondary" onClick={() => setSelectedItem(item)}>
                                        <Icon name="preview" />
                                        <span>Preview</span>
                                      </button>
                                      <a
                                        className="link-btn"
                                        href={`${API_BASE}${item.outputUrl || `/images/${item.slug}.png`}`}
                                        download={`${item.slug}`}
                                      >
                                        <Icon name="download" />
                                        <span>Download</span>
                                      </a>
                                      <button
                                        type="button"
                                        className="secondary"
                                        disabled={retryingItemId === item.id}
                                        onClick={() => void retryItem(item, "transport")}
                                      >
                                        <span>{retryingItemId === item.id ? "Retrying..." : "Retry Same Prompt"}</span>
                                      </button>
                                      <button
                                        type="button"
                                        className="secondary"
                                        disabled={retryingItemId === item.id}
                                        onClick={() => void retryItem(item, "creative")}
                                      >
                                        <span>{retryingItemId === item.id ? "Refining..." : "Refine + Retry"}</span>
                                      </button>
                                    </div>
                                  </article>
                                ))}
                              </div>
                            </section>
                          ) : (
                            <section className="panel">
                              <EmptyState
                                icon="empty"
                                title="No Images Yet"
                                description="Generate your first batch to preview and compare outputs before downloading."
                              />
                            </section>
                          )}

                          <section className="panel">
                            <EmptyState
                              icon="preview"
                              title="Preview on Click"
                              description="Click Preview on any image card to open a full modal preview."
                            />
                          </section>
                        </>
                      }
                    />

                    <Route
                      path="/admin"
                      element={
                        isAdmin && adminSettings ? (
                          <>
                            <section className="panel admin-hero">
                              <TitleWithIcon
                                icon="admin"
                                title="Admin"
                                subtitle="Manage operations, readiness, branding, and visual system controls."
                              />
                            </section>

                            <section className="panel admin-settings-panel">
                              <div className="admin-grid">
                                <section className="subpanel status-panel">
                                  <TitleWithIcon icon="check" title="System Requirements" />
                                  {systemRequirements ? (
                                    <ul className="status-list">
                                      <li>
                                        <span>OpenAI API key</span>
                                        <strong>{systemRequirements.openAiKeySet ? "Set" : "Missing"}</strong>
                                      </li>
                                      <li>
                                        <span>Auth enabled</span>
                                        <strong>{systemRequirements.authEnabled ? "Yes" : "No"}</strong>
                                      </li>
                                      <li>
                                        <span>Supabase JWT secret</span>
                                        <strong>{systemRequirements.supabaseJwtSecretSet ? "Set" : "Missing"}</strong>
                                      </li>
                                      <li>
                                        <span>Allowed origin</span>
                                        <strong>{systemRequirements.allowedOriginSet ? "Set" : "Missing"}</strong>
                                      </li>
                                      <li>
                                        <span>Admin emails</span>
                                        <strong>{systemRequirements.adminEmailsSet ? "Set" : "Missing"}</strong>
                                      </li>
                                      <li>
                                        <span>App ready</span>
                                        <strong>{systemRequirements.ready ? "Yes" : "No"}</strong>
                                      </li>
                                    </ul>
                                  ) : (
                                    <EmptyState
                                      icon="empty"
                                      title="System status unavailable"
                                      description="Unable to load readiness checks from the backend."
                                    />
                                  )}
                                </section>

                                <section className="subpanel">
                                  <TitleWithIcon icon="settings" title="App Branding" />
                                  <label htmlFor="appName">App Name</label>
                                  <input
                                    id="appName"
                                    value={adminSettings.appName}
                                    onChange={(e) =>
                                      setAdminSettings((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              appName: e.target.value
                                            }
                                          : prev
                                      )
                                    }
                                  />

                                  <label htmlFor="companyName">Company Name</label>
                                  <input
                                    id="companyName"
                                    value={adminSettings.companyName}
                                    onChange={(e) =>
                                      setAdminSettings((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              companyName: e.target.value
                                            }
                                          : prev
                                      )
                                    }
                                  />

                                  <label htmlFor="brandName">Prompt Brand Name</label>
                                  <input
                                    id="brandName"
                                    value={adminSettings.branding.brandName}
                                    onChange={(e) => updateAdminBrandingField("brandName", e.target.value)}
                                  />

                                  <label htmlFor="audience">Audience</label>
                                  <input
                                    id="audience"
                                    value={adminSettings.branding.audience}
                                    onChange={(e) => updateAdminBrandingField("audience", e.target.value)}
                                  />

                                  <label htmlFor="defaultProvider">Default Image Provider</label>
                                  <select
                                    id="defaultProvider"
                                    value={adminSettings.generation.defaultProvider}
                                    onChange={(e) =>
                                      setAdminSettings((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              generation: {
                                                ...prev.generation,
                                                defaultProvider:
                                                  e.target.value === "pollinations" ? "pollinations" : "openai"
                                              }
                                            }
                                          : prev
                                      )
                                    }
                                  >
                                    <option value="openai">OpenAI</option>
                                    <option value="pollinations">Pollinations</option>
                                  </select>
                                </section>

                                <section className="subpanel">
                                  <TitleWithIcon icon="spark" title="Prompt Style Lists" />
                                  <label htmlFor="visualStyle">Visual Style (one per line)</label>
                                  <textarea
                                    id="visualStyle"
                                    rows={6}
                                    value={toLines(adminSettings.branding.visualStyle)}
                                    onChange={(e) => updateAdminBrandingField("visualStyle", fromLines(e.target.value))}
                                  />

                                  <label htmlFor="palette">Palette (one per line)</label>
                                  <textarea
                                    id="palette"
                                    rows={5}
                                    value={toLines(adminSettings.branding.palette)}
                                    onChange={(e) => updateAdminBrandingField("palette", fromLines(e.target.value))}
                                  />

                                  <label htmlFor="compositionRules">Composition Rules (one per line)</label>
                                  <textarea
                                    id="compositionRules"
                                    rows={5}
                                    value={toLines(adminSettings.branding.compositionRules)}
                                    onChange={(e) =>
                                      updateAdminBrandingField("compositionRules", fromLines(e.target.value))
                                    }
                                  />

                                  <label htmlFor="restrictions">Restrictions (one per line)</label>
                                  <textarea
                                    id="restrictions"
                                    rows={5}
                                    value={toLines(adminSettings.branding.restrictions)}
                                    onChange={(e) => updateAdminBrandingField("restrictions", fromLines(e.target.value))}
                                  />
                                </section>

                                <section className="subpanel">
                                  <TitleWithIcon icon="settings" title="UI Theme" />
                                  <label htmlFor="primaryColor">Primary Color</label>
                                  <input
                                    id="primaryColor"
                                    value={adminSettings.uiTheme.primaryColor}
                                    onChange={(e) => updateAdminThemeField("primaryColor", e.target.value)}
                                  />

                                  <label htmlFor="secondaryColor">Secondary Color</label>
                                  <input
                                    id="secondaryColor"
                                    value={adminSettings.uiTheme.secondaryColor}
                                    onChange={(e) => updateAdminThemeField("secondaryColor", e.target.value)}
                                  />

                                  <label htmlFor="accentColor">Accent Color</label>
                                  <input
                                    id="accentColor"
                                    value={adminSettings.uiTheme.accentColor}
                                    onChange={(e) => updateAdminThemeField("accentColor", e.target.value)}
                                  />

                                  <label htmlFor="surfaceColor">Surface Color</label>
                                  <input
                                    id="surfaceColor"
                                    value={adminSettings.uiTheme.surfaceColor}
                                    onChange={(e) => updateAdminThemeField("surfaceColor", e.target.value)}
                                  />

                                  <label htmlFor="backgroundFrom">Background From</label>
                                  <input
                                    id="backgroundFrom"
                                    value={adminSettings.uiTheme.backgroundFrom}
                                    onChange={(e) => updateAdminThemeField("backgroundFrom", e.target.value)}
                                  />

                                  <label htmlFor="backgroundTo">Background To</label>
                                  <input
                                    id="backgroundTo"
                                    value={adminSettings.uiTheme.backgroundTo}
                                    onChange={(e) => updateAdminThemeField("backgroundTo", e.target.value)}
                                  />
                                </section>

                                <section className="subpanel full-span">
                                  <div className="row">
                                    <button type="button" onClick={saveAdminSettings} disabled={settingsSaving}>
                                      <Icon name="settings" />
                                      <span>{settingsSaving ? "Saving..." : "Save Settings"}</span>
                                    </button>
                                  </div>
                                </section>
                              </div>
                            </section>

                            <section className="panel">
                              <div className="preview-header">
                                <TitleWithIcon icon="logs" title="Admin Activity Logs" />
                                <button type="button" className="secondary" onClick={loadAdminLogs}>
                                  Refresh Logs
                                </button>
                              </div>

                              <div className="log-filters">
                                <label>
                                  Action
                                  <select value={logActionFilter} onChange={(e) => setLogActionFilter(e.target.value)}>
                                    {logActions.map((action) => (
                                      <option key={action} value={action}>
                                        {action}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  Search
                                  <input
                                    value={logSearchFilter}
                                    onChange={(e) => setLogSearchFilter(e.target.value)}
                                    placeholder="email, ip, details"
                                  />
                                </label>
                                <label>
                                  From date
                                  <input type="date" value={logFromDate} onChange={(e) => setLogFromDate(e.target.value)} />
                                </label>
                                <label>
                                  Rows
                                  <input
                                    type="number"
                                    min={10}
                                    max={500}
                                    step={10}
                                    value={logLimit}
                                    onChange={(e) => setLogLimit(Number(e.target.value) || 100)}
                                  />
                                </label>
                              </div>

                              {filteredLogs.length > 0 ? (
                                <div className="logs-table-wrap">
                                  <table className="logs-table">
                                    <thead>
                                      <tr>
                                        <th>Time</th>
                                        <th>Action</th>
                                        <th>User</th>
                                        <th>IP</th>
                                        <th>Details</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {filteredLogs.map((log) => (
                                        <tr key={log.id}>
                                          <td>{new Date(log.timestamp).toLocaleString()}</td>
                                          <td><code>{log.action}</code></td>
                                          <td>{log.email}</td>
                                          <td>{log.ip}</td>
                                          <td>
                                            <details>
                                              <summary>View</summary>
                                              <pre>{JSON.stringify(log.details, null, 2)}</pre>
                                            </details>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <EmptyState
                                  icon="empty"
                                  title="No matching logs"
                                  description="Try adjusting your filters or generate activity to populate audit records."
                                />
                              )}
                            </section>
                          </>
                        ) : (
                          <Navigate to="/dashboard" replace />
                        )
                      }
                    />

                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                </section>
              </div>
            )
          }
        />
      </Routes>
      {selectedItem ? (
        <div className="modal-overlay" onClick={() => setSelectedItem(null)}>
          <section className="panel preview-panel modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="preview-header">
              <TitleWithIcon icon="preview" title="Preview" />
              <button type="button" className="secondary" onClick={() => setSelectedItem(null)}>
                Close
              </button>
            </div>
            <img
              className="preview-image"
              src={`${API_BASE}${selectedItem.outputUrl || `/images/${selectedItem.slug}.png`}`}
              alt={selectedItem.title}
            />
            <p>{selectedItem.title}</p>
            {selectedItem.provider ? <p>Provider: {selectedItem.provider}</p> : null}
            <p>Attempt: {selectedItem.attempt || 1}</p>
            <p>Retry Type: {selectedItem.retryType || "initial"}</p>
            {selectedItem.promptRevisionNote ? <p>Revision note: {selectedItem.promptRevisionNote}</p> : null}
            {selectedItem.concept ? <p>Concept: {selectedItem.concept}</p> : null}
            {selectedItem.prompt ? <pre>{selectedItem.prompt}</pre> : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}
