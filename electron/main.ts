import { app, BrowserWindow, dialog, ipcMain, protocol } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createReadStream } from "node:fs";
import {
  readFile,
  writeFile,
  stat,
  unlink,
  mkdir,
  rename,
} from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { randomUUID } from "node:crypto";
import ffmpegPath from "ffmpeg-static";
import probe from "ffprobe-static";
import { z } from "zod";
import {
  assetSchema,
  projectSchema,
  duration,
  type Asset,
  type Project,
} from "../src/core/model";
protocol.registerSchemesAsPrivileged([
  {
    scheme: "nightmedia",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);
let win: BrowserWindow;
const media = new Map<string, string>();
// spawn requires a real executable path outside app.asar.
const unpackedBinary = (file: string) =>
  app.isPackaged
    ? file.replace(/app\.asar([\\/])/, "app.asar.unpacked$1")
    : file;
const ffmpeg = unpackedBinary(
  (!app.isPackaged && process.env.NIGHTFRAME_FFMPEG) || ffmpegPath!,
);
const ffprobe = unpackedBinary(
  (!app.isPackaged && process.env.NIGHTFRAME_FFPROBE) || probe.path,
);
function run(exe: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(exe, args, { windowsHide: true });
    const chunks: Buffer[] = [];
    let size = 0,
      err = "";
    p.stdout.on("data", (d: Buffer) => {
      size += d.length;
      if (size > 32 * 1024 * 1024) {
        p.kill();
        reject(new Error("Слишком большой ответ анализа"));
      } else chunks.push(d);
    });
    p.stderr.on("data", (d) => {
      err = (err + d.toString()).slice(-4000);
    });
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(new Error(err || "Ошибка медиадвижка")),
    );
  });
}
async function importPath(file: string): Promise<Asset> {
  if (
    !path.isAbsolute(file) ||
    ![
      ".mp4",
      ".mov",
      ".mkv",
      ".webm",
      ".mp3",
      ".wav",
      ".ogg",
      ".m4a",
      ".aac",
      ".flac",
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
    ].includes(path.extname(file).toLowerCase())
  )
    throw new Error("Неподдерживаемый путь или формат медиа");
  const info = JSON.parse(
    (
      await run(ffprobe, [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        file,
      ])
    ).toString(),
  );
  const v = info.streams.find(
      (s: { codec_type: string }) => s.codec_type === "video",
    ),
    audio = info.streams.some(
      (s: { codec_type: string }) => s.codec_type === "audio",
    );
  const image = [".png", ".jpg", ".jpeg", ".webp"].includes(
    path.extname(file).toLowerCase(),
  );
  if (!v && !audio) throw new Error("Файл не содержит медиа");
  const id = randomUUID();
  media.set(id, file);
  const a: Asset = {
    id,
    name: path.basename(file),
    path: file,
    url: `nightmedia://asset/${id}`,
    kind: image ? "image" : v ? "video" : "audio",
    duration: image ? 5 : Number(info.format.duration || v?.duration || 0),
    width: v?.width,
    height: v?.height,
  };
  if (!image && a.duration <= 0)
    throw new Error("Не удалось определить длительность");
  if (audio) {
    const raw = await run(ffmpeg, [
      "-v",
      "error",
      "-i",
      file,
      "-t",
      "3600",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "2000",
      "-f",
      "f32le",
      "pipe:1",
    ]);
    const count = Math.floor(raw.length / 4),
      bins = 240;
    const peaks = Array<number>(bins).fill(0);
    for (let i = 0; i < count; i++)
      peaks[Math.min(bins - 1, Math.floor((i / count) * bins))] = Math.max(
        peaks[Math.min(bins - 1, Math.floor((i / count) * bins))],
        Math.abs(raw.readFloatLE(i * 4)),
      );
    a.wave = peaks;
  }
  return assetSchema.parse(a);
}
function handle<Args extends unknown[]>(
  name: string,
  fn: (...args: Args) => unknown,
) {
  ipcMain.handle(name, (event, ...args) => {
    if (
      event.sender !== win.webContents ||
      event.senderFrame !== win.webContents.mainFrame
    )
      throw new Error("Недопустимый IPC отправитель");
    return fn(...(args as Args));
  });
}
interface ExportJob {
  process: ChildProcessWithoutNullStreams;
  closed: Promise<void>;
  error: string;
  output: string;
  temp: string;
  frames: number;
  expected: number;
  duration: number;
  hasAudio: boolean;
}
let job: ExportJob | null = null;
async function cancel() {
  const active = job;
  if (!active) return;
  job = null;
  active.process.kill();
  await active.closed.catch(() => {});
  await unlink(active.temp).catch(() => {});
}
app.whenReady().then(async () => {
  protocol.handle("nightmedia", async (request) => {
    const url = new URL(request.url),
      id = url.pathname.slice(1),
      file = media.get(id);
    if (url.host !== "asset" || !file)
      return new Response("Not found", { status: 404 });
    const size = (await stat(file)).size;
    const range = request.headers.get("range");
    let start = 0,
      end = size - 1,
      status = 200;
    if (range) {
      const m = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!m) return new Response(null, { status: 416 });
      start = Number(m[1]);
      end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      status = 206;
      if (start > end || start >= size)
        return new Response(null, { status: 416 });
    }
    const ext = path.extname(file).toLowerCase();
    const types: Record<string, string> = {
      ".mp4": "video/mp4",
      ".mov": "video/quicktime",
      ".webm": "video/webm",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".m4a": "audio/mp4",
      ".ogg": "audio/ogg",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
    };
    const headers: Record<string, string> = {
      "Content-Type": types[ext] || "application/octet-stream",
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
    };
    if (status === 206)
      headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    return new Response(
      Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream,
      { status, headers },
    );
  });
  win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: "#080b09",
    title: "NIGHTFRAME Studio",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, cb) =>
    cb(false),
  );
  handle("media:import", async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Медиа",
          extensions: [
            "mp4",
            "mov",
            "mkv",
            "webm",
            "mp3",
            "wav",
            "ogg",
            "m4a",
            "aac",
            "flac",
            "png",
            "jpg",
            "jpeg",
            "webp",
          ],
        },
      ],
    });
    return result.canceled ? [] : Promise.all(result.filePaths.map(importPath));
  });
  handle("media:paths", async (input: unknown) =>
    Promise.all(
      z.array(z.string().max(4096)).max(100).parse(input).map(importPath),
    ),
  );
  handle("project:save", async (input: unknown) => {
    const p = projectSchema.parse(input);
    const result = await dialog.showSaveDialog(win, {
      defaultPath: `${p.name.replace(/[<>:"/\\|?*]/g, "_")}.nightframe`,
      filters: [{ name: "Проект NIGHTFRAME", extensions: ["nightframe"] }],
    });
    if (result.canceled || !result.filePath) return false;
    await writeFile(
      result.filePath + ".tmp",
      JSON.stringify(p, null, 2),
      "utf8",
    );
    await rename(result.filePath + ".tmp", result.filePath);
    return true;
  });
  handle("project:open", async () => {
    const result = await dialog.showOpenDialog(win, {
      filters: [{ name: "Проект NIGHTFRAME", extensions: ["nightframe"] }],
    });
    if (result.canceled) return null;
    const file = result.filePaths[0];
    if ((await stat(file)).size > 20 * 1024 * 1024)
      throw new Error("Проект слишком большой");
    const p = projectSchema.parse(JSON.parse(await readFile(file, "utf8")));
    for (const a of p.assets) {
      if (!a.path) throw new Error("Медиа не имеет локального пути");
      const registered = await importPath(a.path);
      a.url = registered.url;
    }
    return p;
  });
  handle("export:begin", async (input: unknown, settings: unknown) => {
    if (job) throw new Error("Экспорт уже идёт");
    const p = projectSchema.parse(input);
    const s = z
      .object({
        height: z.union([z.literal(720), z.literal(1080)]),
        fps: z.union([z.literal(24), z.literal(30), z.literal(60)]),
        quality: z.number().int().min(15).max(30),
        name: z.string().max(200),
      })
      .parse(settings);
    const dur = duration(p);
    if (!dur) throw new Error("Таймлайн пуст");
    for (const a of p.assets)
      if (a.path && ![...media.values()].includes(a.path))
        throw new Error("Сначала импортируйте медиа");
    const result = await dialog.showSaveDialog(win, {
      defaultPath: s.name.replace(/[<>:"/\\|?*]/g, "_") + ".mp4",
      filters: [{ name: "MP4 видео", extensions: ["mp4"] }],
    });
    if (result.canceled || !result.filePath) return false;
    const output = result.filePath,
      temp = output + ".rendering.mp4";
    const args = [
      "-hide_banner",
      "-y",
      "-f",
      "image2pipe",
      "-framerate",
      String(s.fps),
      "-vcodec",
      "mjpeg",
      "-i",
      "pipe:0",
    ];
    const audioClips = p.clips.filter(
      (c) =>
        (c.kind === "video" || c.kind === "audio") &&
        c.assetId &&
        !p.muted.includes(c.track) &&
        c.volume > 0,
    );
    const realAudio: typeof audioClips = [];
    for (const c of audioClips) {
      const a = p.assets.find((a) => a.id === c.assetId);
      if (!a?.path) continue;
      const info = JSON.parse(
        (
          await run(ffprobe, [
            "-v",
            "error",
            "-show_streams",
            "-of",
            "json",
            a.path,
          ])
        ).toString(),
      );
      if (
        info.streams.some(
          (s: { codec_type: string }) => s.codec_type === "audio",
        )
      ) {
        realAudio.push(c);
        args.push("-i", a.path);
      }
    }
    const filters = realAudio.map(
      (c, i) =>
        `[${i + 1}:a]atrim=start=${c.in}:duration=${c.duration},asetpts=N/SR/TB,volume=${c.volume},adelay=${Math.round(c.start * 1000)}:all=1[a${i}]`,
    );
    if (filters.length) {
      filters.push(
        realAudio.map((_, i) => `[a${i}]`).join("") +
          `amix=inputs=${realAudio.length}:normalize=0:duration=longest,asetpts=N/SR/TB,apad,atrim=duration=${dur}[audio]`,
      );
      args.push(
        "-filter_complex",
        filters.join(";"),
        "-map",
        "0:v:0",
        "-map",
        "[audio]",
        "-c:a",
        "aac",
        "-b:a",
        "320k",
      );
    } else args.push("-map", "0:v:0", "-an");
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      String(s.quality),
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-t",
      String(dur),
      temp,
    );
    const child = spawn(ffmpeg, args, { windowsHide: true });
    const j: ExportJob = {
      process: child,
      closed: Promise.resolve(),
      error: "",
      temp,
      output,
      frames: 0,
      expected: Math.ceil(dur * s.fps),
      duration: dur,
      hasAudio: realAudio.length > 0,
    };
    j.closed = new Promise<void>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(j.error || "FFmpeg завершился с ошибкой")),
      );
    });
    j.closed.catch(() => {});
    child.stderr.on("data", (d) => {
      j.error = (j.error + d.toString()).slice(-6000);
    });
    child.stdin.on("error", () => {});
    job = j;
    return true;
  });
  handle("export:frame", async (bytes: unknown) => {
    const j = job;
    if (!j) throw new Error("Экспорт не запущен");
    if (
      !(bytes instanceof Uint8Array) ||
      bytes.length > 32 * 1024 * 1024 ||
      j.frames >= j.expected
    )
      throw new Error("Недопустимый кадр");
    await new Promise<void>((resolve, reject) =>
      j.process.stdin.write(bytes, (e) => (e ? reject(e) : resolve())),
    );
    j.frames++;
  });
  handle("export:finish", async () => {
    const j = job;
    if (!j || j.frames !== j.expected) throw new Error("Неполный набор кадров");
    j.process.stdin.end();
    await j.closed;
    const info = JSON.parse(
      (
        await run(ffprobe, [
          "-v",
          "error",
          "-show_streams",
          "-show_format",
          "-of",
          "json",
          j.temp,
        ])
      ).toString(),
    );
    if (
      !info.streams.some(
        (s: { codec_type: string }) => s.codec_type === "video",
      ) ||
      Number(info.format.duration) <= 0
    )
      throw new Error("Неверный экспорт");
    if (j.hasAudio) {
      const audio = info.streams.find(
        (stream: { codec_type: string }) => stream.codec_type === "audio",
      );
      if (
        !audio ||
        Math.abs(Number(audio.start_time || 0)) > 0.1 ||
        Math.abs(Number(audio.duration) - j.duration) > 0.15
      )
        throw new Error("Неверная длительность или синхронизация звука");
    }
    await rename(j.temp, j.output);
    job = null;
    return j.output;
  });
  handle("export:cancel", cancel);
  if (process.argv.includes("--dev"))
    await win.loadURL("http://localhost:5173");
  else await win.loadFile(path.join(__dirname, "../dist/index.html"));
  win.on("closed", () => {
    void cancel();
  });
});
app.on("window-all-closed", () => {
  void cancel().finally(() => app.quit());
});
