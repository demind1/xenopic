import { useState } from "react";
import {
  Search,
  Plus,
  ArrowUpRight,
  Film,
  Music2,
  Image,
  Upload,
  SlidersHorizontal,
  Sparkles,
  Type,
  Layers,
  FolderOpen,
} from "lucide-react";
import { useStore, addToTimeline } from "../core/store";
import { effects, presets, makeClip, type EffectName } from "../core/model";
export default function Library({ onImport }: { onImport: () => void }) {
  const [tab, setTab] = useState("Эффекты"),
    [category, setCategory] = useState("Все"),
    [query, setQuery] = useState("");
  const s = useStore();
  const chosen = s.project.clips.find((c) => c.id === s.selected);
  function apply(values: Partial<Record<EffectName, number>>) {
    if (!chosen || chosen.kind === "audio") {
      s.notify("Сначала выделите видео или текст на таймлайне");
      return;
    }
    if (s.project.locked.includes(chosen.track)) {
      s.notify("Дорожка заблокирована");
      return;
    }
    s.patch(chosen.id, { effects: { ...chosen.effects, ...values } });
    s.notify("Эффекты применены к «" + chosen.name + "»");
  }
  return (
    <aside className="library panel">
      <nav className="library-tabs">
        {[
          { name: "Медиа", icon: FolderOpen },
          { name: "Эффекты", icon: SlidersHorizontal },
          { name: "Пресеты", icon: Sparkles },
          { name: "Текст", icon: Type },
        ].map(({ name, icon: Icon }) => (
          <button
            key={name}
            className={tab === name ? "selected" : ""}
            onClick={() => {
              setTab(name);
              setCategory("Все");
              setQuery("");
            }}
          >
            <Icon size={19} />
            <span>{name}</span>
          </button>
        ))}
      </nav>
      <div className="library-content">
        <div className="section-heading">
          <h2>
            {tab === "Пресеты"
              ? "Быстрые эдиты"
              : tab === "Медиа"
                ? "Ваша медиатека"
                : tab === "Текст"
                  ? "Типографика"
                  : "Библиотека эффектов"}
          </h2>
          <span className="badge">{tab === "Эффекты" ? "08" : "STUDIO"}</span>
        </div>
        <label className="search">
          <Search size={15} />
          <input
            placeholder="Найти свой сигнал…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>⌕</kbd>
        </label>
        {tab === "Эффекты" && (
          <>
            <div className="categories">
              {[
                "Все",
                "Glitch",
                "Pixel",
                "VHS",
                "Angelcore",
                "Цвет",
                "Свет",
              ].map((c) => (
                <button
                  key={c}
                  className={category === c ? "selected" : ""}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="library-label">СОЗДАЙТЕ СВОЙ ВИЗУАЛЬНЫЙ ЯЗЫК</div>
            <div className="effect-grid">
              {effects
                .filter(
                  (e) =>
                    (category === "Все" || e.category === category) &&
                    `${e.name} ${e.ru}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                )
                .map((e, i) => (
                  <button
                    draggable
                    onDragStart={(ev) =>
                      ev.dataTransfer.setData("effect", e.id)
                    }
                    key={e.id}
                    className="effect-card"
                    title={`${e.ru}. ${e.description} Нажмите, чтобы применить.`}
                    onClick={() => apply({ [e.id]: 0.3 })}
                  >
                    <div className={`effect-art effect-${e.id}`}>
                      <span className="effect-index">0{i + 1}</span>
                      <div className="effect-orbit" />
                      <strong>
                        {e.id === "rgb"
                          ? "SIGNAL"
                          : e.id === "pixel"
                            ? "PIXEL"
                            : e.id === "glow"
                              ? "HALO"
                              : e.id === "mono"
                                ? "NOIR"
                                : e.id === "grain"
                                  ? "ANALOG"
                                  : e.id === "fade"
                                    ? "FADE"
                                    : "LIGHT"}
                      </strong>
                      <span className="add-effect">
                        <Plus size={14} />
                      </span>
                    </div>
                    <div className="effect-caption">
                      <span>{e.name}</span>
                      <small>{e.category}</small>
                    </div>
                  </button>
                ))}
            </div>
            <p className="library-hint">
              <Layers size={13} /> Комбинируйте эффекты. Создавайте новое.
            </p>
          </>
        )}
        {tab === "Пресеты" && (
          <>
            <p className="muted intro">Один стиль. Одно нажатие. Ваш звук.</p>
            <div className="preset-list">
              {presets
                .filter((p) =>
                  p.name.toLowerCase().includes(query.toLowerCase()),
                )
                .map((p, i) => (
                  <button key={p.name} onClick={() => apply(p.effects)}>
                    <div className={`preset-art preset-${i}`}>
                      <div className="effect-orbit" />
                      <span>NF / 0{i + 1}</span>
                    </div>
                    <b>{p.name}</b>
                    <small>{p.tag}</small>
                    <ArrowUpRight size={16} />
                  </button>
                ))}
            </div>
            <button
              className="wide"
              disabled={!chosen}
              onClick={() => {
                if (!chosen) return;
                const blob = new Blob(
                  [
                    JSON.stringify({
                      name: chosen.name,
                      effects: chosen.effects,
                    }),
                  ],
                  { type: "application/json" },
                );
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "preset.json";
                a.click();
                URL.revokeObjectURL(a.href);
              }}
            >
              Сохранить пресет клипа
            </button>
            <label className="file-label">
              Импорт пресета
              <input
                type="file"
                accept=".json"
                onChange={async (e) => {
                  try {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const raw = JSON.parse(await file.text());
                    const values: Partial<Record<EffectName, number>> = {};
                    for (const def of effects) {
                      const v = raw.effects?.[def.id];
                      if (typeof v === "number" && v >= 0 && v <= 1)
                        values[def.id] = v;
                    }
                    apply(values);
                  } catch (err) {
                    s.notify(String(err));
                  }
                }}
              />
            </label>
          </>
        )}
        {tab === "Медиа" && (
          <>
            <button className="import-tile" onClick={onImport}>
              <Upload size={24} />
              <b>Импортировать медиа</b>
              <span>Видео, музыка и изображения</span>
            </button>
            <p className="library-label">ДВОЙНОЙ ЩЕЛЧОК → НА ТАЙМЛАЙН</p>
            <div className="media-list">
              {s.project.assets
                .filter((a) =>
                  a.name.toLowerCase().includes(query.toLowerCase()),
                )
                .map((a) => (
                  <button
                    key={a.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("asset", a.id)}
                    onDoubleClick={() => addToTimeline(a)}
                    title="Дважды нажмите или перетащите на таймлайн"
                  >
                    <div>
                      {a.kind === "video" ? (
                        <Film />
                      ) : a.kind === "audio" ? (
                        <Music2 />
                      ) : (
                        <Image />
                      )}
                    </div>
                    <b>
                      {a.name}
                      <small>
                        {a.kind.toUpperCase()} · {a.duration.toFixed(1)} сек
                      </small>
                    </b>
                    <Plus size={14} />
                  </button>
                ))}
            </div>
          </>
        )}
        {tab === "Текст" && (
          <>
            <div className="text-sample">
              YOUR
              <br />
              <em>NEXT</em>
              <br />
              SIGNAL.
            </div>
            <p className="muted intro">
              Название бита, строчка из трека, ваша история. Поддерживается
              кириллица.
            </p>
            <button
              className="primary wide"
              onClick={() => {
                const c = makeClip("text", "DEPHCORE", 2, 5);
                c.start = s.time;
                s.add(c);
              }}
            >
              <Plus size={16} /> Добавить текст
            </button>
          </>
        )}
      </div>
      <div className="library-bottom">
        <span className="pixel-symbol">⌘</span>
        <div>
          MADE FOR YOUR FREQUENCY<small>NIGHTFRAME EFFECT ENGINE / 01</small>
        </div>
      </div>
    </aside>
  );
}
