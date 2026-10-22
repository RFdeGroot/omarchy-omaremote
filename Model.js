// Pure helpers for the panel, kept free of QML so tests/model.test.js can run them under node.

var REPOSITORY = "RFdeGroot/OMARemote"

// What the panel takes in at most. Sync and import carry other systems' connections into
// connections.json, so a shared sync folder decides how many favourites there are and how long
// their names run: each row is a delegate, and 20,000 of them froze the shell for 23 s at 3 GiB.
var MAX_ACTIVE = 64      // omaremote-session list shows at most 256 sessions
var MAX_FAVOURITES = 50
var MAX_STARRED = 100    // what `omaremote-session read favourites` answers with at most
var MAX_TEXT = 200       // characters of a name, host or second line
// Bytes of OMARemote's answers read at most; more is refused, never parsed. The session list gets
// twice what its 256 records can hold; the favourites what OMARemote caps every answer at.
var READ_LIMITS = { version: 256, paths: 16384, list: 8388608, favourites: 16777216 }
var READ_SECONDS = 20    // an answer that takes longer is a failed read, so `r` can try again
var MAX_WINDOW_CONNECTIONS = 500

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

// `have` is `omaremote --version` output (or a bare version); false when it holds no version.
function versionAtLeast(have, want) {
  return parseVersion(have) !== "" && compareVersions(parseVersion(have), want) >= 0
}

function isActive(session) {
  return !!session && (session.state === "connecting" || session.state === "connected")
}

function byName(a, b) {
  return String(a.name || a.host || "").localeCompare(String(b.name || b.host || ""))
}

// Running sessions, one per connection, by name. Of two sessions for one connection the first
// listed wins, which is the newest: the contract has `omaremote-session list` sort newest first.
// No prototype on the maps below: a connection id like "constructor" must not find Object's member.
// At most `max` (MAX_ACTIVE when left out).
function activeSessions(sessions, max) {
  var seen = Object.create(null)
  var out = []
  ;(sessions || []).forEach(function (s) {
    if (!isActive(s) || seen[s.connection]) return
    seen[s.connection] = true
    out.push(s)
  })
  return out.sort(byName).slice(0, max === undefined ? MAX_ACTIVE : max)
}

// Favourite connections that are not running already (those are listed as active), by name; at
// most `max` (MAX_FAVOURITES when left out).
function favourites(connections, sessions, max) {
  var running = Object.create(null)
  activeSessions(sessions, Infinity).forEach(function (s) { running[s.connection] = true })
  return (connections || [])
    .filter(function (c) { return c && c.favourite === true && !running[c.id] })
    .sort(byName)
    .slice(0, max === undefined ? MAX_FAVOURITES : max)
}

// Only the entries that are objects: everything downstream reads fields off each one, and a stray
// `null` in a hand-edited or synced file would otherwise throw there.
function objectsOnly(list) {
  return list.filter(function (item) { return item !== null && typeof item === "object" })
}

// The answer of `omaremote-session read favourites`: { exists, favourites }, each favourite marked
// as one, or null for an answer that is not one (the service shows none then). `exists` false:
// OMARemote has no connections file yet.
function parseFavourites(text) {
  try {
    var data = JSON.parse(String(text || ""))
    if (!data || typeof data !== "object" || !Array.isArray(data.favourites)) return null
    return {
      exists: data.exists === true,
      favourites: objectsOnly(data.favourites.slice(0, MAX_STARRED)).map(function (c) {
        return { id: c.id, name: c.name, host: c.host, protocol: c.protocol, favourite: true }
      })
    }
  } catch (e) {
    return null
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
    return Array.isArray(data) ? objectsOnly(data) : fallback
  } catch (e) {
    return fallback
  }
}

// A name or host as one line of text: synced data could otherwise draw a second line under a row's
// title (a line break), or reorder a host (bidi controls). At most MAX_TEXT characters.
function displayText(value) {
  var text = String(value === undefined || value === null ? "" : value)
  var long = text.length > MAX_TEXT
  if (long) text = text.slice(0, MAX_TEXT).replace(/[\ud800-\udbff]$/, "")
  text = text.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
    .replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
  return long ? text + "…" : text
}

// A row's title: the connection's or session's name, or its host when it has none.
function rowTitle(item) {
  return displayText((item && (item.name || item.host)) || "")
}

// "RDP", "VNC", "SSH", …; OMARemote's default protocol, RDP, when the item names none.
function protocolLabel(item) {
  return displayText((item && item.protocol) || "rdp").toUpperCase()
}

// The connections set to open in a window of their own, as kept in the widget's settings.
function windowConnections(value) {
  return Array.isArray(value) ? value.map(String) : []
}

// Whether the connection is in that list.
function opensInWindow(list, connectionId) {
  return windowConnections(list).indexOf(String(connectionId)) !== -1
}

// `list` with the choice for one connection changed. The panel reads only the favourites, not
// every connection, so it cannot tell a deleted connection from one that is not starred: the
// list keeps the newest MAX_WINDOW_CONNECTIONS choices instead.
function setOpensInWindow(list, connectionId, on) {
  var id = String(connectionId)
  var out = windowConnections(list).filter(function (c) { return c !== id })
  if (on) out.push(id)
  return out.slice(-MAX_WINDOW_CONNECTIONS)
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

// A running session's second line: "VNC · connected · own window".
function sessionMeta(session) {
  var state = session.state === "connecting" ? "connecting…" : "connected"
  var where = isHotkey(session) ? " · hotkey window" : inOwnWindow(session) ? " · own window" : ""
  return protocolLabel(session) + " · " + state + where
}

// A favourite's second line: "RDP · design-ws01.acme.lan", or just "RDP" without a host.
function favouriteMeta(connection) {
  var host = displayText(connection.host || "")
  return protocolLabel(connection) + (host !== "" ? " · " + host : "")
}

// `command`, given at most `seconds` (READ_SECONDS when left out) and `maxBytes` bytes of output.
// Past either it fails: the time with timeout's status, the size with 3, and nothing is printed
// then. The output is cut after `maxBytes` + 1 bytes, so the shell never holds more; its length is
// counted in bytes (LC_ALL=C once the command has run, so the command keeps the user's locale).
// Trailing line breaks are dropped, which neither JSON nor a version minds.
function boundedCommand(command, maxBytes, seconds) {
  var script = "set -o pipefail; " +
    "out=$(/usr/bin/timeout -k 2 -- " + (seconds || READ_SECONDS) + " \"$@\" | /usr/bin/head -c " + (maxBytes + 1) + ") || exit; " +
    "LC_ALL=C; [ ${#out} -le " + maxBytes + " ] || exit 3; printf '%s' \"$out\""
  return ["/usr/bin/bash", "-c", script, "bash"].concat(command)
}

// A second check on output read through boundedCommand: a JS string never has more characters
// than the UTF-8 bytes it came from, so more than `maxBytes` characters is past the cap.
function withinLimit(text, maxBytes) {
  return String(text || "").length <= maxBytes
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

// `s` as one single-quoted shell word, whatever it holds.
function shellQuote(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'"
}

// curl's options for one download made before anything checked it: HTTPS only (redirects too),
// at most `maxBytes` (curl also stops a stream that never says its size) and at most `seconds` in
// all, so a server that keeps sending can neither fill the disk nor hold the terminal for ever.
function downloadLimits(maxBytes, seconds) {
  return "--proto '=https' --proto-redir '=https' --connect-timeout 20 --max-time " + seconds + " --max-filesize " + maxBytes
}

// Downloads the newest release for this machine (alphas included), checks its signature against
// OMARemote's release key and that this system's Qt is new enough for it, and installs it with
// pacman, then starts OMARemote through uwsm-app, as the panel does. Run in a terminal, so sudo
// can ask for the password. Release files on GitHub can be replaced after publishing, so nothing
// reaches sudo unless the key in `keyring` signed it. The signature is saved under a name pacman
// does not look for: with `<package>.sig` beside it, pacman -U checks that too, against its own
// keyring, which lacks OMARemote's key, and refuses the package.
// The download is checked once where it landed, so a bad one fails before sudo asks anything, and
// then again as a copy in a folder only root can change, which is what pacman installs: another
// program of this user could otherwise swap the file between the check and the install.
// Every tool comes from `path` (/usr/bin), never from the user's PATH: sudo gets the password, and
// the grep that reads gpgv's verdict decides what reaches it. curl -q skips ~/.curlrc.
// The subshell keeps `set -e` and `exit` away from the terminal's wrapper script, which would
// otherwise close the window before a failure can be read.
// The terminal starts through uwsm-app as a systemd unit, and systemd (262 and newer, scopes too)
// expands every `${...}` in its command line before bash sees it, emptying any it cannot read, so
// the command uses `$(...)` and plain `$name` only.
// Every download is bounded (downloadLimits): the release list to 4 MiB in a minute (436 KB in
// October 2026), the package to 64 MiB in ten minutes (0.5 MB), its signature to 64 KiB.
// `fingerprint` defaults to RELEASE_KEY and `path` to /usr/bin; the tests pass their own.
function installCommand(keyring, fingerprint, path) {
  // checked: the package and signature in folder $1 are signed by the release key, and built
  // against a Qt this system has. gpgv's verdict is read from a variable, not a pipe: with pipefail,
  // grep -q ending early would fail gpgv on a broken pipe.
  // OMARemote's tab renderer only loads on the Qt it was built against or newer, and a release can
  // be built against a newer Qt than this system has. Pulling in the newer Qt would be a partial
  // upgrade, so the system update comes first. Either version unreadable: no reason to refuse.
  var checked = "checked() { " +
    "status=$(gpgv --status-fd 1 --keyring " + shellQuote(keyring) + " \"$1/signature\" \"$1/$name\" 2>/dev/null) || true; " +
    "grep -q \"^\\[GNUPG:\\] VALIDSIG " + (fingerprint || RELEASE_KEY) + " \" <<< \"$status\"" +
    " || { echo \"The download is not signed by OMARemote's release key, so it is not installed.\"; exit 1; }; " +
    "built=$(bsdtar -xOf \"$1/$name\" .BUILDINFO 2>/dev/null" +
    " | sed -n 's/^installed = qt6-base-\\([0-9]*\\.[0-9]*\\)\\..*/\\1/p') || built=; " +
    "have=$(pacman -Q qt6-base 2>/dev/null | awk '{ split($2, v, \".\"); print v[1] \".\" v[2] }') || have=; " +
    "if [ -n \"$built\" ] && [ -n \"$have\" ] && [ \"$(vercmp \"$built\" \"$have\")\" -gt 0 ]; then " +
    "echo \"This OMARemote needs Qt $built; this system has Qt $have.\"; " +
    "echo \"Update the system first (omarchy update), then install OMARemote again.\"; exit 1; fi; }"
  return "(set -e; set -o pipefail; PATH=" + shellQuote(path || "/usr/bin") + "; export PATH; " + checked + "; " +
    "url=$(curl -q -fsSL " + downloadLimits(4194304, 60) + " https://api.github.com/repos/" + REPOSITORY + "/releases" +
    " | grep -o \"https://[^\\\"]*/omaremote-[0-9][^/\\\"]*-$(uname -m)\\.pkg\\.tar\\.zst\\\"\"" +
    " | sed -n 1p | tr -d '\"') || url=; " +
    "[ -n \"$url\" ] || { echo \"Could not find an OMARemote release for $(uname -m) on GitHub.\"; exit 1; }; " +
    "root=; dir=$(mktemp -d); trap 'rm -rf \"$dir\"; if [ -n \"$root\" ]; then sudo rm -rf \"$root\"; fi' EXIT; " +
    "name=$(basename \"$url\"); " +
    "curl -q -fL " + downloadLimits(67108864, 600) + " -o \"$dir/$name\" \"$url\"" +
    " || { echo \"The download failed or was larger than an OMARemote package can be, so it is not installed.\"; exit 1; }; " +
    "curl -q -fL " + downloadLimits(65536, 60) + " -o \"$dir/signature\" \"$url.sig\"" +
    " || { echo \"The release has no signature, so it is not installed.\"; exit 1; }; " +
    "checked \"$dir\"; " +
    "root=$(sudo mktemp -d -p /tmp omaremote-install.XXXXXXXX); sudo chmod 0755 \"$root\"; " +
    "sudo install -m 0644 \"$dir/$name\" \"$dir/signature\" \"$root/\"; " +
    "checked \"$root\"; " +
    "sudo pacman -U \"$root/$name\"; " +
    "setsid -f uwsm-app -- omaremote >/dev/null 2>&1)"
}

if (typeof module !== "undefined")
  module.exports = {
    parseVersion: parseVersion, compareVersions: compareVersions, versionAtLeast: versionAtLeast,
    isActive: isActive, activeSessions: activeSessions, favourites: favourites,
    parseFavourites: parseFavourites, hasFavourites: hasFavourites, parseSessions: parseSessions,
    displayText: displayText, rowTitle: rowTitle, boundedCommand: boundedCommand, withinLimit: withinLimit,
    MAX_ACTIVE: MAX_ACTIVE, MAX_FAVOURITES: MAX_FAVOURITES, MAX_TEXT: MAX_TEXT, READ_LIMITS: READ_LIMITS,
    MAX_WINDOW_CONNECTIONS: MAX_WINDOW_CONNECTIONS, MAX_STARRED: MAX_STARRED,
    sessionGlyph: sessionGlyph, sessionMeta: sessionMeta, favouriteMeta: favouriteMeta, summary: summary,
    RELEASE_KEY: RELEASE_KEY, installCommand: installCommand, openCommand: openCommand,
    isHotkey: isHotkey, toggleCommand: toggleCommand, isSafeId: isSafeId,
    windowConnections: windowConnections, opensInWindow: opensInWindow, setOpensInWindow: setOpensInWindow
  }
