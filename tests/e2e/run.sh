#!/usr/bin/env bash
# Teste de ponta a ponta: sobe um GNOME Shell headless isolado (dconf, dados e runtime próprios),
# carrega a extensão e uma extensão "driver" que executa o cenário, tira screenshots e grava
# PASS/FAIL em .out/log.txt. Não toca na sua sessão nem nas suas configurações.
#
# Uso: tests/e2e/run.sh            (sai com 1 se alguma verificação falhar)
#      tests/e2e/run.sh --inner    (uso interno, dentro do dbus-run-session)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
OUT="$HERE/.out"
WL_DISPLAY="th-e2e"

if [ "${1:-}" = "--inner" ]; then
    gsettings set org.gnome.shell disable-user-extensions false
    gsettings set org.gnome.shell enabled-extensions "['clipboard-history-win10@leon', 'th-test-driver@local']"
    gsettings set org.gnome.shell welcome-dialog-last-shown-version '999'
    gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark'
    gnome-shell --headless --wayland --no-x11 --virtual-monitor 1280x800 \
        --wayland-display "$WL_DISPLAY" > "$OUT/shell.log" 2>&1 &
    shell_pid=$!
    sleep 5
    # Janela focada que recebe o Ctrl+V; grava o que foi colado em pasted.txt.
    WAYLAND_DISPLAY="$WL_DISPLAY" GDK_BACKEND=wayland python3 "$HERE/target_app.py" > "$OUT/target.log" 2>&1 &
    for _ in $(seq 1 90); do
        grep -q '^DONE' "$OUT/log.txt" 2>/dev/null && break
        sleep 1
    done
    kill "$shell_pid" 2>/dev/null || true
    sleep 1
    kill -9 "$shell_pid" 2>/dev/null || true
    exit 0
fi

ROOT="$OUT/root"
rm -rf "$OUT"
mkdir -p "$ROOT"/{config,data/gnome-shell/extensions,cache,state}
# O socket do Wayland tem limite de 108 bytes no caminho; o runtime dir fica curto, em /tmp.
RUNTIME="$(mktemp -d /tmp/th-e2e.XXXX)"
chmod 700 "$RUNTIME"
trap 'rm -rf "$RUNTIME"' EXIT

glib-compile-schemas "$REPO/extension/schemas"
ln -s "$REPO/extension" "$ROOT/data/gnome-shell/extensions/clipboard-history-win10@leon"
cp -r "$HERE/driver" "$ROOT/data/gnome-shell/extensions/th-test-driver@local"

env -i HOME="$HOME" USER="$USER" PATH="$PATH" LANG=C.UTF-8 \
    XDG_CONFIG_HOME="$ROOT/config" XDG_DATA_HOME="$ROOT/data" \
    XDG_CACHE_HOME="$ROOT/cache" XDG_STATE_HOME="$ROOT/state" \
    XDG_RUNTIME_DIR="$RUNTIME" XDG_DATA_DIRS=/usr/local/share:/usr/share \
    TH_OUT="$OUT" \
    dbus-run-session -- "$0" --inner > "$OUT/session.log" 2>&1

cat "$OUT/log.txt" 2>/dev/null || { echo "Sem log: veja $OUT/shell.log"; exit 1; }
grep -E 'JS ERROR|clipboard-history-win10' "$OUT/shell.log" || true
echo "Screenshots em $OUT"
if grep -q '^FAIL' "$OUT/log.txt" || ! grep -q '^DONE' "$OUT/log.txt"; then
    exit 1
fi
