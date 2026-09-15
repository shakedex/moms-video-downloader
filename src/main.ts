import { api } from "./api";

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
