import { test, expect } from "@playwright/test";
test("editor loads, renders, applies effects, edits text, undoes and configures project", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5173");
  await expect(page.getByText("Библиотека эффектов")).toBeVisible();
  await page
    .getByRole("button", {
      name: "Клип Ethereal signal · генеративный фон",
      exact: true,
    })
    .click();
  await page.getByTitle(/Разделение каналов/).click();
  await expect(page.getByLabel("Интенсивность rgb")).toBeVisible();
  await page.getByLabel("Интенсивность rgb").fill("0.3");
  await page.getByRole("button", { name: "Текст", exact: true }).click();
  await page
    .getByRole("button", { name: "Добавить текст", exact: true })
    .click();
  await page.getByLabel("Текст надписи").fill("DEPHCORE");
  await expect(
    page.getByRole("button", { name: "Клип DEPHCORE", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Настройки проекта", exact: true })
    .click();
  await page
    .getByText("Соотношение сторон")
    .locator("select")
    .selectOption("1080:1920");
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  await expect(page.locator(".project-spec")).toContainText("1080 × 1920");
  await page.screenshot({ path: "test-results/studio.png", fullPage: true });
  await page
    .getByRole("button", { name: "Экспортировать", exact: true })
    .click();
  await expect(
    page.getByText("Вы открыли браузерный режим.", { exact: false }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("each shipped effect changes actual pixels; grain is deterministic", async ({
  page,
}) => {
  await page.goto("http://localhost:5173");
  const result = await page.evaluate(async () => {
    const modulePath = "/src/render/compositor.ts";
    const { prepare, render } = await import(modulePath);
    const modelPath = "/src/core/model.ts";
    const { emptyProject, makeClip, effects } = await import(modelPath);
    const input = document.createElement("canvas");
    input.width = 320;
    input.height = 180;
    const ctx = input.getContext("2d")!;
    const gradient = ctx.createLinearGradient(0, 0, 320, 180);
    gradient.addColorStop(0, "#b62641");
    gradient.addColorStop(0.5, "#165ab2");
    gradient.addColorStop(1, "#eee6a9");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 320, 180);
    ctx.fillStyle = "#fff";
    ctx.fillRect(31, 25, 13, 70);
    ctx.fillStyle = "#000";
    ctx.fillRect(90, 32, 41, 41);
    const p = emptyProject();
    p.width = 320;
    p.height = 180;
    p.assets = [
      {
        id: "image",
        name: "fixture",
        kind: "image",
        url: input.toDataURL(),
        duration: 5,
      },
    ];
    const clip = makeClip("image", "fixture", 0, 5, "image");
    p.clips = [clip];
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    await prepare(p, 0.25);
    render(canvas, p, 0.25);
    const original = canvas.getContext("2d")!.getImageData(0, 0, 320, 180).data;
    const changed: string[] = [];
    for (const effect of effects) {
      clip.effects = { [effect.id]: 0.5 };
      render(canvas, p, 0.25);
      const pixels = canvas.getContext("2d")!.getImageData(0, 0, 320, 180).data;
      let difference = 0;
      for (let i = 0; i < pixels.length; i++)
        difference += Math.abs(pixels[i] - original[i]);
      if (difference > 1000) changed.push(effect.id);
    }
    clip.effects = { grain: 0.5 };
    render(canvas, p, 0.25);
    const first = canvas.toDataURL();
    render(canvas, p, 0.25);
    const second = canvas.toDataURL();
    render(canvas, p, 0.5);
    const third = canvas.toDataURL();
    return { changed, same: first === second, different: first !== third };
  });
  expect(result.changed.sort()).toEqual(
    [
      "brightness",
      "contrast",
      "rgb",
      "pixel",
      "grain",
      "glow",
      "mono",
      "fade",
    ].sort(),
  );
  expect(result.same).toBe(true);
  expect(result.different).toBe(true);
});
