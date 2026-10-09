import QtQuick
import qs.Commons
import qs.Ui

// The dropdown drawn from sample data (no real connections), in the popup card the bar uses, for
// preview.png. tests/preview.sh renders it offscreen; its second argument picks another state
// ("missing" for the install row, "error" for a failed session read, "old" for an OMARemote too
// old for own windows).
Item {
  id: stage

  readonly property bool missing: Qt.application.arguments.indexOf("missing") >= 0 || sampleState === "missing"
  readonly property bool readError: sampleState === "error"
  property string sampleState: ""
  property url bodySource: ""

  width: card.width
  height: card.height

  QtObject {
    id: sampleRemote
    property bool installed: !stage.missing
    property bool compatible: !stage.missing
    property bool installing: false
    property string version: stage.sampleState === "old" ? "0.1.4-alpha" : "0.1.6-alpha"
    property string minimumVersion: "0.1.3-alpha"
    property string windowVersion: "0.1.6-alpha"
    property bool canOpenInWindow: !stage.missing && stage.sampleState !== "old"
    property bool appRunning: true
    property bool readError: stage.readError
    property var active: stage.missing ? [] : [
      { connection: "s-pi", name: "Raspberry Pi", protocol: "vnc", state: "connected", tab: true, view: "window" },
      { connection: "s-files", name: "File Server", protocol: "rdp", state: "connecting", tab: true }
    ]
    property var favourites: stage.missing ? [] : [
      { id: "s-build", name: "Build Server", protocol: "rdp", host: "build01.acme.lan" },
      { id: "s-design", name: "Design Workstation", protocol: "rdp", host: "design-ws01.acme.lan" },
      { id: "s-lobby", name: "Lobby Screen", protocol: "vnc", host: "lobbyscreen" }
    ]
    property var connections: favourites
    function open(id) {}
    function openApp() {}
    function install() {}
  }

  QtObject {
    id: sampleHost
    property var remote: sampleRemote
    property color foreground: Color.foreground
    property color dim: Qt.darker(Color.foreground, 1.55)
    property string fontFamily: Style.font.family
    property string summary: stage.missing ? "Not installed" : stage.readError ? "Sessions unknown" : "2 sessions running"
    property bool busy: !stage.missing
    property bool cursorActive: !stage.readError
    property var windowConnections: ["s-pi", "s-design"]
    property int cursorIndex: stage.missing ? 0 : stage.sampleState === "old" ? 3 : 2
    function opensInWindow(id) { return sampleRemote.canOpenInWindow && windowConnections.indexOf(id) !== -1 }
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
    color: Color.popups.background
    borderSpec: Border.surfaceSpec("popups", "border", Color.popups.border, Math.max(1, Style.space(2)))
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
