import { open } from "@tauri-apps/plugin-dialog";
import { api, type Settings } from "../api";
import { t, errorKey } from "../strings/t";
import { show } from "../main";
import { icon } from "../icons";

export function settingsScreen(): HTMLElement {
  const el = document.createElement("div");
  el.className = "screen";

  // Header: title on the right, back on the left (RTL flow).
  const header = document.createElement("div");
  header.className = "header";
  const h1 = document.createElement("h1");
  h1.textContent = t("settings_title");
  const back = document.createElement("button");
  back.className = "btn btn-secondary";
  back.append(icon("back", 24), document.createTextNode(t("settings_back")));
  back.addEventListener("click", async () => {
    const { mainScreen } = await import("./main");
    show(mainScreen());
  });
  header.append(h1, back);

  const body = document.createElement("div");
  body.className = "card-body";

  // Folder
  const folderCard = document.createElement("div");
  folderCard.className = "card";
  const folderLabel = document.createElement("h2");
  folderLabel.textContent = t("settings_folder");
  const folderRow = document.createElement("div");
  folderRow.className = "row";
  const folderPath = document.createElement("input");
  folderPath.className = "input path-input";
  folderPath.type = "text";
  folderPath.dir = "ltr";
  folderPath.readOnly = true;
  folderPath.tabIndex = -1;
  const choose = document.createElement("button");
  choose.className = "btn btn-secondary";
  choose.append(icon("folderOpen", 24), document.createTextNode(t("settings_choose")));
  folderRow.append(folderPath, choose);
  folderCard.append(folderLabel, folderRow);

  // Compat
  const compatCard = document.createElement("div");
  compatCard.className = "card";
  const compatLabel = document.createElement("label");
  compatLabel.className = "switch-row";
  const compatText = document.createElement("h2");
  compatText.textContent = t("settings_compat");
  const compat = document.createElement("input");
  compat.type = "checkbox";
  compat.className = "switch";
  compat.setAttribute("role", "switch");
  compatLabel.append(compatText, compat);
  const compatHelp = document.createElement("div");
  compatHelp.className = "muted";
  compatHelp.textContent = t("settings_compat_help");
  compatCard.append(compatLabel, compatHelp);

  // Tools
  const toolsCard = document.createElement("div");
  toolsCard.className = "card";
  const toolsTitle = document.createElement("h2");
  toolsTitle.textContent = t("settings_tools");
  const versionRow = document.createElement("div");
  versionRow.className = "version-row muted";
  const versionLabel = document.createElement("span");
  versionLabel.textContent = t("settings_version");
  const version = document.createElement("span");
  version.className = "version";
  version.dir = "ltr";
  versionRow.append(versionLabel, version);
  const toolsRow = document.createElement("div");
  toolsRow.className = "row";
  const check = document.createElement("button");
  check.className = "btn btn-secondary";
  check.textContent = t("settings_check_update");
  const reinstall = document.createElement("button");
  reinstall.className = "btn btn-danger";
  reinstall.append(icon("retry", 22), document.createTextNode(t("settings_reinstall")));
  toolsRow.append(check, reinstall);
  const toolsMsg = document.createElement("div");
  toolsMsg.className = "tools-msg";
  toolsCard.append(toolsTitle, versionRow, toolsRow, toolsMsg);

  body.append(folderCard, compatCard, toolsCard);
  el.append(header, body);

  let settings: Settings = { downloadDir: "", compatMode: false };

  function setToolsMsg(text: string, isError = false) {
    toolsMsg.textContent = text;
    toolsMsg.classList.toggle("error", isError);
  }

  async function save() {
    await api.setSettings(settings);
  }

  choose.addEventListener("click", async () => {
    const dir = await open({ directory: true, multiple: false, defaultPath: settings.downloadDir });
    if (typeof dir === "string" && dir) {
      settings.downloadDir = dir;
      folderPath.value = dir;
      try {
        await save();
      } catch (e) {
        setToolsMsg(t(errorKey(String(e))), true);
      }
    }
  });

  compat.addEventListener("change", async () => {
    settings.compatMode = compat.checked;
    try {
      await save();
    } catch (e) {
      setToolsMsg(t(errorKey(String(e))), true);
    }
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
    setToolsMsg(t("settings_checking"));
    try {
      setToolsMsg(await api.updateYtdlp());
    } catch (e) {
      setToolsMsg(t(errorKey(String(e))), true);
    }
    await loadVersion();
    check.disabled = false;
  });

  reinstall.addEventListener("click", async () => {
    reinstall.disabled = true;
    check.disabled = true;
    setToolsMsg(t("settings_checking"));
    try {
      await api.reinstallTools();
      setToolsMsg("");
    } catch (e) {
      setToolsMsg(t(errorKey(String(e))), true);
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
