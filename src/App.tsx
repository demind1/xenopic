import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Upload,
  Save,
  FolderOpen,
  ChevronDown,
  Plus,
  X,
  Check,
  Command,
  Settings2,
} from "lucide-react";
import Library from "./components/Library";
import Preview from "./components/Preview";
import Timeline from "./components/Timeline";
import Inspector from "./components/Inspector";
import { useStore, addToTimeline } from "./core/store";
import { demoProject } from "./core/demo";
import { browserImport } from "./core/media";
import {
  emptyProject,
  projectSchema,
  effects,
  type Project,
} from "./core/model";
import { exportProject, clearSources } from "./render/compositor";
import "./core/bridge";
useStore.getState().load(demoProject());
function download(text: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function App() {
  const s = useStore(),
    p = s.project;
  const [exporting, setExporting] = useState(false),
    [showExport, setShowExport] = useState(false),
    [progress, setProgress] = useState<number | null>(null),
    [height, setHeight] = useState(1080),
    [fps, setFps] = useState(p.fps),
    [quality, setQuality] = useState(20),
    [showSettings, setShowSettings] = useState(false),
    [busy, setBusy] = useState(false),
    [recover, setRecover] = useState(
      () => !!localStorage.getItem("nightframe-autosave"),
    );
  const canceled = useRef(false),
    file = useRef<HTMLInputElement>(null),
    projectFile = useRef<HTMLInputElement>(null);
  const action = async (fn: () => Promise<unknown>) => {
    try {
      setBusy(true);
      await fn();
    } catch (e) {
      s.notify(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  async function importFiles(files?: File[]) {
    await action(async () => {
      const assets = files
        ? window.nightframe
          ? await window.nightframe.importPaths(
              files.map((f) => window.nightframe!.pathForFile(f)),
            )
          : await browserImport(files)
        : window.nightframe
          ? await window.nightframe.importMedia()
          : null;
      if (!assets) {
        file.current?.click();
        return;
      }
      for (const a of assets) {
        s.addAsset(a);
        addToTimeline(a);
      }
      if (assets.length)
        s.notify(
          `Импортировано: ${assets.length}. Клипы добавлены на таймлайн.`,
        );
    });
  }
  async function save() {
    await action(async () => {
      if (window.nightframe) {
        if (await window.nightframe.save(p)) s.notify("Проект сохранён");
      } else {
        if (p.assets.some((a) => a.url.startsWith("blob:")))
          throw new Error(
            "Постоянное сохранение медиа доступно в настольной версии. Браузерные ссылки действуют только в текущем сеансе.",
          );
        download(JSON.stringify(p, null, 2), p.name + ".nightframe");
        s.notify("Проект сохранён");
      }
    });
  }
  async function loadProject(next: Project) {
    clearSources();
    s.load(next);
  }
  async function open() {
    await action(async () => {
      if (window.nightframe) {
        const next = await window.nightframe.open();
        if (next) await loadProject(next);
      } else projectFile.current?.click();
    });
  }
  useEffect(() => {
    if (recover) return;
    const timer = setTimeout(() => {
      if (p.assets.every((a) => !a.url.startsWith("blob:"))) {
        try {
          localStorage.setItem("nightframe-autosave", JSON.stringify(p));
        } catch {
          s.notify(
            "Недостаточно места для автосохранения. Сохраните проект в файл.",
          );
        }
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [p, recover]);
  useEffect(() => {
    if (!s.message) return;
    const timer = setTimeout(() => s.notify(""), 6500);
    return () => clearTimeout(timer);
  }, [s.message, s.notify]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        exporting ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName,
        )
      )
        return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      } else if (ctrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? s.redo() : s.undo();
      } else if (ctrl && e.key.toLowerCase() === "d") {
        e.preventDefault();
        s.duplicate();
      } else if (e.code === "Space") {
        e.preventDefault();
        s.toggle();
      } else if (e.key === "Delete") s.remove();
      else if (e.key.toLowerCase() === "s") s.split();
      else if (e.key.toLowerCase() === "m")
        s.edit((p) => p.markers.push(s.time));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  return (
    <div
      className="app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const effect = e.dataTransfer.getData("effect");
        if (effect && effects.some((v) => v.id === effect)) {
          const c = p.clips.find((c) => c.id === s.selected);
          if (c) s.patch(c.id, { effects: { ...c.effects, [effect]: 0.3 } });
          else s.notify("Сначала выделите клип");
        }
        if (e.dataTransfer.files.length)
          void importFiles([...e.dataTransfer.files]);
      }}
    >
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <span />
            <span />
            <span />
          </div>
          <div>
            NIGHTFRAME
            <small>
              STUDIO <span> / </span> 01
            </small>
          </div>
        </div>
        <div className="project-title">
          <span className="live-dot" />
          <input
            aria-label="Название проекта"
            value={p.name}
            onChange={(e) =>
              s.edit((p) => {
                p.name = e.target.value;
              })
            }
          />
          <span className="badge">MVP</span>
        </div>
        <div className="top-actions">
          <button
            title="Новый проект"
            onClick={() => {
              if (
                confirm(
                  "Создать новый проект? Сначала сохраните текущий монтаж.",
                )
              ) {
                clearSources();
                s.load(emptyProject());
              }
            }}
          >
            <Plus size={17} />
            <span>Новый</span>
          </button>
          <button title="Открыть проект" onClick={() => void open()}>
            <FolderOpen size={16} />
          </button>
          <button title="Сохранить (Ctrl+S)" onClick={() => void save()}>
            <Save size={16} />
          </button>
          <i />
          <button
            title="Настройки проекта"
            onClick={() => setShowSettings(true)}
          >
            <Settings2 size={16} />
          </button>
          <button
            className="primary export-button"
            onClick={() => {
              s.playing && s.toggle();
              setShowExport(true);
              setProgress(null);
            }}
          >
            <span>Экспортировать</span>
            <ArrowUpRight size={17} />
          </button>
        </div>
      </header>
      <div className="workspace-heading">
        <div>
          <b>Монтаж</b>
          <span>ВАШ ЗВУК. ВАШ ВИЗУАЛЬНЫЙ МИР.</span>
        </div>
        <div className="inline">
          <button
            className="import-button"
            onClick={() => void importFiles()}
            disabled={busy}
          >
            <Upload size={15} />
            {busy ? "Анализ медиа…" : "Импортировать"}
          </button>
          <span className="project-spec">
            {p.width} × {p.height} <i /> {p.fps} FPS
          </span>
        </div>
      </div>
      {recover && (
        <div className="recovery">
          <span>Найдена локальная копия проекта.</span>
          <button
            onClick={() =>
              void action(async () => {
                const next = projectSchema.parse(
                  JSON.parse(localStorage.getItem("nightframe-autosave")!),
                );
                if (next.assets.length) {
                  if (!window.nightframe)
                    throw new Error("Откройте проект в настольной версии");
                  const assets = await window.nightframe.importPaths(
                    next.assets.map((a) => a.path!),
                  );
                  next.assets.forEach((a, i) => {
                    a.url = assets[i].url;
                  });
                }
                await loadProject(next);
                setRecover(false);
              })
            }
          >
            Восстановить
          </button>
          <button onClick={() => setRecover(false)}>Закрыть</button>
        </div>
      )}
      <main className="workspace">
        <Library onImport={() => void importFiles()} />
        <Preview />
        <Inspector />
      </main>
      <Timeline />
      <input
        className="hidden"
        ref={file}
        type="file"
        multiple
        accept="video/*,audio/*,image/*"
        onChange={(e) => {
          void importFiles([...(e.target.files || [])]);
          e.target.value = "";
        }}
      />
      <input
        className="hidden"
        ref={projectFile}
        type="file"
        accept=".nightframe,.json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f)
            void action(async () => {
              const next = projectSchema.parse(JSON.parse(await f.text()));
              if (next.assets.length)
                throw new Error(
                  "Для проектов с локальными медиа используйте настольное приложение",
                );
              await loadProject(next);
            });
          e.target.value = "";
        }}
      />
      {s.message && (
        <div className="toast" role="status">
          <span className="live-dot" />
          {s.message}
          <button title="Закрыть уведомление" onClick={() => s.notify("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {showSettings && (
        <div className="modal-backdrop">
          <section className="modal">
            <div className="modal-title">
              <h2>Настройки проекта</h2>
              <button
                title="Закрыть настройки"
                onClick={() => setShowSettings(false)}
              >
                <X size={18} />
              </button>
            </div>
            <label>
              Соотношение сторон
              <select
                value={`${p.width}:${p.height}`}
                onChange={(e) => {
                  const [width, height] = e.target.value.split(":").map(Number);
                  s.edit((p) => {
                    p.width = width;
                    p.height = height;
                  });
                }}
              >
                {[
                  ["1920:1080", "16:9 · 1080p"],
                  ["1080:1920", "9:16 · Shorts / Reels"],
                  ["1080:1080", "1:1 · Квадрат"],
                  ["1080:1350", "4:5 · Портрет"],
                  ["2520:1080", "21:9 · Кино"],
                ].map(([v, l]) => (
                  <option value={v} key={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Частота кадров
              <select
                value={p.fps}
                onChange={(e) =>
                  s.edit((p) => {
                    p.fps = +e.target.value as 24 | 30 | 60;
                  })
                }
              >
                {[24, 30, 60].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              BPM
              <input
                type="number"
                min={30}
                max={300}
                value={p.bpm}
                onChange={(e) =>
                  s.edit((p) => {
                    p.bpm = Math.max(30, Math.min(300, +e.target.value));
                  })
                }
              />
            </label>
            <p className="muted">
              Параметры применяются к предпросмотру и экспорту. Исходные медиа
              не изменяются.
            </p>
            <button
              className="primary wide"
              onClick={() => setShowSettings(false)}
            >
              Готово <Check size={16} />
            </button>
          </section>
        </div>
      )}
      {showExport && (
        <div className="modal-backdrop">
          <section className="modal">
            <div className="modal-title">
              <div>
                <span className="eyebrow">MAKE IT REAL</span>
                <h2>Ваш следующий релиз.</h2>
              </div>
              <button
                title="Закрыть экспорт"
                disabled={exporting}
                onClick={() => setShowExport(false)}
              >
                <X size={18} />
              </button>
            </div>
            <label>
              Имя видео
              <input
                aria-label="Имя видео"
                disabled={exporting}
                value={p.name}
                onChange={(e) =>
                  s.edit((p) => {
                    p.name = e.target.value;
                  })
                }
              />
            </label>
            <div className="modal-row">
              <label>
                Разрешение
                <select
                  aria-label="Разрешение экспорта"
                  disabled={exporting}
                  value={height}
                  onChange={(e) => setHeight(+e.target.value)}
                >
                  <option value={1080}>1080p</option>
                  <option value={720}>720p</option>
                </select>
              </label>
              <label>
                Кадров в секунду
                <select
                  aria-label="FPS экспорта"
                  disabled={exporting}
                  value={fps}
                  onChange={(e) => setFps(+e.target.value as typeof fps)}
                >
                  {[24, 30, 60].map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Качество
              <select
                disabled={exporting}
                value={quality}
                onChange={(e) => setQuality(+e.target.value)}
              >
                <option value={18}>Максимальное</option>
                <option value={20}>Высокое — рекомендуется</option>
                <option value={26}>Компактный файл</option>
              </select>
            </label>
            <div className="export-summary">
              <span>MP4 · H.264 · AAC</span>
              <span>Локальный рендер</span>
            </div>
            {!window.nightframe && (
              <p className="warning">
                Вы открыли браузерный режим. Экспорт MP4 работает в настольном
                приложении Electron.
              </p>
            )}
            {progress !== null && (
              <>
                <progress value={progress} max={1} />
                <div className="export-summary">
                  <span>
                    {progress === 1
                      ? "Экспорт проверен через FFprobe"
                      : "Рендеринг композиции"}
                  </span>
                  <span>{Math.round(progress * 100)}%</span>
                </div>
              </>
            )}
            <button
              className="primary wide"
              disabled={exporting || !window.nightframe || !p.clips.length}
              onClick={() =>
                void action(async () => {
                  canceled.current = false;
                  setExporting(true);
                  s.playing && s.toggle();
                  try {
                    const result = await exportProject(
                      p,
                      { height, fps, quality, name: p.name },
                      setProgress,
                      () => canceled.current,
                    );
                    if (result) s.notify("Видео сохранено: " + result);
                    else setProgress(null);
                  } finally {
                    setExporting(false);
                  }
                })
              }
            >
              {exporting ? "Экспортируем…" : "Выбрать папку и экспортировать"}
              <ArrowUpRight size={17} />
            </button>
            {exporting && (
              <button
                className="wide"
                onClick={() => {
                  canceled.current = true;
                  void window.nightframe?.cancelExport();
                }}
              >
                Отменить экспорт
              </button>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
