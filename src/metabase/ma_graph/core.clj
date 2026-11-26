(ns metabase.ma-graph.core
  "Michael and Associates fork: custom graphs. A custom graph is a card whose `display` is `ma_graph` and whose
  visualization settings hold a whole HTML page under `ma_graph.html`. The browser runs that page in a sandboxed frame
  (see [[metabase.ma-graph.api]]) and hands it the card's results.

  Graph code runs in every viewer's browser, so only admins may write it: [[check-graph-authoring!]] runs in the Card
  and DashboardCard save hooks, which every write path reaches (REST, the MCP tools, copies, reverts)."
  (:require
   [metabase.api.common :as api]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(def display
  "The `display` of a custom graph card."
  "ma_graph")

(def html-setting
  "The visualization setting that holds a custom graph's HTML page."
  "ma_graph.html")

(defn- setting
  "The value of the setting named `k` in `settings`, whose keys are keywords once normalized and strings before."
  [settings k]
  (when (map? settings)
    (or (get settings (keyword k))
        (get settings k))))

(defn- graph-code
  "Every place `visualization-settings` can carry graph code: the card's own settings, or a visualizer dashcard's."
  [visualization-settings]
  [(setting visualization-settings html-setting)
   (setting (setting (setting visualization-settings "visualization") "settings") html-setting)])

(defn summarize-graph-code
  "`visualization-settings` with the graph code replaced by a note of its length. For write responses an AI client
  reads: it sent the code, and echoing a whole page back costs it thousands of tokens on every save. Reads
  (get_content) still return the code itself, so a client can edit it."
  [visualization-settings]
  (if-let [code (setting visualization-settings html-setting)]
    (-> visualization-settings
        (dissoc html-setting)
        (assoc (keyword html-setting) (str "<" (count code) " characters of graph HTML, saved>")))
    visualization-settings))

(defn- graph-display?
  "Whether a card's `display`, a keyword once normalized and a string before, is a custom graph."
  [card-display]
  (= (some-> card-display name) display))

(defn check-graph-authoring!
  "Throws a 403 unless the current user is an admin, when a write adds or changes custom graph code, or turns a card
  into a custom graph. `previous` is the row as it was (nil for a new row, or the source of a copy), so editing
  anything else on a graph card, or copying one unchanged, stays open to anyone allowed to edit the card. A write with
  no current user is internal (serialization, migrations, startup tasks) and is not checked."
  [{:keys [visualization_settings] :as row} previous]
  (when (and api/*current-user-id*
             (not api/*is-superuser?*)
             (or (not= (graph-code visualization_settings)
                       (graph-code (:visualization_settings previous)))
                 (and (graph-display? (:display row))
                      (not (graph-display? (:display previous))))))
    (throw (ex-info (tru "Only admins can save custom graph code.") {:status-code 403}))))
