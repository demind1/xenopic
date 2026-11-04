import {
  mkdir,
  copyFile,
  writeFile,
  readdir,
  readFile,
} from "node:fs/promises";
import path from "node:path";
await mkdir("dist-notices", { recursive: true });
for (const pkg of [
  "ffmpeg-static",
  "ffprobe-static",
  "electron",
  "react",
  "react-dom",
  "zustand",
  "zod",
  "lucide-react",
]) {
  const root = path.join("node_modules", pkg);
  const names = await readdir(root);
  for (const file of names.filter((n) =>
    /license|notice|readme|package\.json/i.test(n),
  )) {
    try {
      await copyFile(
        path.join(root, file),
        path.join("dist-notices", pkg + "-" + file),
      );
    } catch (e) {
      if (e.code !== "EISDIR") throw e;
    }
  }
}
await copyFile("docs/THIRD_PARTY.md", "dist-notices/THIRD_PARTY.md");
