import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type Mode = "video" | "music";

export interface Settings {
  downloadDir: string;
  compatMode: boolean;
}

export interface SetupProgress { step: "ytdlp" | "ffmpeg"; downloaded: number; total: number }
export interface JobTitle { id: number; title: string }
export interface JobProgress { id: number; percent: number; eta: string; status: "downloading" | "processing" }
export interface JobDone { id: number; path: string | null }
export interface JobFailed { id: number; code: string; details: string }
export interface JobId { id: number }
export interface ClipboardUrl { url: string }

export const api = {
  toolsStatus: () => invoke<boolean>("tools_status"),
  installTools: () => invoke<void>("install_tools"),
  reinstallTools: () => invoke<void>("reinstall_tools"),
  ytdlpVersion: () => invoke<string>("ytdlp_version"),
  updateYtdlp: () => invoke<string>("update_ytdlp"),

  getSettings: () => invoke<Settings>("get_settings"),
  setSettings: (settings: Settings) => invoke<void>("set_settings", { settings }),

  enqueue: (url: string, mode: Mode) => invoke<number>("enqueue_download", { url, mode }),
  cancel: (id: number) => invoke<void>("cancel_download", { id }),
  cancelAll: () => invoke<void>("cancel_all"),
  reveal: (path: string) => invoke<void>("reveal_in_explorer", { path }),
  openFolder: (path: string) => invoke<void>("open_folder", { path }),

  readClipboard: () => invoke<string | null>("read_clipboard"),

  onSetupProgress: (f: (p: SetupProgress) => void) => listen<SetupProgress>("setup-progress", (e) => f(e.payload)),
  onJobTitle: (f: (p: JobTitle) => void) => listen<JobTitle>("job-title", (e) => f(e.payload)),
  onJobProgress: (f: (p: JobProgress) => void) => listen<JobProgress>("job-progress", (e) => f(e.payload)),
  onJobDone: (f: (p: JobDone) => void) => listen<JobDone>("job-done", (e) => f(e.payload)),
  onJobFailed: (f: (p: JobFailed) => void) => listen<JobFailed>("job-failed", (e) => f(e.payload)),
  onJobCancelled: (f: (p: JobId) => void) => listen<JobId>("job-cancelled", (e) => f(e.payload)),
  onClipboardUrl: (f: (p: ClipboardUrl) => void) => listen<ClipboardUrl>("clipboard-url", (e) => f(e.payload)),
};

export type { UnlistenFn };
