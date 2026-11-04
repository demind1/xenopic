import { describe, it, expect, beforeEach } from "vitest";
import {
  emptyProject,
  makeClip,
  splitClip,
  interpolate,
  projectSchema,
  duration,
} from "../src/core/model";
import { useStore } from "../src/core/store";
describe("non-destructive timeline", () => {
  beforeEach(() => useStore.getState().load(emptyProject()));
  it("splits at the playhead with correct source offsets", () => {
    const c = makeClip("video", "clip", 0, 15);
    c.start = 2;
    c.in = 4;
    const [a, b] = splitClip(c, 7);
    expect(a.duration).toBe(5);
    expect(b.in).toBe(9);
    expect(b.start).toBe(7);
    expect(b.duration).toBe(10);
    expect(c.duration).toBe(15);
  });
  it("preserves eased animation exactly across split", () => {
    const c = makeClip("video", "clip", 0, 10);
    c.keys.scale = [
      { time: 0, value: 1, ease: "smooth" },
      { time: 10, value: 2, ease: "linear" },
    ];
    const [left, right] = splitClip(c, 4);
    for (const t of [0, 2, 4, 6, 9])
      expect(
        interpolate((t < 4 ? left : right).keys.scale, t < 4 ? t : t - 4, 1),
      ).toBeCloseTo(interpolate(c.keys.scale, t, 1), 8);
  });
  it("does not split outside a clip", () => {
    const c = makeClip("text", "title", 2);
    expect(splitClip(c, 100)).toEqual([c]);
  });
  it("undoes and redoes edits and respects track lock", () => {
    const s = useStore.getState(),
      c = makeClip("text", "text", 2);
    s.add(c);
    s.patch(c.id, { text: "CHANGED" });
    expect(useStore.getState().project.clips[0].text).toBe("CHANGED");
    s.undo();
    expect(useStore.getState().project.clips[0].text).not.toBe("CHANGED");
    s.redo();
    expect(useStore.getState().project.clips[0].text).toBe("CHANGED");
    s.edit((p) => p.locked.push(2));
    s.patch(c.id, { start: 12 });
    expect(useStore.getState().project.clips[0].start).toBe(0);
  });
  it("serializes keyframes effects and mix without loss", () => {
    const p = emptyProject(),
      c = makeClip("video", "v", 0);
    c.effects = { rgb: 0.3, pixel: 0.1 };
    c.volume = 0.6;
    c.keys.opacity = [
      { time: 0, value: 0, ease: "linear" },
      { time: 2, value: 1, ease: "smooth" },
    ];
    p.clips = [c];
    expect(projectSchema.parse(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(duration(p)).toBe(10);
  });
  it("rejects malformed projects and excessive dimensions", () => {
    expect(() =>
      projectSchema.parse({ ...emptyProject(), width: 99999 }),
    ).toThrow();
  });
  it.each(["linear", "in", "out", "smooth", "step"] as const)(
    "interpolates %s at endpoints",
    (ease) => {
      const keys = [
        { time: 0, value: 1, ease },
        { time: 2, value: 3, ease },
      ];
      expect(interpolate(keys, 0, 0)).toBe(1);
      expect(interpolate(keys, 2.01, 0)).toBe(3);
    },
  );
});
