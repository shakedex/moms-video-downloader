import { ask } from "@tauri-apps/plugin-dialog";
import { getName } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api } from "./api";
import { t } from "./strings/t";
import { icon } from "./icons";

const screenRoot = document.querySelector<HTMLDivElement>("#screen")!;
const titlebar = document.querySelector<HTMLDivElement>(".titlebar")!;
const logoUrl = new URL("./logo.png", import.meta.url).href;

type ScreenName = "main" | "settings" | "setup";

let currentScreen: ScreenName | undefined;
let settingsBtn: HTMLButtonElement | null = null;

export function show(screen: HTMLElement, name?: ScreenName) {
  screenRoot.replaceChildren(screen);
  currentScreen = name;
  updateSettingsButton();
}

function updateSettingsButton() {
  if (!settingsBtn) return;
  // Disabled during setup, and before the first screen is shown.
  settingsBtn.disabled = currentScreen === "setup" || currentScreen === undefined;
}

function titlebarButton(
  iconName: "settings" | "minimize" | "close",
  label: string,
  extraClass?: string,
): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = extraClass ? `titlebar-btn ${extraClass}` : "titlebar-btn";
  b.title = label;
  b.setAttribute("aria-label", label);
  b.append(icon(iconName, 18));
  return b;
}

function buildTitlebar() {
  const brand = document.createElement("div");
  brand.className = "titlebar-brand";
  brand.setAttribute("data-tauri-drag-region", "");
  const logo = document.createElement("img");
  logo.src = logoUrl;
  logo.alt = "";
  const title = document.createElement("span");
  title.className = "titlebar-title";
  title.dir = "ltr";
  // app_title is the fallback; the build's productName (scripts/release.ps1 -Name) wins.
  title.textContent = t("app_title");
  void getName()
    .then((name) => {
      if (!name) return;
      title.textContent = name;
      document.title = name;
    })
    .catch(() => {});
  brand.append(logo, title);

  const actions = document.createElement("div");
  actions.className = "titlebar-actions";
  actions.setAttribute("data-tauri-drag-region", "");

  settingsBtn = titlebarButton("settings", t("settings"));
  settingsBtn.addEventListener("click", async () => {
    if (currentScreen === "settings") {
      const { mainScreen } = await import("./screens/main");
      show(mainScreen(), "main");
    } else if (currentScreen === "main") {
      const { settingsScreen } = await import("./screens/settings");
      show(settingsScreen(), "settings");
    }
  });

  const minimize = titlebarButton("minimize", t("titlebar_minimize"));
  minimize.addEventListener("click", () => void getCurrentWindow().minimize());

  const close = titlebarButton("close", t("titlebar_close"), "titlebar-btn-close");
  close.addEventListener("click", () => void getCurrentWindow().close());

  actions.append(settingsBtn, minimize, close);
  titlebar.append(brand, actions);
  updateSettingsButton();
}

buildTitlebar();

async function boot() {
  const ok = await api.toolsStatus();
  if (ok) {
    const { mainScreen } = await import("./screens/main");
    show(mainScreen(), "main");
  } else {
    const { setupScreen } = await import("./screens/setup");
    show(setupScreen(), "setup");
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
