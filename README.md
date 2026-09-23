# Mom's Video Downloader

A portable Windows app that lets a non-technical person download a video or its audio from
YouTube, Facebook, TikTok, Kan, and any other site [yt-dlp](https://github.com/yt-dlp/yt-dlp)
supports. Hebrew, right-to-left, one big button. Built for one specific user (the author's
mother), so every decision favors "she can't get this wrong" over flexibility.

The whole interaction: copy a link in the browser, open the app (the link is already filled
in), pick video or audio, click download.

## Contents

- [What it does](#what-it-does)
- [Installing it on her PC](#installing-it-on-her-pc)
- [Developer setup](#developer-setup)
- [Everyday commands](#everyday-commands)
- [Releasing a new build](#releasing-a-new-build)
- [Building it under another name](#building-it-under-another-name)
- [Project layout](#project-layout)
- [How it works](#how-it-works)
- [Conventions that must hold](#conventions-that-must-hold)
- [Runtime files](#runtime-files)
- [Troubleshooting](#troubleshooting)
- [Known limits](#known-limits)
- [Design history](#design-history)

## What it does

- **Single portable exe.** No installer, no admin rights, nothing pre-installed except the
  WebView2 runtime that ships with Windows 10/11.
- **Self-provisioning.** On first launch it downloads `yt-dlp.exe`, `ffmpeg.exe`, and
  `ffprobe.exe` from GitHub into her AppData folder and shows a Hebrew progress screen.
  Every later launch runs `yt-dlp -U` silently in the background so site changes keep working.
- **Clipboard aware.** A background watcher fills the link box whenever a URL is copied. It
  never starts a download on its own; she always clicks.
- **Video or audio.** Video mode downloads best video plus best audio merged into mp4. Audio
  mode extracts mp3 at best quality with cover art and metadata embedded.
- **Sequential queue** with per-row cancel, retry, and "open folder" (opens Explorer with the
  file selected). Duplicate links are refused. Closing with active downloads asks first.
- **Cloudflare handling.** Generic sites are fetched with browser impersonation, and any 403 or
  bot challenge triggers one automatic retry with full Chrome impersonation.
- **Settings screen** (aimed at the maintainer, still in Hebrew): download folder, H.264
  compatibility mode, yt-dlp version with check-for-update, and reinstall tools.
- **Every string in one file.** All Hebrew lives in `src/strings/he.json`.

## Installing it on her PC

1. Build or download `MomsVideoDownloader.exe` (see [Releasing](#releasing-a-new-build)).
2. Copy the exe anywhere, for example `C:\Users\<her>\MomsVideoDownloader\`, and put a
   shortcut on the desktop.
3. First launch: Windows SmartScreen warns once because the exe is unsigned. Click
   "More info", then "Run anyway". It does not recur.
4. The app shows the setup screen and downloads about 100 MB of tools. Wait for it to finish.
5. Done. Updates to the app itself are you copying a new exe over the old one.

If the app shows a message box about WebView2 instead of opening, install the
[WebView2 Evergreen runtime](https://go.microsoft.com/fwlink/p/?LinkId=2124703). Windows 11 and
updated Windows 10 already have it.

## Developer setup

Windows only. The app spawns Windows executables and uses Windows registry and Explorer calls.

| Tool | Version used | Notes |
|---|---|---|
| Rust (stable) | 1.98 | `rustup` from https://rustup.rs. Needs the MSVC toolchain. |
| Visual Studio Build Tools | 2022 | "Desktop development with C++" workload, required by Rust MSVC and Tauri. |
| Node.js | 24 | Anything 22+ works. |
| pnpm | 10.33 | Pinned via `packageManager` in `package.json`; `corepack enable` picks it up. |
| WebView2 runtime | any | Present on Windows 11 and updated Windows 10. |

```bash
git clone <this repo>
cd moms-video-downloader
pnpm install
```

The first Rust build takes several minutes. Later builds are incremental.

Recommended VS Code extensions are in `.vscode/extensions.json` (rust-analyzer and the Tauri
extension).

## Everyday commands

```bash
pnpm tauri dev        # run the app with hot reload for the front end
pnpm build            # type-check and bundle the front end only
pnpm test             # Rust unit tests (cd src-tauri && cargo test)
pnpm tauri build      # release build of the portable exe
pnpm release          # release build + zip into release/
```

Tests are deliberately few: parsers, the yt-dlp argument builder, error classification, and URL
detection. Everything else is verified by running the exe. Do not add a front end test suite.

## Releasing a new build

```bash
pnpm release
```

This runs `pnpm tauri build`, reads the version from `src-tauri/tauri.conf.json`, and writes
`release/MomsVideoDownloader-v<version>.zip` containing the single exe. The `release/`
folder is git-ignored.

Release checklist:

1. Bump `version` in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `package.json`.
2. `pnpm test`, then `pnpm release`.
3. Run the exe once from a fresh folder. Download one YouTube link in each mode and one
   non-YouTube link.
4. Commit, tag `vX.Y.Z`, send the zip.

The exe is unsigned by design. Code signing costs money and this is a personal app.

## Building it under another name

The name lives in one place, `productName` in `src-tauri/tauri.conf.json` ("Mom's Video
Downloader"). To give someone else a copy that feels like their own, build it under their name
without editing any file:

```bash
pnpm release -Name "Grandma's Video Downloader"
```

That name appears in the title strip, the taskbar, and the exe's file properties. The exe, the
zip, and the AppData folder take the name with only English letters and digits kept
(`GrandmasVideoDownloader.exe`). For a name without English letters, such as a Hebrew one, add
`-ExeName GrandmasVideoDownloader` to choose that part yourself. Each name also gets its own app
identifier, so two differently named builds on one PC run side by side with separate tools and
settings. The script passes these to `tauri build` as a `--config` override; `tauri.conf.json`
is not modified.

## Project layout

```
.
├── index.html                  Root page: dir="rtl", title bar strip + #screen container
├── src/                        Front end (Vite + TypeScript, no framework)
│   ├── main.ts                 Boot, custom title bar, screen router, close confirmation
│   ├── api.ts                  Typed wrappers for every Rust command and event
│   ├── icons.ts                Lucide icon helper (inline SVG)
│   ├── style.css               Whole design system (palette, layout, RTL rules)
│   ├── logo.png                Logo used in the title bar and setup screen
│   ├── strings/he.json         EVERY user-facing string, keyed in English
│   ├── strings/t.ts            t(key) and errorKey(code)
│   └── screens/
│       ├── setup.ts            First-run tool download
│       ├── main.ts             Link box, mode switch, download button, job list
│       └── settings.ts         Folder, compat mode, yt-dlp update, reinstall
├── src-tauri/                  Rust backend
│   ├── tauri.conf.json         Window (720x680 fixed, no decorations), bundle.active=false
│   ├── capabilities/default.json  Permissions the front end is allowed to call
│   ├── icons/                  Generated from docs/icon.png via `pnpm tauri icon`
│   └── src/
│       ├── main.rs             WebView2 presence check, then run()
│       ├── lib.rs              Plugins, state, command registration, startup hook
│       ├── paths.rs            AppData locations and the CREATE_NO_WINDOW flag
│       ├── settings.rs         settings.json load/save
│       ├── tools.rs            Download/extract/update yt-dlp and ffmpeg
│       ├── downloader.rs       yt-dlp args, progress parsing, queue, cancel, retry
│       ├── process_tree.rs     Job object that lets cancel kill yt-dlp and its children
│       └── clipboard.rs        Clipboard polling thread
├── scripts/release.ps1         Build + zip, optionally under another name (-Name)
├── docs/icon.png               Icon source (1024px+ PNG)
└── docs/superpowers/           Design spec and implementation plan (history)
```

## How it works

### Startup

1. `main.rs` checks the registry for the WebView2 runtime. If missing, it shows a native
   message box with the install link (text pulled from `he.json` at compile time) and exits.
2. `lib.rs` registers the single-instance plugin (a second launch focuses the existing window),
   the dialog plugin, and the downloader state. At startup it moves a pre-rename
   `%LOCALAPPDATA%\LipszycVideoDownloader\` folder to the new name and sets the window title
   from `productName`. If all three tools exist it spawns `yt-dlp -U` on a background thread,
   logging to `update.log`. It starts the clipboard watcher.
3. The front end calls `tools_status`. False routes to the setup screen, which calls
   `install_tools` and listens to `setup-progress`. True routes to the main screen.

### Downloads

The front end calls `enqueue_download { url, mode }`. Rust refuses duplicates, appends to a
queue, and runs one job at a time. Each job spawns `yt-dlp.exe` with:

- `--progress-template "download:MVD|status|percent|eta"` plus `--print` lines prefixed
  `MVD_TITLE|` and `MVD_FILE|`, so progress is parsed from fixed markers, never from yt-dlp's
  human output. `--progress` is required because `--print` implies quiet mode.
- `PYTHONIOENCODING=utf-8`, `PYTHONUTF8=1`, and `--encoding utf-8`, otherwise Hebrew titles
  and paths arrive in the console codepage and come out garbled.
- `--extractor-args generic:impersonate`, and on a 403 or Cloudflare error one retry with
  `--impersonate chrome`.
- `--no-playlist`, `--windows-filenames`, `--ffmpeg-location <bin>`, `-P <download dir>`.
- Video: `-f "bv*+ba/b" --merge-output-format mp4`. Compat mode:
  `-S "res,vcodec:h264,acodec:m4a"`. Audio: `-x --audio-format mp3 --audio-quality 0
  --embed-thumbnail --embed-metadata`.

Events to the front end: `job-title`, `job-progress`, `job-done`, `job-failed`,
`job-cancelled`, all carrying the job id. Rust never sends text, only error codes
(`network`, `unsupported_url`, `tool_missing`, `yt_dlp_failed`, `disk`, `duplicate`); the
front end maps them through `errorKey()` to `error_<code>` in `he.json`.

Cancel kills the whole process tree, not just the process the app spawned. `yt-dlp.exe` is a
PyInstaller one-file build: it starts a second `yt-dlp.exe` that does the real work and runs
ffmpeg, and killing only the first leaves the download and merge running. So each attempt is
placed in a Windows job object (`process_tree.rs`) right after spawn, and cancel terminates the
job. The job is also kill-on-close, so nothing outlives the app. Once the tree is gone, cancel
deletes files that appeared in the download folder during the job and whose name contains its
title: `.part`, `.ytdl`, per-format pieces like `.f137.mp4`, and ffmpeg's `.temp` output.
Closing the window with active jobs asks, then `cancel_all` waits up to 3 seconds for cleanup.

### Front end structure

`src/main.ts` owns the persistent title strip (logo, title, settings, minimize, close) and a
`#screen` container. Screens are plain functions returning an element. `screens/main.ts` keeps
its job map and event listeners at module level so they survive a trip to Settings; a
module-level `ui` record always points at the live screen's elements.

## Conventions that must hold

- **No Hebrew outside `src/strings/he.json`.** No Hebrew literal in any `.ts`, `.html`,
  `.css`, or `.rs` file. Use `t("key")`. Rust returns codes. Quick check:
  ```bash
  grep -rnP "[\x{0590}-\x{05FF}]" src --include=*.ts --include=*.css index.html src-tauri/src
  ```
  (use a small Python or Node script if your grep lacks `-P`; it must print nothing).
- **Every child process uses `CREATE_NO_WINDOW`** (`paths::NO_WINDOW`) so no console flashes.
- **All writes stay under `%LOCALAPPDATA%\MomsVideoDownloader\`** (named after the exe) or the
  user's chosen download folder.
- **Icons are Lucide inline SVG** through `src/icons.ts`. No emoji.
- **RTL is deliberate.** The root is `dir="rtl"`. The link input flips to LTR when it holds a
  URL and back to RTL for the placeholder. Numbers inside Hebrew text go through the `num()`
  helper (`dir="ltr"` spans). The technical details block and version string are LTR on
  purpose. The title strip is `direction: ltr` so window controls sit in Windows order.
- **Fixed window.** 720x680 logical pixels, not resizable, not maximizable. The page never
  scrolls; only the job list does. Check the height budget when adding controls.
- **Tests stay minimal.** Pure functions in Rust only. No front end test suite.
- **Portable exe only.** `bundle.active` is `false`; the deliverable is
  `src-tauri/target/release/MomsVideoDownloader.exe` (`mainBinaryName`).
- **The app name comes from the build.** It is read from `productName` at runtime (`getName()`
  in the front end, `package_info().name` in Rust) so `release.ps1 -Name` can rename a build.
  `app_title` in `he.json` is only the fallback; never hardcode the name as a literal.

## Runtime files

All under `%LOCALAPPDATA%\MomsVideoDownloader\` (the exe name, so a build made with `-Name` has
its own folder):

| Path | Purpose |
|---|---|
| `bin\yt-dlp.exe`, `bin\ffmpeg.exe`, `bin\ffprobe.exe` | Downloaded on first run; yt-dlp self-updates in place |
| `settings.json` | `{ "downloadDir": "...", "compatMode": false }` |
| `update.log` | Output of the last background `yt-dlp -U` |

Delete the folder to reset the app completely. If any of the three exes is missing at launch
(for example Windows Defender quarantined yt-dlp), the setup screen runs again and only the
missing pieces are downloaded.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "Windows protected your PC" on first run | Unsigned exe. More info, Run anyway. Once. |
| App exits immediately with a Hebrew message box | WebView2 runtime missing. Install it from the link in the box. |
| Setup screen fails | No internet or GitHub unreachable. Retry. Check `bin\` for leftover `.part` files (they are removed automatically on retry). |
| Download fails with a 403 or "Cloudflare" in details | Should retry automatically with Chrome impersonation. If it still fails, the site needs a login. |
| Titles or file names show as `?` or `-` | Encoding regression. Confirm `PYTHONIOENCODING`/`PYTHONUTF8` env vars and `--encoding utf-8` are still set in `downloader.rs`. |
| Progress bar never moves | `--progress` missing from the args. yt-dlp's `--print` implies quiet mode. |
| "Open folder" opens the wrong place | The final path from yt-dlp did not exist; the app falls back to the download folder. Check the details block for the real path. |
| Settings "reinstall" shows a disk error | `bin\` could not be deleted, usually because yt-dlp is running (a download or the background update). Wait and retry. |
| A second window opens | Single-instance plugin not registered first in `lib.rs`. |
| Cancel does nothing and the download finishes anyway | Only the top `yt-dlp.exe` was killed. The job object in `process_tree.rs` must be created right after spawn and terminated on cancel. |

The failed-row "technical details" expander shows yt-dlp's raw stderr. Ask her to read it to
you, or take a screenshot.

## Known limits

- Instagram and login-only Facebook content need browser cookies. The app does not pass any.
  Public videos work.
- Playlist links download only the single video.
- No download history across restarts.
- The background yt-dlp update has no timeout; a hung GitHub call only affects the Settings
  "check update" button if pressed at the same time.
- The setup screen and all downloads require internet at that moment; nothing is bundled.

## Design history

`docs/superpowers/specs/2026-09-15-moms-video-downloader-design.md` is the approved design and
`docs/superpowers/plans/2026-09-15-moms-video-downloader.md` the task-by-task plan it was
built from. The spec's "Post-implementation changes" section lists everything that changed
after the plan was executed (renames, redesign, encoding fixes, impersonation retry, cancel fix). Read the
spec first when you come back to this; it explains why things are the way they are.
