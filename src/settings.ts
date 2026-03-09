import fs from "node:fs/promises";
import path from "node:path";
import { getDefaultSettings } from "./brand.js";
import type {
  AppSettings,
  BrandStyle,
  GenerationSettings,
  ImageProvider,
  SystemRequirements,
  UITheme
} from "./types.js";

const settingsPath = path.join(process.cwd(), "output", "settings.json");

function sanitizeList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((v) => String(v).trim())
    .filter(Boolean);
}

function mergeBranding(input: Partial<BrandStyle> | undefined, fallback: BrandStyle): BrandStyle {
  return {
    brandName: String(input?.brandName || fallback.brandName),
    audience: String(input?.audience || fallback.audience),
    visualStyle: sanitizeList(input?.visualStyle).length
      ? sanitizeList(input?.visualStyle)
      : fallback.visualStyle,
    palette: sanitizeList(input?.palette).length ? sanitizeList(input?.palette) : fallback.palette,
    restrictions: sanitizeList(input?.restrictions).length
      ? sanitizeList(input?.restrictions)
      : fallback.restrictions,
    compositionRules: sanitizeList(input?.compositionRules).length
      ? sanitizeList(input?.compositionRules)
      : fallback.compositionRules
  };
}

function mergeTheme(input: Partial<UITheme> | undefined, fallback: UITheme): UITheme {
  return {
    primaryColor: String(input?.primaryColor || fallback.primaryColor),
    secondaryColor: String(input?.secondaryColor || fallback.secondaryColor),
    accentColor: String(input?.accentColor || fallback.accentColor),
    surfaceColor: String(input?.surfaceColor || fallback.surfaceColor),
    backgroundFrom: String(input?.backgroundFrom || fallback.backgroundFrom),
    backgroundTo: String(input?.backgroundTo || fallback.backgroundTo)
  };
}

function mergeGeneration(
  input: Partial<GenerationSettings> | undefined,
  fallback: GenerationSettings
): GenerationSettings {
  const provider: ImageProvider =
    input?.defaultProvider === "pollinations" || input?.defaultProvider === "openai"
      ? input.defaultProvider
      : fallback.defaultProvider;
  return { defaultProvider: provider };
}

function mergeSettings(input: Partial<AppSettings>, fallback: AppSettings): AppSettings {
  return {
    appName: String(input.appName || fallback.appName),
    companyName: String(input.companyName || fallback.companyName),
    branding: mergeBranding(input.branding, fallback.branding),
    uiTheme: mergeTheme(input.uiTheme, fallback.uiTheme),
    generation: mergeGeneration(input.generation, fallback.generation)
  };
}

export async function loadSettings(): Promise<AppSettings> {
  const defaults = getDefaultSettings();

  try {
    const raw = await fs.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return mergeSettings(parsed, defaults);
  } catch {
    return defaults;
  }
}

export async function saveSettings(input: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  const merged = mergeSettings(input, current);

  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(merged, null, 2), "utf8");

  return merged;
}

export function getSystemRequirements(): SystemRequirements {
  const openAiKeySet = Boolean(process.env.OPENAI_API_KEY);
  const authEnabled = process.env.AUTH_ENABLED === "true";
  const supabaseJwtSecretSet = Boolean(process.env.SUPABASE_JWT_SECRET);
  const allowedOriginSet = Boolean(process.env.ALLOWED_ORIGIN);
  const adminEmailsSet = Boolean(process.env.ADMIN_EMAILS);

  const ready =
    openAiKeySet &&
    allowedOriginSet &&
    adminEmailsSet &&
    (!authEnabled || supabaseJwtSecretSet);

  return {
    openAiKeySet,
    authEnabled,
    supabaseJwtSecretSet,
    allowedOriginSet,
    adminEmailsSet,
    ready
  };
}
