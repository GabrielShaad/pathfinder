#!/usr/bin/env bash
# Installs Pathfinder's private Node.js runtime (macOS and Linux).
#
#   bash install-node.sh <dest-dir> [--check | --verify | --use-system]
#
# Places a Node.js 22+ in <dest-dir>/node (bin/node), the exact path .mcp.json starts
# the server with. A Node.js 22+ already installed on the computer is linked, with no
# download (set PATHFINDER_NODE_SKIP_SYSTEM=1 to skip that). Otherwise a pinned LTS build
# is downloaded from nodejs.org and checked against the SHA-256 below. Then the bundled
# server is started once to prove it works: only that prints the final "PRONTO:" line.
# Nothing outside <dest-dir> is touched: no admin password, no PATH change.
# Messages are in Portuguese for the person.
#
#   --check       OK / FALTANDO (exit 3); installs nothing
#   --verify      starts the server with the installed runtime; installs nothing
#   --use-system  link the computer's Node.js 22+ even when a download would work
set -euo pipefail

NODE_VERSION="v24.22.2"
# From https://nodejs.org/dist/v24.22.2/SHASUMS256.txt
sha_for() {
  case "$1" in
    darwin-arm64) echo "aa9549349e47dffaa42dcf95d6e06ade8c4bdafc980979883b88767670df385a" ;;
    darwin-x64) echo "d5e336d588c45be0c37dbd52cc29895593009ca4997a77a1fd02815131ed0e52" ;;
    linux-arm64) echo "95c264150aceb7f3437a29fd6984924f5f8d1511ea3cbd6c508b83f6c555dae2" ;;
    linux-x64) echo "361718c444e49af2ca5a110c83ba6a8901143f23ab285ebbef0341f391f482a9" ;;
    *) echo "" ;;
  esac
}

fail() {
  echo "ERRO: $*" >&2
  exit 1
}

DEST="${1:-}"
MODE="${2:-}"
[ -n "$DEST" ] || fail "informe a pasta de destino (uso: install-node.sh <pasta> [--check])."
# The skill passes the plugin data folder, filled in by Claude Code. A placeholder that
# was not filled in, or a relative path, means the command was improvised: installing
# anywhere else would leave Pathfinder still unable to start.
case "$DEST" in
  *'$'*) fail "a pasta de destino não foi preenchida ($DEST). Nada foi instalado." ;;
  /*) ;;
  *) fail "a pasta de destino precisa ser um caminho completo ($DEST). Nada foi instalado." ;;
esac
case "$MODE" in
  "" | --check | --verify | --use-system) ;;
  *) fail "opção desconhecida: $MODE" ;;
esac
TARGET="$DEST/node"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER="$(dirname "$SCRIPT_DIR")/dist/server.mjs"

case "$(uname -s)" in
  Darwin) OS="darwin" ;;
  Linux) OS="linux" ;;
  *) fail "sistema não suportado por este instalador: $(uname -s). No Windows use install-node.ps1." ;;
esac
case "$(uname -m)" in
  arm64 | aarch64) ARCH="arm64" ;;
  x86_64 | amd64) ARCH="x64" ;;
  *) fail "processador não suportado: $(uname -m)." ;;
esac
PLATFORM="$OS-$ARCH"

installed() {
  [ -x "$TARGET/bin/node" ] && "$TARGET/bin/node" --version >/dev/null 2>&1 || return 1
  # A pinned download, or a linked system Node that still works and is new enough.
  [ "$(cat "$TARGET/VERSION" 2>/dev/null || true)" = "$NODE_VERSION" ] && return 0
  [ -L "$TARGET/bin/node" ] && [ "$("$TARGET/bin/node" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge 22 ] 2>/dev/null
}

# Starts the bundled server with "$TARGET/bin/node", as Claude Code will, and prints the
# final line. "PRONTO:" is the only output that means Pathfinder is ready.
ready() {
  local result
  [ -f "$SERVER" ] || fail "não encontrei os arquivos do Pathfinder ($SERVER). Reinstale o plugin."
  if result="$("$TARGET/bin/node" "$SCRIPT_DIR/verify-server.mjs" "$TARGET/bin/node" "$SERVER" "$DEST/.verify-$$" 2>&1)"; then
    echo "PRONTO: o Pathfinder iniciou com o componente $("$TARGET/bin/node" --version) em $TARGET/bin/node"
    exit 0
  fi
  fail "o componente está em $TARGET, mas o Pathfinder não conseguiu iniciar com ele: $result"
}

if [ "$MODE" = "--check" ]; then
  if installed; then echo "OK $("$TARGET/bin/node" --version) (instalado em $TARGET)"; exit 0; fi
  echo "FALTANDO: o componente ainda não está instalado em $TARGET"
  exit 3
fi

if [ "$MODE" = "--verify" ]; then
  installed || { echo "FALTANDO: o componente ainda não está instalado em $TARGET"; exit 3; }
  ready
fi

if [ "$MODE" != "--use-system" ] && installed; then
  echo "OK $("$TARGET/bin/node" --version) (já estava instalado em $TARGET)"
  ready
fi

# The Node.js 22+ the person installed with the official installer (the README asks for
# it), found on PATH or in the usual install locations, which a desktop app's PATH may
# miss. It is linked into the private location, so nothing is downloaded.
use_system() {
  local candidate major
  for candidate in "$(command -v node 2>/dev/null || true)" /usr/local/bin/node /opt/homebrew/bin/node /usr/bin/node; do
    [ -n "$candidate" ] && [ -x "$candidate" ] || continue
    major="$("$candidate" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
    [ "$major" -ge 22 ] 2>/dev/null || continue
    rm -rf "$TARGET"
    mkdir -p "$TARGET/bin"
    ln -s "$candidate" "$TARGET/bin/node"
    "$candidate" --version | tr -d '\n' >"$TARGET/VERSION"
    echo "OK $("$candidate" --version) (usando o Node.js já instalado no computador: $candidate)"
    return 0
  done
  return 1
}

if [ "$MODE" = "--use-system" ]; then
  use_system || fail "não encontrei um Node.js 22 ou mais novo instalado no computador."
  ready
fi

if [ -z "${PATHFINDER_NODE_SKIP_SYSTEM:-}" ] && use_system; then
  ready
fi

if [ "$OS" = "linux" ] && [ -f /etc/alpine-release ]; then
  fail "o Alpine Linux não é suportado pelos pacotes oficiais do Node.js."
fi

EXPECTED="${PATHFINDER_NODE_EXPECTED_SHA256:-$(sha_for "$PLATFORM")}"
[ -n "$EXPECTED" ] || fail "não há pacote do Node.js para $PLATFORM."
command -v curl >/dev/null 2>&1 || fail "o programa 'curl' não foi encontrado; ele é necessário para baixar o componente."
command -v tar >/dev/null 2>&1 || fail "o programa 'tar' não foi encontrado."

mkdir -p "$DEST"
WORK="$(mktemp -d "$DEST/.node-install.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

ARCHIVE="node-$NODE_VERSION-$PLATFORM.tar.gz"
URL="${PATHFINDER_NODE_MIRROR:-https://nodejs.org/dist}/$NODE_VERSION/$ARCHIVE"
echo "Baixando o componente (Node.js $NODE_VERSION, cerca de 50 MB) de nodejs.org..."
if ! curl -fsSL --retry 2 --connect-timeout 20 -o "$WORK/$ARCHIVE" "$URL"; then
  fail "não consegui baixar $URL. Verifique a internet (ou proxy/antivírus da empresa) e tente de novo."
fi

if command -v shasum >/dev/null 2>&1; then
  ACTUAL="$(shasum -a 256 "$WORK/$ARCHIVE" | awk '{print $1}')"
else
  ACTUAL="$(sha256sum "$WORK/$ARCHIVE" | awk '{print $1}')"
fi
[ "$ACTUAL" = "$EXPECTED" ] || fail "o arquivo baixado não confere com a assinatura esperada (SHA-256). Nada foi instalado."

tar -xzf "$WORK/$ARCHIVE" -C "$WORK"
STAGE="$WORK/node-$NODE_VERSION-$PLATFORM"
[ -x "$STAGE/bin/node" ] || fail "o pacote baixado não tem o executável esperado."
"$STAGE/bin/node" --version >/dev/null 2>&1 || fail "o componente baixado não funciona neste computador."
echo "$NODE_VERSION" >"$STAGE/VERSION"

# Swap in place: the old copy is removed only after the new one is there.
rm -rf "$DEST/node.old"
[ -d "$TARGET" ] && mv "$TARGET" "$DEST/node.old"
mv "$STAGE" "$TARGET"
rm -rf "$DEST/node.old"

echo "OK $NODE_VERSION (instalado em $TARGET)"
ready
