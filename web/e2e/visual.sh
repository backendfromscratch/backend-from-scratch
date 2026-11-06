#!/bin/sh
# The screenshots (playwright.visual.config.ts), inside Playwright's Docker image, pinned in
# playwright-image.txt. Run from web/ (pnpm test:visual), after pnpm build; any argument goes to
# Playwright (--update-snapshots takes them again).
set -eu
image="$(cat e2e/playwright-image.txt)"
# The whole repository, because pnpm keeps the packages in the root node_modules.
cd ..
exec docker run --rm --ipc=host -e CI \
  -v "$PWD":/repo -w /repo/web "$image" \
  npx playwright test -c playwright.visual.config.ts "$@"
