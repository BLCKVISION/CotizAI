#!/usr/bin/env bash
# Pruebas unitarias del frontend sin dependencias nuevas: tsc (ya instalado) + test runner de Node.
set -euo pipefail
cd "$(dirname "$0")/.."
trap 'rm -rf .test-build' EXIT
rm -rf .test-build
npx tsc -p tests/tsconfig.json
node --require ./tests/setup.js --test .test-build/tests/
