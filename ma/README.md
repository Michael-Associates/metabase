# Michael and Associates fork of Metabase

This fork is open-source Metabase with our own chart types added. Everything we
change lives on the `ma-main` branch, which started from Metabase's `v0.65.3.7`
release. Metabase's code is otherwise untouched; their releases live in
[metabase/metabase](https://github.com/metabase/metabase).

It's an experiment. It runs only in its own Railway project, "Metabase Fork
Sandbox", against Metabase's Sample Database. Our real Metabase, production and
staging, runs Metabase's official image and never this fork.

## What we changed

- `frontend/src/metabase/visualizations/visualizations/MaHeatmap/`: the
  Heatmap chart (rows by columns, colored by a number).
- `frontend/src/metabase/visualizations/visualizations/MaFlow/`: the Flow
  chart, a multi-step sankey (journeys through two to eight steps, bands
  colored by a chosen step, hover to trace).
- `frontend/src/metabase/visualizations/visualizations/MaShared/`: helpers
  both charts use.
- Small registrations in Metabase's own files so the charts show up in the
  chart picker: `register.ts`, `metabase-types/api/visualization.ts`,
  `viz-core/lib/sensibility.ts`, `EmptyVizState/utils.ts` and
  `embedding/mcp/utils/getMcpChartTypes.ts`.
- `.github/workflows/ma-fork.yml`: checks and builds every pull request, and
  publishes every merge as a release.
- `ma/deploy/Dockerfile` (added with the first release): what Railway runs.
  It is Metabase's official image of the same version with our uberjar in
  place of theirs, checked against the release's SHA-256.

Metabase's own workflow files are removed from `ma-main`, so only `ma-fork.yml`
runs here. They would otherwise fire on our pull requests and releases.

Heatmap and Flow cards show as tables in emailed subscriptions, Slack alerts
and PDF exports: Metabase draws those on the server, which doesn't know our
charts.

## How a change reaches the sandbox

1. Open a pull request into `ma-main`. The workflow lints, type-checks, runs
   the visualization tests and builds the uberjar.
2. Merge it. The workflow builds the uberjar again and publishes it as a GitHub
   release named like `v0.65.3.7-ma.12`, with its SHA-256 in the notes.
3. Open a second pull request that points `ma/deploy/Dockerfile` at that release
   and its SHA-256, and merge it. The `metabase-fork` service in the Metabase
   Fork Sandbox Railway project watches `ma/deploy/` on `ma-main` and
   redeploys.

## Rolling back

Our changes are frontend only, so every build of the same Metabase version
uses the same application database. To roll back, point `ma/deploy/Dockerfile`
at an earlier release, or use Railway's rollback on the previous deployment.
Going back to Metabase's official image also works: Heatmap and Flow cards
then show as tables.

## Upgrading to a new Metabase version

Metabase cuts each release from its own release branch, so merging a new
release into `ma-main` would conflict far beyond our files. Move our commits
onto the new release instead:

1. `git fetch upstream tag <new tag>` and create a branch from the new tag.
2. Cherry-pick our commits from `ma-main` onto it. Expect small conflicts in
   the five registration files above.
3. Delete every file in `.github/workflows/` except `ma-fork.yml`, including
   any new one the release brought in. Leave `.github/actions/` alone:
   `ma-fork.yml` uses those.
4. Update `MA_BASE_VERSION` in `ma-fork.yml` to the new tag. The workflow
   refuses to build if the migrations don't match that tag.
5. Run `git merge -s ours ma-main` so the branch can merge into `ma-main` as a
   normal pull request, then open it and follow the steps above. Change the
   `FROM` line in `ma/deploy/Dockerfile` to the new version in the deploy pull
   request.

Never deploy a version older than the one the target Metabase already runs:
Metabase can't migrate its application database backwards.
