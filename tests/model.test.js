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
  assert.strictEqual(Model.parseConnections(JSON.stringify(connections)).length, 4)
  assert.deepStrictEqual(Model.parseConnections("{}"), [])
  assert.deepStrictEqual(Model.parseSessions("{}"), [])
})

test("a failed session read is told apart from no sessions", () => {
  assert.strictEqual(Model.parseSessions("not json", null), null)
  assert.strictEqual(Model.parseSessions("{}", null), null)
  assert.deepStrictEqual(Model.parseSessions("[]", null), [])
  assert.strictEqual(Model.summary(true, true, true, 0, true), "Sessions unknown")
  assert.strictEqual(Model.summary(false, false, false, 0, true), "Not installed")
})

test("a connections file caught mid-rewrite keeps the last good read", () => {
  assert.strictEqual(Model.parseConnections("", connections), connections)
  assert.strictEqual(Model.parseConnections('{"connections": [{"id": "pi"', connections), connections)
  assert.deepStrictEqual(Model.parseConnections('{"connections": []}', connections), [])
})

test("favourites exist even when all of them are running", () => {
  assert.ok(Model.hasFavourites(connections))
  assert.ok(!Model.hasFavourites([{ id: "build", favourite: false }]))
  assert.ok(!Model.hasFavourites([]))
  const allRunning = [{ id: "pi", state: "connected", connection: "pi" }]
  assert.deepStrictEqual(Model.favourites([connections[0]], allRunning), [])
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

// Runs the command the way omarchy-launch-floating-terminal-with-presentation does (inside a
// larger bash -c script), with curl, sudo and setsid replaced by stubs that log what they get.
function runInstall(releasesJson) {
  const fs = require("node:fs"), os = require("node:os"), path = require("node:path")
  const { spawnSync } = require("node:child_process")
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "omaremote-install-test-"))
  try {
    const bin = path.join(work, "bin")
    fs.mkdirSync(bin)
    fs.writeFileSync(path.join(work, "releases.json"), releasesJson)
    const stub = (name, body) => fs.writeFileSync(path.join(bin, name), "#!/bin/bash\n" + body + "\n", { mode: 0o755 })
    stub("curl", 'echo "curl $*" >> "$LOG"\n' +
      'out=; prev=; for a in "$@"; do [[ $prev == -o ]] && out=$a; prev=$a; done\n' +
      'if [[ -n $out ]]; then echo pkg > "$out"; else cat "$WORK/releases.json"; fi')
    stub("uname", "echo x86_64")
    stub("sudo", 'echo "sudo $*" >> "$LOG"; [[ -f ${@: -1} ]] && echo "package present" >> "$LOG"')
    stub("setsid", 'echo "setsid $*" >> "$LOG"')
    const log = path.join(work, "log")
    const script = "echo before; " + Model.installCommand() + "; echo \"after $?\""
    const r = spawnSync("bash", ["-c", script], {
      encoding: "utf8",
      env: { PATH: bin + ":" + process.env.PATH, LOG: log, WORK: work, TMPDIR: work }
    })
    const left = fs.readdirSync(work).filter(n => n.startsWith("tmp."))
    return { stdout: r.stdout, log: fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "", left }
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}

test("install command: downloads this machine's package, installs it, cleans up", () => {
  const base = "https://github.com/RFdeGroot/OMARemote/releases/download/v0.2.0"
  const r = runInstall(JSON.stringify([{ assets: [
    { browser_download_url: base + "/omaremote-debug-0.2.0-1-x86_64.pkg.tar.zst" },
    { browser_download_url: base + "/omaremote-0.2.0-1-aarch64.pkg.tar.zst" },
    { browser_download_url: base + "/omaremote-0.2.0-1-x86_64.pkg.tar.zst.sig" },
    { browser_download_url: base + "/omaremote-0.2.0-1-x86_64.pkg.tar.zst" }
  ] }]))
  assert.match(r.log, /curl -fL -o \S+\/omaremote-0\.2\.0-1-x86_64\.pkg\.tar\.zst https:\/\/\S+\/omaremote-0\.2\.0-1-x86_64\.pkg\.tar\.zst\n/)
  assert.match(r.log, /sudo pacman -U \S+\/omaremote-0\.2\.0-1-x86_64\.pkg\.tar\.zst\npackage present/)
  assert.match(r.log, /setsid -f uwsm-app -- omaremote/)
  assert.match(r.stdout, /after 0/)
  assert.deepStrictEqual(r.left, [])
})

test("install command: a failure ends the install, not the terminal's script", () => {
  const r = runInstall("[]")
  assert.match(r.stdout, /^before\nCould not find an OMARemote release for x86_64 on GitHub\.\nafter 1\n$/)
  assert.doesNotMatch(r.log, /sudo/)
})
