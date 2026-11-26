(ns metabase.ma-graph.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.ma-graph.core :as ma-graph]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private graph-settings
  {:ma_graph.html "<!doctype html><p>graph</p>"})

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
  (testing "a non-admin can't put graph code in a visualizer dashcard's settings"
    (as-user false
      (is (forbidden? #(ma-graph/check-graph-authoring!
                        {:visualization_settings {:visualization {:settings graph-settings}}}
                        nil)))))
  (testing "a non-admin can't turn a card into a custom graph"
    (as-user false
      (is (forbidden? #(ma-graph/check-graph-authoring! {:display :ma_graph} {:display :table})))
      (is (forbidden? #(ma-graph/check-graph-authoring! {:display "ma_graph"} nil)))))
  (testing "a non-admin can change other settings of a custom graph, or copy one unchanged"
    (as-user false
      (is (not (forbidden? #(ma-graph/check-graph-authoring!
                             {:display :ma_graph :visualization_settings (assoc graph-settings :card.title "New")}
                             {:display :ma_graph :visualization_settings graph-settings}))))
      (is (not (forbidden? #(ma-graph/check-graph-authoring!
                             {:display :ma_graph :visualization_settings graph-settings}
                             {:display "ma_graph" :visualization_settings {"ma_graph.html" (:ma_graph.html graph-settings)}}))))))
  (testing "an admin can write graph code"
    (as-user true
      (is (not (forbidden? #(ma-graph/check-graph-authoring!
                             {:display :ma_graph :visualization_settings graph-settings}
                             nil))))))
  (testing "a write with no signed-in user is internal and not checked"
    (is (not (forbidden? #(ma-graph/check-graph-authoring!
                           {:display :ma_graph :visualization_settings graph-settings}
                           nil))))))

(deftest ^:parallel summarize-graph-code-test
  (testing "the graph code becomes a note of its length"
    (is (= {:ma_graph.html "<27 characters of graph HTML, saved>" :card.title "Graph"}
           (ma-graph/summarize-graph-code (assoc graph-settings :card.title "Graph")))))
  (testing "settings without graph code are returned as they are"
    (is (= {:graph.dimensions ["CATEGORY"]}
           (ma-graph/summarize-graph-code {:graph.dimensions ["CATEGORY"]})))))

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
  (testing "the DashboardCard hooks apply the rule on insert and update"
    (mt/with-temp [:model/Card          {card-id :id}      {}
                   :model/Dashboard     {dashboard-id :id} {}
                   :model/DashboardCard {dashcard-id :id}  {:dashboard_id dashboard-id :card_id card-id}]
      (as-user false
        (is (forbidden? #(t2/update! :model/DashboardCard dashcard-id {:visualization_settings graph-settings})))
        (is (forbidden? #(mt/with-temp [:model/DashboardCard _ {:dashboard_id           dashboard-id
                                                                :card_id                card-id
                                                                :visualization_settings graph-settings}]
                           nil))))
      (as-user true
        (t2/update! :model/DashboardCard dashcard-id {:visualization_settings graph-settings})
        (is (= (:ma_graph.html graph-settings)
               (:ma_graph.html (t2/select-one-fn :visualization_settings :model/DashboardCard :id dashcard-id))))))))
