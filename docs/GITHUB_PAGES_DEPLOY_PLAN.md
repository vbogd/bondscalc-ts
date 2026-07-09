# GitHub Pages Deploy Plan

## Context

Project: `bondscalc-ts`

React + TypeScript + Vite SPA for Russian bonds calculator. The app is browser-only, has no backend, and uses MOEX ISS API from the client.

Current package scripts:

```bash
npm run test
npm run build
npm run preview
npm run test:integration
```

Regular unit tests do not require network. Integration tests use real MOEX ISS API and should not be mandatory for every PR/deploy.

## Current Status

- `.gitignore` already excludes `node_modules/`, `dist/`, env files, coverage, logs, `.DS_Store`.
- All `latest` dependency specs were replaced with concrete versions in `package.json` and root package metadata in `package-lock.json`.
- Verification after pinning versions:
  - `rg '"latest"' package.json package-lock.json` found no matches.
  - `npm run test` passed: 8 files, 50 tests.
  - `npm run build` passed.
- There is no `.github/` directory yet.
- No GitHub remote is configured yet.

## Decisions

- Use GitHub as source repository.
- Use GitHub Actions for CI and GitHub Pages deployment.
- Publish from GitHub Actions artifact, not by committing `dist/`.
- Keep `dist/` ignored.
- Keep `npm ci` in CI because `package-lock.json` exists.
- Use two workflows:
  - `ci.yml` for checks on push and pull requests.
  - `pages.yml` for deploy from `main`.

## Important GitHub Pages SPA Notes

If publishing as a project site:

```text
https://<github-user>.github.io/bondscalc-ts/
```

then Vite needs:

```ts
base: "/bondscalc-ts/",
```

If publishing on a custom domain at the domain root, keep/default:

```ts
base: "/",
```

The app has direct routes such as `/bond/:secid`. GitHub Pages does not provide a normal SPA rewrite fallback, so the deploy workflow should copy:

```bash
cp dist/index.html dist/404.html
```

This lets direct route refreshes load the React app through GitHub Pages custom 404 handling.

## Implementation Plan

1. Add Node version file.

   Recommended file:

   ```text
   .nvmrc
   ```

   Use a current LTS available in GitHub Actions. Avoid local experimental/current-only versions.

2. Update `vite.config.ts`.

   For GitHub Pages project site, add:

   ```ts
   base: "/bondscalc-ts/",
   ```

   Keep the existing plugins, aliases, and Vitest config unchanged.

3. Add CI workflow.

   File:

   ```text
   .github/workflows/ci.yml
   ```

   Behavior:

   - trigger on `push` and `pull_request`
   - checkout
   - setup Node from `.nvmrc`
   - cache npm
   - `npm ci`
   - `npm run test`
   - `npm run build`

4. Add GitHub Pages deploy workflow.

   File:

   ```text
   .github/workflows/pages.yml
   ```

   Behavior:

   - trigger on push to `main`
   - allow manual `workflow_dispatch`
   - permissions:
     - `contents: read`
     - `pages: write`
     - `id-token: write`
   - checkout
   - setup Node from `.nvmrc`
   - `npm ci`
   - `npm run test`
   - `npm run build`
   - `cp dist/index.html dist/404.html`
   - `actions/configure-pages`
   - `actions/upload-pages-artifact` with `path: ./dist`
   - `actions/deploy-pages`

5. Create GitHub repository.

   Suggested repo name:

   ```text
   bondscalc-ts
   ```

   Then add remote:

   ```bash
   git remote add origin git@github.com:<github-user>/bondscalc-ts.git
   git push -u origin main
   ```

6. Enable GitHub Pages.

   In GitHub repository:

   ```text
   Settings -> Pages -> Build and deployment -> Source -> GitHub Actions
   ```

7. Verify deployment.

   Check:

   - root page opens
   - search page works
   - calculator page works
   - direct route refresh for `/bond/:secid` does not break
   - built assets load from the correct `/bondscalc-ts/` prefix
   - GitHub Actions CI and Pages workflow are green

## Optional Later Improvements

- Add `LICENSE` before making the repository public.
- Add repository description/topics on GitHub.
- Consider code splitting if the Vite chunk warning becomes important.
- Keep MOEX integration tests manual or scheduled, not mandatory for every deploy.
