import { create } from "zustand";
import {
  emptyProject,
  makeClip,
  splitClip,
  uid,
  type Project,
  type Clip,
  type Asset,
} from "./model";
export interface State {
  transaction: boolean;
  begin: () => void;
  end: () => void;
  project: Project;
  selected: string | null;
  time: number;
  playing: boolean;
  past: Project[];
  future: Project[];
  message: string;
  edit: (fn: (p: Project) => void) => void;
  setTime: (t: number) => void;
  select: (id: string | null) => void;
  toggle: () => void;
  undo: () => void;
  redo: () => void;
  load: (p: Project) => void;
  patch: (id: string, patch: Partial<Clip>) => void;
  split: () => void;
  remove: () => void;
  duplicate: () => void;
  addAsset: (a: Asset) => void;
  add: (c: Clip) => void;
  notify: (s: string) => void;
}
export const useStore = create<State>((set, get) => ({
  transaction: false,
  begin: () => {
    const s = get();
    set({
      transaction: true,
      past: [...s.past.slice(-49), structuredClone(s.project)],
      future: [],
    });
  },
  end: () => set({ transaction: false }),
  project: emptyProject(),
  selected: null,
  time: 0,
  playing: false,
  past: [],
  future: [],
  message: "",
  edit: (fn) => {
    const s = get(),
      p = structuredClone(s.project);
    fn(p);
    set({
      project: p,
      past: s.transaction ? s.past : [...s.past.slice(-49), s.project],
      future: [],
    });
  },
  setTime: (time) => set({ time: Math.max(0, time) }),
  select: (selected) => set({ selected }),
  toggle: () => set((s) => ({ playing: !s.playing })),
  undo: () => {
    const s = get();
    if (s.past.length)
      set({
        project: s.past.at(-1)!,
        past: s.past.slice(0, -1),
        future: [s.project, ...s.future],
        playing: false,
      });
  },
  redo: () => {
    const s = get();
    if (s.future.length)
      set({
        project: s.future[0],
        future: s.future.slice(1),
        past: [...s.past, s.project],
        playing: false,
      });
  },
  load: (project) =>
    set({
      transaction: false,
      project,
      selected: null,
      time: 0,
      playing: false,
      past: [],
      future: [],
    }),
  patch: (id, patch) => {
    if (
      get().project.locked.includes(
        get().project.clips.find((c) => c.id === id)?.track ?? -1,
      )
    )
      return;
    get().edit((p) => {
      const c = p.clips.find((c) => c.id === id);
      if (c) Object.assign(c, patch);
    });
  },
  split: () => {
    const s = get();
    s.edit((p) => {
      p.clips = p.clips.flatMap((c) =>
        c.id === s.selected && !p.locked.includes(c.track)
          ? splitClip(c, s.time)
          : [c],
      );
    });
  },
  remove: () => {
    const s = get();
    s.edit((p) => {
      p.clips = p.clips.filter(
        (c) => c.id !== s.selected || p.locked.includes(c.track),
      );
    });
    set({ selected: null });
  },
  duplicate: () => {
    const s = get(),
      c = s.project.clips.find((c) => c.id === s.selected);
    if (c)
      s.add({ ...structuredClone(c), id: uid(), start: c.start + c.duration });
  },
  addAsset: (a) =>
    get().edit((p) => {
      p.assets.push(a);
    }),
  add: (c) => {
    get().edit((p) => p.clips.push(c));
    set({ selected: c.id });
  },
  notify: (message) => set({ message }),
}));
export function addToTimeline(a: Asset) {
  const s = useStore.getState();
  const track = a.kind === "audio" ? 3 : 0;
  const c = makeClip(a.kind, a.name, track, a.duration || 5, a.id);
  c.start = s.time;
  s.add(c);
}
