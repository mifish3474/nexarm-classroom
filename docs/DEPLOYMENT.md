# Public classroom app

The classroom app is published at **https://nexarm.mrfish.app/** using GitHub Pages.
The existing custom domain and HTTPS configuration are retained.

The operator approved replacing the old public prototype on 2026-10-28.
`.github/workflows/pages.yml` builds the application from `main` using the package
lock and Node 24.14.1. It requires passing unit tests, type-check/build and Chrome
browser checks with mocked USB before uploading **only `dist/`** to Pages.
Deployment uses GitHub's `github-pages` environment, with Pages configured for
GitHub Actions instead of publishing repository-root files.

Application movement profiles and firmware are unchanged. Root `index.html`
remains the old prototype in source control; it is not the deployed entry point.
The public entry point comes from `app/index.html`. Blockly media, workers,
scripts and styles are served from the same site. The production content policy
blocks runtime data connections; deployment does not add accounts or uploads.
The site remains a development milestone, not a completed student-safety release.

## Check a deployment

- Inspect the repository's **Actions → Publish classroom app** run for the commit.
- Open the public site and check the header version.
- `/deployment.json` records the version, source commit and build timestamp.
- Verify the editor, My Blocks, project save/load and setup pages without
  connecting hardware. Browser tests cannot prove robot movement or stopping.
- Physical USB use needs a compatible Chrome/Edge browser and an explicit Connect.

The public HTTPS origin has separate browser storage and USB permission from
localhost. Export local programs and positions before switching. Program files
from dev.59 include all saved positions; loading replaces the current position list.
Older files recover only embedded snapshots. No reconnection or movement happens automatically.
Browser permission for the robot may need to be granted again on the public site.

## Preserve and recover

`milestone-0.7.0-dev.57` preserves the app before publishing configuration changes;
see [the milestone record](./MILESTONE_DEV57.md). The tag and local backup bundle
retain the old prototype and all tracked source history. The local source ZIP is
an additional snapshot; browser-local work and ignored firmware backups are separate.

To roll back a later application change, prepare a new commit on `main` restoring
the known-good application source and lockfile while retaining the Pages workflow.
Review and run its checks, then push it normally. Do not reset/force-push `main`
or switch Pages back to repository-root publishing: that would deploy the old
prototype. A manually rerun workflow uses the commit attached to that run, not
necessarily the latest source. Avoid creating an older deployment unintentionally.

To pause automatic publishing, disable the workflow in GitHub Actions; the last
successful deployed site remains available. Failed builds do not replace it.
