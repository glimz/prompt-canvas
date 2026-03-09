import { defaultBrandStyle } from "./brand.js";
import type { BrandStyle, ImagePromptSpec } from "./types.js";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function extractConcept(title: string): string {
  const lower = title.toLowerCase();

  if (lower.includes("endometriosis")) {
    return "a calm, empathetic women's health scene focused on pain awareness, reflection, and support";
  }
  if (lower.includes("pms") || lower.includes("pmdd")) {
    return "an emotionally balanced visual about hormonal changes, self-awareness, and symptom understanding";
  }
  if (lower.includes("menopause")) {
    return "a confident and reassuring scene about life transition, wellbeing, and stability";
  }
  if (lower.includes("sleep")) {
    return "a peaceful night-time wellness composition with restorative mood and gentle health symbolism";
  }
  if (lower.includes("doctor") || lower.includes("consultation")) {
    return "a respectful healthcare interaction scene emphasizing trust, clarity, and patient empowerment";
  }
  if (lower.includes("stress")) {
    return "a thoughtful wellness scene connecting emotional load, hormones, and self-care";
  }
  if (lower.includes("cycle tracking")) {
    return "a modern self-management and health awareness composition with subtle digital health cues";
  }

  return "a calm, supportive women's health editorial illustration with a trustworthy and empowering tone";
}

export function buildPromptSpec(title: string, brand: BrandStyle = defaultBrandStyle): ImagePromptSpec {
  const slug = slugify(title);
  const concept = extractConcept(title);

  const finalPrompt = `
Create a website header image for a women's digital health article.

Article title:
"${title}"

Brand:
${brand.brandName}
Audience:
${brand.audience}

Visual concept:
${concept}

Brand style:
${brand.visualStyle.join(", ")}

Color palette:
${brand.palette.join(", ")}

Composition rules:
${brand.compositionRules.join(", ")}

Restrictions:
${brand.restrictions.join(", ")}

The image must feel part of a single coherent editorial series for one health brand.
Focus on emotional clarity, trust, modern digital health, and visual consistency across multiple articles.
No text embedded in the image.
`.trim();

  return {
    title,
    slug,
    concept,
    finalPrompt,
    outputFileBase: `output/images/${slug}`
  };
}
