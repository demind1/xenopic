import ffmpeg from "ffmpeg-static";
import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
mkdirSync(".local/fixtures", { recursive: true });
const ff = process.env.NIGHTFRAME_FFMPEG || ffmpeg;
execFileSync(ff, [
  "-y",
  "-v",
  "error",
  "-f",
  "lavfi",
  "-i",
  "testsrc2=size=640x360:rate=30:duration=4",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:sample_rate=48000:duration=4",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-shortest",
  ".local/fixtures/recording.mp4",
]);
execFileSync(ff, [
  "-y",
  "-v",
  "error",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=110:sample_rate=48000:duration=4",
  ".local/fixtures/beat.wav",
]);
