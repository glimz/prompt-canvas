import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { buildPromptSpec } from "./prompts.js";
import { defaultBrandStyle } from "./brand.js";
import type { BrandStyle, GenerationManifestItem, ImageProvider } from "./types.js";
import { logError, logInfo, logWarn } from "./logger.js";

const POLLINATIONS_MODEL = process.env.POLLINATIONS_MODEL || "flux";
const OPENAI_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
type OpenAIImageSize =
  | "auto"
  | "256x256"
  | "512x512"
  | "1024x1024"
  | "1536x1024"
  | "1024x1536"
  | "1792x1024"
  | "1024x1792";

const OPENAI_SIZE_CANDIDATE =
  process.env.OPENAI_IMAGE_SIZE || (OPENAI_MODEL === "dall-e-2" ? "1024x1024" : "1536x1024");
const OPENAI_ALLOWED_SIZES: OpenAIImageSize[] = [
  "auto",
  "256x256",
  "512x512",
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "1792x1024",
  "1024x1792"
];
const SIZE: OpenAIImageSize = OPENAI_ALLOWED_SIZES.includes(OPENAI_SIZE_CANDIDATE as OpenAIImageSize)
  ? (OPENAI_SIZE_CANDIDATE as OpenAIImageSize)
  : "1024x1024";
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 120000);
const POLLINATIONS_TIMEOUT_MS = Number(process.env.POLLINATIONS_TIMEOUT_MS || 60000);
const SERVICE_RETRY_MAX_ATTEMPTS = Number(process.env.SERVICE_RETRY_MAX_ATTEMPTS || 3);
const SERVICE_RETRY_BASE_DELAY_MS = Number(process.env.SERVICE_RETRY_BASE_DELAY_MS || 1200);
const OPENAI_PROMPT_MAX_CHARS = Number(
  process.env.OPENAI_PROMPT_MAX_CHARS || (OPENAI_MODEL === "dall-e-2" ? 1000 : 32000)
);

const manifestPath = path.join(process.cwd(), "output", "manifest.json");

let openAiClient: OpenAI | null = null;

function getOpenAiClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing. Set it in .env to use provider=openai");
  }

  if (!openAiClient) {
    openAiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: OPENAI_TIMEOUT_MS
    });
  }

  return openAiClient;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function readTitles(): Promise<string[]> {
  const filePath = path.join(process.cwd(), "input", "blog-titles.json");
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

function parseSize(size: string) {
  const [widthRaw, heightRaw] = size.split("x");
  const width = Number(widthRaw);
  const height = Number(heightRaw);
  return { width, height };
}

function mimeToExtension(mime: string | null | undefined): "png" | "jpg" | "webp" {
  if (!mime) {
    return "png";
  }
  if (mime.includes("webp")) {
    return "webp";
  }
  if (mime.includes("jpeg") || mime.includes("jpg")) {
    return "jpg";
  }
  return "png";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: unknown): boolean {
  const text = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    text.includes("timeout") ||
    text.includes("429") ||
    text.includes("rate") ||
    text.includes("503") ||
    text.includes("502") ||
    text.includes("500") ||
    text.includes("network") ||
    text.includes("fetch") ||
    text.includes("temporarily")
  );
}

async function withServiceRetry<T>(
  opName: string,
  context: Record<string, unknown>,
  operation: () => Promise<T>
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < SERVICE_RETRY_MAX_ATTEMPTS) {
    attempt += 1;
    try {
      if (attempt > 1) {
        logWarn("service.retry.attempt", {
          opName,
          attempt,
          maxAttempts: SERVICE_RETRY_MAX_ATTEMPTS,
          ...context
        });
      }
      return await operation();
    } catch (error) {
      lastError = error;
      const retryable = isRetryableError(error);
      logWarn("service.retry.error", {
        opName,
        attempt,
        retryable,
        error: error instanceof Error ? error.message : String(error),
        ...context
      });

      if (!retryable || attempt >= SERVICE_RETRY_MAX_ATTEMPTS) {
        break;
      }

      const jitter = Math.floor(Math.random() * 250);
      const delay = SERVICE_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + jitter;
      await sleep(delay);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function generateWithOpenAI(prompt: string) {
  const client = getOpenAiClient();
  const startedAt = Date.now();
  logInfo("service.openai.generate.start", {
    provider: "openai",
    model: OPENAI_MODEL,
    size: SIZE
  });

  const result = await withServiceRetry(
    "openai.images.generate",
    {
      provider: "openai",
      model: OPENAI_MODEL,
      size: SIZE
    },
    async () =>
      client.images.generate({
        model: OPENAI_MODEL,
        prompt,
        size: SIZE
      })
  );

  const imageBase64 = result.data?.[0]?.b64_json;
  if (imageBase64) {
    logInfo("service.openai.generate.success", {
      provider: "openai",
      model: OPENAI_MODEL,
      durationMs: Date.now() - startedAt,
      responseType: "b64_json"
    });

    return {
      buffer: Buffer.from(imageBase64, "base64"),
      extension: "png" as const,
      model: OPENAI_MODEL
    };
  }

  const imageUrl = result.data?.[0]?.url;
  if (imageUrl) {
    const response = await fetch(imageUrl, {
      headers: {
        Accept: "image/*"
      }
    });
    if (!response.ok) {
      throw new Error(`OpenAI image URL fetch failed: ${response.status} ${response.statusText}`);
    }
    const mime = response.headers.get("content-type");
    const bytes = await response.arrayBuffer();
    logInfo("service.openai.generate.success", {
      provider: "openai",
      model: OPENAI_MODEL,
      durationMs: Date.now() - startedAt,
      responseType: "url",
      bytes: bytes.byteLength
    });
    return {
      buffer: Buffer.from(bytes),
      extension: mimeToExtension(mime),
      model: OPENAI_MODEL
    };
  }

  throw new Error("No image returned from OpenAI API (missing b64_json and url)");
}

async function generateWithPollinations(prompt: string) {
  const startedAt = Date.now();
  const { width, height } = parseSize(SIZE);
  const endpoint = new URL(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`);
  endpoint.searchParams.set("model", POLLINATIONS_MODEL);
  endpoint.searchParams.set("width", String(width));
  endpoint.searchParams.set("height", String(height));
  endpoint.searchParams.set("nologo", "true");
  endpoint.searchParams.set("safe", "true");

  const response = await withServiceRetry(
    "pollinations.image.fetch",
    {
      provider: "pollinations",
      model: POLLINATIONS_MODEL,
      size: SIZE,
      timeoutMs: POLLINATIONS_TIMEOUT_MS
    },
    async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), POLLINATIONS_TIMEOUT_MS);
      try {
        logInfo("service.pollinations.generate.start", {
          provider: "pollinations",
          model: POLLINATIONS_MODEL,
          size: SIZE,
          timeoutMs: POLLINATIONS_TIMEOUT_MS
        });
        const res = await fetch(endpoint.toString(), {
          method: "GET",
          headers: {
            Accept: "image/*"
          },
          signal: controller.signal
        });

        if (!res.ok) {
          throw new Error(`Pollinations request failed: ${res.status} ${res.statusText}`);
        }

        return res;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error(`Pollinations request timeout after ${POLLINATIONS_TIMEOUT_MS}ms`);
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
  );

  const mime = response.headers.get("content-type");
  const arrayBuffer = await response.arrayBuffer();
  logInfo("service.pollinations.generate.success", {
    provider: "pollinations",
    model: POLLINATIONS_MODEL,
    durationMs: Date.now() - startedAt,
    bytes: arrayBuffer.byteLength
  });

  return {
    buffer: Buffer.from(arrayBuffer),
    extension: mimeToExtension(mime),
    model: POLLINATIONS_MODEL
  };
}

type ImageGenerationResult =
  | Awaited<ReturnType<typeof generateWithOpenAI>>
  | Awaited<ReturnType<typeof generateWithPollinations>>;

async function readManifestHistory(): Promise<GenerationManifestItem[]> {
  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    return JSON.parse(raw) as GenerationManifestItem[];
  } catch {
    return [];
  }
}

async function writeManifestHistory(items: GenerationManifestItem[]) {
  await fs.writeFile(manifestPath, JSON.stringify(items, null, 2), "utf-8");
}

function getNextAttempt(history: GenerationManifestItem[], slug: string): number {
  const attempts = history.filter((item) => item.slug === slug).map((item) => item.attempt || 1);
  const max = attempts.length ? Math.max(...attempts) : 0;
  return max + 1;
}

function buildOutputPaths(slug: string, attempt: number, extension: string) {
  const fileName = attempt <= 1 ? `${slug}.${extension}` : `${slug}--a${attempt}.${extension}`;
  return {
    outputFile: `output/images/${fileName}`,
    outputUrl: `/images/${fileName}`
  };
}

function applyCreativeRefinement(basePrompt: string, note?: string) {
  const extra = note?.trim() || "Increase subject clarity, cleaner composition, and stronger palette adherence.";
  return `${basePrompt}\n\nRefinement instructions for retry:\n${extra}`;
}

function fitPromptForOpenAI(prompt: string): string {
  if (prompt.length <= OPENAI_PROMPT_MAX_CHARS) {
    return prompt;
  }

  const compact = prompt.replace(/\s+/g, " ").trim();
  if (compact.length <= OPENAI_PROMPT_MAX_CHARS) {
    logWarn("prompt.compacted", {
      model: OPENAI_MODEL,
      fromChars: prompt.length,
      toChars: compact.length
    });
    return compact;
  }

  const clipped = compact.slice(0, OPENAI_PROMPT_MAX_CHARS).trimEnd();
  logWarn("prompt.truncated", {
    model: OPENAI_MODEL,
    maxChars: OPENAI_PROMPT_MAX_CHARS,
    fromChars: prompt.length,
    toChars: clipped.length
  });
  return clipped;
}

function normalizePromptForProvider(prompt: string, provider: ImageProvider): string {
  if (provider === "openai") {
    return fitPromptForOpenAI(prompt);
  }
  return prompt;
}

interface RunGenerationOptions {
  titles?: string[];
  branding?: BrandStyle;
  provider?: ImageProvider;
  onItem?: (item: GenerationManifestItem) => void | Promise<void>;
}

export async function runGeneration(options: RunGenerationOptions = {}) {
  await ensureDir(path.join(process.cwd(), "output", "images"));

  const sourceTitles = options.titles ?? (await readTitles());
  const brand = options.branding ?? defaultBrandStyle;
  const provider = options.provider || "openai";
  const newEntries: GenerationManifestItem[] = [];
  const history = await readManifestHistory();
  const runStartedAt = Date.now();
  logInfo("generation.run.start", {
    provider,
    titleCount: sourceTitles.length,
    size: SIZE
  });

  for (const title of sourceTitles) {
    const spec = buildPromptSpec(title, brand);
    const attempt = getNextAttempt(history.concat(newEntries), spec.slug);
    const itemStartedAt = Date.now();
    logInfo("generation.item.start", {
      provider,
      title: spec.title,
      slug: spec.slug,
      attempt
    });

    const effectivePrompt = normalizePromptForProvider(spec.finalPrompt, provider);
    let imageResult: ImageGenerationResult;
    try {
      imageResult =
        provider === "pollinations"
          ? await generateWithPollinations(effectivePrompt)
          : await generateWithOpenAI(effectivePrompt);
    } catch (error) {
      logError("generation.item.error", {
        provider,
        title: spec.title,
        slug: spec.slug,
        attempt,
        durationMs: Date.now() - itemStartedAt,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }

    const { outputFile, outputUrl } = buildOutputPaths(spec.slug, attempt, imageResult.extension);
    await fs.writeFile(path.join(process.cwd(), outputFile), imageResult.buffer);
    logInfo("generation.item.success", {
      provider,
      title: spec.title,
      slug: spec.slug,
      attempt,
      outputFile,
      durationMs: Date.now() - itemStartedAt
    });

    const entry: GenerationManifestItem = {
      id: randomUUID(),
      title: spec.title,
      slug: spec.slug,
      attempt,
      retryType: "initial",
      concept: spec.concept,
      prompt: effectivePrompt,
      outputFile,
      outputUrl,
      provider,
      model: imageResult.model,
      size: SIZE,
      generatedAt: new Date().toISOString(),
      brandSnapshot: brand
    };
    newEntries.push(entry);
    if (options.onItem) {
      await options.onItem(entry);
    }
  }

  await writeManifestHistory([...history, ...newEntries]);
  logInfo("generation.run.success", {
    provider,
    count: newEntries.length,
    durationMs: Date.now() - runStartedAt
  });

  return newEntries;
}

interface RetryGenerationOptions {
  source: Pick<GenerationManifestItem, "id" | "title" | "slug" | "concept" | "prompt" | "provider">;
  provider: ImageProvider;
  branding?: BrandStyle;
  mode: "transport" | "creative";
  note?: string;
}

export async function retryGeneration(options: RetryGenerationOptions): Promise<GenerationManifestItem> {
  await ensureDir(path.join(process.cwd(), "output", "images"));

  const history = await readManifestHistory();
  const brand = options.branding ?? defaultBrandStyle;
  const attempt = getNextAttempt(history, options.source.slug);
  const prompt =
    options.mode === "creative"
      ? applyCreativeRefinement(options.source.prompt, options.note)
      : options.source.prompt;
  const effectivePrompt = normalizePromptForProvider(prompt, options.provider);

  const startedAt = Date.now();
  logInfo("generation.retry.start", {
    sourceId: options.source.id,
    slug: options.source.slug,
    provider: options.provider,
    mode: options.mode,
    attempt
  });

  const imageResult =
    options.provider === "pollinations"
      ? await generateWithPollinations(effectivePrompt)
      : await generateWithOpenAI(effectivePrompt);

  const { outputFile, outputUrl } = buildOutputPaths(options.source.slug, attempt, imageResult.extension);
  await fs.writeFile(path.join(process.cwd(), outputFile), imageResult.buffer);

  const entry: GenerationManifestItem = {
    id: randomUUID(),
    parentId: options.source.id,
    title: options.source.title,
    slug: options.source.slug,
    attempt,
    retryType: options.mode,
    promptRevisionNote: options.mode === "creative" ? options.note?.trim() || undefined : undefined,
    concept: options.source.concept,
    prompt: effectivePrompt,
    outputFile,
    outputUrl,
    provider: options.provider,
    model: imageResult.model,
    size: SIZE,
    generatedAt: new Date().toISOString(),
    brandSnapshot: brand
  };

  await writeManifestHistory([...history, entry]);
  logInfo("generation.retry.success", {
    sourceId: options.source.id,
    newId: entry.id,
    provider: entry.provider,
    mode: options.mode,
    attempt,
    durationMs: Date.now() - startedAt
  });

  return entry;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runGeneration()
    .then(() => {
      console.log("Done. Images and manifest saved in output/");
    })
    .catch((err) => {
      logError("generation.run.error", {
        error: err instanceof Error ? err.message : String(err)
      });
      console.error(err);
      process.exit(1);
    });
}
