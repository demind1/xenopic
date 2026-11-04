import { emptyProject, makeClip } from "./model";
export function demoProject() {
  const p = emptyProject();
  p.name = "Ethereal signal";
  p.width = 1920;
  p.height = 1080;
  p.fps = 30;
  const art = makeClip("art", "Ethereal signal · генеративный фон", 0, 18);
  art.effects = { grain: 0.12, contrast: 0.15 };
  const title = makeClip("text", "ETHEREAL SIGNAL", 2, 14);
  title.start = 2;
  title.text = "ETHEREAL SIGNAL";
  title.y = 0.77;
  title.scale = 0.63;
  title.effects = { fade: 0.5, glow: 0.18 };
  p.clips = [art, title];
  return p;
}
