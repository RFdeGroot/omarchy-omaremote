import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Quickshell
import qs.Commons
import qs.Ui
import "Model.js" as Model

// OMARemote in the bar: running sessions and favourite connections, one click to bring a session
// forward or connect. Without OMARemote (or with one too old for this plugin) it offers to install.
Panel {
  id: root
  moduleName: "rfdegroot.omaremote"
  ipcTarget: "rfdegroot.omaremote"

  property int cursorIndex: 0
  property bool cursorActive: false

  readonly property bool autoHide: setting("autoHide", false) === true
  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color dim: Qt.darker(foreground, 1.55)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property bool busy: remote.appRunning || remote.active.length > 0
  readonly property color barIconColor: busy || !remote.compatible ? barForeground : Qt.darker(barForeground, 1.55)
  readonly property string summary: remote.installing ? "Installing…"
    : Model.summary(remote.installed, remote.compatible, remote.appRunning, remote.active.length, remote.readError)

  // Every row the cursor can land on, top to bottom.
  readonly property var rows: {
    var out = []
    if (!remote.compatible) out.push({ kind: "install" })
    else if (!remote.readError) {
      remote.active.forEach(function (s) { out.push({ kind: "session", item: s }) })
      remote.favourites.forEach(function (c) { out.push({ kind: "favourite", item: c }) })
    }
    return out
  }

  // Autohide hides the icon only while OMARemote is installed, closed and idle: the install
  // button must stay reachable.
  visible: !autoHide || !remote.checked || !remote.compatible || busy
  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  function rowHasCursor(index) {
    return cursorActive && cursorIndex === index
  }

  function moveCursor(dy) {
    cursorActive = true
    pointerGate.reset()
    if (rows.length === 0) return
    cursorIndex = Math.max(0, Math.min(rows.length - 1, cursorIndex + dy))
    scrollCursorIntoView()
  }

  // The panel caps its height, so a long FAVOURITES list scrolls; keep the keyboard cursor in
  // view. Hover leaves the scroll alone: the row under the pointer is on screen already.
  function scrollCursorIntoView() {
    Qt.callLater(function () {
      var item = column.rowItem(cursorIndex)
      if (!item) return
      // The first row brings the hero and its section header back as well.
      if (cursorIndex === 0) { panelFlick.contentY = 0; return }
      var margin = Style.space(6)
      var top = item.mapToItem(panelFlick.contentItem, 0, 0).y
      var bottom = top + item.height
      var maxY = Math.max(0, panelFlick.contentHeight - panelFlick.height)
      if (top < panelFlick.contentY + margin) panelFlick.contentY = Math.max(0, top - margin)
      else if (bottom > panelFlick.contentY + panelFlick.height - margin)
        panelFlick.contentY = Math.min(maxY, bottom + margin - panelFlick.height)
    })
  }

  // Hover moves the cursor only when the pointer itself moves: rows scrolling under a resting
  // pointer would otherwise take the cursor away from the keyboard.
  function pointerMoved(index, item, mouse) {
    if (!pointerGate.moved(item, mouse)) return
    cursorActive = true
    cursorIndex = index
  }

  function activate(index) {
    var row = rows[index]
    if (!row) return
    // Also while installing: the terminal may have been closed before it finished.
    if (row.kind === "install") {
      remote.install()
      root.close()
      return
    }
    remote.open(row.kind === "session" ? row.item.connection : row.item.id)
    root.close()
  }

  onOpenedChanged: if (opened) {
    cursorActive = false
    cursorIndex = 0
    pointerGate.reset()
    if (panelFlick) panelFlick.contentY = 0
    remote.refresh()
    remote.listSessions()
    Qt.callLater(function () { keyCatcher.forceActiveFocus() })
  }
  onRowsChanged: cursorIndex = Math.max(0, Math.min(cursorIndex, rows.length - 1))

  // One Service for the bars on every monitor: Omarchy loads it once as this plugin's service and
  // hands it to widgets in the built-in bar. A replacement bar gets no service lookup, so there
  // each copy of the widget runs its own.
  readonly property var sharedService: bar && bar.shell && typeof bar.shell.serviceFor === "function"
    ? bar.shell.serviceFor(moduleName) : null

  Loader {
    id: ownService
    active: !root.sharedService
    sourceComponent: Component { Service { } }
  }

  // Stands in for the few moments neither exists (between the two while one is torn down).
  QtObject {
    id: noService
    readonly property bool checked: false
    readonly property bool installed: false
    readonly property bool compatible: false
    readonly property bool installing: false
    readonly property bool appRunning: false
    readonly property bool readError: false
    readonly property string version: ""
    readonly property string minimumVersion: ""
    readonly property var connections: []
    readonly property var active: []
    readonly property var favourites: []
    function refresh() {}
    function listSessions() {}
    function open(id) {}
    function openApp() {}
    function install() {}
  }

  // For PanelBody too, which reads the service through its host.
  readonly property var remote: sharedService || ownService.item || noService

  PointerMoveGate {
    id: pointerGate
    referenceItem: panelFlick
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    tooltipText: "OMARemote · " + root.summary
    iconComponent: Component {
      Item {
        OMARemoteIcon {
          anchors.centerIn: parent
          iconSize: Style.space(13)
          color: root.barIconColor
        }
      }
    }
    onPressed: function (buttonCode) {
      if (buttonCode === Qt.MiddleButton) remote.openApp()
      else root.toggle()
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(340))
    contentHeight: panel.fittedContentHeight(column.implicitHeight, Style.space(560))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onMoveRequested: function (dx, dy) {
        if (!root.cursorActive) { root.cursorActive = true; return }
        if (dy !== 0) root.moveCursor(dy)
      }
      onActivateRequested: if (root.cursorActive) root.activate(root.cursorIndex)
      onCloseRequested: root.close()
      onTabRequested: function (direction) { root.switchPanel(direction) }
      onTextKey: function (t) {
        var key = String(t).toLowerCase()
        if (key === "o") { remote.openApp(); root.close() }
        else if (key === "r") { remote.refresh(); remote.listSessions() }
        else if (key === "i" && !remote.compatible) root.activate(0)
      }

      Flickable {
        id: panelFlick
        anchors.fill: parent
        contentWidth: width
        contentHeight: column.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        flickableDirection: Flickable.VerticalFlick
        interactive: contentHeight > height
        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

        PanelBody {
          id: column
          width: panelFlick.width
          host: root
        }
      }
    }
  }

}
