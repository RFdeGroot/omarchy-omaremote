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

  // 0.4.2 keeps connection names, hosts and errors off command lines, which other accounts can
  // read, its notifications included (Omarchy's notification service hands their text to a shell);
  // 0.5.1's sessions say which are hotkey windows; 0.5.2 takes in no synced id that its command line
  // would read as an option; 0.7.0's text fields never read the clipboard by themselves, and a paste
  // is bounded; 0.8.0 writes no synced name into ssh's config with its line breaks (they could add
  // ssh options, a ProxyCommand among them); 0.8.2 asks before a synced change shares a drive or
  // the microphone, or moves a connection with a chosen ssh key to another host, and writes no ssh
  // host pattern; 0.9.1 also asks when a synced move into another group would share or point
  // elsewhere through that group's settings; 0.9.2 asks the same before a synced restore from the
  // trash, and gives a new synced connection no group credential set; 0.9.3 also asks before a
  // synced group deletion drops a gateway, KDC or security level, counts the clipboard as sharing,
  // and skips malformed sync files; 0.9.4's session tabs read the clipboard only through a bounded
  // wl-paste, and not at all when the connection does not share it; 0.9.5 caps the cursors a
  // server sends (512x512, 64 kept), so a session cannot fill OMARemote's memory with them; 0.9.6
  // serves a pasted clipboard file only while it is still the file that was offered; 0.9.7 keeps a
  // shared sync folder from planting files and never overwrites a connections file it cannot read;
  // 0.9.10 caps what its updater and update checks download, in bytes and in time.
  // With anything older the panel lists and connects nothing and offers the update instead.
  // `omaremote open --window` (0.1.6-alpha) is older than this, so every compatible OMARemote can
  // open a connection in a window of its own.
  property string minimumVersion: "0.9.10"

  property bool checked: false
  property bool installed: false
  property string version: ""
  readonly property bool compatible: installed && Model.versionAtLeast(version, minimumVersion)
  // An install or update started from the panel is under way, until a compatible version answers.
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

  // Shows the connection's running session, or connects it: in a tab, or with `inWindow` in a
  // floating window of its own. Starts OMARemote if needed.
  function open(connectionId, inWindow) {
    if (root.compatible && Model.isSafeId(connectionId))
      Quickshell.execDetached(Model.openCommand(connectionId, inWindow === true))
  }

  // A running hotkey window: shown, or hidden when it is shown and focused.
  function toggle(connectionId) {
    if (root.compatible && Model.isSafeId(connectionId))
      Quickshell.execDetached(Model.toggleCommand(connectionId))
  }

  // The connection manager itself (a second launch focuses the open window).
  function openApp() {
    if (root.installed)
      Quickshell.execDetached(["uwsm-app", "--", "omaremote"])
  }

  // Installs (or updates to) the newest release in a floating Omarchy terminal, where sudo can
  // ask for the password; the version check is repeated until the new one answers.
  function install() {
    root.installing = true
    var keyring = decodeURIComponent(Qt.resolvedUrl("omaremote-release.gpg").toString().replace(/^file:\/\//, ""))
    Quickshell.execDetached(["omarchy", "launch", "floating", "terminal", "with", "presentation", Model.installCommand(keyring)])
    installPoll.restart()
    installTimeout.restart()
  }

  // A file watch only attaches to a file that exists, so a connections file that appears later
  // (a fresh install) is read again whenever there is a reason to look.
  function reloadConnections() {
    if (root.connectionsPath !== "" && !root.connectionsLoaded)
      connectionsFile.reload()
  }

  Component.onCompleted: refresh()

  // The install poll covers an install started from the panel. OMARemote's window appearing is the
  // cue for one done some other way, and for the bars of a replacement bar, which each run their
  // own copy of this service.
  onAppRunningChanged: if (appRunning && !compatible) refresh()

  Process {
    id: versionProcess
    command: ["sh", "-c", "command -v omaremote >/dev/null 2>&1 && omaremote --version"]
    stdout: StdioCollector { id: versionOutput; waitForEnd: true }
    onExited: function (exitCode) {
      root.installed = exitCode === 0
      root.version = exitCode === 0 ? Model.parseVersion(versionOutput.text) : ""
      root.checked = true
      if (root.installing && Model.versionAtLeast(root.version, root.minimumVersion)) {
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
