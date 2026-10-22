import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui

// The dropdown drawn from sample data (no real connections), in the popup card the bar uses, for
// preview.png. tests/preview.sh renders it offscreen; its second argument picks another state
// ("missing" for the install row, "old" for the update row of an OMARemote too old for this
// plugin, "error" for a failed session read). The sample versions only need to be on either side of
// the minimum; they need not follow it.
Item {
  id: stage

  property string sampleState: ""
  property url bodySource: ""
  readonly property bool missing: sampleState === "missing"
  readonly property bool old: sampleState === "old"
  readonly property bool readError: sampleState === "error"
  // Installed and new enough: sessions and favourites show.
  readonly property bool ready: !missing && !old

  width: card.width
  height: card.height

  QtObject {
    id: sampleRemote
    property bool installed: !stage.missing
    property bool compatible: stage.ready
    property bool installing: false
    property string version: stage.missing ? "" : stage.old ? "0.9.0" : "1.0.0"
    property string minimumVersion: "0.9.3"
    property bool appRunning: true
    property bool readError: stage.readError
    property var active: stage.ready ? [
      { connection: "s-pi", name: "Raspberry Pi", protocol: "vnc", state: "connected", tab: true, view: "window" },
      { connection: "s-studio", name: "Studio Desktop", protocol: "gliff", state: "connecting", tab: true, view: "tab" },
      { connection: "s-git", name: "Git Server", protocol: "ssh", state: "connected", tab: true, view: "window", hotkey: true }
    ] : []
    property var favourites: stage.ready ? [
      { id: "s-build", name: "Build Server", protocol: "rdp", host: "build01.acme.lan" },
      { id: "s-design", name: "Design Workstation", protocol: "rdp", host: "design-ws01.acme.lan" },
      { id: "s-lobby", name: "Lobby Screen", protocol: "vnc", host: "lobbyscreen" }
    ] : []
    property var starred: favourites
    property bool connectionsExist: true
    property bool favouritesFailed: false
    function open(id) {}
    function toggle(id) {}
    function openApp() {}
    function install() {}
  }

  QtObject {
    id: sampleHost
    property var remote: sampleRemote
    property color foreground: Commons.Color.foreground
    property color dim: Qt.darker(Commons.Color.foreground, 1.55)
    property string fontFamily: Style.font.family
    property string summary: stage.missing ? "Not installed" : stage.old ? "Needs a newer OMARemote"
      : stage.readError ? "Sessions unknown" : "3 sessions running"
    property bool busy: !stage.missing
    property bool cursorActive: !stage.readError
    property var windowConnections: ["s-pi", "s-design"]
    // On the install row when it shows, else on the third session.
    property int cursorIndex: stage.ready ? 2 : 0
    function opensInWindow(id) { return sampleRemote.compatible && windowConnections.indexOf(id) !== -1 }
    function toggleWindow(i) {}
    function rowHasCursor(i) { return cursorActive && cursorIndex === i }
    function pointerMoved(i, item, mouse) {}
    function activate(i) {}
    function close() {}
  }

  BorderSurface {
    id: card
    width: Style.space(340)
    height: (body.item ? body.item.implicitHeight : 0) + contentTopInset + contentBottomInset
    color: Commons.Color.popups.background
    borderSpec: Border.surfaceSpec("popups", "border", Commons.Color.popups.border, Math.max(1, Style.space(2)))
    padding: Style.spacing.popupPadding
    radius: Style.cornerRadius

    Loader {
      id: body
      x: card.contentLeftInset
      y: card.contentTopInset
      width: card.width - card.contentLeftInset - card.contentRightInset
      source: stage.bodySource
      onLoaded: {
        item.host = sampleHost
        item.width = Qt.binding(function () { return body.width })
      }
    }
  }
}
