# Mom's Video Downloader

Portable Windows app for downloading videos and music with yt-dlp, in Hebrew.

## Build

    pnpm install
    pnpm tauri build

The portable exe is `src-tauri/target/release/tauri-app.exe`. Copy that single file anywhere and run it.

## Runtime files

Everything the app downloads lives in `%LOCALAPPDATA%\MomsVideoDownloader\`:
`bin\` holds yt-dlp.exe, ffmpeg.exe, ffprobe.exe; `settings.json` holds settings; `update.log` holds the last background yt-dlp update output. Delete the folder to reset.

## Changing any text

Edit `src/strings/he.json` and rebuild. No other file contains user-facing text.

## Known limits

Instagram and login-only Facebook content need browser cookies, which this app does not pass. Public videos work.
