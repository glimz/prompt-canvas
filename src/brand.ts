import type { AppSettings, BrandStyle } from "./types.js";

export const defaultBrandStyle: BrandStyle = {
  brandName: "PromptCanvas Demo",
  audience: "women seeking evidence-based digital health support",
  visualStyle: [
    "editorial digital health illustration",
    "clean and modern composition",
    "soft natural lighting",
    "calm, trustworthy, supportive mood",
    "minimal clutter",
    "subtle depth",
    "premium healthcare feel"
  ],
  palette: [
    "berry plum",
    "soft rose",
    "warm beige",
    "dusty mauve",
    "off-white"
  ],
  restrictions: [
    "no text in image",
    "no watermark",
    "no logo",
    "no overly dramatic medical imagery",
    "no photorealistic hospital scenes",
    "no dark horror-like mood",
    "no cartoonish style"
  ],
  compositionRules: [
    "wide header composition",
    "clear subject focus",
    "space for website headline overlay",
    "consistent framing across all outputs"
  ]
};

export function getDefaultSettings(): AppSettings {
  const envProvider = process.env.IMAGE_PROVIDER === "pollinations" ? "pollinations" : "openai";
  return {
    appName: process.env.APP_NAME || "PromptCanvas",
    companyName: process.env.COMPANY_NAME || "PromptCanvas Demo",
    branding: defaultBrandStyle,
    uiTheme: {
      primaryColor: "#8f1f5d",
      secondaryColor: "#5f4b56",
      accentColor: "#d6a6bf",
      surfaceColor: "#ffffff",
      backgroundFrom: "#fff9fc",
      backgroundTo: "#f2e4ec"
    },
    generation: {
      defaultProvider: envProvider
    }
  };
}
