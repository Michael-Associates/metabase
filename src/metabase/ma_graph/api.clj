(ns metabase.ma-graph.api
  "Michael and Associates fork: `GET /api/ma-graph/frame`, the page a custom graph runs in.

  The page is inert until the custom graph card posts it the graph's HTML and the card's results, then it writes that
  HTML into itself. It carries its own Content-Security-Policy, because a graph's inline scripts and styles are blocked
  by the app's policy, which a `srcdoc` frame would inherit. That policy also seals the page:

  - `sandbox allow-scripts` gives the page a unique origin however it is framed, or even when opened on its own, so a
    graph can never act as the signed-in user: no session cookie, no API calls, no access to the app's page.
  - `connect-src`, `img-src`, `font-src`, `form-action`, `webrtc` and `default-src` block requests, images, fonts,
    forms, peer connections, frames, workers and plugins, so a graph can't send data through any of them.
  - Trusted Types with one policy, which the page itself takes to write the graph: graph code can't turn text into HTML
    or code (innerHTML, document.write, srcdoc, eval), so a value in the data, such as a lead's name, can never run as
    script. Browsers without Trusted Types (Firefox, Safari) skip this layer.
  - `frame-ancestors *` lets public and embedded dashboards frame it, as the app's own page may be framed there.

  What the policy can't block: the page navigating itself, which the browser checks against the framing page's
  `frame-src` (the app's own pages and the allowed iframe hosts). That takes code written to do it, and only admins can
  save graph code (see [[metabase.ma-graph.core]]).

  No auth: public dashboards render custom graphs too, and the page holds no data until the card posts it."
  (:require
   [clojure.java.io :as io]
   [metabase.api.macros :as api.macros]))

(set! *warn-on-reflection* true)

(def ^:private frame-html
  (delay (slurp (io/resource "ma_graph/frame.html"))))

(def frame-csp
  "The page's Content-Security-Policy."
  (str "sandbox allow-scripts; "
       "default-src 'none'; "
       "script-src 'unsafe-inline'; "
       "style-src 'unsafe-inline'; "
       "img-src data: blob:; "
       "font-src data:; "
       "connect-src 'none'; "
       "form-action 'none'; "
       "base-uri 'none'; "
       "webrtc 'block'; "
       "require-trusted-types-for 'script'; "
       "trusted-types ma-graph; "
       "frame-ancestors *"))

(api.macros/defendpoint :get "/frame" :- :any
  "The page a custom graph runs in. See the namespace docstring."
  [_route-params _query-params _body]
  {:status  200
   :headers {"Content-Type"            "text/html; charset=utf-8"
             "Content-Security-Policy" frame-csp
             ;; nil drops the header: the security middleware would otherwise add X-Frame-Options: DENY, which
             ;; frame-ancestors replaces here.
             "X-Frame-Options"         nil
             "X-Content-Type-Options"  "nosniff"
             "Referrer-Policy"         "no-referrer"
             ;; private: the middleware may add cookies to the response.
             "Cache-Control"           "private, max-age=300"}
   :body    @frame-html})

(def ^{:arglists '([request respond raise])} routes
  "`/api/ma-graph` routes."
  (api.macros/ns-handler *ns*))
