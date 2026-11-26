(ns metabase.ma-graph.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.test.http-client :as client]))

(deftest frame-test
  (testing "GET /api/ma-graph/frame serves the sealed page with no sign-in"
    (let [{:keys [body headers]} (client/client-full-response :get 200 "ma-graph/frame")]
      (testing "it is an HTML page that announces itself to the card"
        (is (str/starts-with? (get headers "Content-Type") "text/html"))
        (is (str/includes? body "ma-graph:ready")))
      (testing "it carries exactly its own sealed policy (pinned: a change must break this test)"
        (is (= (str "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; "
                    "style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; "
                    "form-action 'none'; base-uri 'none'; frame-ancestors *")
               (get headers "Content-Security-Policy"))))
      (testing "frame-ancestors replaces X-Frame-Options, so public and embedded dashboards can frame it"
        (is (nil? (get headers "X-Frame-Options")))))))
