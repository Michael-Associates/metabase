(ns metabase.ma-graph.core
  "Michael and Associates fork: custom graphs. A custom graph is a card whose `display` is `ma_graph` and whose
  visualization settings hold a whole HTML page under `ma_graph.html`. The browser runs that page in a sandboxed frame
  (see [[metabase.ma-graph.api]]) and hands it the card's results.

  Graph code runs in every viewer's browser, so only admins may write it, and it lives on cards only:

  - [[check-graph-authoring!]] runs in the Card save hooks, which every write path reaches (REST, the MCP tools,
    copies, reverts, serialization over the API).
  - [[strip-graph-code]] runs in the DashboardCard save hooks: a dashboard card never draws graph code of its own (the
    setting is card-only), so any it carries, from \"Reset to defaults\" or a visualizer copy, is dropped for everyone
    rather than refused."
  (:require
   [clojure.walk :as walk]
   [metabase.api.common :as api]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def display
  "The `display` of a custom graph card."
  "ma_graph")

(def html-setting
  "The visualization setting that holds a custom graph's HTML page."
  "ma_graph.html")

(def ^:private html-keys
  "The setting's key as it appears before normalization (a string) and after (a keyword)."
  [(keyword html-setting) html-setting])

(defn- decoded
  "Settings as a map. Settings can arrive as JSON text, which must not slip past the checks below."
  [settings]
  (if (string? settings)
    (try
      (json/decode+kw settings)
      (catch Exception _
        settings))
    settings))

(defn- graph-code
  "Every piece of graph code anywhere in `settings`: the card's own, a visualizer dashcard's
  (`visualization.settings`), a virtual card's (`virtual_card.visualization_settings`), or any other nesting."
  [settings]
  (let [found (volatile! #{})]
    (walk/postwalk (fn [x]
                     (when (map? x)
                       (doseq [k html-keys
                               :let [code (get x k)]
                               :when (some? code)]
                         (vswap! found conj code)))
                     x)
                   (decoded settings))
    @found))

(defn- graph-display?
  "Whether a `display`, a keyword once normalized and a string before, is a custom graph."
  [card-display]
  (= (some-> card-display name) display))

(defn- nested-graph-display?
  "Whether any `display` nested in `settings` (a visualizer's or a virtual card's) is a custom graph."
  [settings]
  (let [found? (volatile! false)]
    (walk/postwalk (fn [x]
                     (when (and (map? x)
                                (graph-display? (or (get x :display) (get x "display"))))
                       (vreset! found? true))
                     x)
                   (decoded settings))
    @found?))

(defn- draws-graph?
  [{:keys [visualization_settings] :as row}]
  (or (graph-display? (:display row))
      (nested-graph-display? visualization_settings)))

(defn check-graph-authoring!
  "Throws a 403 unless the current user is an admin, when a card write adds, changes or removes graph code, or turns a
  card into a custom graph. `previous` is the card as it was (nil for a new card, or the source of a copy), so editing
  anything else on a graph card, or copying one unchanged, stays open to anyone allowed to edit the card. A write with
  no current user is internal (serialization from the CLI, migrations, startup tasks) and is not checked."
  [{:keys [visualization_settings] :as card} previous]
  (when (and api/*current-user-id*
             (not api/*is-superuser?*)
             (or (not= (graph-code visualization_settings)
                       (graph-code (:visualization_settings previous)))
                 (and (draws-graph? card)
                      (not (draws-graph? previous)))))
    (throw (ex-info (tru "Only admins can save custom graph code.") {:status-code 403}))))

(defn strip-graph-code
  "`settings` without graph code anywhere in them. For dashboard cards, which never draw code of their own."
  [settings]
  (if (seq (graph-code settings))
    (walk/postwalk (fn [x]
                     (if (map? x)
                       (apply dissoc x html-keys)
                       x))
                   (decoded settings))
    settings))

(defn graph-code-length
  "The length of the card's graph code in `settings`, or nil when there is none."
  [settings]
  (some (fn [k] (some-> (get settings k) count)) html-keys))

(defn without-own-graph-code
  "`settings` without the card's own graph code. For write responses an AI client reads: it sent the code, and echoing
  a whole page back costs it thousands of tokens on every save. Reads (get_content) still return the code."
  [settings]
  (apply dissoc settings html-keys))

(defn keep-graph-code
  "`new-settings`, keeping `previous-settings`' graph code when `new-settings` leave it out. A client that resends the
  settings from a write response, which leaves the code out, must not erase the graph."
  [new-settings previous-settings]
  (let [code (some #(get previous-settings %) html-keys)]
    (if (and (map? new-settings)
             (some? code)
             (not-any? #(contains? new-settings %) html-keys))
      (assoc new-settings (keyword html-setting) code)
      new-settings)))
