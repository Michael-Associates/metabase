---
name: custom-graphs
description: Custom graphs (display `ma_graph`) on this Michael and Associates build of Metabase. A custom graph is a saved question whose visualization is a whole HTML page you write; Metabase runs the question and hands the page the live results. Covers creating one with question_write, the data contract, the sandbox rules, sizing and dark mode, and the firm's house style. Triggers: "build a custom graph", "make it look like our HTML report", "a sankey/flowchart/scorecard Metabase doesn't have", "ma_graph".
---

# Custom graphs

A custom graph is a question with `display: "ma_graph"`. Its `visualization_settings` hold one key, `ma_graph.html`: a complete HTML page with inline CSS and JavaScript. Metabase runs the question as usual (dashboard filters included) and draws the card by running your page in a sealed frame, handing it the results. Anything you could build as a standalone HTML report works here, with live data.

Use one when no built-in display fits or when the look matters. For an ordinary bar, line or table, use the built-in displays: they also render in emails and PDFs, where a custom graph shows as a table.

Only admins can save graph code. A non-admin's question_write that sets or changes `ma_graph.html`, or turns a card into `ma_graph`, fails with a 403.

## Step 1: write the query

Write the question's query first and run it with execute_query (or execute_sql) to see its exact output column names. Shape the result for the graph: one row per thing you draw (per flow, per box, per bar), with readable values. Keep it under 2,000 rows.

## Step 2: create the card

Save it with question_write, passing the `query_handle` that execute_query or execute_sql returned:

```json
{"method": "create",
 "name": "Intake flow",
 "collection_id": 12,
 "query_handle": "<the handle>",
 "display": "ma_graph",
 "visualization_settings": {"ma_graph.html": "<!doctype html><html>...</html>"}}
```

A write's response leaves the page out of `visualization_settings` and reports its length as `graph_code_characters`, so a save doesn't echo the whole page back. To change the page, update the card with `visualization_settings` that include the new `ma_graph.html`; to change other settings, send them without it and the saved page is kept. Read the page back with get_content when you need to edit it.

To put the graph on a dashboard, use dashboard_write's `add_card`; a custom graph starts full width (24 by 12). Graph code lives on the card only: a dashboard card never carries its own.

## Step 3: the page

Your page gets a global `metabase` object. Register a draw function with `metabase.onRender`; it runs once the page has loaded, and again whenever the results, the size or the color scheme change.

```html
<!doctype html>
<html>
<head>
<style>
  html, body { margin: 0; height: 100%; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  #chart { width: 100%; height: 100%; }
</style>
</head>
<body>
<svg id="chart"></svg>
<script>
  metabase.onRender(function (data, context) {
    var svg = document.getElementById("chart");
    svg.replaceChildren();
    svg.setAttribute("viewBox", "0 0 " + context.width + " " + context.height);
    data.records.forEach(function (record) {
      // draw from record.<column name>, building elements with
      // document.createElementNS and text with textContent
    });
  });
</script>
</body>
</html>
```

`data`:

- `data.columns`: `[{name, displayName, baseType, semanticType}]`, in query order. `name` is the output column name.
- `data.rows`: the rows as arrays, in column order.
- `data.records`: the same rows as objects keyed by column `name`. Usually the easiest to use.

Values are JSON: numbers, strings (dates and timestamps come as ISO strings), booleans, null.

`context`:

- `context.width`, `context.height`: the card's size in pixels.
- `context.colorScheme`: `"light"` or `"dark"`. The page's `<html>` also carries `data-color-scheme="light"` or `"dark"`, so CSS can follow it: `[data-color-scheme="dark"] { ... }`.

Rules for the draw function:

- **Redraw from scratch** each call: clear what you drew, then draw again. It runs on every filter change and resize.
- **Fit the card.** Size to `context.width` and `context.height`, or draw in a fixed `viewBox` that scales. Nothing should depend on the page scrolling. If the content is taller than a card can be, let the page scroll inside the card.
- **Errors show in the card.** An uncaught error, in the draw function or anywhere in the page, replaces the graph with its message, so check your data before you rely on it.

`metabase.data` and `metabase.context` hold the latest values if you need them outside the draw function.

## Sandbox rules

The page runs in a sealed frame with its own origin. It cannot:

- load anything from the network: no CDN scripts, web fonts, remote images or `fetch`. Inline every script and style; images and fonts work as `data:` URLs. Use the system font stack.
- reach Metabase: no session, no API calls, no access to the app around it.
- use `localStorage`, cookies, `alert`, popups, form submission or WebRTC.
- **turn text into HTML or code.** The frame enforces Trusted Types: `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `srcdoc`, `eval`, `new Function` and string timers all throw. Build every element with `document.createElement` / `createElementNS`, put text in with `textContent`, and set attributes with `setAttribute`. This is what keeps a value in the data (a lead's name, a message body) from ever running as script, so never work around it. Browsers without Trusted Types don't enforce it, so the rule holds whatever the browser.

Everything the graph needs comes from the question's results. To show other numbers (totals, comparisons), add them to the query.

## House style

These graphs should look like the firm's HTML reports, not like default charts.

- **Page:** background `#f9f9f7`, surfaces (cards, tooltips) `#fcfcfb`, hairlines `#e1e0d9`, 12px corner radius on cards. Text `#0b0b0b`, secondary `#52514e`, muted `#898781`. In dark mode: page `#0d0d0d`, surface `#1a1a19`, text `#ffffff`, secondary `#c3c2b7`, muted `#898781`, hairline `#2c2c2a`.
- **Category colors:** saturated, in this order: blue `#2a78d6`, orange `#eb6834`, green `#1baf7a`, then purple `#7a5af5`, red `#d9364f`, teal `#0f9fb5`, gold `#d4a017`; "other" is gray `#a3a29c`. Dark mode: `#3987e5`, `#d95926`, `#199e70`.
- **Neutral marks:** middle steps and totals in `#52514e`; places where things leave a flow (lost, not scheduled, did not happen) in light gray `#c3c2b7`, named in the legend ("Gray bars are where leads leave the funnel").
- **Type:** system-ui, 14px base. Titles 16 to 24px at weight 650; labels 13px weight 650 with a 12px secondary detail line; column headings 12px uppercase, weight 600, letter-spacing 0.04em, muted.
- **Labels say what they mean:** plain-English headings ("How the lead came in", not `lead_type`), full numbers with separators (`7,499`), and a share with its base (`31.7% of leads`, `74.3% of scheduled consults`). Never a bare percentage.
- **Sankeys and flows:** 12px nodes with a 2px radius, generous gaps (about 30px), bands at 0.5 opacity with a 1px separator in the surface color, colored by the source category. Labels left of the first step and right of the others, with a 4px halo in the surface color. On hover, fade other bands to 0.18 and raise the hovered one to 0.85.
- **Tooltips:** a surface-colored box with a hairline border, 10px radius and a soft shadow; the number first and big (18px, weight 650), then what it is, then its shares.
- **Around the chart:** when the card is a report, start with a title, one or two sentences on how to read it, and a row of summary tiles (name, big value, a muted note), as the firm's HTML reports do.

## To confirm

After a write, read the card back with get_content and open it in Metabase. If the card shows an error, it is your page's: fix the page and update the card. If it shows a table, the card's `display` is not `ma_graph`.
