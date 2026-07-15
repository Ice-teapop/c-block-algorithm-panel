# AlgoLatch downloads

Official downloads are published only through the
[GitHub Releases page](https://github.com/Ice-teapop/algolatch/releases). GitHub's
automatically generated **Source code** archives are not application installers.

## Available download

### macOS historical build

The current public macOS artifact is the historical, unsigned `v0.0.1` build.
It predates the AlgoLatch rename, so the downloaded file and installed app use
the former project name.

- [Universal DMG](https://github.com/Ice-teapop/algolatch/releases/download/v0.0.1/c-block-algorithm-panel-0.0.1-universal.dmg)
- [SHA-256 checksums](https://github.com/Ice-teapop/algolatch/releases/download/v0.0.1/SHA256SUMS.txt)

Follow the [README installation instructions](./README.md#安装) for the required
Gatekeeper confirmation. This historical DMG is not signed by SignPath or
notarized by Apple.

## Windows public preview

The public Windows 10/11 x64 `v0.0.2-preview.1` build is an **unsigned
prerelease** for early testing:

- [Download the Windows EXE](https://github.com/Ice-teapop/algolatch/releases/download/v0.0.2-preview.1/AlgoLatch-Setup-0.0.2-unsigned-x64.exe)
- [Download the SHA-256 checksum](https://github.com/Ice-teapop/algolatch/releases/download/v0.0.2-preview.1/SHA256SUMS.txt)
- [Read the preview release notes](https://github.com/Ice-teapop/algolatch/releases/tag/v0.0.2-preview.1)

The preview passed automated installation, launch, project creation, native C
compile/run, uninstallation and project-retention checks. It is not
Authenticode-signed, so Windows may display an unknown-publisher or SmartScreen
warning. Verify the checksum and install it only if you accept that boundary.

The installer is one-click, per-user and does not require administrator access.
It includes the Windows C toolchain. Uninstalling AlgoLatch does not remove
projects stored under `%USERPROFILE%\Documents\C Algorithm Workbench\`.

## Windows signed release

The stable Windows release will be linked here only after signing, signature
verification and installed-application regression all succeed.

**Free code signing provided by SignPath.io, certificate by SignPath
Foundation.** The application is currently pending; the public Preview does not
claim this signature. After acceptance, the signing process will follow the
project's [Code signing policy](./CODE_SIGNING_POLICY.md).

When available, the official release will contain:

- `AlgoLatch-Setup-<version>-x64.exe`; and
- `SHA256SUMS.txt`.

## Safety

Do not download installers from issue attachments, Actions artifacts, mirrors
or third-party file hosts. Verify the published SHA-256 checksum before opening
an installer. A valid signature proves publisher identity and file integrity;
Microsoft SmartScreen reputation can still take time to accumulate for a new
release.
