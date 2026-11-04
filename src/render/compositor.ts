import {
  duration,
  interpolate,
  type Project,
  type Clip,
  type Asset,
} from "../core/model";
const sourceCache = new Map<string, HTMLVideoElement | HTMLImageElement>();
const scratch = document.createElement("canvas");
const effectsCanvas = document.createElement("canvas");
function source(a: Asset, id: string) {
  const cacheKey = a.url + id;
  let el = sourceCache.get(cacheKey);
  if (!el) {
    el = a.kind === "image" ? new Image() : document.createElement("video");
    if (el instanceof HTMLVideoElement) {
      el.preload = "auto";
      el.muted = true;
      el.playsInline = true;
    }
    el.crossOrigin = "anonymous";
    el.src = a.url;
    sourceCache.set(cacheKey, el);
  }
  return el;
}
export function clearSources() {
  for (const el of sourceCache.values()) {
    if (el instanceof HTMLVideoElement) {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
  }
  sourceCache.clear();
}
export async function prepare(p: Project, t: number) {
  await Promise.all(
    p.clips
      .filter(
        (c) =>
          c.assetId &&
          c.kind !== "audio" &&
          t >= c.start &&
          t < c.start + c.duration &&
          !p.muted.includes(c.track),
      )
      .map(async (c) => {
        const a = p.assets.find((a) => a.id === c.assetId);
        if (!a) return;
        const el = source(a, c.id);
        if (el instanceof HTMLImageElement) {
          if (!el.complete) await el.decode();
          return;
        }
        if (el.readyState < 2)
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error(`Не удалось декодировать ${a.name}`)),
              10000,
            );
            el.addEventListener(
              "loadeddata",
              () => {
                clearTimeout(timer);
                resolve();
              },
              { once: true },
            );
            el.addEventListener(
              "error",
              () => {
                clearTimeout(timer);
                reject(new Error(`Неподдерживаемый формат: ${a.name}`));
              },
              { once: true },
            );
          });
        const target = c.in + t - c.start;
        if (Math.abs(el.currentTime - target) > 0.001)
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error("Истекло время поиска кадра")),
              10000,
            );
            el.addEventListener(
              "seeked",
              () => {
                clearTimeout(timer);
                resolve();
              },
              { once: true },
            );
            el.currentTime = target;
          });
      }),
  );
}
function art(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  ctx.fillStyle = "#070b09";
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(
    w * 0.5,
    h * 0.5,
    0,
    w * 0.5,
    h * 0.5,
    w * 0.48,
  );
  g.addColorStop(0, "#23342a");
  g.addColorStop(1, "#070b09");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w * 0.5, h * 0.51);
  ctx.scale(h / 700, h / 700);
  ctx.rotate(Math.sin(t * 0.15) * 0.06);
  for (let i = 0; i < 23; i++) {
    const a = i * 0.29 + t * 0.08;
    ctx.strokeStyle = `rgba(162,196,166,${0.1 + i * 0.018})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 110 + i * 6, 45 + i * 6, a, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.shadowColor = "#a6ff66";
  ctx.shadowBlur = 24;
  ctx.strokeStyle = "#b8db9e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, -145, 116, 29, -0.27, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#e0e9dd";
  ctx.fillRect(-2, -81, 4, 160);
  ctx.fillRect(-43, -42, 86, 4);
  ctx.restore();
  ctx.fillStyle = "#738675";
  ctx.font = `${w * 0.011}px monospace`;
  ctx.fillText("NIGHTFRAME   /   ORIGINAL GENERATIVE STUDY", w * 0.06, h * 0.1);
  ctx.fillText(
    "SIGNAL 001                         120 BPM",
    w * 0.06,
    h * 0.92,
  );
}
function applyEffects(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  c: Clip,
  frame: number,
) {
  const e = c.effects;
  const s = effectsCanvas;
  s.width = w;
  s.height = h;
  const sc = s.getContext("2d")!;
  sc.drawImage(ctx.canvas, 0, 0);
  if (e.pixel) {
    const size = Math.max(1, 1 + e.pixel * 45);
    scratch.width = Math.ceil(w / size);
    scratch.height = Math.ceil(h / size);
    scratch.getContext("2d")!.drawImage(s, 0, 0, scratch.width, scratch.height);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(scratch, 0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
  }
  if (e.brightness || e.contrast || e.mono) {
    sc.clearRect(0, 0, w, h);
    sc.drawImage(ctx.canvas, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.filter = `brightness(${1 + (e.brightness || 0)}) contrast(${1 + (e.contrast || 0)}) grayscale(${e.mono || 0})`;
    ctx.drawImage(s, 0, 0);
    ctx.filter = "none";
  }
  if (e.rgb || e.grain) {
    const data = ctx.getImageData(0, 0, w, h),
      copy = new Uint8ClampedArray(data.data);
    const shift = Math.round((e.rgb || 0) * w * 0.025);
    let seed = frame * 9301 + 49297;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (shift) {
          data.data[i] = copy[(y * w + Math.max(0, x - shift)) * 4];
          data.data[i + 2] = copy[(y * w + Math.min(w - 1, x + shift)) * 4 + 2];
        }
        if (e.grain) {
          seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
          const n = ((seed >>> 0) / 4294967296 - 0.5) * e.grain * 90;
          for (let k = 0; k < 3; k++) data.data[i + k] += n;
        }
      }
    ctx.putImageData(data, 0, 0);
  }
  if (e.glow) {
    sc.clearRect(0, 0, w, h);
    sc.drawImage(ctx.canvas, 0, 0);
    ctx.save();
    ctx.filter = `blur(${Math.max(1, w * 0.009)}px) brightness(1.4)`;
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = e.glow * 0.65;
    ctx.drawImage(s, 0, 0);
    ctx.restore();
  }
}
const layer = document.createElement("canvas");
export function render(canvas: HTMLCanvasElement, p: Project, t: number) {
  const ctx = canvas.getContext("2d")!,
    w = canvas.width,
    h = canvas.height;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  for (const c of [...p.clips].sort((a, b) => a.track - b.track)) {
    if (
      c.kind === "audio" ||
      p.muted.includes(c.track) ||
      t < c.start ||
      t >= c.start + c.duration
    )
      continue;
    const local = t - c.start;
    layer.width = w;
    layer.height = h;
    const lc = layer.getContext("2d")!;
    const a = p.assets.find((a) => a.id === c.assetId);
    lc.save();
    const x = interpolate(c.keys.x, local, c.x),
      y = interpolate(c.keys.y, local, c.y),
      scale = interpolate(c.keys.scale, local, c.scale);
    lc.translate(x * w, y * h);
    lc.scale(scale, scale);
    if (c.kind === "text") {
      lc.textAlign = "center";
      lc.textBaseline = "middle";
      lc.font = `800 ${h * 0.095}px 'Arial',sans-serif`;
      lc.fillStyle = "#f1f4ed";
      lc.shadowColor = "#b4e29b";
      lc.shadowBlur = h * 0.012;
      lc.fillText(c.text, 0, 0, w * 0.95);
    } else if (c.kind === "art") {
      lc.translate(-w / 2, -h / 2);
      art(lc, w, h, t);
    } else if (a) {
      const el = source(a, c.id);
      const sw =
          el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth,
        sh = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
      if (sw && sh) {
        const f = Math.min(w / sw, h / sh);
        lc.drawImage(el, (-sw * f) / 2, (-sh * f) / 2, sw * f, sh * f);
      }
    }
    lc.restore();
    applyEffects(lc, w, h, c, Math.round(t * p.fps));
    ctx.save();
    let opacity = interpolate(c.keys.opacity, local, c.opacity);
    if (c.effects.fade) {
      const edge = Math.min(c.duration / 2, c.effects.fade * 3);
      opacity *= Math.min(1, local / edge, (c.duration - local) / edge);
    }
    ctx.globalAlpha = opacity;
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
  }
}
export async function exportProject(
  p: Project,
  settings: { height: number; fps: number; quality: number; name: string },
  onProgress: (v: number) => void,
  cancel: () => boolean,
) {
  const api = window.nightframe;
  if (!api)
    throw new Error(
      "MP4-экспорт доступен в настольном приложении. Запустите npm run desktop.",
    );
  const graph = structuredClone(p);
  if (!(await api.beginExport(graph, settings))) return false;
  const canvas = document.createElement("canvas");
  canvas.height = settings.height;
  canvas.width = Math.round((settings.height * p.width) / p.height / 2) * 2;
  try {
    const frames = Math.ceil(duration(p) * settings.fps);
    for (let i = 0; i < frames; i++) {
      if (cancel()) throw new Error("Экспорт отменён");
      await prepare(graph, i / settings.fps);
      render(canvas, graph, i / settings.fps);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Ошибка кадра"))),
          "image/jpeg",
          0.98,
        ),
      );
      await api.frame(new Uint8Array(await blob.arrayBuffer()));
      onProgress(((i + 1) / frames) * 0.97);
    }
    const output = await api.finishExport();
    onProgress(1);
    return output;
  } catch (e) {
    await api.cancelExport();
    throw e;
  }
}
