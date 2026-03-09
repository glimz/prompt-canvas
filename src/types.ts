export interface BrandStyle {
  brandName: string;
  audience: string;
  visualStyle: string[];
  palette: string[];
  restrictions: string[];
  compositionRules: string[];
}

export type ImageProvider = "openai" | "pollinations";

export interface UITheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  surfaceColor: string;
  backgroundFrom: string;
  backgroundTo: string;
}

export interface GenerationSettings {
  defaultProvider: ImageProvider;
}

export interface AppSettings {
  appName: string;
  companyName: string;
  branding: BrandStyle;
  uiTheme: UITheme;
  generation: GenerationSettings;
}

export interface SystemRequirements {
  openAiKeySet: boolean;
  authEnabled: boolean;
  supabaseJwtSecretSet: boolean;
  allowedOriginSet: boolean;
  adminEmailsSet: boolean;
  ready: boolean;
}

export interface ImagePromptSpec {
  title: string;
  slug: string;
  concept: string;
  finalPrompt: string;
  outputFileBase: string;
}

export interface GenerationManifestItem {
  id: string;
  parentId?: string;
  title: string;
  slug: string;
  attempt: number;
  retryType: "initial" | "transport" | "creative";
  promptRevisionNote?: string;
  concept: string;
  prompt: string;
  outputFile: string;
  outputUrl: string;
  provider: ImageProvider;
  model: string;
  size: string;
  generatedAt: string;
  brandSnapshot: BrandStyle;
}
