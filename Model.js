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

// The connections out of connections.json, or [] when it is missing or not JSON.
function parseConnections(text) {
  try {
    var data = JSON.parse(String(text || "{}"))
    if (Array.isArray(data)) return data
    return Array.isArray(data.connections) ? data.connections : []
  } catch (e) {
    return []
  }
}

function parseSessions(text) {
  try {
    var data = JSON.parse(String(text || "[]"))
    return Array.isArray(data) ? data : []
  } catch (e) {
    return []
  }
}

function protocolLabel(item) {
  return String((item && item.protocol) || "rdp").toUpperCase()
}

function sessionMeta(session) {
  var state = session.state === "connecting" ? "connecting…" : "connected"
  return protocolLabel(session) + " · " + state + (session.tab === false ? " · own window" : "")
}

function favouriteMeta(connection) {
  return protocolLabel(connection) + " · " + String(connection.host || "")
}

// One line for the panel's hero: what is going on right now.
function summary(installed, compatible, appRunning, activeCount) {
  if (!installed) return "Not installed"
  if (!compatible) return "Needs a newer OMARemote"
  if (activeCount === 1) return "1 session running"
  if (activeCount > 1) return activeCount + " sessions running"
  return appRunning ? "No sessions running" : "Closed"
}

// Downloads the newest release for this machine (alphas included) and installs it with pacman,
// then starts OMARemote. Run in a terminal, so sudo can ask for the password.
function installCommand() {
  return "set -e; " +
    "url=$(curl -fsSL https://api.github.com/repos/" + REPOSITORY + "/releases" +
    " | grep -o \"https://[^\\\"]*-$(uname -m)\\.pkg\\.tar\\.zst\" | head -1); " +
    "[ -n \"$url\" ] || { echo \"No OMARemote release found for $(uname -m).\"; exit 1; }; " +
    "cd \"$(mktemp -d)\"; " +
    "curl -fLO \"$url\"; " +
    "sudo pacman -U \"./${url##*/}\"; " +
    "setsid -f omaremote >/dev/null 2>&1"
}

if (typeof module !== "undefined")
  module.exports = {
    parseVersion: parseVersion, compareVersions: compareVersions, versionAtLeast: versionAtLeast,
    isActive: isActive, activeSessions: activeSessions, favourites: favourites,
    parseConnections: parseConnections, parseSessions: parseSessions,
    sessionMeta: sessionMeta, favouriteMeta: favouriteMeta, summary: summary,
    installCommand: installCommand
  }
