const test = require("node:test")
const assert = require("node:assert")
const Model = require("../Model.js")

test("versions: numbers, then alpha < beta < release", () => {
  assert.strictEqual(Model.parseVersion("omaremote 0.1.3-alpha"), "0.1.3-alpha")
  assert.strictEqual(Model.parseVersion("command not found"), "")
  assert.ok(Model.versionAtLeast("omaremote 0.1.3-alpha", "0.1.3-alpha"))
  assert.ok(Model.versionAtLeast("omaremote 0.1.10-alpha", "0.1.3-alpha"))
  assert.ok(Model.versionAtLeast("omaremote 0.1.3", "0.1.3-alpha"))
  assert.ok(Model.versionAtLeast("omaremote 0.1.3-beta", "0.1.3-alpha"))
  assert.ok(!Model.versionAtLeast("omaremote 0.1.2-alpha", "0.1.3-alpha"))
  assert.ok(!Model.versionAtLeast("", "0.1.3-alpha"))
})

const sessions = [
  { id: "1", connection: "pi", name: "Raspberry Pi", protocol: "vnc", state: "connected", tab: true },
  { id: "0", connection: "pi", name: "Raspberry Pi", protocol: "vnc", state: "connecting", tab: true },
  { id: "2", connection: "dc", name: "Directory Server", state: "connecting", tab: false },
  { id: "3", connection: "files", name: "File Server", state: "failed" },
]
const connections = [
  { id: "pi", name: "Raspberry Pi", favourite: true },
  { id: "files", name: "File Server", favourite: true, host: "files.acme.lan" },
  { id: "build", name: "Build Server", favourite: false },
  { id: "design", name: "Design Workstation", favourite: true, protocol: "rdp", host: "design-ws01.acme.lan" },
]

test("active: running sessions only, one per connection, by name", () => {
  assert.deepStrictEqual(Model.activeSessions(sessions).map(s => s.id), ["2", "1"])
})

test("favourites: not the ones already running, by name", () => {
  assert.deepStrictEqual(Model.favourites(connections, sessions).map(c => c.id), ["design", "files"])
})

test("parsing tolerates missing or broken files", () => {
  assert.deepStrictEqual(Model.parseConnections(""), [])
  assert.deepStrictEqual(Model.parseConnections("not json"), [])
  assert.strictEqual(Model.parseConnections(JSON.stringify({ connections })).length, 4)
  assert.deepStrictEqual(Model.parseSessions("{}"), [])
})

test("row and hero text", () => {
  assert.strictEqual(Model.sessionMeta(sessions[0]), "VNC · connected")
  assert.strictEqual(Model.sessionMeta(sessions[2]), "RDP · connecting… · own window")
  assert.strictEqual(Model.favouriteMeta(connections[1]), "RDP · files.acme.lan")
  assert.strictEqual(Model.summary(false, false, false, 0), "Not installed")
  assert.strictEqual(Model.summary(true, false, false, 0), "Needs a newer OMARemote")
  assert.strictEqual(Model.summary(true, true, true, 2), "2 sessions running")
  assert.strictEqual(Model.summary(true, true, false, 0), "Closed")
})

test("install command fetches the newest release for this machine", () => {
  const cmd = Model.installCommand()
  assert.match(cmd, /api\.github\.com\/repos\/RFdeGroot\/OMARemote\/releases/)
  assert.match(cmd, /\$\(uname -m\)/)
  assert.match(cmd, /sudo pacman -U/)
})
