import "dotenv/config";
import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { jwtVerify, type JWTPayload } from "jose";
import { retryGeneration, runGeneration } from "./index.js";
import { getSystemRequirements, loadSettings, saveSettings } from "./settings.js";
import type { AppSettings, GenerationManifestItem, ImageProvider } from "./types.js";
import { logError, logInfo, logWarn } from "./logger.js";

type AuthUser = {
  id: string;
  email: string;
  role: string;
};

type AuthedRequest = express.Request & { user?: AuthUser; requestId?: string };

type AuditLogEntry = {
  id: string;
  timestamp: string;
  action:
    | "auth.login"
    | "generate.success"
    | "generate.failed"
    | "retry.success"
    | "retry.failed"
    | "manifest.view"
    | "admin.logs.view"
    | "admin.settings.update";
  userId: string;
  email: string;
  ip: string;
  userAgent: string;
  details: Record<string, unknown>;
};

const app = express();
const port = Number(process.env.PORT || 8787);
const allowedOrigin = process.env.ALLOWED_ORIGIN || "http://localhost:5173";
const logPath = path.join(process.cwd(), "output", "audit-log.jsonl");

app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: "1mb" }));
app.use("/images", express.static(path.join(process.cwd(), "output", "images")));
app.use((req: AuthedRequest, res, next) => {
  const requestId = randomUUID();
  const start = Date.now();
  req.requestId = requestId;
  logInfo("http.request.start", {
    requestId,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip
  });
  res.on("finish", () => {
    logInfo("http.request.end", {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - start
    });
  });
  next();
});

function authEnabled() {
  return process.env.AUTH_ENABLED === "true";
}

function testLoginEnabled() {
  return process.env.TEST_LOGIN_ENABLED === "true";
}

function getTestLoginConfig() {
  return {
    email: process.env.TEST_LOGIN_EMAIL || "",
    password: process.env.TEST_LOGIN_PASSWORD || "",
    token: process.env.TEST_LOGIN_TOKEN || "dev-test-token"
  };
}

function parseAdminEmails() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isAdmin(user: AuthUser) {
  const admins = parseAdminEmails();
  return admins.includes(user.email.toLowerCase());
}

async function appendAuditLog(entry: AuditLogEntry) {
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8");
}

async function readAuditLogs(limit = 200): Promise<AuditLogEntry[]> {
  try {
    const raw = await fs.readFile(logPath, "utf8");
    const rows = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AuditLogEntry);

    return rows.slice(-limit).reverse();
  } catch {
    return [];
  }
}

async function authenticate(req: AuthedRequest): Promise<AuthUser | null> {
  if (!authEnabled()) {
    return {
      id: "local-dev",
      email: "local-dev@example.com",
      role: "dev"
    };
  }

  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("SUPABASE_JWT_SECRET is required when AUTH_ENABLED=true");
  }

  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    return null;
  }

  if (testLoginEnabled()) {
    const testCfg = getTestLoginConfig();
    if (token === testCfg.token && testCfg.email) {
      return {
        id: "test-login-user",
        email: testCfg.email,
        role: "authenticated"
      };
    }
  }

  const secret = new TextEncoder().encode(jwtSecret);

  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"]
    });

    const user = payloadToUser(payload);
    return user;
  } catch {
    return null;
  }
}

function payloadToUser(payload: JWTPayload): AuthUser | null {
  const id = typeof payload.sub === "string" ? payload.sub : "";
  const email = typeof payload.email === "string" ? payload.email : "";
  const role = typeof payload.role === "string" ? payload.role : "authenticated";

  if (!id || !email) {
    return null;
  }

  return { id, email, role };
}

async function requireAuth(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  try {
    const user = await authenticate(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Auth error";
    res.status(500).json({ error: message });
  }
}

function requireAdmin(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!isAdmin(req.user)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  next();
}

function getClientDetails(req: express.Request) {
  return {
    ip: req.ip || "unknown",
    userAgent: req.header("user-agent") || "unknown"
  };
}

function getDiscordWebhookUrl(): string | null {
  const primary = (process.env.DISCORD_NOTIFICATION || "").trim();
  if (primary.startsWith("http://") || primary.startsWith("https://")) {
    return primary;
  }

  if (primary === "true") {
    const fallback = (process.env.DISCORD_WEBHOOK_URL || "").trim();
    return fallback || null;
  }

  return null;
}

function getPublicBaseUrl(req: express.Request): string {
  const configured = (process.env.DISCORD_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || "").trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  return `${req.protocol}://${req.get("host") || "localhost:8787"}`;
}

async function sendDiscordMessage(payload: {
  content: string;
  embeds?: Array<Record<string, unknown>>;
}) {
  const webhookUrl = getDiscordWebhookUrl();
  if (!webhookUrl) {
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) {
      logWarn("discord.notify.failed", {
        status: response.status,
        statusText: response.statusText
      });
    }
  } catch (error) {
    logWarn("discord.notify.error", {
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function sendDiscordLoginNotification(req: express.Request, user: AuthUser) {
  await sendDiscordMessage({
    content: `Login: ${user.email}`,
    embeds: [
      {
        title: "User Login",
        description: `${user.email} logged in`,
        color: 0x8f1f5d,
        fields: [
          { name: "User ID", value: user.id, inline: true },
          { name: "Time", value: new Date().toISOString(), inline: true },
          { name: "IP", value: req.ip || "unknown", inline: true }
        ]
      }
    ]
  });
}

async function sendDiscordGenerationNotification(args: {
  req: express.Request;
  user: AuthUser;
  provider: ImageProvider;
  mode: "generate" | "retry";
  items: GenerationManifestItem[];
}) {
  const { req, user, provider, mode, items } = args;
  const baseUrl = getPublicBaseUrl(req);
  const cappedItems = items.slice(0, 5);
  const embeds = cappedItems.map((item) => ({
    title: item.title,
    description: `Provider: ${provider} | Model: ${item.model} | Attempt: ${item.attempt}`,
    url: `${baseUrl}${item.outputUrl}`,
    image: {
      url: `${baseUrl}${item.outputUrl}`
    },
    fields: [
      { name: "Slug", value: item.slug, inline: true },
      { name: "Retry Type", value: item.retryType, inline: true },
      { name: "Generated At", value: item.generatedAt, inline: true }
    ]
  }));

  const hiddenCount = items.length > cappedItems.length ? items.length - cappedItems.length : 0;
  await sendDiscordMessage({
    content:
      `${mode === "retry" ? "Retry Generated" : "Images Generated"} by ${user.email} ` +
      `(${provider}, ${items.length} item${items.length === 1 ? "" : "s"})` +
      (hiddenCount ? ` | ${hiddenCount} additional item(s) not shown` : ""),
    embeds
  });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/auth/mode", (_req, res) => {
  res.json({
    testLoginEnabled: testLoginEnabled(),
    authEnabled: authEnabled()
  });
});

app.get("/api/config/public", async (_req, res) => {
  try {
    const settings = await loadSettings();
    const openaiModel = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
    const pollinationsModel = process.env.POLLINATIONS_MODEL || "flux";
    res.json({
      appName: settings.appName,
      companyName: settings.companyName,
      uiTheme: settings.uiTheme,
      branding: settings.branding,
      generation: settings.generation,
      providerInfo: {
        openaiModel,
        pollinationsModel
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.get("/api/me", requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  res.json({
    user,
    isAdmin: isAdmin(user)
  });
});

app.post("/api/auth/test-login", async (req, res) => {
  if (!testLoginEnabled()) {
    res.status(404).json({ error: "Test login is disabled" });
    return;
  }

  const { email, password } = req.body as { email?: string; password?: string };
  const cfg = getTestLoginConfig();

  if (!cfg.email || !cfg.password) {
    res.status(500).json({ error: "Test login env is not fully configured" });
    return;
  }

  if (email !== cfg.email || password !== cfg.password) {
    logInfo("api.auth.test_login.failed", { email: email || "" });
    res.status(401).json({ error: "Invalid test login credentials" });
    return;
  }
  logInfo("api.auth.test_login.success", { email: cfg.email });

  res.json({
    token: cfg.token,
    user: {
      id: "test-login-user",
      email: cfg.email
    }
  });
});

app.post("/api/auth/login-event", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const user = req.user!;
    const details = getClientDetails(req);

    await appendAuditLog({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      action: "auth.login",
      userId: user.id,
      email: user.email,
      ip: details.ip,
      userAgent: details.userAgent,
      details: {
        source: "token"
      }
    });
    logInfo("api.auth.login_event", {
      requestId: req.requestId || "",
      userId: user.id,
      email: user.email
    });
    await sendDiscordLoginNotification(req, user);

    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.post("/api/generate", requireAuth, async (req: AuthedRequest, res) => {
  const user = req.user!;
  const details = getClientDetails(req);
  const requestId = req.requestId || randomUUID();
  const start = Date.now();
  let selectedProvider: ImageProvider = "openai";

  try {
    const { titles, provider } = req.body as { titles?: string[]; provider?: ImageProvider };
    if (!Array.isArray(titles) || titles.length === 0) {
      res.status(400).json({ error: "titles must be a non-empty array of strings" });
      return;
    }

    const cleaned = titles
      .map((t) => String(t).trim())
      .filter((t) => t.length > 0)
      .slice(0, 20);

    if (cleaned.length === 0) {
      res.status(400).json({ error: "No valid titles provided" });
      return;
    }

    const settings = await loadSettings();
    selectedProvider =
      provider === "openai" || provider === "pollinations"
        ? provider
        : settings.generation.defaultProvider;
    const manifest = await runGeneration({
      titles: cleaned,
      branding: settings.branding,
      provider: selectedProvider
    });
    logInfo("api.generate.success", {
      requestId,
      userId: user.id,
      email: user.email,
      provider: selectedProvider,
      titleCount: cleaned.length,
      durationMs: Date.now() - start
    });

    await appendAuditLog({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      action: "generate.success",
      userId: user.id,
      email: user.email,
      ip: details.ip,
      userAgent: details.userAgent,
      details: {
        titleCount: cleaned.length,
        titles: cleaned,
        outputSlugs: manifest.map((m) => m.slug),
        brandName: settings.branding.brandName,
        provider: selectedProvider
      }
    });
    await sendDiscordGenerationNotification({
      req,
      user,
      provider: selectedProvider,
      mode: "generate",
      items: manifest
    });

    res.json({ count: manifest.length, manifest });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logError("api.generate.error", {
      requestId,
      userId: user.id,
      email: user.email,
      durationMs: Date.now() - start,
      error: message
    });

    await appendAuditLog({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      action: "generate.failed",
      userId: user.id,
      email: user.email,
      ip: details.ip,
      userAgent: details.userAgent,
      details: {
        error: message
      }
    });
    res.status(500).json({ error: message });
  }
});

app.post("/api/generate/stream", requireAuth, async (req: AuthedRequest, res) => {
  const user = req.user!;
  const details = getClientDetails(req);
  const requestId = req.requestId || randomUUID();
  const start = Date.now();

  try {
    const { titles, provider } = req.body as { titles?: string[]; provider?: ImageProvider };
    if (!Array.isArray(titles) || titles.length === 0) {
      res.status(400).json({ error: "titles must be a non-empty array of strings" });
      return;
    }

    const cleaned = titles
      .map((t) => String(t).trim())
      .filter((t) => t.length > 0)
      .slice(0, 20);

    if (cleaned.length === 0) {
      res.status(400).json({ error: "No valid titles provided" });
      return;
    }

    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    const settings = await loadSettings();
    const selectedProvider: ImageProvider =
      provider === "openai" || provider === "pollinations"
        ? provider
        : settings.generation.defaultProvider;

    res.write(
      `${JSON.stringify({
        type: "start",
        requestId,
        provider: selectedProvider,
        total: cleaned.length
      })}\n`
    );

    const manifest = await runGeneration({
      titles: cleaned,
      branding: settings.branding,
      provider: selectedProvider,
      onItem: async (item) => {
        res.write(`${JSON.stringify({ type: "item", item })}\n`);
      }
    });

    await appendAuditLog({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      action: "generate.success",
      userId: user.id,
      email: user.email,
      ip: details.ip,
      userAgent: details.userAgent,
      details: {
        requestId,
        titleCount: cleaned.length,
        titles: cleaned,
        outputSlugs: manifest.map((m) => m.slug),
        brandName: settings.branding.brandName,
        provider: selectedProvider,
        mode: "stream"
      }
    });

    logInfo("api.generate.stream.success", {
      requestId,
      userId: user.id,
      email: user.email,
      provider: selectedProvider,
      titleCount: cleaned.length,
      durationMs: Date.now() - start
    });
    await sendDiscordGenerationNotification({
      req,
      user,
      provider: selectedProvider,
      mode: "generate",
      items: manifest
    });

    res.write(
      `${JSON.stringify({
        type: "done",
        requestId,
        provider: selectedProvider,
        count: manifest.length
      })}\n`
    );
    res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    await appendAuditLog({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      action: "generate.failed",
      userId: user.id,
      email: user.email,
      ip: details.ip,
      userAgent: details.userAgent,
      details: {
        requestId,
        mode: "stream",
        error: message
      }
    });

    logError("api.generate.stream.error", {
      requestId,
      userId: user.id,
      email: user.email,
      durationMs: Date.now() - start,
      error: message
    });

    res.write(`${JSON.stringify({ type: "error", requestId, error: message })}\n`);
    res.end();
  }
});

app.post("/api/retry", requireAuth, async (req: AuthedRequest, res) => {
  const user = req.user!;
  const details = getClientDetails(req);
  const requestId = req.requestId || randomUUID();
  const start = Date.now();

  try {
    const payload = req.body as {
      source?: {
        id?: string;
        title?: string;
        slug?: string;
        concept?: string;
        prompt?: string;
        provider?: ImageProvider;
      };
      mode?: "transport" | "creative";
      note?: string;
      provider?: ImageProvider;
    };

    const source = payload.source;
    if (!source?.id || !source.title || !source.slug || !source.concept || !source.prompt) {
      res.status(400).json({ error: "source with id/title/slug/concept/prompt is required" });
      return;
    }

    const mode = payload.mode === "creative" ? "creative" : "transport";
    const settings = await loadSettings();
    const provider: ImageProvider =
      payload.provider === "openai" || payload.provider === "pollinations"
        ? payload.provider
        : source.provider === "openai" || source.provider === "pollinations"
          ? source.provider
          : settings.generation.defaultProvider;

    const item = await retryGeneration({
      source: {
        id: source.id,
        title: source.title,
        slug: source.slug,
        concept: source.concept,
        prompt: source.prompt,
        provider
      },
      provider,
      branding: settings.branding,
      mode,
      note: payload.note
    });

    await appendAuditLog({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      action: "retry.success",
      userId: user.id,
      email: user.email,
      ip: details.ip,
      userAgent: details.userAgent,
      details: {
        requestId,
        sourceId: source.id,
        newId: item.id,
        mode,
        provider,
        attempt: item.attempt
      }
    });
    await sendDiscordGenerationNotification({
      req,
      user,
      provider,
      mode: "retry",
      items: [item]
    });

    logInfo("api.retry.success", {
      requestId,
      userId: user.id,
      email: user.email,
      provider,
      mode,
      sourceId: source.id,
      newId: item.id,
      durationMs: Date.now() - start
    });

    res.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await appendAuditLog({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      action: "retry.failed",
      userId: user.id,
      email: user.email,
      ip: details.ip,
      userAgent: details.userAgent,
      details: {
        requestId,
        error: message
      }
    });

    logError("api.retry.error", {
      requestId,
      userId: user.id,
      email: user.email,
      durationMs: Date.now() - start,
      error: message
    });
    res.status(500).json({ error: message });
  }
});

app.get("/api/manifest", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const user = req.user!;
    const details = getClientDetails(req);
    const manifestPath = path.join(process.cwd(), "output", "manifest.json");
    const raw = await fs.readFile(manifestPath, "utf8");

    await appendAuditLog({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      action: "manifest.view",
      userId: user.id,
      email: user.email,
      ip: details.ip,
      userAgent: details.userAgent,
      details: {}
    });

    res.type("application/json").send(raw);
  } catch {
    res.status(404).json({ error: "Manifest not found" });
  }
});

app.get("/api/admin/logs", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const user = req.user!;
    const details = getClientDetails(req);
    const logs = await readAuditLogs(250);

    await appendAuditLog({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      action: "admin.logs.view",
      userId: user.id,
      email: user.email,
      ip: details.ip,
      userAgent: details.userAgent,
      details: {
        returned: logs.length
      }
    });
    logInfo("api.admin.logs.success", {
      requestId: req.requestId || "",
      userId: user.id,
      email: user.email,
      returned: logs.length
    });

    res.json({ logs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.get("/api/admin/settings", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const settings = await loadSettings();
    const system = getSystemRequirements();
    logInfo("api.admin.settings.read", {
      requestId: (_req as AuthedRequest).requestId || ""
    });
    res.json({ settings, system });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.put("/api/admin/settings", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const user = req.user!;
    const details = getClientDetails(req);
    const payload = req.body as Partial<AppSettings>;
    const settings = await saveSettings(payload);

    await appendAuditLog({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      action: "admin.settings.update",
      userId: user.id,
      email: user.email,
      ip: details.ip,
      userAgent: details.userAgent,
      details: {
        appName: settings.appName,
        brandName: settings.branding.brandName
      }
    });
    logInfo("api.admin.settings.update.success", {
      requestId: req.requestId || "",
      userId: user.id,
      email: user.email,
      appName: settings.appName,
      providerDefault: settings.generation.defaultProvider
    });

    res.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.listen(port, () => {
  logInfo("server.started", {
    port,
    allowedOrigin,
    authEnabled: authEnabled(),
    testLoginEnabled: testLoginEnabled()
  });
  console.log(`API running on http://localhost:${port}`);
});
