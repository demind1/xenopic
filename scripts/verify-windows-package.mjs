import { readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
const root = path.resolve(process.argv[2] || "release/win-unpacked");
const binaries = {
  app: path.join(root, "NIGHTFRAME Studio.exe"),
  ffmpeg: path.join(
    root,
    "resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe",
  ),
  ffprobe: path.join(
    root,
    "resources/app.asar.unpacked/node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe",
  ),
};
for (const [name, file] of Object.entries(binaries)) {
  if (statSync(file).size < 1024 * 1024)
    throw new Error(`${name}: binary is unexpectedly small`);
  const bytes = readFileSync(file);
  const header = bytes.readUInt32LE(0x3c);
  if (
    bytes.toString("ascii", 0, 2) !== "MZ" ||
    bytes.toString("ascii", header, header + 4) !== "PE\0\0" ||
    bytes.readUInt16LE(header + 4) !== 0x8664
  )
    throw new Error(`${name}: expected Windows x64 PE executable`);
  console.log(
    `${name}: Windows x64 executable present (${statSync(file).size} bytes)`,
  );
}
for (const name of ["ffmpeg", "ffprobe"]) {
  const version = execFileSync(binaries[name], ["-version"], {
    encoding: "utf8",
    windowsHide: true,
  });
  console.log(version.split(/\r?\n/)[0]);
}
const encoders = execFileSync(binaries.ffmpeg, ["-hide_banner", "-encoders"], {
  encoding: "utf8",
  windowsHide: true,
});
if (!/\blibx264\b/.test(encoders) || !/\baac\b/.test(encoders))
  throw new Error("Bundled FFmpeg must encode H.264 and AAC");
statSync(path.join(root, "resources/notices/THIRD_PARTY.md"));
console.log("Bundled FFmpeg, FFprobe, required encoders and notices verified.");
