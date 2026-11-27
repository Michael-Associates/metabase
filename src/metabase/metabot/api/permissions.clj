(ns metabase.metabot.api.permissions
  "`/api/metabot/permissions` routes"
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.settings :as metabot.settings]))

(defn- simplify-permissions
  "Strip the namespace from permission keywords for a flatter JSON response.
  e.g. {:permission/metabot :yes} → {:metabot :yes}"
  [perms]
  (into {} (map (fn [[k v]] [(keyword (name k)) v])) perms))

(def ^:private user-permissions-response-schema
  [:map
   [:permissions
    [:map
     [:metabot [:enum :yes :no]]
     [:metabot-sql-generation [:enum :yes :no]]
     [:metabot-nlq [:enum :yes :no]]
     [:metabot-other-tools [:enum :yes :no]]]]])

(api.macros/defendpoint :get "/user-permissions" :- user-permissions-response-schema
  "Return the current user's resolved metabot permissions, taking the most
  permissive value across all their groups."
  []
  {:permissions (simplify-permissions
                 (cond-> (if api/*is-superuser?*
                           scope/all-yes-permissions
                           (scope/resolve-user-permissions api/*current-user-id*))
                   ;; Michael and Associates fork: the SQL editor's helpers (fix this SQL, write SQL for me, suggested
                   ;; rewrites) run on Metabot's own agent, and Claude Brain answers this fork's chat instead, so with
                   ;; Claude Brain they are off for everyone, admins too, until Claude Brain writes SQL in the editor.
                   (metabot.settings/claude-brain-configured?)
                   (assoc :permission/metabot-sql-generation :no)))})

(def ^{:arglists '([request respond raise])} routes
  "`/api/metabot/permissions` routes."
  (api.macros/ns-handler *ns* +auth))
