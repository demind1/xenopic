import { useState } from "react";
import { Diamond, Plus, X, SlidersHorizontal } from "lucide-react";
import { useStore } from "../core/store";
import { effects, interpolate, type Clip } from "../core/model";
export default function Inspector() {
  const s = useStore(),
    c = s.project.clips.find((c) => c.id === s.selected);
  const [advanced, setAdvanced] = useState(false);
  const patch = (v: Partial<Clip>) => c && s.patch(c.id, v);
  const numeric = (
    label: string,
    key:
      "start" | "duration" | "in" | "volume" | "x" | "y" | "scale" | "opacity",
    min: number,
    max: number,
    step = 0.01,
  ) =>
    c && (
      <label className="number-field">
        <span>{label}</span>
        <input
          aria-label={label}
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number(c[key].toFixed(3))}
          onChange={(e) => {
            const value = +e.target.value;
            if (!Number.isFinite(value)) return;
            const asset = s.project.assets.find((a) => a.id === c.assetId);
            let v = Math.max(min, Math.min(max, value));
            if (asset && c.kind !== "image") {
              if (key === "duration") v = Math.min(v, asset.duration - c.in);
              if (key === "in") v = Math.min(v, asset.duration - c.duration);
            }
            patch({ [key]: v });
          }}
        />
      </label>
    );
  return (
    <aside className="inspector panel">
      <div className="panel-title">
        <span>ИНСПЕКТОР</span>
        <SlidersHorizontal size={14} />
      </div>
      {c ? (
        <>
          <div className="inspector-heading">
            <span className="mini-icon">
              {c.kind === "text" ? "T" : c.kind === "audio" ? "♫" : "▤"}
            </span>
            <div>
              <b>{c.name}</b>
              <small>
                {c.kind === "text"
                  ? "ТЕКСТОВЫЙ СЛОЙ"
                  : c.kind === "audio"
                    ? "АУДИОКЛИП"
                    : "ВИЗУАЛЬНЫЙ СЛОЙ"}
              </small>
            </div>
          </div>
          <div className="inspector-body">
            {s.project.locked.includes(c.track) && (
              <p className="warning">Дорожка заблокирована</p>
            )}
            <div className="inspector-section">
              <h3>
                Монтаж <span>СЕК</span>
              </h3>
              {numeric("Начало", "start", 0, 86400)}
              {numeric("Длительность", "duration", 1 / s.project.fps, 86400)}
              {c.assetId &&
                c.kind !== "image" &&
                numeric("Отступ в исходнике", "in", 0, 86400)}
            </div>
            {c.kind === "text" && (
              <div className="inspector-section">
                <h3>Ваш текст</h3>
                <textarea
                  aria-label="Текст надписи"
                  value={c.text}
                  onChange={(e) =>
                    patch({
                      text: e.target.value,
                      name: e.target.value.slice(0, 40) || "Текст",
                    })
                  }
                />
              </div>
            )}
            {["video", "audio"].includes(c.kind) && (
              <div className="inspector-section">
                <h3>Аудио</h3>
                <label className="slider-label">
                  Громкость <span>{Math.round(c.volume * 100)}%</span>
                  <input
                    aria-label="Громкость"
                    type="range"
                    min={0}
                    max={2}
                    step={0.01}
                    value={c.volume}
                    onChange={(e) => patch({ volume: +e.target.value })}
                  />
                </label>
              </div>
            )}
            {c.kind !== "audio" && (
              <>
                <div className="inspector-section">
                  <h3>Трансформация</h3>
                  {numeric("Масштаб", "scale", 0.05, 5)}
                  {numeric("Положение X", "x", -2, 2)}
                  {numeric("Положение Y", "y", -2, 2)}
                  <label className="slider-label">
                    Прозрачность <span>{Math.round(c.opacity * 100)}%</span>
                    <input
                      type="range"
                      aria-label="Прозрачность"
                      min={0}
                      max={1}
                      step={0.01}
                      value={c.opacity}
                      onChange={(e) => patch({ opacity: +e.target.value })}
                    />
                  </label>
                </div>
                <div className="inspector-section">
                  <h3>
                    Эффекты{" "}
                    <span>
                      {Object.keys(c.effects)
                        .length.toString()
                        .padStart(2, "0")}
                    </span>
                  </h3>
                  {Object.entries(c.effects).map(([id, value]) => (
                    <div className="effect-control" key={id}>
                      <div>
                        <b>
                          <span className="live-dot" />
                          {effects.find((e) => e.id === id)?.name}
                        </b>
                        <button
                          title="Удалить эффект"
                          onClick={() => {
                            const e = { ...c.effects };
                            delete e[id as keyof typeof e];
                            patch({ effects: e });
                          }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                      <label className="slider-label">
                        <span className="muted">Интенсивность</span>
                        <strong>{Math.round(value * 100)}%</strong>
                        <input
                          aria-label={`Интенсивность ${id}`}
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={value}
                          onChange={(e) =>
                            patch({
                              effects: { ...c.effects, [id]: +e.target.value },
                            })
                          }
                        />
                      </label>
                    </div>
                  ))}
                  {!Object.keys(c.effects).length && (
                    <p className="muted">Выберите эффект в библиотеке слева</p>
                  )}
                </div>
                <button
                  className="advanced-button"
                  onClick={() => setAdvanced(!advanced)}
                >
                  <Diamond size={13} />
                  {advanced ? "Скрыть ключевые кадры" : "Ключевые кадры"}
                  <Plus size={13} />
                </button>
                {advanced && (
                  <div className="keyframes">
                    <p className="muted">
                      В позиции курсора · {(s.time - c.start).toFixed(2)} сек
                    </p>
                    {(["x", "y", "scale", "opacity"] as const).map((k) => (
                      <div key={k}>
                        <div className="key-title">
                          <b>
                            {
                              {
                                x: "Положение X",
                                y: "Положение Y",
                                scale: "Масштаб",
                                opacity: "Прозрачность",
                              }[k]
                            }
                          </b>
                          <button
                            title="Добавить ключевой кадр"
                            onClick={() => {
                              const t = Math.max(
                                0,
                                Math.min(c.duration, s.time - c.start),
                              );
                              patch({
                                keys: {
                                  ...c.keys,
                                  [k]: [
                                    ...c.keys[k].filter(
                                      (key) => Math.abs(key.time - t) > 0.001,
                                    ),
                                    { time: t, value: c[k], ease: "smooth" },
                                  ].sort((a, b) => a.time - b.time),
                                },
                              });
                            }}
                          >
                            <Diamond size={12} />
                          </button>
                        </div>
                        {c.keys[k].map((key, i) => (
                          <div className="key-row" key={i}>
                            <button
                              title="Перейти к кадру"
                              onClick={() => s.setTime(c.start + key.time)}
                            >
                              {key.time.toFixed(2)}s
                            </button>
                            <input
                              aria-label={`Значение ${k} ${i}`}
                              type="number"
                              step={0.01}
                              value={key.value}
                              onChange={(e) => {
                                const v = +e.target.value;
                                if (Number.isFinite(v))
                                  patch({
                                    keys: {
                                      ...c.keys,
                                      [k]: c.keys[k].map((v, j) =>
                                        j === i
                                          ? { ...v, value: +e.target.value }
                                          : v,
                                      ),
                                    },
                                  });
                              }}
                            />
                            <select
                              aria-label="Интерполяция"
                              value={key.ease}
                              onChange={(e) =>
                                patch({
                                  keys: {
                                    ...c.keys,
                                    [k]: c.keys[k].map((v, j) =>
                                      j === i
                                        ? {
                                            ...v,
                                            ease: e.target
                                              .value as typeof key.ease,
                                          }
                                        : v,
                                    ),
                                  },
                                })
                              }
                            >
                              {["linear", "in", "out", "smooth", "step"].map(
                                (v) => (
                                  <option key={v}>{v}</option>
                                ),
                              )}
                            </select>
                            <button
                              title="Удалить ключ"
                              onClick={() =>
                                patch({
                                  keys: {
                                    ...c.keys,
                                    [k]: c.keys[k].filter((_, j) => j !== i),
                                  },
                                })
                              }
                            >
                              <X size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <div className="inspector-empty">
          <SlidersHorizontal size={30} />
          <b>Всё под контролем</b>
          <p>
            Выделите клип на таймлайне, чтобы настроить монтаж, эффекты и
            анимацию.
          </p>
        </div>
      )}
      <div className="inspector-tip">
        <span>ПОДСКАЗКА</span>
        <p>
          Меньше шума. Больше характера.
          <br />
          Начните с одного эффекта.
        </p>
      </div>
    </aside>
  );
}
