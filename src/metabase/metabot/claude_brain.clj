(ns metabase.metabot.claude-brain
  "Michael and Associates fork: Claude Brain, the firm's own agent behind Metabot's chat panel.

  Claude Brain is a separate service (`ma/claude-brain/`) that runs Claude's own agent loop (the Claude Agent SDK) in
  place of Metabot's. The panel and its stream stay Metabase's: [[run-turn]] stands in for
  [[metabase.metabot.agent.core/run-agent-loop]], posts the turn to the service, and reduces the parts it streams back
  (one JSON part per line, in the shapes [[metabase.metabot.self.core/parts->aisdk-sse-xf]] takes), so saving the turn,
  history and titles work as before.

  The agent's only tools are Metabase's MCP tools, as the signed-in person: each turn gets an MCP access token for that
  person, good for the turn only and revoked when it ends."
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.mcp.core :as mcp]
   [metabase.mcp.permissions :as mcp.perms]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [oidc-provider.protocol :as oidc.protocol]
   [oidc-provider.store :as oidc.store]
   [oidc-provider.token :as oidc.token])
  (:import
   (java.io BufferedReader IOException InputStream InputStreamReader)
   (java.net URI)
   (java.net.http HttpClient HttpClient$Version HttpRequest HttpRequest$BodyPublishers HttpResponse
                  HttpResponse$BodyHandlers)
   (java.nio.charset StandardCharsets)
   (java.time Duration)))

(set! *warn-on-reflection* true)

(def ^:private served-profiles
  "The chat panel (`internal`) and the full-page Ask chat (`nlq`). Other profiles keep Metabot's own agent; their entry
  points are hidden in this fork."
  #{:internal :nlq})

(defn serves?
  "Whether Claude Brain answers a turn of the profile `profile-id`."
  [profile-id]
  (and (metabot.settings/claude-brain-configured?)
       (contains? served-profiles (keyword profile-id))))

;;; ------------------------------------------------ Access ------------------------------------------------------

(def ^:private profile->permission
  "The Metabot permission a profile needs, as Metabot's own agent checks it."
  {:nlq :permission/metabot-nlq})

(defn- check-access!
  "Throw a 403 unless the current user may use `profile-id`, the check Metabot's agent loop makes."
  [profile-id]
  (let [perms (or scope/*current-user-metabot-permissions*
                  (if api/*is-superuser?*
                    scope/all-yes-permissions
                    (scope/resolve-user-permissions api/*current-user-id*)))]
    (when (scope/missing-permission perms (profile->permission profile-id))
      (throw (ex-info (tru "You do not have permission to use the AI assistant.")
                      {:status-code 403 :type :metabot/permission-denied})))))

(defn- check-mcp-access!
  "Throw a 403 unless Metabase's MCP server is on for the current user, since Claude Brain works through it."
  []
  (when-not (and (mcp/mcp-enabled?)
                 (mcp.perms/enabled? (mcp.perms/policy-for-current-user)))
    (throw (ex-info (tru "Claude Brain works through Metabase''s MCP server, which is turned off for you.")
                    {:status-code 403 :type :metabot/permission-denied}))))

(def ^:private mcp-client-id
  "The OAuth client Metabase issues server-side MCP tokens under (see `metabase.oauth-server.jwt-bearer`); its row
  comes from a migration, and tokens of a client without a row are refused."
  "metabase-jwt-bearer")

(defn- issue-mcp-token!
  "An MCP access token for `user-id`, with every MCP scope, bound to Metabase's MCP endpoint, and expiring when a chat
  turn times out."
  [user-id]
  (let [provider (oauth-server/get-provider)
        token    (oidc.token/generate-access-token)
        ttl-ms   (+ (metabot.settings/metabot-chat-turn-async-timeout-ms) 60000)]
    (oidc.store/save-access-token (:token-store provider) token (str user-id) mcp-client-id (mcp/v2-scopes)
                                  (+ (System/currentTimeMillis) ttl-ms) [(oauth-server/mcp-resource-url)])
    token))

(defn- revoke-mcp-token!
  [token]
  (try
    (oidc.protocol/revoke-token (:token-store (oauth-server/get-provider)) token)
    (catch Exception e
      (log/warn e "Could not revoke a Claude Brain turn's MCP token"))))

;;; ------------------------------------------------ Service -----------------------------------------------------

(defonce ^:private http-client
  (delay (-> (HttpClient/newBuilder)
             (.version HttpClient$Version/HTTP_1_1)
             (.connectTimeout (Duration/ofSeconds 10))
             (.build))))

(defn- post
  "POST `body` as JSON to the Claude Brain service's `path`, returning the response with its body as a stream.
  `timeout` bounds the wait for the response to start."
  ^HttpResponse [path body ^Duration timeout]
  (let [url     (str (str/replace (metabot.settings/ma-claude-brain-url) #"/+$" "") path)
        request (-> (HttpRequest/newBuilder (URI/create url))
                    (.header "Content-Type" "application/json")
                    (.header "Authorization" (str "Bearer " (metabot.settings/ma-claude-brain-secret)))
                    (.timeout timeout)
                    (.POST (HttpRequest$BodyPublishers/ofString (json/encode body) StandardCharsets/UTF_8))
                    (.build))]
    (.send ^HttpClient @http-client request (HttpResponse$BodyHandlers/ofInputStream))))

(def ^:private part-types
  "The parts the service streams; anything else is dropped."
  #{:start :text :reasoning :tool-input-start :tool-input :tool-output :usage :finish :error})

(defn- line->part
  [line]
  (let [part (json/decode+kw line)
        type (keyword (:type part))]
    (cond
      (not (part-types type)) (log/warn "Dropping an unknown Claude Brain part" {:type (:type part)})
      ;; The loop's finish reason is a keyword, `:max-iterations` when the turn hit its step limit.
      (= :finish type)        (assoc part :type type :finish-reason (keyword (:finish-reason part)))
      :else                   (assoc part :type type))))

(defn- read-parts
  "Reduce the parts the service streams on `body` with `rf`, from `init`, until the stream ends or `rf` stops."
  [^InputStream body rf init canceled-chan]
  (let [done (a/promise-chan)]
    (when canceled-chan
      ;; The person stopped the reply or left: closing the stream ends the read below, and the service, seeing its
      ;; connection close, stops the agent.
      (a/thread
        (let [[_ port] (a/alts!! [canceled-chan done])]
          (when (= port canceled-chan)
            (.close body)))))
    (try
      (with-open [reader (BufferedReader. (InputStreamReader. body StandardCharsets/UTF_8))]
        (loop [acc init]
          (let [line (try
                       (.readLine reader)
                       (catch IOException e
                         (if (and canceled-chan (a/poll! canceled-chan))
                           nil
                           (throw e))))]
            (cond
              (nil? line)       acc
              (str/blank? line) (recur acc)
              :else
              (let [acc (if-let [part (line->part line)] (rf acc part) acc)]
                (if (reduced? acc) @acc (recur acc)))))))
      (finally
        (a/put! done true)))))

(defn- message-text
  "The text of a history message: its content when that is a string, else its text blocks."
  [{:keys [content]}]
  (cond
    (string? content)     content
    (sequential? content) (str/join "\n" (keep #(when (= "text" (some-> (:type %) name)) (:text %)) content))))

(defn- transcript
  "The conversation so far as `{:role :text}` entries, for a conversation whose agent session the service no longer
  has. Tool calls and results stay out: the text is what was said."
  [history]
  (into []
        (keep (fn [{:keys [role] :as message}]
                (let [role (keyword role)
                      text (message-text message)]
                  (when (and (#{:user :assistant} role) (not (str/blank? text)))
                    {:role (name role) :text text}))))
        history))

(defn- user-name
  [{:keys [common_name first_name last_name email]}]
  (or (not-empty common_name)
      (not-empty (str/trim (str first_name " " last_name)))
      email))

(defn run-turn
  "Run a chat turn on Claude Brain, returning a reducible of parts like
  [[metabase.metabot.agent.core/run-agent-loop]]. `message` is the person's message, `history` the conversation
  before it, `context` the enriched chat context. `canceled-chan` receives a value when the person stops the reply."
  [{:keys [conversation-id profile-id message history context canceled-chan]}]
  (check-access! (keyword profile-id))
  (check-mcp-access!)
  (let [user-id api/*current-user-id*
        user    (some-> api/*current-user* deref)
        mcp-url (or (oauth-server/mcp-resource-url)
                    (throw (ex-info (tru "Claude Brain needs the Site URL setting.") {:status-code 500})))]
    (reify clojure.lang.IReduceInit
      (reduce [_ rf init]
        (let [token (issue-mcp-token! user-id)]
          (try
            (let [response (post "/turn"
                                 {:conversationId conversation-id
                                  :message        (:content message)
                                  :context        context
                                  :history        (transcript history)
                                  :user           {:id user-id :name (user-name user)}
                                  :mcp            {:url mcp-url :token token}}
                                 (Duration/ofSeconds 30))
                  status   (.statusCode response)
                  ^InputStream body (.body response)]
              (if (= 200 status)
                (read-parts body rf init canceled-chan)
                (do (.close body)
                    (log/error "Claude Brain refused a turn" {:status status :conversation-id conversation-id})
                    (unreduced (rf init {:type :error :error {:message (tru "Claude Brain answered with an error ({0})." status)}})))))
            (catch IOException e
              (log/error e "Could not reach Claude Brain" {:conversation-id conversation-id})
              (unreduced (rf init {:type :error :error {:message (tru "Claude Brain could not be reached.")}})))
            (finally
              (revoke-mcp-token! token))))))))

(defn title
  "A title for a new conversation, from its first `message`, written by Claude Brain; nil when there is none."
  [message]
  (let [response (post "/title" {:message message} (Duration/ofSeconds 20))]
    (with-open [^InputStream body (.body response)]
      (if (= 200 (.statusCode response))
        (:title (json/decode+kw (slurp body :encoding "UTF-8")))
        (log/warn "Claude Brain could not title a conversation" {:status (.statusCode response)})))))
