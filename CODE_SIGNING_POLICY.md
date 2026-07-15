# Code signing policy

AlgoLatch is an MIT-licensed open-source project maintained in the public
[Ice-teapop/algolatch](https://github.com/Ice-teapop/algolatch) repository.

**Free code signing provided by SignPath.io, certificate by SignPath
Foundation.** The SignPath Foundation application is currently pending. The
public Windows Preview is explicitly unsigned. Until the application is
accepted and the signed release gate succeeds, no AlgoLatch download is
described as SignPath-signed.

## What may be signed

Only release artifacts produced from this repository by the documented GitHub
Actions release workflow may be submitted for signing. The intended release
policy requires:

- a version tag that matches the package version and is reachable from `main`;
- a clean build from the committed lockfile and pinned GitHub Actions;
- the project's release, architecture, regression and installed-application
  gates to pass;
- origin verification that binds the artifact to this repository and release
  tag; and
- explicit approval before a release-signing request is completed.

Artifacts uploaded by hand, builds from untrusted branches, modified upstream
binaries, and artifacts that cannot prove their source origin are not eligible
for release signing.

## Project roles

- **Authors / Committers:** [Ice-teapop](https://github.com/Ice-teapop)
- **Reviewers:** [Ice-teapop](https://github.com/Ice-teapop)
- **Approvers:** [Ice-teapop](https://github.com/Ice-teapop)

Repository and signing-service access must use multi-factor authentication.
Changes from other contributors require maintainer review before merge. A
release signing request remains a separate approval decision.

## Privacy and system changes

AlgoLatch does not transfer information to other networked systems unless the
user or the person installing or operating it specifically requests that
transfer. Network AI is disabled by default and is used only after the user
chooses a provider, supplies a credential and sends a request. The complete
[privacy policy](./PRIVACY.md) describes the exact data boundary.

The Windows installer is per-user and includes an uninstaller. Uninstalling the
application does not delete projects stored in Documents. Installation,
execution and removal behavior is documented on the [downloads page](./DOWNLOADS.md).

## Verification and incident response

Published releases provide a SHA-256 checksum beside the installer. A signed
Windows release must also pass Authenticode verification, timestamp validation,
installation, launch, native C compile/run and uninstallation checks before it
is made public.

Suspected signing abuse, compromised releases or security vulnerabilities
should be reported through the [security policy](./SECURITY.md), not a public
issue. A published version tag is never moved to replace a compromised or
incorrect release; remediation uses withdrawal where necessary and a new patch
version.
