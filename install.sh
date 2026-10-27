#!/usr/bin/env bash
# Instala a extensão por symlink (edições no repo valem no próximo login) e compila o schema.
# Uso: ./install.sh            instala
#      ./install.sh --zip      gera o pacote para extensions.gnome.org
#      ./install.sh --remove   desinstala (o histórico em ~/.local/share fica; veja docs/operacao.md)
set -euo pipefail

UUID="clipboard-history-win10@leon"
SRC="$(cd "$(dirname "$0")" && pwd)/extension"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

case "${1:-}" in
  --remove)
    gnome-extensions disable "$UUID" 2>/dev/null || true
    rm -f "$DEST"
    echo "Removida. Histórico mantido em ${XDG_DATA_HOME:-$HOME/.local/share}/clipboard-history-win10"
    ;;
  --zip)
    gnome-extensions pack "$SRC" --force --out-dir "$(dirname "$SRC")" \
      --extra-source=historyStore.js --extra-source=clipboardMonitor.js \
      --extra-source=popup.js --extra-source=paster.js
    echo "Pacote: $(dirname "$SRC")/$UUID.shell-extension.zip"
    ;;
  "")
    glib-compile-schemas "$SRC/schemas"
    mkdir -p "$(dirname "$DEST")"
    if [ -e "$DEST" ] && [ ! -L "$DEST" ]; then
      echo "Já existe uma cópia (não symlink) em $DEST; remova antes." >&2
      exit 1
    fi
    ln -sfn "$SRC" "$DEST"
    echo "Instalada em $DEST"
    echo "No Wayland, saia e entre na sessão; depois: gnome-extensions enable $UUID"
    ;;
  *)
    echo "Opção desconhecida: $1" >&2
    exit 2
    ;;
esac
