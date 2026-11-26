(ns metabase.ma-graph.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.ma-graph.core :as ma-graph]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(def ^:private graph-html "<!doctype html><p>graph</p>")

(def ^:private graph-settings
  {:ma_graph.html graph-html})

(defn- forbidden?
  "Whether `thunk` throws the 403 custom graph authoring error."
  [thunk]
  (try
    (thunk)
    false
    (catch clojure.lang.ExceptionInfo e
      (and (= 403 (:status-code (ex-data e)))
           (= "Only admins can save custom graph code." (ex-message e))))))

(defmacro ^:private as-user
  "Runs `body` as a signed-in user, an admin when `admin?`."
  [admin? & body]
  `(binding [api/*current-user-id* (mt/user->id (if ~admin? :crowberto :rasta))
             api/*is-superuser?*   ~admin?]
     ~@body))

(deftest ^:parallel check-graph-authoring-test
  (testing "a non-admin can't add graph code"
    (as-user false
      (is (forbidden? #(ma-graph/check-graph-authoring! {:visualization_settings graph-settings} nil)))))
  (testing "a non-admin can't change graph code"
    (as-user false
      (is (forbidden? #(ma-graph/check-graph-authoring!
                        {:visualization_settings {:ma_graph.html "<p>other</p>"}}
                        {:visualization_settings graph-settings})))))
  (testing "a non-admin can't remove graph code"
    (as-user false
      (is (forbidden? #(ma-graph/check-graph-authoring! {:visualization_settings {}}
                                                        {:visualization_settings graph-settings})))))
  (testing "a non-admin can't hide graph code deeper in the settings"
    (as-user false
      (is (forbidden? #(ma-graph/check-graph-authoring!
                        {:visualization_settings {:visualization {:settings graph-settings}}}
                        nil)))
      (is (forbidden? #(ma-graph/check-graph-authoring!
                        {:visualization_settings {:virtual_card {:display                "ma_graph"
                                                                 :visualization_settings graph-settings}}}
                        nil)))))
  (testing "a non-admin can't slip graph code in as JSON text"
    (as-user false
      (is (forbidden? #(ma-graph/check-graph-authoring!
                        {:visualization_settings (json/encode {"ma_graph.html" graph-html})}
                        nil)))))
  (testing "a non-admin can't turn a card into a custom graph"
    (as-user false
      (is (forbidden? #(ma-graph/check-graph-authoring! {:display :ma_graph} {:display :table})))
      (is (forbidden? #(ma-graph/check-graph-authoring! {:display "ma_graph"} nil)))
      (is (forbidden? #(ma-graph/check-graph-authoring!
                        {:display :table :visualization_settings {:virtual_card {:display "ma_graph"}}}
                        nil)))))
  (testing "a non-admin can change other settings of a custom graph, or copy one unchanged"
    (as-user false
      (is (not (forbidden? #(ma-graph/check-graph-authoring!
                             {:display :ma_graph :visualization_settings (assoc graph-settings :card.title "New")}
                             {:display :ma_graph :visualization_settings graph-settings}))))
      (is (not (forbidden? #(ma-graph/check-graph-authoring!
                             {:display :ma_graph :visualization_settings graph-settings}
                             {:display "ma_graph" :visualization_settings {"ma_graph.html" graph-html}}))))))
  (testing "an admin can write graph code"
    (as-user true
      (is (not (forbidden? #(ma-graph/check-graph-authoring!
                             {:display :ma_graph :visualization_settings graph-settings}
                             nil))))))
  (testing "a write with no signed-in user is internal and not checked"
    (is (not (forbidden? #(ma-graph/check-graph-authoring!
                           {:display :ma_graph :visualization_settings graph-settings}
                           nil))))))

(deftest ^:parallel strip-graph-code-test
  (testing "graph code is dropped wherever it sits, and everything else is kept"
    (is (= {:card.title    "Graph"
            :visualization {:display "bar" :settings {:graph.metrics ["count"]}}
            :virtual_card  {:display "ma_graph" :visualization_settings {}}}
           (ma-graph/strip-graph-code
            {:card.title    "Graph"
             :ma_graph.html graph-html
             :visualization {:display "bar" :settings {:graph.metrics ["count"] "ma_graph.html" graph-html}}
             :virtual_card  {:display "ma_graph" :visualization_settings graph-settings}}))))
  (testing "settings without graph code come back as they are"
    (is (= {:card.title "Graph"} (ma-graph/strip-graph-code {:card.title "Graph"})))))

(deftest ^:parallel write-response-test
  (testing "a write response leaves the code out and reports its length"
    (is (= {:card.title "Graph"}
           (ma-graph/without-own-graph-code (assoc graph-settings :card.title "Graph"))))
    (is (= 27 (ma-graph/graph-code-length graph-settings)))
    (is (nil? (ma-graph/graph-code-length {:card.title "Graph"})))))

(deftest ^:parallel keep-graph-code-test
  (testing "settings resent without the code keep the saved code"
    (is (= {:card.title "New" :ma_graph.html graph-html}
           (ma-graph/keep-graph-code {:card.title "New"} graph-settings))))
  (testing "settings that carry code replace it"
    (is (= {:ma_graph.html "<p>new</p>"}
           (ma-graph/keep-graph-code {:ma_graph.html "<p>new</p>"} graph-settings))))
  (testing "a card without code is left alone"
    (is (= {:card.title "New"} (ma-graph/keep-graph-code {:card.title "New"} {})))))

(deftest card-save-hooks-test
  (testing "the Card hooks apply the rule on insert and update"
    (mt/with-temp [:model/Card {card-id :id} {:display :table}]
      (as-user false
        (is (forbidden? #(t2/update! :model/Card card-id {:display                :ma_graph
                                                          :visualization_settings graph-settings})))
        (is (forbidden? #(mt/with-temp [:model/Card _ {:display                :ma_graph
                                                        :visualization_settings graph-settings}]
                           nil))))
      (as-user true
        (t2/update! :model/Card card-id {:display :ma_graph :visualization_settings graph-settings})
        (is (= "ma_graph" (name (t2/select-one-fn :display :model/Card :id card-id)))))
      (testing "a non-admin can still rename the custom graph"
        (as-user false
          (t2/update! :model/Card card-id {:name "Renamed graph"})
          (is (= "Renamed graph" (t2/select-one-fn :name :model/Card :id card-id))))))))

(deftest dashcard-save-hooks-test
  (testing "the DashboardCard hooks drop graph code for everyone, so saving a dashboard never fails on it"
    (mt/with-temp [:model/Card          {card-id :id}      {}
                   :model/Dashboard     {dashboard-id :id} {}
                   :model/DashboardCard {dashcard-id :id}  {:dashboard_id dashboard-id :card_id card-id}]
      (doseq [admin? [false true]]
        (as-user admin?
          (t2/update! :model/DashboardCard dashcard-id {:visualization_settings (assoc graph-settings
                                                                                       :card.title "Graph")})
          (is (= {:card.title "Graph"}
                 (t2/select-one-fn :visualization_settings :model/DashboardCard :id dashcard-id)))
          (mt/with-temp [:model/DashboardCard {new-dashcard-id :id} {:dashboard_id           dashboard-id
                                                                     :card_id                card-id
                                                                     :visualization_settings graph-settings}]
            (is (= {} (t2/select-one-fn :visualization_settings :model/DashboardCard :id new-dashcard-id)))))))))
