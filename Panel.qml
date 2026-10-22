import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Quickshell
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Model.js" as Model

// OMARemote in the bar: running sessions and favourite connections, one click to bring a session
// forward or connect. Without OMARemote (or with one too old for this plugin) it offers to install.
// This file is the bar button and the popup around PanelBody.qml: cursor, keys and scrolling.
Panel {
  id: root
  moduleName: "rfdegroot.omaremote"
  ipcTarget: "rfdegroot.omaremote"

  // --- The service ---------------------------------------------------------------------------

  // One Service for the bars on every monitor: Omarchy loads it once as this plugin's service and
  // hands it to widgets in the built-in bar. A replacement bar gets no service lookup, so there
  // each copy of the widget runs its own.
  readonly property var sharedService: bar && bar.shell && typeof bar.shell.serviceFor === "function"
    ? bar.shell.serviceFor(moduleName) : null
  // For PanelBody too, which reads the service through its host.
  readonly property var remote: sharedService || ownService.item || noService

  // --- Settings ------------------------------------------------------------------------------

  readonly property bool autoHide: setting("autoHide", false) === true

  // The connections that open in a floating window of their own, by id. Kept in this widget's
  // shell.json entry like its other settings, so the choice survives restarts and the bars on
  // every monitor share it. Changed here at once; the entry written back sets it again through
  // onSettingsChanged.
  property var windowConnections: Model.windowConnections(setting("windowConnections", []))

  // --- Look ----------------------------------------------------------------------------------

  readonly property color foreground: bar ? bar.foreground : Commons.Color.foreground
  readonly property color dim: Qt.darker(foreground, 1.55)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  // OMARemote's window is open or a session runs: the icon at full strength.
  readonly property bool busy: remote.appRunning || remote.active.length > 0
  readonly property color barIconColor: busy || !remote.compatible ? barForeground : Qt.darker(barForeground, 1.55)
  readonly property string summary: remote.installing ? "Installing…"
    : Model.summary(remote.installed, remote.compatible, remote.appRunning, remote.active.length, remote.readError)

  // --- Rows and the cursor -------------------------------------------------------------------

  // Every row the cursor can land on, top to bottom. PanelBody.rowItem() maps them back to items.
  readonly property var rows: {
    var out = []
    // Missing or too old: the one row installs or updates it.
    if (!remote.compatible) out.push({ kind: "install" })
    if (remote.compatible && !remote.readError) {
      remote.active.forEach(function (s) { out.push({ kind: "session", item: s }) })
      remote.favourites.forEach(function (c) { out.push({ kind: "favourite", item: c }) })
    }
    return out
  }

  property int cursorIndex: 0
  // The cursor shows only once the keyboard or the pointer has moved it, not when the panel opens.
  property bool cursorActive: false

  // Autohide hides the icon only while OMARemote is installed, closed and idle: the install
  // button must stay reachable.
  visible: !autoHide || !remote.checked || !remote.compatible || busy
  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  // --- Functions -----------------------------------------------------------------------------

  // The connection a row stands for: a session's, or the favourite itself.
  function connectionOf(row) {
    return row.kind === "session" ? row.item.connection : row.item.id
  }

  function opensInWindow(connectionId) {
    return remote.compatible && Model.opensInWindow(windowConnections, connectionId)
  }

  // A hotkey window always opens on its own special workspace, so the switch means nothing there.
  function hasWindowSwitch(row) {
    return !!row && remote.compatible
      && (row.kind === "favourite" || (row.kind === "session" && !Model.isHotkey(row.item)))
  }

  // Flips "own window" for the row's connection and writes the list back to shell.json.
  function toggleWindow(index) {
    var row = rows[index]
    if (!hasWindowSwitch(row)) return
    var id = connectionOf(row)
    windowConnections = Model.setOpensInWindow(windowConnections, id, !Model.opensInWindow(windowConnections, id))
    if (!bar || !bar.shell || typeof bar.shell.updateEntryInline !== "function") return
    // updateEntryInline replaces the whole entry, so the other settings go along unchanged.
    var entry = { id: moduleName }
    for (var key in settings) if (key !== "id") entry[key] = settings[key]
    entry.windowConnections = windowConnections
    bar.shell.updateEntryInline(moduleName, entry)
  }

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

  // What a click or ⏎ on a row does; the panel closes after it.
  function activate(index) {
    var row = rows[index]
    if (!row) return
    // Also while installing: the terminal may have been closed before it finished.
    if (row.kind === "install") remote.install()
    else if (row.kind === "session" && Model.isHotkey(row.item)) remote.toggle(connectionOf(row))
    else remote.open(connectionOf(row), opensInWindow(connectionOf(row)))
    root.close()
  }

  // --- Handlers ------------------------------------------------------------------------------

  onSettingsChanged: windowConnections = Model.windowConnections(setting("windowConnections", []))

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

  // --- Children ------------------------------------------------------------------------------

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
    readonly property bool favouritesFailed: false
    readonly property bool connectionsExist: false
    readonly property var starred: []
    readonly property var active: []
    readonly property var favourites: []
    function refresh() {}
    function listSessions() {}
    function open(id, inWindow) {}
    function toggle(id) {}
    function openApp() {}
    function install() {}
  }

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
      // The first arrow or j/k only shows the cursor where it is; later ones move it.
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
        else if (key === "w" && root.cursorActive) root.toggleWindow(root.cursorIndex)
        // The install row is always row 0 when it shows.
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
