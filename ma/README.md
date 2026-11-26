# Michael and Associates fork of Metabase

This fork is open-source Metabase with our own chart types added. Everything we
change lives on the `ma-main` branch. `master` and the release tags are
Metabase's, untouched.

## What we changed

- `frontend/src/metabase/visualizations/visualizations/MaHeatmap/`: the
  Heatmap chart (rows by columns, colored by a number).
- Small registrations in Metabase's own files so the chart shows up in the
  chart picker: `register.ts`, `metabase-types/api/visualization.ts`,
  `viz-core/lib/sensibility.ts`, `EmptyVizState/utils.ts` and
  `embedding/mcp/utils/getMcpChartTypes.ts`.
- `.github/workflows/ma-fork.yml`: checks every pull request and builds the
  uberjar.
- `ma/deploy/Dockerfile`: what Railway runs.

Every upstream workflow is disabled in this repository's Actions settings, so
only `ma-fork.yml` runs.

## How a change reaches staging

1. Open a pull request into `ma-main`. The workflow lints, type-checks and runs
   the visualization tests.
2. Merge it. The workflow builds the open-source uberjar and publishes it as a
   GitHub release named like `v0.65.3.7-ma.12`, with its SHA-256 in the notes.
3. Open a second pull request that points `ma/deploy/Dockerfile` at that release
   and its SHA-256, and merge it. Railway's `metabase-staging` service watches
   `ma/deploy/` on `ma-main` and redeploys.

## Upgrading to a new Metabase version

1. Fetch the new tag from `metabase/metabase` and merge it into `ma-main` on a
   branch. Expect small conflicts only in the five registration files above.
2. Update `MA_BASE_VERSION` in `ma-fork.yml` and the `FROM` line in
   `ma/deploy/Dockerfile` to the new version.
3. Disable any new upstream workflow the merge brought in.
4. Open the pull request and follow the steps above.

Never deploy a version older than the one the target Metabase already runs:
Metabase can't migrate its application database backwards.
