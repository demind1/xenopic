import type { Asset, Project } from "./model";
export interface DesktopAPI {
  importMedia: () => Promise<Asset[]>;
  importPaths: (paths: string[]) => Promise<Asset[]>;
  pathForFile: (file: File) => string;
  save: (p: Project) => Promise<boolean>;
  open: () => Promise<Project | null>;
  beginExport: (
    p: Project,
    settings: { height: number; fps: number; quality: number; name: string },
  ) => Promise<boolean>;
  frame: (bytes: Uint8Array) => Promise<void>;
  finishExport: () => Promise<string>;
  cancelExport: () => Promise<void>;
}
declare global {
  interface Window {
    nightframe?: DesktopAPI;
  }
}
