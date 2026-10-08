# Reference build

Builds upstream CircuitJS1 from the pinned submodule at `reference/circuitjs1`, with the golden-test
harness patch from [`tools/reference-patch/`](../reference-patch/README.md) applied, and serves it
locally. This is the reference that golden tests record against. Nothing here edits the submodule.

## Requirements

Docker (with BuildKit, the default since Docker 23), Python 3, and the submodule checked out:

```sh
git submodule update --init
```

## Commands

```sh
pnpm reference:build   # docker build, then copies the static site to .reference-site/
pnpm reference:serve   # serves http://localhost:8000/circuitjs.html (builds first if needed)
node tools/reference-build/smoke.mjs   # with the server running: checks that the sim runs
```

`build.sh` tags the image `perun/reference:<first 12 chars of the upstream SHA>-p<first 8
chars of the patch SHA-256>` and writes both SHAs to `.reference-site/reference-build.json`, which the
golden recorder copies into every fixture. Gradle dependencies are kept in a BuildKit cache mount
between builds, since Maven Central rate-limits repeated downloads.

## Toolchain

| Piece             | Version                            | Why                                                        |
| ----------------- | ---------------------------------- | ---------------------------------------------------------- |
| Gradle            | 8.7                                | Upstream README: the GWT Gradle plugin breaks on Gradle 9  |
| JDK               | 8 (Temurin, from the Gradle image) | Upstream `circuitjs1.Containerfile` and `dev.sh` use JDK 8 |
| GWT               | 2.8.2                              | Pinned in upstream `build.gradle`                          |
| gwt-gradle-plugin | org.wisepersist 1.1.19             | Pinned in upstream `build.gradle`                          |

Both base images in the `Dockerfile` are pinned by digest. A clean build takes about 2 minutes,
most of it GWT compilation.

## Behind a TLS-intercepting proxy

Set `EXTRA_CA_CERT` to the proxy's CA certificate and keep `HTTPS_PROXY` set. The script passes the
certificate as a BuildKit secret (it is not stored in the image) and runs the build on the host
network so the proxy is reachable:

```sh
EXTRA_CA_CERT=/path/to/proxy-ca.crt pnpm reference:build
```

## Fallback

If the Docker build stops working, the official offline download at
https://www.falstad.com/circuit/offline/ ships a compiled copy of the app. Its version will not match
the pinned SHA, so golden fixtures recorded with it must say so. This fallback is untested.
