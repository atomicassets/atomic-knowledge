#!/usr/bin/env bash
# Installs ripgrep into a job-owned directory and puts it on the job's PATH.
#
# The runner image does not carry ripgrep, and three checks are ripgrep rules.
# The version and its checksum are pinned here rather than taken from apt,
# because a rule that silently changes engine between runs is a rule nobody can
# reason about: the wallet arm and the casing arm both need PCRE2 lookarounds,
# which this build carries and a distribution build need not.
set -euo pipefail

VERSION='15.2.0'
SHA256='33e15bcf1624b25cdd2a55813a47a2f95dbe126268203e76aa6a585d1e7b149c'
TARGET="ripgrep-${VERSION}-x86_64-unknown-linux-musl"

archive="${RUNNER_TEMP}/${TARGET}.tar.gz"

curl --fail --silent --show-error --location --output "${archive}" \
    "https://github.com/BurntSushi/ripgrep/releases/download/${VERSION}/${TARGET}.tar.gz"

echo "${SHA256}  ${archive}" | sha256sum --check --status

tar --extract --gzip --file "${archive}" --directory "${RUNNER_TEMP}"

echo "${RUNNER_TEMP}/${TARGET}" >> "${GITHUB_PATH}"
"${RUNNER_TEMP}/${TARGET}/rg" --version | head -1
