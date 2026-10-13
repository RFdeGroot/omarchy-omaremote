// Pure helpers for the panel, kept free of QML so tests/model.test.js can run them under node.

var REPOSITORY = "RFdeGroot/OMARemote"

// "omaremote 0.1.3-alpha" -> "0.1.3-alpha"; "" when the output says nothing usable.
function parseVersion(output) {
  var m = String(output || "").match(/(\d+(?:\.\d+)*(?:-[0-9A-Za-z.]+)?)/)
  return m ? m[1] : ""
}

// Numeric parts first; at equal numbers a pre-release (alpha < beta < rc) sorts before the release.
function compareVersions(a, b) {
  var pa = splitVersion(a), pb = splitVersion(b)
  for (var i = 0; i < Math.max(pa.numbers.length, pb.numbers.length); i++) {
    var x = pa.numbers[i] || 0, y = pb.numbers[i] || 0
    if (x !== y) return x < y ? -1 : 1
  }
  if (pa.tag === pb.tag) return 0
  if (pa.tag === "") return 1
  if (pb.tag === "") return -1
  return pa.tag < pb.tag ? -1 : 1
}

function splitVersion(v) {
  var text = String(v || "")
  var dash = text.indexOf("-")
  var core = dash < 0 ? text : text.slice(0, dash)
  return {
    numbers: core.split(".").map(function (n) { return parseInt(n, 10) || 0 }),
    tag: dash < 0 ? "" : text.slice(dash + 1)
  }
}

function versionAtLeast(have, want) {
  return parseVersion(have) !== "" && compareVersions(parseVersion(have), want) >= 0
}

function isActive(session) {
  return !!session && (session.state === "connecting" || session.state === "connected")
}

function byName(a, b) {
  return String(a.name || a.host || "").localeCompare(String(b.name || b.host || ""))
}

// Running sessions, one per connection (the newest wins), by name.
function activeSessions(sessions) {
  var seen = {}
  var out = []
  ;(sessions || []).forEach(function (s) {
    if (!isActive(s) || seen[s.connection]) return
    seen[s.connection] = true
    out.push(s)
  })
  return out.sort(byName)
}

// Favourite connections that are not running already (those are listed as active), by name.
function favourites(connections, sessions) {
  var running = {}
  activeSessions(sessions).forEach(function (s) { running[s.connection] = true })
  return (connections || [])
    .filter(function (c) { return c && c.favourite === true && !running[c.id] })
    .sort(byName)
}

// The connections out of connections.json. Text that is empty or not JSON is most likely a file
// caught mid-rewrite, so it yields `previous` (the last good read) rather than an empty list.
function parseConnections(text, previous) {
  var fallback = Array.isArray(previous) ? previous : []
  try {
    var data = JSON.parse(String(text || ""))
    if (Array.isArray(data)) return data
    return data && Array.isArray(data.connections) ? data.connections : []
  } catch (e) {
    return fallback
  }
}

function hasFavourites(connections) {
  return (connections || []).some(function (c) { return c && c.favourite === true })
}

// The sessions out of `omaremote-session list`; `fallback` (default []) for output that is not a
// JSON array, so the service can tell a failed read from an empty list.
function parseSessions(text, fallback) {
  if (fallback === undefined) fallback = []
  try {
    var data = JSON.parse(String(text || "[]"))
    return Array.isArray(data) ? data : fallback
  } catch (e) {
    return fallback
  }
}

function protocolLabel(item) {
  return String((item && item.protocol) || "rdp").toUpperCase()
}

// The connections set to open in a window of their own, as kept in the widget's settings.
function windowConnections(value) {
  return Array.isArray(value) ? value.map(String) : []
}

function opensInWindow(list, connectionId) {
  return windowConnections(list).indexOf(String(connectionId)) !== -1
}

// `list` with the choice for one connection changed. Ids of connections that no longer exist
// (`known`: the ids of saved connections and running sessions) are dropped on the way.
function setOpensInWindow(list, connectionId, on, known) {
  var id = String(connectionId)
  var keep = (known || []).map(String)
  var out = windowConnections(list).filter(function (c) { return c !== id && keep.indexOf(c) !== -1 })
  if (on) out.push(id)
  return out
}

// `view` says where a session is shown now. An older OMARemote has no `view`; there only a
// session it does not draw itself (`tab` false) has a window of its own.
function inOwnWindow(session) {
  return typeof session.view === "string" ? session.view === "window" : session.tab === false
}

// Connection ids go on OMARemote's command line, and a program there reads one that starts with
// "-" as an option of its own. OMARemote never makes such ids, but sync could bring one in, so the
// panel does not pass it on.
function isSafeId(connectionId) {
  var id = String(connectionId === undefined || connectionId === null ? "" : connectionId)
  return id !== "" && id.charAt(0) !== "-"
}

// The command a click runs: bring the session forward, or connect. With `inWindow`, the session
// goes to a floating window of its own on the current workspace (OMARemote 0.1.6-alpha and newer).
// Through uwsm-app, as Omarchy launches apps, so a newly started OMARemote runs in its own unit
// rather than as a child of the shell.
function openCommand(connectionId, inWindow) {
  return ["uwsm-app", "--", "omaremote", "open"].concat(inWindow ? ["--window"] : [], [String(connectionId)])
}

// The command a click on a running hotkey window runs: shown and focused, it hides, as its
// shortcut would; otherwise it is shown and focused. Never moved to a normal workspace.
function toggleCommand(connectionId) {
  return ["uwsm-app", "--", "omaremote", "toggle", String(connectionId)]
}

// The glyph for a running session, as OMARemote shows it: a terminal for SSH, a monitor otherwise.
function sessionGlyph(session) {
  return String((session && session.protocol) || "").toLowerCase() === "ssh" ? "\uf120" : "\uf108"
}

// OMARemote decides which connections open as hotkey windows (a special workspace of their own,
// shown and hidden by a shortcut); the panel only reads its verdict.
function isHotkey(session) {
  return !!session && session.hotkey === true
}

function sessionMeta(session) {
  var state = session.state === "connecting" ? "connecting…" : "connected"
  var where = isHotkey(session) ? " · hotkey window" : inOwnWindow(session) ? " · own window" : ""
  return protocolLabel(session) + " · " + state + where
}

function favouriteMeta(connection) {
  return protocolLabel(connection) + " · " + String(connection.host || "")
}

// One line for the panel's hero: what is going on right now.
function summary(installed, compatible, appRunning, activeCount, readError) {
  if (!installed) return "Not installed"
  if (!compatible) return "Needs a newer OMARemote"
  if (readError) return "Sessions unknown"
  if (activeCount === 1) return "1 session running"
  if (activeCount > 1) return activeCount + " sessions running"
  return appRunning ? "No sessions running" : "Closed"
}

// OMARemote's release key (docs/plugin-interface.md in OMARemote); its public half is the keyring
// omaremote-release.gpg beside this file. A key rotation is announced there first.
var RELEASE_KEY = "D7FC432CF643656A400BDDEB3BE7753BBB50B393"

function shellQuote(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'"
}

// Downloads the newest release for this machine (alphas included), checks its signature against
// OMARemote's release key and that this system's Qt is new enough for it, and installs it with
// pacman, then starts OMARemote through uwsm-app, as the panel does. Run in a terminal, so sudo
// can ask for the password. Release files on GitHub can be replaced after publishing, so nothing
// reaches sudo unless the key in `keyring` signed it. The signature is saved under a name pacman
// does not look for: with `<package>.sig` beside it, pacman -U checks that too, against its own
// keyring, which lacks OMARemote's key, and refuses the package.
// The subshell keeps `set -e` and `exit` away from the terminal's wrapper script, which would
// otherwise close the window before a failure can be read.
function installCommand(keyring, fingerprint) {
  return "(set -e; " +
    "url=$(curl -fsSL https://api.github.com/repos/" + REPOSITORY + "/releases" +
    " | grep -o \"https://[^\\\"]*/omaremote-[0-9][^/\\\"]*-$(uname -m)\\.pkg\\.tar\\.zst\\\"\"" +
    " | head -1 | tr -d '\"'); " +
    "[ -n \"$url\" ] || { echo \"Could not find an OMARemote release for $(uname -m) on GitHub.\"; exit 1; }; " +
    "dir=$(mktemp -d); trap 'rm -rf \"$dir\"' EXIT; pkg=\"$dir/${url##*/}\"; " +
    "curl -fL -o \"$pkg\" \"$url\"; " +
    "curl -fL -o \"$dir/signature\" \"$url.sig\" || { echo \"The release has no signature, so it is not installed.\"; exit 1; }; " +
    "gpgv --status-fd 1 --keyring " + shellQuote(keyring) + " \"$dir/signature\" \"$pkg\" 2>/dev/null" +
    " | grep -q \"^\\[GNUPG:\\] VALIDSIG " + (fingerprint || RELEASE_KEY) + " \"" +
    " || { echo \"The download is not signed by OMARemote's release key, so it is not installed.\"; exit 1; }; " +
    // OMARemote's tab renderer only loads on the Qt it was built against or newer, and Arch Linux
    // ARM can be ahead of this system. Pulling in the newer Qt would be a partial upgrade, so the
    // system update comes first. Either version unreadable: no reason to refuse.
    "built=$(bsdtar -xOf \"$pkg\" .BUILDINFO 2>/dev/null" +
    " | sed -n 's/^installed = qt6-base-\\([0-9]*\\.[0-9]*\\)\\..*/\\1/p'); " +
    "have=$(pacman -Q qt6-base 2>/dev/null | awk '{ split($2, v, \".\"); print v[1] \".\" v[2] }'); " +
    "if [ -n \"$built\" ] && [ -n \"$have\" ] && [ \"$(vercmp \"$built\" \"$have\")\" -gt 0 ]; then " +
    "echo \"This OMARemote needs Qt $built; this system has Qt $have.\"; " +
    "echo \"Update the system first (omarchy update), then install OMARemote again.\"; exit 1; fi; " +
    "sudo pacman -U \"$pkg\"; " +
    "setsid -f uwsm-app -- omaremote >/dev/null 2>&1)"
}

if (typeof module !== "undefined")
  module.exports = {
    parseVersion: parseVersion, compareVersions: compareVersions, versionAtLeast: versionAtLeast,
    isActive: isActive, activeSessions: activeSessions, favourites: favourites,
    parseConnections: parseConnections, hasFavourites: hasFavourites, parseSessions: parseSessions,
    sessionGlyph: sessionGlyph, sessionMeta: sessionMeta, favouriteMeta: favouriteMeta, summary: summary,
    RELEASE_KEY: RELEASE_KEY, installCommand: installCommand, openCommand: openCommand,
    isHotkey: isHotkey, toggleCommand: toggleCommand, isSafeId: isSafeId,
    windowConnections: windowConnections, opensInWindow: opensInWindow, setOpensInWindow: setOpensInWindow
  }
