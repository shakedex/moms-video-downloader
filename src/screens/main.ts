import { api, type Mode } from "../api";
import { t, errorKey } from "../strings/t";
import { show } from "../main";

type JobState = "queued" | "downloading" | "processing" | "done" | "failed" | "cancelled";

interface JobRow {
  id: number;
  url: string;
  mode: Mode;
  state: JobState;
  el: HTMLElement;
  title: HTMLElement;
  status: HTMLElement;
  progress: HTMLElement;
  bar: HTMLElement;
  actions: HTMLElement;
  details: HTMLDetailsElement;
  detailsBody: HTMLElement;
  path: string | null;
}

interface MainUi {
  input: HTMLInputElement;
  list: HTMLElement;
  inlineError: HTMLElement;
  refreshButtons: () => void;
}

const jobs = new Map<number, JobRow>();
let autoFilled = "";
let listenersAttached = false;
let ui: MainUi | null = null;

function showInlineError(code: string) {
  if (!ui) return;
  ui.inlineError.textContent = t(errorKey(code));
  ui.inlineError.hidden = false;
}

function setLinkFromClipboard(url: string) {
  if (!ui) return;
  const current = ui.input.value.trim();
  if (current === "" || current === autoFilled) {
    ui.input.value = url;
    autoFilled = url;
    ui.refreshButtons();
  }
}

function addRow(id: number, url: string, mode: Mode) {
  if (!ui) return;
  const rowEl = document.createElement("div");
  rowEl.className = "job";
  const title = document.createElement("div");
  title.className = "job-title";
  title.textContent = url;
  const status = document.createElement("div");
  status.className = "status";
  status.textContent = t("status_queued");
  const progress = document.createElement("div");
  progress.className = "progress";
  const bar = document.createElement("div");
  bar.className = "bar";
  progress.append(bar);
  const details = document.createElement("details");
  details.hidden = true;
  const summary = document.createElement("summary");
  summary.textContent = t("details");
  const detailsBody = document.createElement("div");
  detailsBody.className = "details";
  details.append(summary, detailsBody);
  const actions = document.createElement("div");
  actions.className = "job-actions";
  rowEl.append(title, status, progress, details, actions);
  ui.list.prepend(rowEl);

  const row: JobRow = { id, url, mode, state: "queued", el: rowEl, title, status, progress, bar, actions, details, detailsBody, path: null };
  jobs.set(id, row);
  renderActions(row);
}

function renderActions(row: JobRow) {
  row.actions.replaceChildren();
  if (row.state === "queued" || row.state === "downloading" || row.state === "processing") {
    const cancel = document.createElement("button");
    cancel.className = "btn btn-danger";
    cancel.textContent = t("cancel");
    cancel.addEventListener("click", () => void api.cancel(row.id));
    row.actions.append(cancel);
  } else if (row.state === "done") {
    const open = document.createElement("button");
    open.className = "btn btn-secondary";
    open.textContent = t("open_folder");
    open.addEventListener("click", async () => {
      if (row.path) {
        await api.reveal(row.path);
      } else {
        const s = await api.getSettings();
        await api.openFolder(s.downloadDir);
      }
    });
    row.actions.append(open);
  } else if (row.state === "failed") {
    const retry = document.createElement("button");
    retry.className = "btn";
    retry.textContent = t("retry");
    retry.addEventListener("click", async () => {
      row.el.remove();
      jobs.delete(row.id);
      try {
        const id = await api.enqueue(row.url, row.mode);
        addRow(id, row.url, row.mode);
      } catch (e) {
        showInlineError(String(e));
      }
    });
    row.actions.append(retry);
  }
}

export function mainScreen(): HTMLElement {
  const el = document.createElement("div");
  el.className = "screen";

  const header = document.createElement("div");
  header.className = "header";
  const h1 = document.createElement("h1");
  h1.textContent = t("app_title");
  const gear = document.createElement("button");
  gear.className = "icon-btn";
  gear.title = t("settings");
  gear.textContent = "⚙";
  gear.addEventListener("click", async () => {
    const { settingsScreen } = await import("./settings");
    show(settingsScreen());
  });
  header.append(h1, gear);

  const linkRow = document.createElement("div");
  linkRow.className = "row";
  const input = document.createElement("input");
  input.className = "input";
  input.placeholder = t("link_placeholder");
  input.spellcheck = false;
  const paste = document.createElement("button");
  paste.className = "btn btn-secondary";
  paste.textContent = t("paste");
  linkRow.append(input, paste);

  const buttons = document.createElement("div");
  buttons.className = "row";
  const videoBtn = document.createElement("button");
  videoBtn.className = "btn btn-big";
  videoBtn.textContent = "🎬 " + t("download_video");
  const musicBtn = document.createElement("button");
  musicBtn.className = "btn btn-big btn-music";
  musicBtn.textContent = "🎵 " + t("download_music");
  buttons.append(videoBtn, musicBtn);

  const inlineError = document.createElement("div");
  inlineError.className = "error";
  inlineError.hidden = true;

  const listHeader = document.createElement("div");
  listHeader.className = "row";
  const clearBtn = document.createElement("button");
  clearBtn.className = "btn btn-secondary";
  clearBtn.textContent = t("clear_finished");
  listHeader.append(clearBtn);

  const list = document.createElement("div");
  list.className = "jobs";

  el.append(header, linkRow, buttons, inlineError, listHeader, list);

  function refreshButtons() {
    const empty = input.value.trim() === "";
    videoBtn.disabled = empty;
    musicBtn.disabled = empty;
  }
  input.addEventListener("input", refreshButtons);
  refreshButtons();

  ui = { input, list, inlineError, refreshButtons };

  paste.addEventListener("click", async () => {
    const url = await api.readClipboard();
    if (url) {
      input.value = url;
      autoFilled = url;
      refreshButtons();
    }
  });

  async function start(mode: Mode) {
    const url = input.value.trim();
    if (!url) return;
    inlineError.hidden = true;
    try {
      const id = await api.enqueue(url, mode);
      addRow(id, url, mode);
      input.value = "";
      autoFilled = "";
      refreshButtons();
    } catch (e) {
      inlineError.textContent = t(errorKey(String(e)));
      inlineError.hidden = false;
    }
  }
  videoBtn.addEventListener("click", () => void start("video"));
  musicBtn.addEventListener("click", () => void start("music"));

  clearBtn.addEventListener("click", () => {
    for (const [id, row] of jobs) {
      if (row.state === "done" || row.state === "failed" || row.state === "cancelled") {
        row.el.remove();
        jobs.delete(id);
      }
    }
  });

  if (!listenersAttached) {
    listenersAttached = true;
    void api.onClipboardUrl((p) => setLinkFromClipboard(p.url));
    void api.onJobTitle((p) => {
      const r = jobs.get(p.id);
      if (r) r.title.textContent = p.title;
    });
    void api.onJobProgress((p) => {
      const r = jobs.get(p.id);
      if (!r) return;
      const prevState = r.state;
      r.state = p.status;
      r.bar.style.width = `${p.percent}%`;
      if (p.status === "processing") {
        r.status.textContent = t("status_processing");
        r.progress.classList.add("indeterminate");
      } else {
        r.progress.classList.remove("indeterminate");
        r.status.textContent = `${t("status_downloading")} ${Math.round(p.percent)}%` + (p.eta ? `  ${t("eta")} ${p.eta}` : "");
      }
      if (r.state !== prevState) renderActions(r);
    });
    void api.onJobDone((p) => {
      const r = jobs.get(p.id);
      if (!r) return;
      r.state = "done";
      r.path = p.path;
      r.progress.classList.remove("indeterminate");
      r.bar.style.width = "100%";
      r.status.textContent = t("status_done");
      r.status.classList.add("ok");
      renderActions(r);
    });
    void api.onJobFailed((p) => {
      const r = jobs.get(p.id);
      if (!r) return;
      r.state = "failed";
      r.progress.classList.remove("indeterminate");
      r.status.textContent = t(errorKey(p.code));
      r.status.classList.add("error");
      if (p.details.trim()) {
        r.detailsBody.textContent = p.details;
        r.details.hidden = false;
      }
      renderActions(r);
    });
    void api.onJobCancelled((p) => {
      const r = jobs.get(p.id);
      if (!r) return;
      r.state = "cancelled";
      r.progress.classList.remove("indeterminate");
      r.status.textContent = t("status_cancelled");
      renderActions(r);
    });
  }

  // Re-render any jobs that survived a trip to the settings screen.
  for (const row of jobs.values()) {
    list.append(row.el);
  }

  void api.readClipboard().then((url) => { if (url) setLinkFromClipboard(url); });

  return el;
}
