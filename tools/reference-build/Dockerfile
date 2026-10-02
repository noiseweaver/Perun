# syntax=docker/dockerfile:1.7
# Builds the upstream CircuitJS1 reference app from reference/circuitjs1 (pinned submodule).
# Toolchain matches upstream: Gradle 8.7 (GWT plugin breaks on 9.x), JDK 8, GWT 2.8.2.
# Build context must be the repo root. See tools/reference-build/README.md.

FROM gradle:8.7-jdk8@sha256:91870528ba21ac1360d249478a5164490d0fd62b3f7034f110df80adffa8131d AS build

# Optional: an extra CA certificate for TLS-intercepting proxies (passed as a build secret).
ARG HTTPS_PROXY
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then \
      keytool -importcert -noprompt -alias extra-ca -file /run/secrets/extra_ca \
        -keystore "$JAVA_HOME/jre/lib/security/cacerts" -storepass changeit; \
    fi

COPY reference/circuitjs1 /src
WORKDIR /src

# Golden-test harness patch (deterministic stepping, seeded Random, state dump).
# See tools/reference-patch/README.md. The submodule itself is never modified.
COPY tools/reference-patch/harness.patch /tmp/harness.patch
# Applied from / (outside any git repo; the submodule's .git file does not resolve here), so the
# patch's src/... paths are prefixed with the /src build directory.
RUN cd / && git apply --directory=src /tmp/harness.patch

# Gradle does not read HTTPS_PROXY, so translate it into JVM flags when set.
# The cache mount keeps downloaded dependencies across builds (Maven Central rate-limits repeat
# downloads); it never ends up in the image.
RUN --mount=type=cache,target=/root/.gradle,id=circuitjs-next-gradle \
    set -eu; \
    if [ -n "${HTTPS_PROXY:-}" ]; then \
      hp="${HTTPS_PROXY#*://}"; hp="${hp%/}"; \
      export GRADLE_OPTS="-Dhttps.proxyHost=${hp%:*} -Dhttps.proxyPort=${hp##*:}"; \
    fi; \
    gradle --no-daemon compileGwt makeSite --console plain

FROM python:3.12-slim@sha256:dddfd7e07f9d15aeeca61529320492139d21cac7f0070c00609243e51e4e0016
COPY --from=build /src/site /site
WORKDIR /site
EXPOSE 8000
CMD ["python3", "-m", "http.server", "8000", "--bind", "0.0.0.0"]
