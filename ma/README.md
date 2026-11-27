# Michael and Associates fork of Metabase

This fork is open-source Metabase with our own chart types and our firm's
branding added. Everything we change lives on the `ma-main` branch, which
started from Metabase's `v0.65.3.7` release, and is listed below; the rest of
Metabase's code is untouched. Their releases live in
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
- Custom graphs (display `ma_graph`): a card whose visualization is a whole
  HTML page, with inline scripts and styles, fed the card's live results. It
  is how graphs built like our standalone HTML reports run inside Metabase.
  - `frontend/src/metabase/visualizations/visualizations/MaGraph/`: the card,
    which frames the page and hands it the graph and the results over a
    private message channel, and the admin-only code editor in its settings.
  - `src/metabase/ma_graph/` and `resources/ma_graph/frame.html`: the page a
    graph runs in, at `/api/ma-graph/frame`. Its own Content-Security-Policy
    sandboxes it into a unique origin, so a graph can't act as the signed-in
    user, and blocks requests, images, fonts, forms, frames and WebRTC. Trusted
    Types stop graph code from turning text into HTML or code, so a value in
    the data can't run as script (Chrome and Edge enforce it). What it can't
    block is the page navigating itself to a host the app allows in frames;
    that takes code written to do it, and only admins write graph code.
  - `src/metabase/ma_graph/core.clj`: only admins may save graph code, which
    lives on cards only. The Card save hooks in `queries/models/card.clj`
    refuse a non-admin write that adds, changes or removes it anywhere in the
    settings, so the rule holds for the UI, the REST API and the MCP tools
    alike. The DashboardCard save hooks in
    `dashboards/models/dashboard_card.clj` drop any graph code a dashboard card
    carries, for everyone.
  - Metabase's built-in MCP server (`/api/metabase-mcp`): `ma_graph` in
    `question_write`'s displays (`mcp/v2/common.clj`), a `custom-graphs` guide
    in `learn` (`resources/mcp/v2/skills/custom-graphs/`, `mcp/v2/skills.clj`,
    `mcp/v2/tools/learn.clj`) with the data contract, the sandbox rules and
    our house style, and write responses that report the graph code's length
    instead of echoing it. An update that leaves the code out keeps it.
  - Smaller registrations: `api_routes/routes.clj`,
    `dashboards/constants.cljc` (a full-width default size), and the
    `ma-graph` module in `.clj-kondo/config/modules/config.edn`.
- Branding, in Metabase's own files:
  - `common/components/LogoIcon/`: `MaLogoIcon.tsx` and its stylesheet draw
    the firm's "MA" icon, and `LogoIcon.tsx` uses it as the app's logo. The
    sample database's row in `DatabaseEngineList.tsx` keeps Metabase's logo,
    since that database is Metabase's.
  - `nav/components/AppBar/AppBarLogo.tsx`: "M&A Data Platform" next to the
    logo.
  - `home/components/HomeGreeting/HomeGreeting.tsx`: "Welcome to the Michael
    and Associates Data Platform" in place of Metabase's random greetings.
  - `home/components/HomeLayout/`: `MaHomeBackground.tsx` and its stylesheet
    fill the home page with the firm's Lady Justice background
    (`resources/frontend_client/app/assets/img/ma-home-background.jpg`) in
    place of Metabase's lighthouse lines; `HomeLayout.tsx` uses it and keeps
    the greeting above it. The login page keeps the lighthouse.
  - `home/components/HomeGreeting/`: the firm's icon (scales of justice with a
    chart, `resources/frontend_client/app/assets/img/ma-home-icon.png`) in
    place of Metabot's faces, next to the welcome line and on the setup guide
    home page.
  - The brand color is the firm's red, `#c6072b`: it is the default of the
    `application-colors` setting in `appearance/settings.clj`, and
    `ui/colors/colors.ts` reads that setting without the paid whitelabel
    feature. Metabase derives every shade, hover and dark-mode color from it.
  - The left menu (`nav/containers/MainNavbar/MainNavbar.styled.tsx`) and the
    top bar (`nav/components/AppBar/AppBarLarge.tsx`, `AppBarSmall.tsx`) are
    the grey of the home background, `--ma-color-chrome: #e4e2e7`, defined in
    `styled-components/containers/GlobalStyles/GlobalStyles.tsx`. Dark mode
    keeps Metabase's page color.
  - `nav/components/AboutModal/AboutModal.tsx`: says this is our build of
    Metabase and links to this repository, as the AGPL asks of a modified
    version. Metabase's trademark line stays.
- `.github/workflows/ma-fork.yml`: checks and builds every pull request, and
  publishes every merge as a release. It runs the unit tests of every folder
  above, the backend tests of custom graphs, and checks that the built
  uberjar serves the graph page with its sealed policy.
- `ma/deploy/Dockerfile` (added with the first release): what Railway runs.
  It is Metabase's official image of the same version with our uberjar in
  place of theirs, checked against the release's SHA-256.

Metabase's own workflow files are removed from `ma-main`, so only `ma-fork.yml`
runs here. They would otherwise fire on our pull requests and releases.

Heatmap, Flow and custom graph cards show as tables in emailed subscriptions,
Slack alerts and PDF exports: Metabase draws those on the server, which doesn't
know our charts.

## How a change reaches the sandbox

1. Work on a branch and open its pull request into `ma-main` as a draft. A
   draft runs no CI. Before pushing, run `ma\scripts\check-changes.ps1`, which
   checks formatting, lint, Clojure brackets and (with enough free memory)
   types on the changed files.
2. Mark the pull request ready for review when the work is done. The workflow
   then lints, type-checks, runs the unit and backend tests of our folders, and
   builds and starts the uberjar.
3. Merge it. The workflow publishes a GitHub release named like
   `v0.65.3.7-ma.12`, with its SHA-256 in the notes. When the merged code is
   exactly the code the pull request built (same source tree), it publishes
   that very build; otherwise (the branch was behind `ma-main`, or the build
   expired, since builds are kept one day) it builds again first.
4. Open a pull request that points `ma/deploy/Dockerfile` at that release and
   its SHA-256, and merge it. Its checks skip the build, since the release was
   already built and checked. The `metabase-fork` service in the Metabase Fork
   Sandbox Railway project watches `ma/deploy/` on `ma-main` and redeploys.

Keep CI runs few. GitHub pauses a fork's workflows when its Actions usage runs
high ("Workflows are not currently being run on this fork due to the scale of
GitHub Actions usage"), and a repository admin then has to re-enable them on
the repository's Actions page. A full run takes about 20 minutes of runners, so
push a ready pull request's fixes together rather than one at a time.

## Rolling back

None of our changes touch the application database's schema, so every build of
the same Metabase version uses the same application database. To roll back,
point `ma/deploy/Dockerfile` at an earlier release, or use Railway's rollback
on the previous deployment.

Going back to Metabase's official image also works: Heatmap, Flow and custom
graph cards then show as tables. While it runs, though, nothing stops a
non-admin from saving custom graph code through the API, and that code would
run once the fork is back. After such a stretch, check custom graph cards'
code before rolling forward.

## Upgrading to a new Metabase version

Metabase cuts each release from its own release branch, so merging a new
release into `ma-main` would conflict far beyond our files. Move our commits
onto the new release instead:

1. `git fetch upstream tag <new tag>` and create a branch from the new tag.
2. Cherry-pick our commits from `ma-main` onto it. Expect small conflicts in
   the Metabase files listed above: the five chart registrations and the
   branding files.
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
