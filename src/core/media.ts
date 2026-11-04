import { uid, type Asset } from "./model";
export async function browserImport(files: File[]): Promise<Asset[]> {
  const out: Asset[] = [];
  for (const file of files) {
    const kind = file.type.startsWith("video/")
      ? "video"
      : file.type.startsWith("audio/")
        ? "audio"
        : file.type.startsWith("image/")
          ? "image"
          : null;
    if (!kind) throw new Error(`Неподдерживаемый файл: ${file.name}`);
    const url = URL.createObjectURL(file);
    const a: Asset = { id: uid(), name: file.name, kind, url, duration: 5 };
    if (kind === "image") {
      const im = new Image();
      im.src = url;
      await im.decode();
      a.width = im.width;
      a.height = im.height;
    } else {
      const el = document.createElement(kind);
      el.src = url;
      await new Promise<void>((resolve, reject) => {
        el.onloadedmetadata = () => resolve();
        el.onerror = () =>
          reject(new Error(`Не удалось прочитать ${file.name}`));
      });
      a.duration = el.duration;
      a.width = el instanceof HTMLVideoElement ? el.videoWidth : undefined;
      a.height = el instanceof HTMLVideoElement ? el.videoHeight : undefined;
    }
    if (kind !== "image") {
      try {
        const context = new AudioContext();
        try {
          const audio = await context.decodeAudioData(await file.arrayBuffer());
          const data = audio.getChannelData(0);
          a.wave = Array.from({ length: 240 }, (_, i) => {
            const from = Math.floor((i * data.length) / 240),
              end = Math.floor(((i + 1) * data.length) / 240);
            let peak = 0;
            for (let j = from; j < end; j += 16)
              peak = Math.max(peak, Math.abs(data[j]));
            return peak;
          });
        } finally {
          await context.close();
        }
      } catch {
        /* Some video containers have no decodable audio; no fabricated waveform. */
      }
    }
    out.push(a);
  }
  return out;
}
