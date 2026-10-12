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
  // OMARemote draws own-window sessions itself now: `tab` stays true, `view` says where it is.
  const base = { protocol: "vnc", state: "connected" }
  assert.strictEqual(Model.sessionMeta({ ...base, tab: true, view: "window", viewer: 4242 }), "VNC · connected · own window")
  assert.strictEqual(Model.sessionMeta({ ...base, tab: true, view: "tab", viewer: null }), "VNC · connected")
  assert.strictEqual(Model.sessionMeta({ ...base, tab: false, view: "window", viewer: null }), "VNC · connected · own window")
  assert.strictEqual(Model.sessionMeta({ protocol: "ssh", state: "connected", tab: true, view: "tab" }), "SSH · connected")
  // SSH gets a terminal, as in OMARemote; anything else (or nothing) the monitor.
  assert.strictEqual(Model.sessionGlyph({ protocol: "ssh" }), "")
  assert.strictEqual(Model.sessionGlyph({ protocol: "vnc" }), "")
  assert.strictEqual(Model.sessionGlyph({}), "")
  assert.strictEqual(Model.favouriteMeta(connections[1]), "RDP · files.acme.lan")
  assert.strictEqual(Model.summary(false, false, false, 0), "Not installed")
  assert.strictEqual(Model.summary(true, false, false, 0), "Needs a newer OMARemote")
  assert.strictEqual(Model.summary(true, true, true, 2), "2 sessions running")
  assert.strictEqual(Model.summary(true, true, false, 0), "Closed")
})

test("a click opens in a tab, or with --window in a window of its own", () => {
  assert.deepStrictEqual(Model.openCommand("pi", false), ["uwsm-app", "--", "omaremote", "open", "pi"])
  assert.deepStrictEqual(Model.openCommand("pi", true), ["uwsm-app", "--", "omaremote", "open", "--window", "pi"])
})

test("open in own window is chosen per connection", () => {
  assert.deepStrictEqual(Model.windowConnections(undefined), [])
  assert.ok(Model.opensInWindow(["pi"], "pi"))
  assert.ok(!Model.opensInWindow(["pi"], "dc"))
  const known = ["pi", "dc"]
  assert.deepStrictEqual(Model.setOpensInWindow([], "dc", true, known), ["dc"])
  assert.deepStrictEqual(Model.setOpensInWindow(["pi", "dc"], "pi", false, known), ["dc"])
  // A connection deleted since is dropped when the list is next written.
  assert.deepStrictEqual(Model.setOpensInWindow(["gone", "pi"], "dc", true, known), ["pi", "dc"])
})

test("install command fetches the newest release for this machine", () => {
  const cmd = Model.installCommand("/plugin/omaremote-release.gpg")
  assert.match(cmd, /api\.github\.com\/repos\/RFdeGroot\/OMARemote\/releases/)
  assert.match(cmd, /\$\(uname -m\)/)
  assert.match(cmd, /sudo pacman -U/)
  assert.match(cmd, /--keyring '\/plugin\/omaremote-release\.gpg'/)
  assert.ok(cmd.includes("VALIDSIG " + Model.RELEASE_KEY + " "))
  assert.match(Model.installCommand("/it's here/k.gpg"), /--keyring '\/it'\\''s here\/k\.gpg'/)
})

const fs = require("node:fs"), os = require("node:os"), path = require("node:path")
const { spawnSync } = require("node:child_process")

test("the bundled keyring holds OMARemote's release key", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "omaremote-key-test-"))
  try {
    const r = spawnSync("gpg", ["--homedir", home, "--batch", "--with-colons", "--show-keys",
      path.join(__dirname, "..", "omaremote-release.gpg")], { encoding: "utf8" })
    const fingerprints = r.stdout.split("\n").filter(l => l.startsWith("fpr:")).map(l => l.split(":")[9])
    assert.deepStrictEqual(fingerprints, [Model.RELEASE_KEY])
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

// A throwaway signing key, standing in for OMARemote's: the real gpgv checks the test downloads.
const signer = (() => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "omaremote-signer-test-"))
  const gpg = args => spawnSync("gpg", ["--homedir", home, "--batch", "--quiet", ...args], { encoding: "utf8" })
  gpg(["--passphrase", "", "--quick-gen-key", "Test releases <test@acme.lan>", "ed25519", "sign", "never"])
  const fingerprint = gpg(["--with-colons", "--list-keys"]).stdout.split("\n").find(l => l.startsWith("fpr:")).split(":")[9]
  const keyring = path.join(home, "release.gpg")
  gpg(["--output", keyring, "--export", fingerprint])
  const sign = (file) => gpg(["--yes", "--detach-sign", "--output", file + ".sig", file])
  return { home, fingerprint, keyring, sign }
})()
test.after(() => {
  spawnSync("gpgconf", ["--homedir", signer.home, "--kill", "all"])
  fs.rmSync(signer.home, { recursive: true, force: true })
})

// Runs the command the way omarchy-launch-floating-terminal-with-presentation does (inside a
// larger bash -c script), with curl, sudo and setsid replaced by stubs that log what they get.
// The curl stub serves the release list and the files in `files` (name -> contents, or
// { signed: contents } for a package with a valid signature beside it, { qt: "6.12.0-1" } for a
// signed package built against that Qt). The pacman stub reports this system's Qt as `systemQt`.
function runInstall(releasesJson, files = {}, fingerprint = signer.fingerprint, systemQt = "6.11.1-1") {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "omaremote-install-test-"))
  try {
    const bin = path.join(work, "bin"), served = path.join(work, "served")
    fs.mkdirSync(bin)
    fs.mkdirSync(served)
    fs.writeFileSync(path.join(work, "releases.json"), releasesJson)
    for (const [name, contents] of Object.entries(files)) {
      const file = path.join(served, name)
      if (typeof contents === "object" && contents.qt) {
        const info = fs.mkdtempSync(path.join(work, "buildinfo-"))
        fs.writeFileSync(path.join(info, ".BUILDINFO"),
          "format = 2\npkgname = omaremote\ninstalled = qt6-base-" + contents.qt + "-x86_64\n")
        spawnSync("bsdtar", ["--zstd", "-cf", file, "-C", info, ".BUILDINFO"])
        fs.rmSync(info, { recursive: true })
        signer.sign(file)
      } else if (typeof contents === "object") {
        fs.writeFileSync(file, contents.signed)
        signer.sign(file)
        if (contents.then !== undefined) fs.writeFileSync(file, contents.then)
      } else {
        fs.writeFileSync(file, contents)
      }
    }
    const stub = (name, body) => fs.writeFileSync(path.join(bin, name), "#!/bin/bash\n" + body + "\n", { mode: 0o755 })
    stub("curl", 'echo "curl $*" >> "$LOG"\n' +
      'out=; prev=; for a in "$@"; do [[ $prev == -o ]] && out=$a; prev=$a; done\n' +
      'if [[ -z $out ]]; then cat "$WORK/releases.json"; exit; fi\n' +
      'url=${@: -1}; src="$WORK/served/${url##*/}"; [[ -f $src ]] || exit 22; cp "$src" "$out"')
    stub("uname", "echo x86_64")
    stub("sudo", 'echo "sudo $*" >> "$LOG"; [[ -f ${@: -1} ]] && echo "package present" >> "$LOG"\n' +
      '[[ -e ${@: -1}.sig ]] && echo "signature beside the package" >> "$LOG"; true')
    stub("setsid", 'echo "setsid $*" >> "$LOG"')
    stub("pacman", '[[ $* == "-Q qt6-base" && -n $QT ]] && echo "qt6-base $QT"')
    const log = path.join(work, "log")
    const script = "echo before; " + Model.installCommand(signer.keyring, fingerprint) + "; echo \"after $?\""
    const r = spawnSync("bash", ["-c", script], {
      encoding: "utf8",
      env: { PATH: bin + ":" + process.env.PATH, LOG: log, WORK: work, TMPDIR: work, HOME: work, QT: systemQt }
    })
    const left = fs.readdirSync(work).filter(n => n.startsWith("tmp."))
    return { stdout: r.stdout, log: fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "", left }
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}

const base = "https://github.com/RFdeGroot/OMARemote/releases/download/v0.4.0"
const release = JSON.stringify([{ assets: [
  { browser_download_url: base + "/omaremote-debug-0.4.0-1-x86_64.pkg.tar.zst" },
  { browser_download_url: base + "/omaremote-0.4.0-1-aarch64.pkg.tar.zst" },
  { browser_download_url: base + "/omaremote-0.4.0-1-x86_64.pkg.tar.zst.sig" },
  { browser_download_url: base + "/omaremote-0.4.0-1-x86_64.pkg.tar.zst" }
] }])
const pkg = "omaremote-0.4.0-1-x86_64.pkg.tar.zst"

test("install command: downloads this machine's package, checks it, installs it, cleans up", () => {
  const r = runInstall(release, { [pkg]: { signed: "pkg" } })
  assert.match(r.log, /curl -fL -o \S+\/omaremote-0\.4\.0-1-x86_64\.pkg\.tar\.zst https:\/\/\S+\/omaremote-0\.4\.0-1-x86_64\.pkg\.tar\.zst\n/)
  assert.match(r.log, /curl -fL -o \S+\/signature https:\/\/\S+\/omaremote-0\.4\.0-1-x86_64\.pkg\.tar\.zst\.sig\n/)
  assert.match(r.log, /sudo pacman -U \S+\/omaremote-0\.4\.0-1-x86_64\.pkg\.tar\.zst\npackage present\n/)
  // pacman -U would check a <package>.sig against its own keyring, which lacks OMARemote's key.
  assert.doesNotMatch(r.log, /signature beside the package/)
  assert.match(r.log, /setsid -f uwsm-app -- omaremote/)
  assert.match(r.stdout, /after 0/)
  assert.deepStrictEqual(r.left, [])
})

test("install command: a package changed after signing is not installed", () => {
  const r = runInstall(release, { [pkg]: { signed: "pkg", then: "replaced pkg" } })
  assert.match(r.stdout, /^before\nThe download is not signed by OMARemote's release key, so it is not installed\.\nafter 1\n$/)
  assert.doesNotMatch(r.log, /sudo/)
  assert.deepStrictEqual(r.left, [])
})

test("install command: a package signed by another key is not installed", () => {
  const r = runInstall(release, { [pkg]: { signed: "pkg" } }, Model.RELEASE_KEY)
  assert.match(r.stdout, /The download is not signed by OMARemote's release key, so it is not installed\.\nafter 1\n$/)
  assert.doesNotMatch(r.log, /sudo/)
})

test("install command: a package without a signature is not installed", () => {
  const r = runInstall(release, { [pkg]: "pkg" })
  assert.match(r.stdout, /The release has no signature, so it is not installed\.\nafter 1\n$/)
  assert.doesNotMatch(r.log, /sudo/)
})

test("install command: a package built against a newer Qt waits for the system update", () => {
  const r = runInstall(release, { [pkg]: { qt: "6.12.0-1" } })
  assert.match(r.stdout, /This OMARemote needs Qt 6\.12; this system has Qt 6\.11\.\nUpdate the system first \(omarchy update\), then install OMARemote again\.\nafter 1\n$/)
  assert.doesNotMatch(r.log, /sudo/)
  assert.deepStrictEqual(r.left, [])
})

test("install command: the same or an older Qt minor installs; an unreadable one does not block", () => {
  for (const qt of ["6.11.3-2", "6.10.0-1"])
    assert.match(runInstall(release, { [pkg]: { qt } }).log, /sudo pacman -U/, qt)
  assert.match(runInstall(release, { [pkg]: { qt: "6.12.0-1" } }, undefined, "6.12.0-1").log, /sudo pacman -U/)
  assert.match(runInstall(release, { [pkg]: { qt: "6.12.0-1" } }, undefined, "").log, /sudo pacman -U/)
})

test("install command: a failure ends the install, not the terminal's script", () => {
  const r = runInstall("[]")
  assert.match(r.stdout, /^before\nCould not find an OMARemote release for x86_64 on GitHub\.\nafter 1\n$/)
  assert.doesNotMatch(r.log, /sudo/)
})
