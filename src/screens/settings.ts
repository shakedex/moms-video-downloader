import { open } from "@tauri-apps/plugin-dialog";
import { api, type Settings } from "../api";
import { t } from "../strings/t";
import { show } from "../main";

export function settingsScreen(): HTMLElement {
  const el = document.createElement("div");
  el.className = "screen";

  const header = document.createElement("div");
  header.className = "header";
  const h1 = document.createElement("h1");
  h1.textContent = t("settings_title");
  const back = document.createElement("button");
  back.className = "btn btn-secondary";
  back.textContent = t("settings_back");
  back.addEventListener("click", async () => {
    const { mainScreen } = await import("./main");
    show(mainScreen());
  });
  header.append(h1, back);

  // Folder
  const folderCard = document.createElement("div");
  folderCard.className = "card stack";
  const folderLabel = document.createElement("h2");
  folderLabel.textContent = t("settings_folder");
  const folderRow = document.createElement("div");
  folderRow.className = "row";
  const folderPath = document.createElement("input");
  folderPath.className = "input";
  folderPath.readOnly = true;
  const choose = document.createElement("button");
  choose.className = "btn btn-secondary";
  choose.textContent = t("settings_choose");
  folderRow.append(folderPath, choose);
  folderCard.append(folderLabel, folderRow);

  // Compat
  const compatCard = document.createElement("div");
  compatCard.className = "card stack";
  const compatLabel = document.createElement("label");
  compatLabel.className = "check";
  const compat = document.createElement("input");
  compat.type = "checkbox";
  const compatText = document.createElement("span");
  compatText.textContent = t("settings_compat");
  compatLabel.append(compat, compatText);
  const compatHelp = document.createElement("div");
  compatHelp.className = "muted";
  compatHelp.textContent = t("settings_compat_help");
  compatCard.append(compatLabel, compatHelp);

  // Tools
  const toolsCard = document.createElement("div");
  toolsCard.className = "card stack";
  const versionRow = document.createElement("div");
  versionRow.className = "row";
  const versionLabel = document.createElement("span");
  versionLabel.textContent = t("settings_version");
  const version = document.createElement("span");
  version.className = "muted";
  version.style.direction = "ltr";
  versionRow.append(versionLabel, version);
  const toolsRow = document.createElement("div");
  toolsRow.className = "row";
  const check = document.createElement("button");
  check.className = "btn btn-secondary";
  check.textContent = t("settings_check_update");
  const reinstall = document.createElement("button");
  reinstall.className = "btn btn-danger";
  reinstall.textContent = t("settings_reinstall");
  toolsRow.append(check, reinstall);
  const toolsMsg = document.createElement("div");
  toolsMsg.className = "muted";
  toolsMsg.style.direction = "ltr";
  toolsMsg.style.textAlign = "left";
  toolsCard.append(versionRow, toolsRow, toolsMsg);

  el.append(header, folderCard, compatCard, toolsCard);

  let settings: Settings = { downloadDir: "", compatMode: false };

  async function save() {
    await api.setSettings(settings);
  }

  choose.addEventListener("click", async () => {
    const dir = await open({ directory: true, multiple: false, defaultPath: settings.downloadDir });
    if (typeof dir === "string" && dir) {
      settings.downloadDir = dir;
      folderPath.value = dir;
      await save();
    }
  });

  compat.addEventListener("change", async () => {
    settings.compatMode = compat.checked;
    await save();
  });

  async function loadVersion() {
    try {
      version.textContent = await api.ytdlpVersion();
    } catch {
      version.textContent = "-";
    }
  }

  check.addEventListener("click", async () => {
    check.disabled = true;
    toolsMsg.textContent = t("settings_checking");
    try {
      toolsMsg.textContent = await api.updateYtdlp();
    } catch (e) {
      toolsMsg.textContent = String(e);
    }
    await loadVersion();
    check.disabled = false;
  });

  reinstall.addEventListener("click", async () => {
    reinstall.disabled = true;
    check.disabled = true;
    toolsMsg.textContent = t("settings_checking");
    try {
      await api.reinstallTools();
      toolsMsg.textContent = "";
    } catch (e) {
      toolsMsg.textContent = String(e);
    }
    await loadVersion();
    reinstall.disabled = false;
    check.disabled = false;
  });

  void (async () => {
    settings = await api.getSettings();
    folderPath.value = settings.downloadDir;
    compat.checked = settings.compatMode;
    await loadVersion();
  })();

  return el;
}
