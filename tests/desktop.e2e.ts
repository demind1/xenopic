import { test, expect, _electron as electron } from "@playwright/test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, existsSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ffmpeg = process.env.NIGHTFRAME_FFMPEG || require("ffmpeg-static");
const ffprobe =
  process.env.NIGHTFRAME_FFPROBE || require("ffprobe-static").path;
import type { Project } from "../src/core/model";
test("desktop imports, edits, saves/reopens and renders actual H264/AAC with effect parity", async () => {
  execFileSync("node", ["scripts/fixtures.mjs"]);
  const root = process.cwd();
  mkdirSync(".local", { recursive: true });
  const output = path.join(root, ".local/output.mp4"),
    projectPath = path.join(root, ".local/test.nightframe");
  const application = await electron.launch({
    executablePath: process.env.NIGHTFRAME_PACKAGED_APP,
    args: [
      ...(process.env.NIGHTFRAME_PACKAGED_APP ? [] : ["."]),
      ...(process.platform === "linux" ? ["--no-sandbox"] : []),
    ],
    env: {
      ...process.env,
      NIGHTFRAME_FFMPEG: ffmpeg,
      NIGHTFRAME_FFPROBE: ffprobe,
    },
  });
  try {
    await application.evaluate(
      ({ dialog }, args) => {
        dialog.showSaveDialog = (async (...values: any[]) => {
          const options = values.at(-1);
          return {
            canceled: false,
            filePath: options.defaultPath.endsWith(".mp4")
              ? args.output
              : args.projectPath,
          };
        }) as typeof dialog.showSaveDialog;
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [args.projectPath],
        });
      },
      { output, projectPath },
    );
    const page = await application.firstWindow();
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") console.log("Renderer:", m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await expect(page.getByText("Библиотека эффектов")).toBeVisible();
    const p = (await page.evaluate(
      async (paths) => {
        const api = window.nightframe!;
        const assets = await api.importPaths(paths);
        return {
          version: 1,
          name: "Integration",
          width: 1280,
          height: 720,
          fps: 30,
          bpm: 120,
          assets,
          muted: [],
          locked: [],
          markers: [0.5],
          clips: [
            {
              id: "video",
              assetId: assets[0].id,
              kind: "video",
              name: "Recording",
              track: 0,
              start: 0,
              duration: 1.5,
              in: 0.5,
              volume: 0.3,
              text: "",
              x: 0.5,
              y: 0.5,
              scale: 1,
              opacity: 1,
              effects: {
                rgb: 0.3,
                pixel: 0.1,
                grain: 0.1,
                glow: 0.1,
                contrast: 0.15,
                brightness: 0.1,
                mono: 0.25,
                fade: 0.1,
              },
              keys: {
                x: [],
                y: [],
                scale: [
                  { time: 0, value: 1, ease: "smooth" },
                  { time: 1.5, value: 1.05, ease: "linear" },
                ],
                opacity: [],
              },
            },
            {
              id: "audio",
              assetId: assets[1].id,
              kind: "audio",
              name: "Beat",
              track: 3,
              start: 0.25,
              duration: 1,
              in: 0,
              volume: 0.4,
              text: "",
              x: 0.5,
              y: 0.5,
              scale: 1,
              opacity: 1,
              effects: {},
              keys: { x: [], y: [], scale: [], opacity: [] },
            },
            {
              id: "text",
              kind: "text",
              name: "DEPHCORE",
              text: "DEPHCORE",
              track: 2,
              start: 0,
              duration: 1.5,
              in: 0,
              volume: 0,
              x: 0.5,
              y: 0.75,
              scale: 0.8,
              opacity: 1,
              effects: {},
              keys: { x: [], y: [], scale: [], opacity: [] },
            },
          ],
        };
      },
      [
        path.join(root, ".local/fixtures/recording.mp4"),
        path.join(root, ".local/fixtures/beat.wav"),
      ],
    )) as Project;
    expect(p.assets[0].wave?.some((v) => v > 0)).toBe(true);
    expect(p.assets[1].kind).toBe("audio");
    await page.evaluate(async (project) => {
      await window.nightframe!.save(project);
    }, p);
    expect(existsSync(projectPath)).toBe(true);
    // Load through real main-process project open path and real UI.
    await page
      .getByRole("button", { name: "Открыть проект", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Клип Recording", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Клип Recording", exact: true })
      .click();
    await page.getByLabel("Начало", { exact: true }).fill("0.1");
    await page.getByLabel("Длительность", { exact: true }).fill("1.4");
    await page
      .getByRole("button", { name: "Отменить (Ctrl+Z)", exact: true })
      .click();
    await expect(page.getByLabel("Длительность", { exact: true })).toHaveValue(
      "1.5",
    );
    // Full-quality preview and encoded frame must represent the same composition.
    await page.getByLabel("Качество предпросмотра").selectOption("1");
    const ruler = await page.locator(".ruler").boundingBox();
    await page.mouse.click(ruler!.x + 24, ruler!.y + 8);
    await expect(page.locator(".transport .mono")).toContainText("00:00:00:15");
    await expect
      .poll(
        async () => ({
          time: await page.locator("canvas").getAttribute("data-rendered-time"),
          message: await page.locator("[role=status]").allTextContents(),
        }),
        { timeout: 15000 },
      )
      .toMatchObject({ time: "0.5" });
    await page
      .getByRole("button", {
        name: "Разделить в позиции курсора (S)",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", { name: "Клип Recording", exact: true }),
    ).toHaveCount(2);
    await page
      .getByRole("button", { name: "Отменить (Ctrl+Z)", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Клип Recording", exact: true }),
    ).toHaveCount(1);
    await expect
      .poll(
        async () => ({
          time: await page.locator("canvas").getAttribute("data-rendered-time"),
          message: await page.locator("[role=status]").allTextContents(),
        }),
        { timeout: 15000 },
      )
      .toMatchObject({ time: "0.5" });
    const reference = path.join(root, ".local/reference.png");
    const encoded = await page
      .locator("canvas")
      .evaluate((c) => (c as HTMLCanvasElement).toDataURL().split(",")[1]);
    writeFileSync(reference, Buffer.from(encoded, "base64"));
    // Packaged mode has no source imports; use real export UI to call bundled engine.
    await page
      .getByRole("button", { name: "Экспортировать", exact: true })
      .click();
    await page.getByLabel("Разрешение экспорта").selectOption("720");
    await page
      .getByRole("button", {
        name: "Выбрать папку и экспортировать",
        exact: true,
      })
      .click();
    await expect(page.getByText("Экспорт проверен через FFprobe")).toBeVisible({
      timeout: 150000,
    });
    expect(existsSync(output)).toBe(true);
    const info = JSON.parse(
      execFileSync(
        ffprobe,
        ["-v", "error", "-show_streams", "-show_format", "-of", "json", output],
        { encoding: "utf8" },
      ),
    );
    expect(
      info.streams.find((s: any) => s.codec_type === "video").codec_name,
    ).toBe("h264");
    expect(
      info.streams.find((s: any) => s.codec_type === "audio").codec_name,
    ).toBe("aac");
    expect(info.streams[0].height).toBe(720);
    expect(Math.abs(+info.format.duration - 1.6)).toBeLessThan(0.1);
    const framePath = path.join(root, ".local/encoded.png");
    execFileSync(ffmpeg, [
      "-v",
      "error",
      "-y",
      "-ss",
      "0.5",
      "-i",
      output,
      "-frames:v",
      "1",
      framePath,
    ]);
    const compared = spawnSync(
      ffmpeg,
      [
        "-i",
        reference,
        "-i",
        framePath,
        "-filter_complex",
        "[0:v]format=yuv420p[a];[1:v]format=yuv420p[b];[a][b]ssim",
        "-f",
        "null",
        "-",
      ],
      { encoding: "utf8" },
    );
    expect(compared.status).toBe(0);
    const score = Number(/All:([0-9.]+)/.exec(compared.stderr)?.[1]);
    expect(score).toBeGreaterThan(0.95);
    console.log("Preview/export SSIM:", score);
    // Actual decoded audio has energy, not just a nominal AAC stream.
    const pcm = execFileSync(ffmpeg, [
      "-v",
      "error",
      "-i",
      output,
      "-vn",
      "-f",
      "f32le",
      "-ac",
      "1",
      "-ar",
      "8000",
      "pipe:1",
    ]);
    let energy = 0;
    for (let i = 0; i < pcm.length; i += 4) energy += pcm.readFloatLE(i) ** 2;
    expect(Math.sqrt(energy / (pcm.length / 4))).toBeGreaterThan(0.01);
    const rms = (start: number, end: number) => {
      let sum = 0;
      const from = Math.round(start * 8000),
        to = Math.min(Math.round(end * 8000), pcm.length / 4);
      for (let i = from; i < to; i++) sum += pcm.readFloatLE(i * 4) ** 2;
      return Math.sqrt(sum / Math.max(1, to - from));
    };
    expect(rms(0, 0.07)).toBeLessThan(0.001);
    expect(rms(0.15, 0.23)).toBeGreaterThan(0.005);
    copyFileSync(output, path.join(root, ".local/output720.mp4"));
    await page
      .getByRole("button", { name: "Закрыть экспорт", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Экспортировать", exact: true })
      .click();
    await page.getByLabel("Разрешение экспорта").selectOption("1080");
    await page.getByLabel("FPS экспорта").selectOption("60");
    await page
      .getByRole("button", {
        name: "Выбрать папку и экспортировать",
        exact: true,
      })
      .click();
    await expect(page.getByText("Экспорт проверен через FFprobe")).toBeVisible({
      timeout: 150000,
    });
    const full = JSON.parse(
      execFileSync(
        ffprobe,
        ["-v", "error", "-show_streams", "-of", "json", output],
        { encoding: "utf8" },
      ),
    );
    const video = full.streams.find(
      (stream: any) => stream.codec_type === "video",
    );
    expect(video.width).toBe(1920);
    expect(video.height).toBe(1080);
    expect(video.r_frame_rate).toBe("60/1");
    await page.evaluate(async (project) => {
      await window.nightframe!.beginExport(project, {
        height: 720,
        fps: 30,
        quality: 20,
        name: "cancel",
      });
      await window.nightframe!.cancelExport();
    }, p);
    expect(existsSync(output + ".rendering.mp4")).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await application.close();
  }
});
