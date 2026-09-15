import { api, type SetupProgress } from "../api";
import { t } from "../strings/t";
import { show } from "../main";
import { icon } from "../icons";

const logoUrl = new URL("../logo.png", import.meta.url).href;

export function setupScreen(): HTMLElement {
  const el = document.createElement("div");
  el.className = "setup";

  const card = document.createElement("div");
  card.className = "setup-card";

  const logo = document.createElement("img");
  logo.className = "setup-logo";
  logo.src = logoUrl;
  logo.alt = "";

  const title = document.createElement("h1");
  title.textContent = t("setup_title");

  const sub = document.createElement("div");
  sub.className = "muted";
  sub.textContent = t("setup_subtitle");

  const step = document.createElement("div");
  step.className = "setup-step";
  const stepLabel = document.createElement("span");
  const stepPct = document.createElement("span");
  stepPct.className = "num";
  stepPct.dir = "ltr";
  step.append(stepLabel, stepPct);

  const progress = document.createElement("div");
  progress.className = "progress indeterminate";
  const bar = document.createElement("div");
  bar.className = "bar";
  progress.append(bar);

  const error = document.createElement("div");
  error.className = "error-line";
  error.hidden = true;

  const retry = document.createElement("button");
  retry.className = "btn btn-primary";
  retry.append(icon("retry", 28), document.createTextNode(t("setup_retry")));
  retry.hidden = true;

  card.append(logo, title, sub, step, progress, error, retry);
  el.append(card);

  let unlisten: (() => void) | null = null;

  function onProgress(p: SetupProgress) {
    stepLabel.textContent = p.step === "ytdlp" ? t("setup_step_ytdlp") : t("setup_step_ffmpeg");
    if (p.total > 0) {
      const pct = Math.min(100, (p.downloaded / p.total) * 100);
      progress.classList.remove("indeterminate");
      bar.style.width = `${pct}%`;
      stepPct.textContent = `${Math.round(pct)}%`;
    } else {
      progress.classList.add("indeterminate");
      stepPct.textContent = "";
    }
  }

  async function run() {
    error.hidden = true;
    retry.hidden = true;
    progress.hidden = false;
    step.hidden = false;
    progress.classList.add("indeterminate");
    bar.style.width = "0%";
    stepLabel.textContent = t("setup_step_ytdlp");
    stepPct.textContent = "";
    if (!unlisten) {
      unlisten = await api.onSetupProgress(onProgress);
    }
    try {
      await api.installTools();
      unlisten?.();
      const { mainScreen } = await import("./main");
      show(mainScreen(), "main");
    } catch {
      progress.hidden = true;
      step.hidden = true;
      error.textContent = t("setup_failed");
      error.hidden = false;
      retry.hidden = false;
    }
  }

  retry.addEventListener("click", () => void run());
  void run();
  return el;
}
