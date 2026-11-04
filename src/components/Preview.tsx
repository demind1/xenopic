import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Scan,
  Shield,
  ChevronDown,
} from "lucide-react";
import { useStore } from "../core/store";
import { duration } from "../core/model";
import { prepare, render } from "../render/compositor";
export function timecode(t: number, fps = 30) {
  const f = Math.round(t * fps);
  return [
    Math.floor(f / fps / 3600),
    Math.floor(f / fps / 60) % 60,
    Math.floor(f / fps) % 60,
    f % fps,
  ]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
}
export default function Preview() {
  const {
    project: p,
    time,
    playing,
    setTime,
    toggle,
    notify,
    selected,
    patch,
  } = useStore();
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 640, height: 360 });
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setBounds({ width: r.width, height: r.height });
    });
    if (stage.current) observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  const [safe, setSafe] = useState(false),
    [quality, setQuality] = useState(0.5);
  const sounds = useRef(new Map<string, HTMLAudioElement>());
  useEffect(() => {
    let disposed = false,
      frame = 0,
      last = -1,
      failed = false;
    const pump = async () => {
      const t = useStore.getState().time;
      if (t !== last && !failed) {
        try {
          await prepare(p, t);
          if (!disposed && canvas.current) {
            render(canvas.current, p, t);
            canvas.current.dataset.renderedTime = String(t);
            last = t;
          }
        } catch (e) {
          if (!disposed) {
            console.error("Preview render failed:", e);
            notify(String(e));
            failed = true;
          }
        }
      }
      if (!disposed) frame = requestAnimationFrame(() => void pump());
    };
    void pump();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
    };
  }, [p, quality, notify]);
  useEffect(() => {
    if (!playing) return;
    const started = performance.now(),
      offset = useStore.getState().time;
    let frame = 0;
    const tick = () => {
      const t = offset + (performance.now() - started) / 1000;
      if (t >= duration(p)) {
        setTime(duration(p));
        useStore.setState({ playing: false });
        return;
      }
      setTime(t);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, p, setTime]);
  useEffect(() => {
    const ids = new Set<string>();
    for (const c of p.clips) {
      if (!c.assetId || !["video", "audio"].includes(c.kind)) continue;
      const a = p.assets.find((a) => a.id === c.assetId);
      if (!a) continue;
      ids.add(c.id);
      let el = sounds.current.get(c.id);
      if (!el) {
        el = new Audio(a.url);
        el.preload = "auto";
        sounds.current.set(c.id, el);
      }
      if (el.src !== a.url) el.src = a.url;
      const active =
        playing &&
        time >= c.start &&
        time < c.start + c.duration &&
        !p.muted.includes(c.track);
      if (active) {
        const target = c.in + time - c.start;
        if (Math.abs(el.currentTime - target) > 0.16) el.currentTime = target;
        el.volume = Math.min(1, c.volume);
        if (el.paused)
          void el.play().catch((e) => {
            if (e.name !== "AbortError" && e.name !== "NotSupportedError")
              notify("Звук: " + e.message);
          });
      } else el.pause();
    }
    for (const [id, el] of sounds.current)
      if (!ids.has(id)) {
        el.pause();
        sounds.current.delete(id);
      }
  }, [p, time, playing, notify]);
  useEffect(
    () => () => {
      for (const el of sounds.current.values()) el.pause();
    },
    [],
  );
  return (
    <section className="preview panel">
      <div className="panel-title">
        <span>
          ПРЕДПРОСМОТР <span className="live-dot" />
        </span>
        <div className="inline">
          <select
            aria-label="Качество предпросмотра"
            value={quality}
            onChange={(e) => setQuality(+e.target.value)}
          >
            <option value={1}>Полное</option>
            <option value={0.5}>½ качества</option>
            <option value={0.25}>¼ качества</option>
          </select>
          <button
            title="Безопасные границы"
            className={safe ? "active" : ""}
            onClick={() => setSafe(!safe)}
          >
            <Shield size={14} />
          </button>
        </div>
      </div>
      <div className="stage" ref={stage}>
        <div
          className="canvas-wrap"
          style={{
            width: Math.min(bounds.width, (bounds.height * p.width) / p.height),
            height: Math.min(
              bounds.height,
              (bounds.width * p.height) / p.width,
            ),
            aspectRatio: `${p.width}/${p.height}`,
          }}
        >
          <canvas
            ref={canvas}
            width={Math.round(p.width * quality)}
            height={Math.round(p.height * quality)}
            onPointerDown={(e) => {
              const c = p.clips.find((c) => c.id === selected);
              if (!c || p.locked.includes(c.track)) return;
              useStore.getState().begin();
              const rect = e.currentTarget.getBoundingClientRect();
              const move = (ev: PointerEvent) => {
                patch(c.id, {
                  x: Math.max(
                    -2,
                    Math.min(2, (ev.clientX - rect.left) / rect.width),
                  ),
                  y: Math.max(
                    -2,
                    Math.min(2, (ev.clientY - rect.top) / rect.height),
                  ),
                });
              };
              const target = e.currentTarget;
              target.setPointerCapture(e.pointerId);
              target.onpointermove = move;
              target.onpointerup = () => {
                target.onpointermove = null;
                useStore.getState().end();
              };
            }}
          />
          {safe && <div className="safe-frame" />}
          {!p.clips.length && (
            <div className="empty-preview">
              <Scan size={40} />
              <b>Здесь начинается ваш эдит</b>
              <span>Импортируйте видео и добавьте его на таймлайн</span>
            </div>
          )}
        </div>
      </div>
      <div className="transport">
        <span className="mono">
          {timecode(time, p.fps)}{" "}
          <small>/ {timecode(duration(p), p.fps)}</small>
        </span>
        <div className="inline">
          <button
            title="Предыдущий кадр"
            onClick={() => setTime(time - 1 / p.fps)}
          >
            <SkipBack size={16} />
          </button>
          <button
            className="play"
            title={playing ? "Пауза (Space)" : "Воспроизвести (Space)"}
            onClick={() => {
              if (time >= duration(p)) setTime(0);
              toggle();
            }}
          >
            {playing ? <Pause size={17} /> : <Play size={17} />}
          </button>
          <button
            title="Следующий кадр"
            onClick={() => setTime(Math.min(duration(p), time + 1 / p.fps))}
          >
            <SkipForward size={16} />
          </button>
        </div>
        <span className="resolution">
          {p.width} × {p.height} <ChevronDown size={12} />
        </span>
      </div>
    </section>
  );
}
