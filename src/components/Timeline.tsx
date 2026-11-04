import { useState } from "react";
import {
  Scissors,
  Copy,
  Trash2,
  Undo2,
  Redo2,
  Magnet,
  Plus,
  Minus,
  Volume2,
  VolumeX,
  Lock,
  Unlock,
  Music2,
  Film,
  Type,
  Flag,
} from "lucide-react";
import { useStore, addToTimeline } from "../core/store";
import { duration, type Clip } from "../core/model";
export default function Timeline() {
  const s = useStore(),
    p = s.project;
  const [zoom, setZoom] = useState(48),
    [snap, setSnap] = useState(true),
    [extra, setExtra] = useState(0);
  const total = Math.max(24, duration(p) + 5);
  const tracks = Math.min(
    16,
    Math.max(4, ...p.clips.map((c) => c.track + 1)) + extra,
  );
  const align = (v: number) => {
    if (!snap) return Math.max(0, v);
    const points = [
      0,
      s.time,
      ...p.markers,
      ...p.clips.flatMap((c) => [c.start, c.start + c.duration]),
    ];
    const closest = points.find((x) => Math.abs(x - v) < 7 / zoom);
    return Math.max(0, closest ?? v);
  };
  function drag(
    e: React.PointerEvent,
    c: Clip,
    mode: "move" | "left" | "right",
  ) {
    if (p.locked.includes(c.track)) return;
    e.stopPropagation();
    s.select(c.id);
    s.begin();
    const startX = e.clientX,
      startY = e.clientY;
    const onMove = (ev: PointerEvent) => {
      const d = (ev.clientX - startX) / zoom;
      if (mode === "move") {
        s.patch(c.id, {
          start: align(c.start + d),
          track: Math.max(
            0,
            Math.min(15, c.track + Math.round((ev.clientY - startY) / 66)),
          ),
        });
      } else if (mode === "right") {
        const asset = p.assets.find((a) => a.id === c.assetId);
        s.patch(c.id, {
          duration: Math.max(
            1 / p.fps,
            Math.min(
              asset && c.kind !== "image" ? asset.duration - c.in : 86400,
              align(c.start + c.duration + d) - c.start,
            ),
          ),
        });
      } else {
        const delta = Math.max(
          -c.in,
          Math.min(c.duration - 1 / p.fps, align(c.start + d) - c.start),
        );
        s.patch(c.id, {
          start: c.start + delta,
          in: c.in + delta,
          duration: c.duration - delta,
          keys: Object.fromEntries(
            Object.entries(c.keys).map(([k, v]) => [
              k,
              v.map((key) => ({ ...key, time: key.time - delta })),
            ]),
          ) as Clip["keys"],
        });
      }
    };
    const onUp = () => {
      s.end();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  return (
    <section className="timeline panel">
      <div className="timeline-tools">
        <div className="inline">
          <button
            title="Отменить (Ctrl+Z)"
            disabled={!s.past.length}
            onClick={s.undo}
          >
            <Undo2 size={17} />
          </button>
          <button
            title="Повторить (Ctrl+Shift+Z)"
            disabled={!s.future.length}
            onClick={s.redo}
          >
            <Redo2 size={17} />
          </button>
          <i />
          <button title="Разделить в позиции курсора (S)" onClick={s.split}>
            <Scissors size={17} />
          </button>
          <button title="Дублировать (Ctrl+D)" onClick={s.duplicate}>
            <Copy size={16} />
          </button>
          <button title="Удалить (Delete)" onClick={s.remove}>
            <Trash2 size={16} />
          </button>
          <i />
          <button
            className={snap ? "active" : ""}
            title="Привязка к границам"
            onClick={() => setSnap(!snap)}
          >
            <Magnet size={17} />
          </button>
          <button
            title="Добавить beat-маркер (M)"
            onClick={() =>
              s.edit((p) => {
                p.markers.push(s.time);
              })
            }
          >
            <Flag size={16} />
          </button>
          <button title="Добавить дорожку" onClick={() => setExtra(extra + 1)}>
            <Plus size={16} />
          </button>
        </div>
        <div className="inline">
          <span className="muted">ТАЙМЛАЙН</span>
          <button
            title="Уменьшить таймлайн"
            onClick={() => setZoom(Math.max(12, zoom / 1.25))}
          >
            <Minus size={14} />
          </button>
          <input
            aria-label="Масштаб таймлайна"
            type="range"
            min={12}
            max={150}
            value={zoom}
            onChange={(e) => setZoom(+e.target.value)}
          />
          <button
            title="Увеличить таймлайн"
            onClick={() => setZoom(Math.min(150, zoom * 1.25))}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
      <div className="timeline-body">
        <div className="track-headers">
          <div className="track-corner">
            {p.fps} FPS <span>♩ {p.bpm}</span>
          </div>
          {Array.from({ length: tracks }, (_, i) => (
            <div className="track-header" key={i}>
              <span>
                {i === 2 ? (
                  <Type size={15} />
                ) : i >= 3 ? (
                  <Music2 size={15} />
                ) : (
                  <Film size={15} />
                )}
                <b>
                  {i === 2 ? "Текст" : i >= 3 ? "Аудио" : "Видео"} {i + 1}
                </b>
              </span>
              <div className="inline">
                <button
                  title="Выключить дорожку"
                  className={p.muted.includes(i) ? "active" : ""}
                  onClick={() =>
                    s.edit((p) => {
                      p.muted = p.muted.includes(i)
                        ? p.muted.filter((v) => v !== i)
                        : [...p.muted, i];
                    })
                  }
                >
                  {p.muted.includes(i) ? (
                    <VolumeX size={12} />
                  ) : (
                    <Volume2 size={12} />
                  )}
                </button>
                <button
                  title="Заблокировать дорожку"
                  onClick={() =>
                    s.edit((p) => {
                      p.locked = p.locked.includes(i)
                        ? p.locked.filter((v) => v !== i)
                        : [...p.locked, i];
                    })
                  }
                >
                  {p.locked.includes(i) ? (
                    <Lock size={12} />
                  ) : (
                    <Unlock size={12} />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="timeline-scroll">
          <div
            className="track-content"
            style={{ width: total * zoom, minHeight: tracks * 66 + 31 }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("asset"),
                a = p.assets.find((a) => a.id === id);
              if (a) {
                const rect = e.currentTarget.getBoundingClientRect();
                s.setTime(Math.max(0, (e.clientX - rect.left) / zoom));
                addToTimeline(a);
              }
            }}
          >
            <div
              className="ruler"
              onPointerDown={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                s.setTime((e.clientX - rect.left) / zoom);
                const move = (ev: PointerEvent) =>
                  s.setTime(Math.max(0, (ev.clientX - rect.left) / zoom));
                const up = () => {
                  window.removeEventListener("pointermove", move);
                  window.removeEventListener("pointerup", up);
                };
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", up);
              }}
            >
              {Array.from({ length: Math.ceil(total / 2) }, (_, i) => (
                <span key={i} style={{ left: i * 2 * zoom }}>
                  {String(Math.floor((i * 2) / 60)).padStart(2, "0")}:
                  {String((i * 2) % 60).padStart(2, "0")}
                </span>
              ))}
            </div>
            {Array.from({ length: tracks }, (_, i) => (
              <div
                className="track-line"
                key={i}
                style={{ top: 31 + i * 66 }}
              />
            ))}
            {p.markers.map((m, i) => (
              <button
                key={i}
                className="marker"
                title="Удалить маркер"
                style={{ left: m * zoom }}
                onClick={() =>
                  s.edit((p) => {
                    p.markers.splice(i, 1);
                  })
                }
              >
                ◆
              </button>
            ))}
            {p.clips.map((c) => {
              const a = p.assets.find((a) => a.id === c.assetId);
              return (
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Клип ${c.name}`}
                  key={c.id}
                  className={`clip ${c.kind} ${s.selected === c.id ? "selected" : ""} ${p.muted.includes(c.track) ? "is-muted" : ""}`}
                  style={{
                    left: c.start * zoom,
                    width: Math.max(14, c.duration * zoom),
                    top: 37 + c.track * 66,
                  }}
                  onPointerDown={(e) => drag(e, c, "move")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") s.select(c.id);
                  }}
                >
                  <div
                    className="trim left"
                    onPointerDown={(e) => drag(e, c, "left")}
                  />
                  <b>
                    {c.kind === "audio" ? "♫" : c.kind === "text" ? "T" : "▤"}{" "}
                    {c.name}
                  </b>
                  {a?.wave ? (
                    <svg
                      viewBox="0 0 480 25"
                      preserveAspectRatio="none"
                      className="waveform"
                    >
                      <path
                        d={a.wave
                          .map((v, i) => `M${i * 2} ${12 - v * 11}v${v * 22}`)
                          .join(" ")}
                        stroke="currentColor"
                        strokeWidth="1.4"
                      />
                    </svg>
                  ) : (
                    <span className="clip-pattern">
                      {c.kind === "text"
                        ? c.text
                        : c.kind === "art"
                          ? "ORIGINAL • GENERATIVE STUDY"
                          : ""}
                    </span>
                  )}
                  <div
                    className="trim right"
                    onPointerDown={(e) => drag(e, c, "right")}
                  />
                </div>
              );
            })}
            <div className="playhead" style={{ left: s.time * zoom }}>
              <span />
            </div>
            {!p.clips.length && (
              <div className="timeline-empty">
                Перетащите медиа сюда или дважды нажмите на него в медиатеке
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="timeline-footer">
        <span>
          <span className="live-dot" /> Локальный проект · без облака
        </span>
        <span>
          Space — воспроизведение <i /> S — разделить <i /> Ctrl+S — сохранить
        </span>
      </div>
    </section>
  );
}
