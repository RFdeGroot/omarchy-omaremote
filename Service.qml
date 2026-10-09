import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import "Model.js" as Model

// What the panel shows, read from OMARemote itself: whether it is installed (and new enough),
// whether its window is open, its favourite connections, and the sessions it runs. Sessions and
// connections are watched, not polled: OMARemote touches a "changes" file on every session event.
// Omarchy loads one copy as the plugin's service, shared by the bars on every monitor; a bar
// without access to it (a replacement bar) makes its own (see Panel.qml).
Item {
  id: root

  property string minimumVersion: "0.1.3-alpha"
  // `omaremote open --window`, for the "Open in own window" toggle.
  property string windowVersion: "0.1.6-alpha"

  property bool checked: false
  property bool installed: false
  property string version: ""
  readonly property bool compatible: installed && Model.versionAtLeast(version, minimumVersion)
  readonly property bool canOpenInWindow: compatible && Model.versionAtLeast(version, windowVersion)
  property bool installing: false
  // The version an install started from the panel waits for: the minimum, or the one the toggle
  // needs when OMARemote works but is too old for it.
  property string installWants: minimumVersion

  property var connections: []
  property var sessions: []
  readonly property var active: Model.activeSessions(sessions)
  readonly property var favourites: Model.favourites(connections, sessions)

  // The OMARemote window, found by its app id among the open windows.
  readonly property bool appRunning: {
    var list = ToplevelManager.toplevels.values
    for (var i = 0; i < list.length; i++)
      if (list[i] && list[i].appId === "omaremote")
        return true
    return false
  }

  property string changesPath: ""
  property string connectionsPath: ""
  property bool connectionsLoaded: false

  // omaremote-session answered with an error (or nothing usable): the panel says so instead of
  // showing an empty or stale list as if it were true.
  property bool pathsFailed: false
  property bool listFailed: false
  readonly property bool readError: compatible && (pathsFailed || listFailed)

  function refresh() {
    if (!versionProcess.running)
      versionProcess.running = true
  }

  function listSessions() {
    if (!root.compatible)
      return
    if (listProcess.running)
      listProcess.again = true
    else
      listProcess.running = true
  }

  // Shows the connection's running session, or connects it in a tab; starts OMARemote if needed.
  // `inWindow` only reaches an OMARemote that understands --window.
  function open(connectionId, inWindow) {
    if (root.compatible)
      Quickshell.execDetached(Model.openCommand(connectionId, inWindow === true && root.canOpenInWindow))
  }

  // The connection manager itself (a second launch focuses the open window).
  function openApp() {
    if (root.installed)
      Quickshell.execDetached(["uwsm-app", "--", "omaremote"])
  }

  // Installs (or updates to) the newest release in a floating Omarchy terminal, where sudo can
  // ask for the password; the version check is repeated until the new one answers.
  function install() {
    root.installWants = root.compatible ? root.windowVersion : root.minimumVersion
    root.installing = true
    Quickshell.execDetached(["omarchy", "launch", "floating", "terminal", "with", "presentation", Model.installCommand()])
    installPoll.restart()
    installTimeout.restart()
  }

  Component.onCompleted: refresh()

  // The install poll covers an install started from the panel. OMARemote's window appearing is the
  // cue for one done some other way, and for the bars of a replacement bar, which each run their
  // own copy of this service.
  onAppRunningChanged: if (appRunning && !canOpenInWindow) refresh()

  // A file watch only attaches to a file that exists, so a connections file that appears later
  // (a fresh install) is read again whenever there is a reason to look.
  function reloadConnections() {
    if (root.connectionsPath !== "" && !root.connectionsLoaded)
      connectionsFile.reload()
  }

  Process {
    id: versionProcess
    command: ["sh", "-c", "command -v omaremote >/dev/null 2>&1 && omaremote --version"]
    stdout: StdioCollector { id: versionOutput; waitForEnd: true }
    onExited: function (exitCode) {
      root.installed = exitCode === 0
      root.version = exitCode === 0 ? Model.parseVersion(versionOutput.text) : ""
      root.checked = true
      if (root.installing && Model.versionAtLeast(root.version, root.installWants)) {
        root.installing = false
        installPoll.stop()
        installTimeout.stop()
      }
      // Not while an update runs: pacman may be halfway through replacing omaremote-session.
      if (root.compatible && !root.installing && !pathsProcess.running)
        pathsProcess.running = true
    }
  }

  // Where OMARemote keeps its connections and its session-change marker, as it reports them.
  Process {
    id: pathsProcess
    command: ["omaremote-session", "paths"]
    stdout: StdioCollector { id: pathsOutput; waitForEnd: true }
    onExited: function (exitCode) {
      var paths = null
      try {
        if (exitCode === 0) paths = JSON.parse(pathsOutput.text)
      } catch (e) {
        paths = null
      }
      root.pathsFailed = !paths || !paths.connections || !paths.changes
      if (root.pathsFailed)
        return
      root.connectionsPath = paths.connections
      root.changesPath = paths.changes
      root.reloadConnections()
      root.listSessions()
    }
  }

  Process {
    id: listProcess
    property bool again: false
    command: ["omaremote-session", "list"]
    stdout: StdioCollector { id: listOutput; waitForEnd: true }
    onExited: function (exitCode) {
      var parsed = exitCode === 0 ? Model.parseSessions(listOutput.text, null) : null
      root.listFailed = parsed === null
      if (parsed)
        root.sessions = parsed
      if (again) {
        again = false
        running = true
      }
    }
  }

  FileView {
    id: connectionsFile
    path: root.connectionsPath
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: {
      root.connectionsLoaded = true
      root.connections = Model.parseConnections(text(), root.connections)
    }
    onLoadFailed: {
      root.connectionsLoaded = false
      root.connections = []
    }
  }

  FileView {
    path: root.changesPath
    watchChanges: true
    printErrors: false
    onFileChanged: {
      reload()
      root.listSessions()
      root.reloadConnections()
    }
  }

  Timer {
    id: installPoll
    interval: 2000
    repeat: true
    onTriggered: root.refresh()
  }

  // Give up waiting after ten minutes; the terminal says what happened.
  Timer {
    id: installTimeout
    interval: 600000
    onTriggered: {
      installPoll.stop()
      root.installing = false
    }
  }
}
