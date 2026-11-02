#!/usr/bin/env bash
# Installs Pathfinder's private Node.js runtime (macOS and Linux).
#
#   bash install-node.sh <dest-dir> [--check | --use-system]
#
# Downloads a pinned LTS build from nodejs.org, checks its SHA-256 against the hash
# below, and places it in <dest-dir>/node (bin/node). Nothing outside <dest-dir> is
# touched: no admin password, no PATH change. Messages are in Portuguese for the person.
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
[ -n "$DEST" ] || fail "informe a pasta de destino (uso: install-node.sh <pasta> [--check])."
TARGET="$DEST/node"

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
  # A pinned download, or a linked system Node that still works (plan B).
  [ "$(cat "$TARGET/VERSION" 2>/dev/null || true)" = "$NODE_VERSION" ] || [ -L "$TARGET/bin/node" ]
}

if [ "${2:-}" = "--check" ]; then
  if installed; then echo "OK $("$TARGET/bin/node" --version) (instalado em $TARGET)"; exit 0; fi
  echo "FALTANDO: o componente ainda não está instalado em $TARGET"
  exit 3
fi

if installed; then
  echo "OK $NODE_VERSION (já estava instalado em $TARGET)"
  exit 0
fi

# Plan B when downloads are blocked: reuse a Node.js 22+ the person installed with the
# official installer, by linking it into the private location.
use_system() {
  local system major
  system="$(command -v node 2>/dev/null || true)"
  [ -n "$system" ] || return 1
  major="$("$system" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [ "$major" -ge 22 ] 2>/dev/null || return 1
  rm -rf "$TARGET"
  mkdir -p "$TARGET/bin"
  ln -s "$system" "$TARGET/bin/node"
  "$system" --version | tr -d '\n' >"$TARGET/VERSION"
  echo "OK $("$system" --version) (usando o Node.js já instalado no computador: $system)"
  return 0
}

if [ "${2:-}" = "--use-system" ]; then
  use_system || fail "não encontrei um Node.js 22 ou mais novo instalado no computador."
  exit 0
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
  use_system && exit 0
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
