# Windows CI/CD setup

Repository: `Aamir1055/TargetFx`. Production branch: `master`. Deployment destination: `C:\xampp\htdocs`. Deployment method: self-hosted Windows runner (confirmed).
The workflow is prepared locally, not installed or activated on the server.

## Deployment contents

Only these build outputs can be copied:

- `assets/` and its files
- `Favicon.svg`
- `favicon-icon.png`
- `index.html`
- `manifest.webmanifest`
- `registerSW.js`
- `vite.svg`
- `sw.js`
- Generated `workbox-<hash>.js` files (the hash can change on a new build)

The screenshot hides some extensions; the names above were confirmed against the local build.
Other files, including `.htaccess`, PHP applications, uploads, and desktop/mobile/sidebar icon folders, are untouched. Existing old assets and Workbox files are retained for open browser sessions. This is a selective copy, never a mirror or whole-directory replacement.

## What runs

Pushes to `master` and pull requests targeting `master` build and test on GitHub's hosted Ubuntu runner using Node 22. A successful build produces a seven-day downloadable `frontend-dist` artifact.

Only a push/manual run on the configured production branch can deploy, and only after `WINDOWS_DEPLOY_ENABLED` is `true`. Pull requests never run on the production server. Deployment is serialized and an active deployment is not cancelled by a newer push.

The Windows runner downloads that exact build and executes `scripts/Deploy-Frontend.ps1`. Build dependencies are installed on the hosted runner, not the web server. The old branch-subfolder SFTP workflow has been replaced in this local working copy.

## Server setup

1. Use the confirmed production branch `master`. No `PRODUCTION_BRANCH` variable is needed.
2. On GitHub, open **Settings > Actions > Runners > New self-hosted runner**, select Windows x64, and follow GitHub's generated download/configuration commands on the virtual Windows server. Install outside `htdocs`, for example `C:\actions-runner`.
3. Assign the custom label **`brokereye-production`** and configure the runner as a Windows service. Its Windows account needs modify access to `C:\xampp\htdocs` and `C:\xampp\brokereye-deploy-backups`. The supplied username `5712987192` may be used if it is a Windows account with those permissions; confirm the account type first. Enter any password directly on the server, not in this repository or chat.
4. Create the GitHub **production** environment and restrict its deployment branches to `master`. Only trusted maintainers should be able to modify that branch/workflow. Do not allow untrusted repositories to use the production runner.
5. Add repository Actions variables under **Settings > Secrets and variables > Actions > Variables**:

   | Variable | Value |
   | --- | --- |
   | `WINDOWS_DEPLOY_ENABLED` | `true` when server setup is ready; `false` disables deployment |

6. Commit/push the workflow and deployment script to that branch after review. A manual run is available through the Actions tab once the workflow is available on the default branch.

The runner uses outbound GitHub connectivity. This approach does not require a public SSH port or server password stored in GitHub. Follow [GitHub's Windows runner setup guidance](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners?platform=windows) and [Windows service configuration guidance](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/configure-the-application?platform=windows).

## Preview and backups

On the server, preview an extracted artifact before deployment:

```powershell
.\scripts\Deploy-Frontend.ps1 -SourcePath 'C:\release-dist' -WhatIf
```

Required build files and paths are validated before copying. Overwritten files are saved in a uniquely named folder under `C:\xampp\brokereye-deploy-backups`, outside the public web root. Checksums verify each copy. If a copy fails, the script attempts to restore files already touched and remove newly created files. Backups include `deployment.json` recording which files previously existed.

This is not an atomic directory swap: process termination, server failure, or rollback I/O failures may require manual recovery from the backup. Keep backups until the deployed release has been verified, and manage retention outside the workflow. Unselected public assets must already exist on the server if referenced by the app/service worker; this pipeline intentionally does not update them.

## Details still needed

- Confirmation that the runner is installed and appears **Idle** in GitHub with the `brokereye-production` label.
- Windows Server version and whether `5712987192` is the service/login account.
- Production website URL for a post-deployment health check.

No live server connection or deployment has been performed. Local validation covered selective copying, preservation of unselected files, retained older assets, dry-run behavior, and 50 utility tests.
