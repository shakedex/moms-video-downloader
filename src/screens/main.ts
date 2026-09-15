import { api, type Mode, type Settings } from "../api";
import { t, errorKey } from "../strings/t";
import { show } from "../main";
import { icon } from "../icons";

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
  empty: HTMLElement;
  inlineError: HTMLElement;
  refreshButtons: () => void;
}

const jobs = new Map<number, JobRow>();

export function hasActiveJobs(): boolean {
  for (const r of jobs.values()) {
    if (r.state === "queued" || r.state === "downloading" || r.state === "processing") return true;
  }
  return false;
}

let autoFilled = "";
let lastEnqueuedUrl = "";
let mode: Mode = "video";
let settingsCache: Settings | null = null;
let listenersAttached = false;
let ui: MainUi | null = null;

const logoUrl = new URL("../logo.png", import.meta.url).href;

/** Numbers, percentages and ETAs are LTR runs inside Hebrew text. */
function num(text: string): HTMLElement {
  const s = document.createElement("span");
  s.className = "num";
  s.dir = "ltr";
  s.textContent = text;
  return s;
}

function showInlineError(code: string) {
  if (!ui) return;
  ui.inlineError.textContent = t(errorKey(code));
  ui.inlineError.hidden = false;
}

function setLinkFromClipboard(url: string) {
  if (!ui) return;
  if (url === lastEnqueuedUrl) return;
  const current = ui.input.value.trim();
  if (current === "" || current === autoFilled) {
    ui.input.value = url;
    autoFilled = url;
    ui.refreshButtons();
  }
}

function refreshEmpty() {
  if (!ui) return;
  ui.empty.hidden = jobs.size > 0;
}

function setState(row: JobRow, state: JobState) {
  row.state = state;
  row.el.dataset.state = state;
}

function buildRow(id: number, url: string, mode: Mode): JobRow {
  const rowEl = document.createElement("div");
  rowEl.className = "job";

  const top = document.createElement("div");
  top.className = "job-top";
  const text = document.createElement("div");
  text.className = "job-text";
  const title = document.createElement("div");
  title.className = "job-title";
  title.dir = "auto";
  title.textContent = url;
  const status = document.createElement("div");
  status.className = "status";
  status.textContent = t("status_queued");
  text.append(title, status);
  const actions = document.createElement("div");
  actions.className = "job-actions";
  top.append(text, actions);

  const progress = document.createElement("div");
  progress.className = "progress";
  const bar = document.createElement("div");
  bar.className = "bar";
  progress.append(bar);

  const details = document.createElement("details");
  details.className = "tech";
  details.hidden = true;
  const summary = document.createElement("summary");
  summary.textContent = t("details");
  const detailsBody = document.createElement("div");
  detailsBody.className = "details";
  details.append(summary, detailsBody);

  rowEl.append(top, progress, details);

  const row: JobRow = { id, url, mode, state: "queued", el: rowEl, title, status, progress, bar, actions, details, detailsBody, path: null };
  setState(row, "queued");
  return row;
}

function addRow(id: number, url: string, mode: Mode) {
  if (!ui) return;
  const row = buildRow(id, url, mode);
  jobs.set(id, row);
  ui.list.prepend(row.el);
  renderActions(row);
  refreshEmpty();
}

function actionButton(label: string, iconName: "cancel" | "folderOpen" | "retry", cls: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = `btn btn-sm ${cls}`;
  b.title = label;
  b.append(icon(iconName, 22), document.createTextNode(label));
  return b;
}

function renderActions(row: JobRow) {
  row.actions.replaceChildren();
  if (row.state === "queued" || row.state === "downloading" || row.state === "processing") {
    const cancel = actionButton(t("cancel"), "cancel", "btn-danger");
    cancel.addEventListener("click", () => void api.cancel(row.id));
    row.actions.append(cancel);
  } else if (row.state === "done") {
    const open = actionButton(t("open_folder"), "folderOpen", "btn-ok");
    open.addEventListener("click", async () => {
      const dir = settingsCache?.downloadDir ?? (await api.getSettings()).downloadDir;
      await api.reveal(row.path ?? "", dir);
    });
    row.actions.append(open);
  } else if (row.state === "failed") {
    const retry = actionButton(t("retry"), "retry", "btn-accent-outline");
    retry.addEventListener("click", async () => {
      row.el.remove();
      jobs.delete(row.id);
      refreshEmpty();
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

function segOption(name: "video" | "music", label: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "seg-opt";
  b.dataset.mode = name;
  b.append(icon(name, 26), document.createTextNode(label));
  return b;
}

export function mainScreen(): HTMLElement {
  const el = document.createElement("div");
  el.className = "screen";

  // Header: brand on the right, settings on the left (RTL flow).
  const header = document.createElement("div");
  header.className = "header";
  const brand = document.createElement("div");
  brand.className = "brand";
  const logo = document.createElement("img");
  logo.src = logoUrl;
  logo.alt = "";
  const h1 = document.createElement("h1");
  h1.dir = "ltr";
  h1.textContent = t("app_title");
  brand.append(logo, h1);
  const gear = document.createElement("button");
  gear.className = "icon-btn";
  gear.title = t("settings");
  gear.setAttribute("aria-label", t("settings"));
  gear.append(icon("settings", 26));
  gear.addEventListener("click", async () => {
    const { settingsScreen } = await import("./settings");
    show(settingsScreen());
  });
  header.append(brand, gear);

  // Link row: input + paste icon button.
  const linkRow = document.createElement("div");
  linkRow.className = "row";
  const input = document.createElement("input");
  input.className = "input link-input";
  input.type = "text";
  input.dir = "rtl";
  input.placeholder = t("link_placeholder");
  input.spellcheck = false;
  input.autocomplete = "off";
  const paste = document.createElement("button");
  paste.className = "icon-btn";
  paste.title = t("paste");
  paste.setAttribute("aria-label", t("paste"));
  paste.append(icon("paste", 26));
  linkRow.append(input, paste);

  // Segmented mode switch.
  const seg = document.createElement("div");
  seg.className = "seg";
  seg.setAttribute("role", "group");
  const videoOpt = segOption("video", t("mode_video"));
  const musicOpt = segOption("music", t("mode_music"));
  seg.append(videoOpt, musicOpt);
  function renderMode() {
    videoOpt.setAttribute("aria-pressed", String(mode === "video"));
    musicOpt.setAttribute("aria-pressed", String(mode === "music"));
  }
  videoOpt.addEventListener("click", () => { mode = "video"; renderMode(); });
  musicOpt.addEventListener("click", () => { mode = "music"; renderMode(); });
  renderMode();

  // One primary download button.
  const downloadBtn = document.createElement("button");
  downloadBtn.className = "btn btn-primary";
  downloadBtn.append(icon("download", 30), document.createTextNode(t("download")));

  const inlineError = document.createElement("div");
  inlineError.className = "error-line";
  inlineError.hidden = true;

  // Job list header + list.
  const listHeader = document.createElement("div");
  listHeader.className = "list-header";
  const listTitle = document.createElement("div");
  listTitle.className = "list-title";
  listTitle.textContent = t("jobs_title");
  const clearBtn = document.createElement("button");
  clearBtn.className = "btn btn-ghost";
  clearBtn.textContent = t("clear_finished");
  listHeader.append(listTitle, clearBtn);

  const list = document.createElement("div");
  list.className = "jobs";
  const empty = document.createElement("div");
  empty.className = "jobs-empty";
  empty.append(icon("download", 36), document.createTextNode(t("jobs_empty")));
  list.append(empty);

  el.append(header, linkRow, seg, downloadBtn, inlineError, listHeader, list);

  function refreshButtons() {
    downloadBtn.disabled = input.value.trim() === "";
  }
  input.addEventListener("input", refreshButtons);
  refreshButtons();

  ui = { input, list, empty, inlineError, refreshButtons };

  paste.addEventListener("click", async () => {
    const url = await api.readClipboard();
    if (url) {
      input.value = url;
      autoFilled = url;
      refreshButtons();
    }
  });

  async function start() {
    const url = input.value.trim();
    if (!url) return;
    inlineError.hidden = true;
    try {
      const id = await api.enqueue(url, mode);
      addRow(id, url, mode);
      lastEnqueuedUrl = url;
      input.value = "";
      autoFilled = "";
      refreshButtons();
    } catch (e) {
      inlineError.textContent = t(errorKey(String(e)));
      inlineError.hidden = false;
    }
  }
  downloadBtn.addEventListener("click", () => void start());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !downloadBtn.disabled) void start();
  });

  clearBtn.addEventListener("click", () => {
    for (const [id, row] of jobs) {
      if (row.state === "done" || row.state === "failed" || row.state === "cancelled") {
        row.el.remove();
        jobs.delete(id);
      }
    }
    refreshEmpty();
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
      setState(r, p.status);
      r.bar.style.width = `${p.percent}%`;
      if (p.status === "processing") {
        r.status.textContent = t("status_processing");
        r.progress.classList.add("indeterminate");
      } else {
        r.progress.classList.remove("indeterminate");
        const parts: (string | HTMLElement)[] = [`${t("status_downloading")} `, num(`${Math.round(p.percent)}%`)];
        if (p.eta) parts.push(`  ${t("eta")} `, num(p.eta));
        r.status.replaceChildren(...parts);
      }
      if (r.state !== prevState) renderActions(r);
    });
    void api.onJobDone((p) => {
      const r = jobs.get(p.id);
      if (!r) return;
      setState(r, "done");
      r.path = p.path;
      r.progress.classList.remove("indeterminate");
      r.bar.style.width = "100%";
      r.status.textContent = t("status_done");
      renderActions(r);
    });
    void api.onJobFailed((p) => {
      const r = jobs.get(p.id);
      if (!r) return;
      setState(r, "failed");
      r.progress.classList.remove("indeterminate");
      r.status.textContent = t(errorKey(p.code));
      if (p.details.trim()) {
        r.detailsBody.textContent = p.details;
        r.details.hidden = false;
      }
      renderActions(r);
    });
    void api.onJobCancelled((p) => {
      const r = jobs.get(p.id);
      if (!r) return;
      setState(r, "cancelled");
      r.progress.classList.remove("indeterminate");
      r.status.textContent = t("status_cancelled");
      renderActions(r);
    });
  }

  // Re-attach rows that survived a trip to the settings screen, newest first.
  for (const row of [...jobs.values()].reverse()) {
    list.append(row.el);
  }
  refreshEmpty();

  // Settings are cached for "open folder"; refreshed each time this screen is built.
  void api.getSettings().then((s) => { settingsCache = s; }).catch(() => {});

  void api.readClipboard().then((url) => { if (url) setLinkFromClipboard(url); });

  return el;
}
