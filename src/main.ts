import { ask } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api } from "./api";
import { t } from "./strings/t";

const root = document.querySelector<HTMLDivElement>("#app")!;

export function show(screen: HTMLElement) {
  root.replaceChildren(screen);
}

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
