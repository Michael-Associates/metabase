# What Railway runs: Metabase's official image of the same version, with our
# open-source uberjar from https://github.com/Michael-Associates/metabase/releases
# in place of theirs. The download is checked against the release's SHA-256.
FROM metabase/metabase:v0.65.3.7@sha256:70ad00d1f811edccee9b22c9a49a38aab3b9d23d06f438ea86078741e00b7e8a

LABEL org.opencontainers.image.source="https://github.com/Michael-Associates/metabase" \
      org.opencontainers.image.version="v0.65.3.7-ma.32"

RUN curl -fsSL --retry 5 --retry-delay 10 -o /tmp/metabase.jar \
        "https://github.com/Michael-Associates/metabase/releases/download/v0.65.3.7-ma.32/metabase.jar" \
    && echo "c79975983fdfc14a693f043611de0045649ec4fe4826eb7e447d6fcfe2db39a3  /tmp/metabase.jar" | sha256sum -c - \
    && mv /tmp/metabase.jar /app/metabase.jar \
    && chmod 644 /app/metabase.jar
