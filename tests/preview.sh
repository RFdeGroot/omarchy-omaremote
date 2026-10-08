#!/bin/bash
# tests/preview.sh [out.png] [missing]: render the dropdown from sample data offscreen, in the
# current Omarchy theme, at 2x. Default output: preview.png; "missing" draws the install state,
# "error" a failed session read.
# Omarchy's shell modules are linked into a temporary folder, as plugin folders may hold no links.
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
out=$(realpath -m "${1:-$here/preview.png}")
state=${2:-}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
ln -s /usr/share/omarchy/shell/Commons "$work/Commons"
ln -s /usr/share/omarchy/shell/Ui "$work/Ui"
cat > "$work/shell.qml" <<QML
import Quickshell
import QtQuick
ShellRoot {
  FloatingWindow {
    implicitWidth: 520; implicitHeight: 900
    color: "transparent"
    Loader {
      id: preview
      source: "file://$here/tests/preview/Preview.qml"
      onLoaded: { item.sampleState = "$state"; item.bodySource = "file://$here/PanelBody.qml" }
    }
    Timer {
      running: true; interval: 1500
      onTriggered: preview.item.grabToImage(function (r) { r.saveToFile("$out"); Qt.quit() })
    }
  }
}
QML
QT_QPA_PLATFORM=offscreen QT_SCALE_FACTOR=${SCALE:-2} timeout 30 qs -p "$work" >"$work/log" 2>&1 || true
grep -E "qml:.*(rror|Type)|\.qml:[0-9]+" "$work/log" | grep -v portal || true
[[ -f $out ]] && echo "wrote $out"
