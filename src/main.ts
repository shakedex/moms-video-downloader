import { ask } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api } from "./api";
import { t } from "./strings/t";
import { icon } from "./icons";

const screenRoot = document.querySelector<HTMLDivElement>("#screen")!;
const titlebar = document.querySelector<HTMLDivElement>(".titlebar")!;

export function show(screen: HTMLElement) {
  screenRoot.replaceChildren(screen);
}

function titlebarButton(iconName: "minimize" | "close", label: string, extraClass?: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = extraClass ? `titlebar-btn ${extraClass}` : "titlebar-btn";
  b.title = label;
  b.setAttribute("aria-label", label);
  b.append(icon(iconName, 18));
  return b;
}

function buildTitlebar() {
  const actions = document.createElement("div");
  actions.className = "titlebar-actions";
  actions.setAttribute("data-tauri-drag-region", "");

  const minimize = titlebarButton("minimize", t("titlebar_minimize"));
  minimize.addEventListener("click", () => void getCurrentWindow().minimize());

  const close = titlebarButton("close", t("titlebar_close"), "titlebar-btn-close");
  close.addEventListener("click", () => void getCurrentWindow().close());

  actions.append(minimize, close);
  titlebar.append(actions);
}

buildTitlebar();

async function boot() {
  const ok = await api.toolsStatus();
  if (ok) {
    const { mainScreen } = await import("./screens/main");
    show(mainScreen());
  } else {
    const { setupScreen } = await import("./screens/setup");
    show(setupScreen());
  }
}

boot();

void getCurrentWindow().onCloseRequested(async (event) => {
  const { hasActiveJobs } = await import("./screens/main");
  if (!hasActiveJobs()) return;
  event.preventDefault();
  const yes = await ask(t("close_confirm_body"), {
    title: t("close_confirm_title"),
    kind: "warning",
    okLabel: t("yes"),
    cancelLabel: t("no"),
  });
  if (yes) {
    await api.cancelAll();
    await getCurrentWindow().destroy();
  }
});
