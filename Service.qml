import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import "Model.js" as Model

// What the panel shows, read from OMARemote itself: whether it is installed (and new enough),
// whether its window is open, its favourite connections, and the sessions it runs. Sessions and
// connections are watched, not polled: OMARemote touches a "changes" file on every session event.
Item {
  id: root

  property string minimumVersion: "0.1.3-alpha"

  property bool checked: false
  property bool installed: false
  property string version: ""
  readonly property bool compatible: installed && Model.versionAtLeast(version, minimumVersion)
  property bool installing: false

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
  function open(connectionId) {
    if (root.compatible)
      Quickshell.execDetached(["omaremote", "open", connectionId])
  }

  // The connection manager itself (a second launch focuses the open window).
  function openApp() {
    if (root.installed)
      Quickshell.execDetached(["omaremote"])
  }

  // Installs (or updates to) the newest release in a floating Omarchy terminal, where sudo can
  // ask for the password; the version check is repeated until the new one answers.
  function install() {
    root.installing = true
    Quickshell.execDetached(["omarchy", "launch", "floating", "terminal", "with", "presentation", Model.installCommand()])
    installPoll.restart()
    installTimeout.restart()
  }

  Component.onCompleted: refresh()

  Process {
    id: versionProcess
    command: ["sh", "-c", "command -v omaremote >/dev/null 2>&1 && omaremote --version"]
    stdout: StdioCollector { id: versionOutput; waitForEnd: true }
    onExited: function (exitCode) {
      root.installed = exitCode === 0
      root.version = exitCode === 0 ? Model.parseVersion(versionOutput.text) : ""
      root.checked = true
      if (root.compatible) {
        root.installing = false
        installPoll.stop()
        installTimeout.stop()
        if (!pathsProcess.running)
          pathsProcess.running = true
      }
    }
  }

  // Where OMARemote keeps its connections and its session-change marker, as it reports them.
  Process {
    id: pathsProcess
    command: ["omaremote-session", "paths"]
    stdout: StdioCollector { id: pathsOutput; waitForEnd: true }
    onExited: function (exitCode) {
      if (exitCode !== 0)
        return
      try {
        var paths = JSON.parse(pathsOutput.text)
        root.connectionsPath = paths.connections || ""
        root.changesPath = paths.changes || ""
      } catch (e) {
        return
      }
      root.listSessions()
    }
  }

  Process {
    id: listProcess
    property bool again: false
    command: ["omaremote-session", "list"]
    stdout: StdioCollector { id: listOutput; waitForEnd: true }
    onExited: function (exitCode) {
      if (exitCode === 0)
        root.sessions = Model.parseSessions(listOutput.text)
      if (again) {
        again = false
        running = true
      }
    }
  }

  FileView {
    path: root.connectionsPath
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: root.connections = Model.parseConnections(text())
    onLoadFailed: root.connections = []
  }

  FileView {
    path: root.changesPath
    watchChanges: true
    printErrors: false
    onFileChanged: {
      reload()
      root.listSessions()
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
