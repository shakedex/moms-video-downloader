import { api, type SetupProgress } from "../api";
import { t } from "../strings/t";
import { show } from "../main";

export function setupScreen(): HTMLElement {
  const el = document.createElement("div");
  el.className = "screen";

  const title = document.createElement("h1");
  title.textContent = t("setup_title");

  const sub = document.createElement("div");
  sub.className = "muted";
  sub.textContent = t("setup_subtitle");

  const step = document.createElement("div");
  step.className = "status";

  const progress = document.createElement("div");
  progress.className = "progress indeterminate";
  const bar = document.createElement("div");
  bar.className = "bar";
  progress.append(bar);

  const error = document.createElement("div");
  error.className = "error";
  error.hidden = true;

  const retry = document.createElement("button");
  retry.className = "btn";
  retry.textContent = t("setup_retry");
  retry.hidden = true;

  el.append(title, sub, step, progress, error, retry);

  let unlisten: (() => void) | null = null;

  function onProgress(p: SetupProgress) {
    step.textContent = p.step === "ytdlp" ? t("setup_step_ytdlp") : t("setup_step_ffmpeg");
    if (p.total > 0) {
      progress.classList.remove("indeterminate");
      bar.style.width = `${Math.min(100, (p.downloaded / p.total) * 100)}%`;
    } else {
      progress.classList.add("indeterminate");
    }
  }

  async function run() {
    error.hidden = true;
    retry.hidden = true;
    progress.classList.add("indeterminate");
    bar.style.width = "0%";
    step.textContent = t("setup_step_ytdlp");
    if (!unlisten) {
      unlisten = await api.onSetupProgress(onProgress);
    }
    try {
      await api.installTools();
      unlisten?.();
      const { mainScreen } = await import("./main");
      show(mainScreen());
    } catch {
      error.textContent = t("setup_failed");
      error.hidden = false;
      retry.hidden = false;
    }
  }

  retry.addEventListener("click", () => void run());
  void run();
  return el;
}
