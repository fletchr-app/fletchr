# Branches and releases

- **`develop`** is where the work happens: every commit goes here, and issues are closed by commits that reach it.
- **`main`** holds releases only. Nothing is committed to it directly; it only receives merges of `develop`, each tagged `vX.Y.Z`.
- The server (`~/fletchr`) and the Play Store builds come from `main`. `git pull` there gets released code only.

## Version number

One number for the whole project, `MAJOR.MINOR.PATCH`, starting at `0.1.0` (not released yet). It lives in three places that must match (`server/core/tests/test_version.py` fails when they do not):

| File | |
|---|---|
| `package.json` | the app; shown in Settings; Android reads it (`versionName`) |
| `server/pyproject.toml` | the server |
| `server/config/settings.py`, `SPECTACULAR_SETTINGS["VERSION"]` | the API schema |

Android's `versionCode` is calculated from it (`MAJOR*10000 + MINOR*100 + PATCH`), so it grows with every release; Google Play rejects an upload whose `versionCode` is not higher than the last one. **App and server versions.** `/api/health/` returns the server's `version` and `min_app_version` (`MIN_APP_VERSION` in `server/config/settings.py`). The app asks at start and whenever it comes to the front: below the minimum it asks the person to update the app, and when the server is a minor version or more behind the app it says so (a note on a frame would otherwise lose its frame without a word). Raise `MIN_APP_VERSION` only for a change that breaks old apps; additive changes need no raise. The app sends no version header on purpose: a custom header needs a CORS allowance, and an old server without it would refuse every request.

Counting: `0.x` while things can still change, `1.0.0` when the Play Store release is public; then PATCH for fixes, MINOR for features, MAJOR for changes that break old app versions (the server must keep serving them).

## Making a release

1. On `develop`: all tests pass (`npm run type-check`, `npm test`, `cd server && uv run pytest`).
2. Change the version in the three places, run `npm run types:api` (the schema carries the version), commit "Version X.Y.Z" on `develop`, push.
3. Merge into `main` and tag:

```bash
git switch main && git pull
git merge --no-ff develop -m "Release X.Y.Z"
git tag -a vX.Y.Z -m "Fletchr X.Y.Z"
git push origin main vX.Y.Z
git switch develop && git merge main      # keeps develop level with the merge commit
```

4. Build the release bundle from `main` (docs/self-hosting.md, "The app"), upload it to Google Play, and update the server: pushing the tag does it (`deploy.yml`, docs/self-hosting.md, section 5), or by hand with `deploy/update.sh vX.Y.Z` on the server.

A fix to a released version that cannot wait for the work on `develop`: branch from `main` (`hotfix/…`), fix, bump PATCH, merge into `main`, tag, then merge `main` into `develop`.

## The website

`deploy/site.sh` copies what is checked out on the server, so the website changes with `main`, together with a release. To publish a text change earlier, check out `develop` on the server for the copy (`git switch develop && git pull && deploy/site.sh && git switch main`), or release.
