import { z } from "zod";
export const effectNames = [
  "brightness",
  "contrast",
  "rgb",
  "pixel",
  "grain",
  "glow",
  "mono",
  "fade",
] as const;
export type EffectName = (typeof effectNames)[number];
const key = z.object({
  time: z.number().finite().min(-86400).max(86400),
  value: z.number().finite(),
  ease: z.enum(["linear", "in", "out", "smooth", "step"]).default("linear"),
});
export const clipSchema = z.object({
  id: z.string(),
  assetId: z.string().optional(),
  kind: z.enum(["video", "audio", "image", "text", "art"]),
  name: z.string().max(300),
  track: z.number().int().min(0).max(15),
  start: z.number().min(0).max(86400),
  duration: z.number().positive().max(86400),
  in: z.number().nonnegative(),
  volume: z.number().min(0).max(2),
  text: z.string().max(10000).default(""),
  x: z.number().min(-2).max(2),
  y: z.number().min(-2).max(2),
  scale: z.number().min(0.05).max(5),
  opacity: z.number().min(0).max(1),
  effects: z.record(z.enum(effectNames), z.number().min(0).max(1)),
  keys: z.object({
    x: z.array(key),
    y: z.array(key),
    scale: z.array(key),
    opacity: z.array(key),
  }),
});
export const assetSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["video", "audio", "image"]),
  url: z.string(),
  path: z.string().optional(),
  duration: z.number().nonnegative(),
  width: z.number().optional(),
  height: z.number().optional(),
  wave: z.array(z.number()).optional(),
});
export const projectSchema = z.object({
  version: z.literal(1),
  name: z.string().max(200),
  width: z.number().int().min(64).max(3840),
  height: z.number().int().min(64).max(3840),
  fps: z.union([z.literal(24), z.literal(30), z.literal(60)]),
  bpm: z.number().min(30).max(300),
  assets: z.array(assetSchema).max(1000),
  clips: z.array(clipSchema).max(5000),
  muted: z.array(z.number().int()),
  locked: z.array(z.number().int()),
  markers: z.array(z.number().nonnegative()),
});
export type Project = z.infer<typeof projectSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Key = z.infer<typeof key>;
export const uid = () => crypto.randomUUID();
export function emptyProject(): Project {
  return {
    version: 1,
    name: "Без названия",
    width: 1920,
    height: 1080,
    fps: 60,
    bpm: 120,
    assets: [],
    clips: [],
    muted: [],
    locked: [],
    markers: [],
  };
}
export const duration = (p: Project) =>
  Math.max(0, ...p.clips.map((c) => c.start + c.duration));
export function makeClip(
  kind: Clip["kind"],
  name: string,
  track: number,
  dur = 10,
  assetId?: string,
): Clip {
  return {
    id: uid(),
    kind,
    name,
    track,
    start: 0,
    duration: dur,
    in: 0,
    volume: 1,
    text: kind === "text" ? "DEPHCORE" : "",
    x: 0.5,
    y: 0.5,
    scale: 1,
    opacity: 1,
    effects: {},
    keys: { x: [], y: [], scale: [], opacity: [] },
    assetId,
  };
}
export function interpolate(keys: Key[], t: number, fallback: number): number {
  const sorted = [...keys].sort((a, b) => a.time - b.time);
  if (!sorted.length) return fallback;
  if (t <= sorted[0].time) return sorted[0].value;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1],
      b = sorted[i];
    if (t <= b.time) {
      let f = (t - a.time) / (b.time - a.time);
      if (a.ease === "in") f *= f;
      else if (a.ease === "out") f = 1 - (1 - f) ** 2;
      else if (a.ease === "smooth") f = f * f * (3 - 2 * f);
      else if (a.ease === "step") f = 0;
      return a.value + (b.value - a.value) * f;
    }
  }
  return sorted.at(-1)!.value;
}
export function splitClip(c: Clip, time: number): Clip[] {
  const offset = time - c.start;
  if (offset <= 0 || offset >= c.duration) return [c];
  const left = structuredClone(c),
    right = structuredClone(c);
  left.duration = offset;
  right.id = uid();
  right.start = time;
  right.in += offset;
  right.duration -= offset;
  // Retain keys outside the trimmed interval to preserve the original easing curve.
  for (const prop of ["x", "y", "scale", "opacity"] as const) {
    right.keys[prop] = c.keys[prop].map((k) => ({
      ...k,
      time: k.time - offset,
    }));
  }
  return [left, right];
}
export const effects: {
  id: EffectName;
  name: string;
  ru: string;
  category: string;
  description: string;
}[] = [
  {
    id: "rgb",
    name: "RGB Split",
    ru: "Разделение каналов",
    category: "Glitch",
    description: "Цветовое расхождение красного и синего каналов.",
  },
  {
    id: "pixel",
    name: "Pixelation",
    ru: "Пикселизация",
    category: "Pixel",
    description: "Контролируемое снижение разрешения с чёткими краями.",
  },
  {
    id: "grain",
    name: "Film Grain",
    ru: "Плёночное зерно",
    category: "VHS",
    description: "Детерминированное зерно, одинаковое при экспорте.",
  },
  {
    id: "glow",
    name: "Divine Glow",
    ru: "Свечение",
    category: "Angelcore",
    description: "Мягкое свечение светлых участков.",
  },
  {
    id: "mono",
    name: "Monochrome",
    ru: "Чёрно-белый",
    category: "Цвет",
    description: "Смешивание с монохромным изображением.",
  },
  {
    id: "brightness",
    name: "Brightness",
    ru: "Яркость",
    category: "Цвет",
    description: "Увеличение яркости.",
  },
  {
    id: "contrast",
    name: "Contrast",
    ru: "Контраст",
    category: "Цвет",
    description: "Увеличение контраста.",
  },
  {
    id: "fade",
    name: "Fade",
    ru: "Появление и затухание",
    category: "Свет",
    description: "Плавное появление и исчезновение по краям клипа.",
  },
];
export const presets = [
  {
    name: "Dark FL Studio",
    tag: "DARK / PRODUCER",
    effects: { mono: 0.85, contrast: 0.3, grain: 0.18 },
  },
  {
    name: "Angelcore Beat",
    tag: "LIGHT / ETHEREAL",
    effects: { glow: 0.35, pixel: 0.08, mono: 0.6 },
  },
  {
    name: "Pixel Underground",
    tag: "RETRO / DIGITAL",
    effects: { pixel: 0.18, rgb: 0.22, grain: 0.2 },
  },
  {
    name: "Soft Aesthetic",
    tag: "SOFT / DREAM",
    effects: { glow: 0.25, fade: 0.3 },
  },
] satisfies {
  name: string;
  tag: string;
  effects: Partial<Record<EffectName, number>>;
}[];
