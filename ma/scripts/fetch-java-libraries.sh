#!/usr/bin/env bash
# Downloads every Java library CI uses (the CLJS compile, our backend tests and
# the uberjar build) without running anything.
#
# Maven Central sometimes answers GitHub's shared machines with "429 Too Many
# Requests", which failed a build on 2026-11-27. Fetching up front, with waits
# that outlast its limit, keeps that from failing a run, and the checks job then
# saves the libraries so the uberjar job and later runs skip the downloads.

set -uo pipefail

for wait in 30 60 120 stop; do
  clojure -P -M:cljs &&
    clojure -P -X:dev:ci:oss:oss-dev:test &&
    clojure -P -X:drivers:build:build/all &&
    exit 0
  if [ "${wait}" = stop ]; then
    echo "::error::Could not fetch the Java libraries after 4 attempts."
    exit 1
  fi
  echo "::warning::Fetching the Java libraries failed; trying again in ${wait}s."
  sleep "${wait}"
done
