# Windows installer

The existing application is built unchanged by `.github/workflows/windows.yml` on `windows-latest` for x64. Pushes to `main` and manual dispatch run the workflow.

The job installs pinned dependencies, runs unit/UI/Electron tests, builds the NSIS installer, verifies the actual unpacked Windows PE executables and FFmpeg H.264/AAC encoders, then silently installs the NSIS package. It tests the installed application with the existing import/project/MP4-export scenario, and uninstalls it. A green run therefore validates automated installation and export on a Windows runner; it does not claim manual GUI acceptance on a user's Windows PC.

The artifact `NIGHTFRAME-Windows-x64-unsigned` contains the NSIS `.exe` and a SHA-256 checksum. In the successful run's **Artifacts** section, download that archive while signed in to GitHub, extract it and run the `.exe`. It is an unsigned development installer. It may display the Windows publisher/SmartScreen prompt. No Node.js, Python, FFmpeg or FFprobe installation is needed on the user's machine.

FFmpeg and FFprobe live in the application's `resources/app.asar.unpacked/node_modules` directory. They are x64 executables included by electron-builder, and the installed application resolves these real filesystem paths. CI verifies the installed copies and uses them for the actual video export. Other platforms' FFprobe binaries are excluded. Open-source notices are in `resources/notices`; see `THIRD_PARTY.md` for distribution obligations.

Artifacts are retained for 30 days and require a GitHub account with access to the run. The workflow does not publish a GitHub Release or upload user media. Synthetic export evidence is in the separate `validation-evidence` artifact.
