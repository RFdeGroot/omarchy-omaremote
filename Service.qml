import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import "Model.js" as Model

// What the panel shows, read from OMARemote itself: whether it is installed (and new enough),
// whether its window is open, its favourite connections, and the sessions it runs. Sessions and
// connections are watched, not polled: OMARemote touches a "changes" file on every session event,
// and the favourites are asked for again whenever its connections file changes. The panel never
// reads either file itself: OMARemote reads the connections within its own bounds.
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
  // 0.9.10 caps what its updater and update checks download, in bytes and in time, and 0.9.11 also
  // bounds the time its update checks spend on headers and redirects; 0.9.12 bounds a Gliff
  // server's video before FFmpeg allocates for it, caps RDP graphics surfaces, and limits every
  // session process to 4 GiB of data; 0.9.13 writes a pasted Gliff file only into the folder of
  // the paste it belongs to, ending a paste when the server's clipboard changes; 0.9.14 bounds
  // what a sync round, an import and the session list take in, in total as well as per file;
  // 0.9.15 reads its connections file only through bounded reads (the panel's favourites through
  // `omaremote-session read favourites`), keeps a library to 2000 connections and syncs it in
  // linear time.
  // With anything older the panel lists and connects nothing and offers the update instead.
  // `omaremote open --window` (0.1.6-alpha) is older than this, so every compatible OMARemote can
  // open a connection in a window of its own.
  property string minimumVersion: "0.9.15"

  property bool checked: false
  property bool installed: false
  property string version: ""
  readonly property bool compatible: installed && Model.versionAtLeast(version, minimumVersion)
  // An install or update started from the panel is under way, until a compatible version answers.
  property bool installing: false

  // Every starred connection, running or not (at most 100, from `omaremote-session read favourites`);
  // `favourites` leaves out the running ones.
  property var starred: []
  property bool connectionsExist: false
  property var sessions: []
  readonly property var active: Model.activeSessions(sessions)
  readonly property var favourites: favouritesFailed ? [] : Model.favourites(starred, sessions)

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

  // omaremote-session answered with an error (or nothing usable): the panel says so instead of
  // showing an empty or stale list as if it were true.
  property bool pathsFailed: false
  property bool listFailed: false
  // The favourites could not be read (the connections file refused or unreadable): the panel says
  // so where they would be.
  property bool favouritesFailed: false
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
    Quickshell.execDetached(["/usr/bin/omarchy", "launch", "floating", "terminal", "with", "presentation", Model.installCommand(keyring)])
    installPoll.restart()
    installTimeout.restart()
  }

  function readFavourites() {
    if (!root.compatible || root.connectionsPath === "")
      return
    if (favouritesProcess.running)
      favouritesProcess.again = true
    else
      favouritesProcess.running = true
  }

  Component.onCompleted: refresh()

  // The install poll covers an install started from the panel. OMARemote's window appearing is the
  // cue for one done some other way, and for the bars of a replacement bar, which each run their
  // own copy of this service.
  onAppRunningChanged: if (appRunning && !compatible) refresh()

  Process {
    id: versionProcess
    command: Model.boundedCommand(["/usr/bin/sh", "-c", "command -v omaremote >/dev/null 2>&1 && omaremote --version"],
      Model.READ_LIMITS.version)
    stdout: StdioCollector { id: versionOutput; waitForEnd: true }
    onExited: function (exitCode) {
      root.installed = exitCode === 0 && Model.withinLimit(versionOutput.text, Model.READ_LIMITS.version)
      root.version = root.installed ? Model.parseVersion(versionOutput.text) : ""
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
  // Each answer is cut off past its cap (Model.READ_LIMITS), and a cut one counts as failed.
  Process {
    id: pathsProcess
    command: Model.boundedCommand(["omaremote-session", "paths"], Model.READ_LIMITS.paths)
    stdout: StdioCollector { id: pathsOutput; waitForEnd: true }
    onExited: function (exitCode) {
      var paths = null
      try {
        if (exitCode === 0 && Model.withinLimit(pathsOutput.text, Model.READ_LIMITS.paths))
          paths = JSON.parse(pathsOutput.text)
      } catch (e) {
        paths = null
      }
      root.pathsFailed = !paths || !paths.connections || !paths.changes
      if (root.pathsFailed)
        return
      root.connectionsPath = paths.connections
      root.changesPath = paths.changes
      root.readFavourites()
      root.listSessions()
    }
  }

  Process {
    id: listProcess
    property bool again: false
    command: Model.boundedCommand(["omaremote-session", "list"], Model.READ_LIMITS.list)
    stdout: StdioCollector { id: listOutput; waitForEnd: true }
    onExited: function (exitCode) {
      var whole = exitCode === 0 && Model.withinLimit(listOutput.text, Model.READ_LIMITS.list)
      var parsed = whole ? Model.parseSessions(listOutput.text, null) : null
      root.listFailed = parsed === null
      if (parsed)
        root.sessions = parsed
      if (again) {
        again = false
        running = true
      }
    }
  }

  // The favourites: OMARemote reads its connections file, bounded, and answers with the starred
  // ones. Refused or unreadable, it exits non-zero: the panel shows no favourites and says why.
  Process {
    id: favouritesProcess
    property bool again: false
    command: Model.boundedCommand(["omaremote-session", "read", "favourites"], Model.READ_LIMITS.favourites)
    stdout: StdioCollector { id: favouritesOutput; waitForEnd: true }
    onExited: function (exitCode) {
      var whole = exitCode === 0 && Model.withinLimit(favouritesOutput.text, Model.READ_LIMITS.favourites)
      var read = whole ? Model.parseFavourites(favouritesOutput.text) : null
      root.favouritesFailed = read === null
      root.starred = read ? read.favourites : []
      root.connectionsExist = read ? read.exists : root.connectionsExist
      if (again) {
        again = false
        running = true
      }
    }
  }

  // Only watched, never read here. It fires for a file that appears later too (a fresh install).
  FileView {
    path: root.connectionsPath
    preload: false
    blockAllReads: true
    watchChanges: true
    printErrors: false
    onFileChanged: root.readFavourites()
  }

  // Only watched: what the marker holds means nothing, so it is never read.
  FileView {
    path: root.changesPath
    preload: false
    blockAllReads: true
    watchChanges: true
    printErrors: false
    onFileChanged: {
      root.listSessions()
      if (!root.connectionsExist)
        root.readFavourites()
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
