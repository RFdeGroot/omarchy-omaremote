const test = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const Model = require("../Model.js")

const pluginRoot = path.join(__dirname, "..")

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

// `omaremote-session read favourites` (OMARemote 0.9.15) answers with the starred connections only.
test("favourites are read from OMARemote's answer, and a broken one is told apart", () => {
  const answer = { exists: true, favourites: [{ id: "pi", name: "Raspberry Pi", protocol: "vnc", group: "Lab" }], more: 0 }
  assert.deepStrictEqual(Model.parseFavourites(JSON.stringify(answer)),
    { exists: true, favourites: [{ id: "pi", name: "Raspberry Pi", host: undefined, protocol: "vnc", favourite: true }] })
  assert.deepStrictEqual(Model.parseFavourites('{"exists": false, "favourites": [], "more": 0}'), { exists: false, favourites: [] })
  // An answer longer than OMARemote ever gives is cut to its maximum before anything else.
  const flood = JSON.stringify({ exists: true, favourites: Array.from({ length: 5000 }, (_, i) => ({ id: "c" + i })) })
  assert.strictEqual(Model.parseFavourites(flood).favourites.length, Model.MAX_STARRED)
  for (const text of ["", "not json", "{}", "[]", '{"favourites": {}}', '{"error": "too large", "broken": true}'])
    assert.strictEqual(Model.parseFavourites(text), null, text)
  // What it reads goes straight into Model.favourites.
  const read = Model.parseFavourites(JSON.stringify({ exists: true, favourites: connections.filter(c => c.favourite) }))
  assert.deepStrictEqual(Model.favourites(read.favourites, sessions).map(c => c.id), ["design", "files"])
  assert.deepStrictEqual(Model.parseSessions("{}"), [])
})

test("entries that are not objects are dropped, so no row reads a field off null", () => {
  const text = JSON.stringify({ exists: true, favourites: [null, { id: "pi" }, "pi", 7] })
  assert.deepStrictEqual(Model.parseFavourites(text).favourites.map(c => c.id), ["pi"])
  assert.deepStrictEqual(Model.parseSessions(JSON.stringify([null, sessions[0]]), null), [sessions[0]])
})

test("a failed session read is told apart from no sessions", () => {
  assert.strictEqual(Model.parseSessions("not json", null), null)
  assert.strictEqual(Model.parseSessions("{}", null), null)
  assert.deepStrictEqual(Model.parseSessions("[]", null), [])
  assert.strictEqual(Model.summary(true, true, true, 0, true), "Sessions unknown")
  assert.strictEqual(Model.summary(false, false, false, 0, true), "Not installed")
})

test("favourites exist even when all of them are running", () => {
  assert.ok(Model.hasFavourites(connections))
  assert.ok(!Model.hasFavourites([{ id: "build", favourite: false }]))
  assert.ok(!Model.hasFavourites([]))
  const allRunning = [{ id: "pi", state: "connected", connection: "pi" }]
  assert.deepStrictEqual(Model.favourites([connections[0]], allRunning), [])
})

test("ids that name Object's members are listed like any other", () => {
  const ids = ["constructor", "__proto__", "toString"]
  const own = ids.map(id => ({ id: id, connection: id, name: id, state: "connected" }))
  assert.deepStrictEqual(Model.activeSessions(own).map(s => s.id).sort(), ids.slice().sort())
  const favs = ids.map(id => ({ id: id, name: id, favourite: true }))
  assert.deepStrictEqual(Model.favourites(favs, []).map(c => c.id).sort(), ids.slice().sort())
  assert.deepStrictEqual(Model.favourites(favs, own), [])
})

// A sync folder decides how many favourites there are: each one is a row the shell draws.
test("the lists stop at their caps, keeping the first by name", () => {
  const many = Array.from({ length: 10000 }, (_, i) => ({ id: "c" + i, name: "n" + String(i).padStart(5, "0"), favourite: true }))
  const favs = Model.favourites(many, [])
  assert.strictEqual(favs.length, Model.MAX_FAVOURITES)
  assert.deepStrictEqual(favs.slice(0, 2).map(c => c.id), ["c0", "c1"])
  const running = many.map(c => ({ connection: c.id, name: c.name, state: "connected" }))
  assert.strictEqual(Model.activeSessions(running).length, Model.MAX_ACTIVE)
  // A favourite that runs past the cap is still left out of FAVOURITES: it runs.
  assert.deepStrictEqual(Model.favourites(many, running), [])
  assert.strictEqual(Model.favourites(many, [], Infinity).length, 10000)
})

test("synced names and hosts show as one line, without bidi controls, and not too long", () => {
  assert.strictEqual(Model.displayText("File Server\nOMARemote · connected"), "File Server OMARemote · connected")
  assert.strictEqual(Model.displayText("a\u2028b\u0085c\td"), "a b c d")
  assert.strictEqual(Model.displayText("host\u202e.acme\u2066.lan\u200f"), "host.acme.lan")
  assert.strictEqual(Model.displayText(null), "")
  const long = Model.displayText("x".repeat(400000))
  assert.strictEqual(long, "x".repeat(Model.MAX_TEXT) + "…")
  // A cut never leaves half of a character that takes two UTF-16 units.
  assert.strictEqual(Model.displayText("x".repeat(Model.MAX_TEXT - 1) + "😀"), "x".repeat(Model.MAX_TEXT - 1) + "…")
  assert.strictEqual(Model.rowTitle({ name: "", host: "pi\n.lan" }), "pi .lan")
  assert.strictEqual(Model.rowTitle({ name: "Büro" }), "Büro")
  assert.strictEqual(Model.favouriteMeta({ protocol: "vnc\n", host: "\u202ehost" }), "VNC  · host")
  assert.strictEqual(Model.sessionMeta({ protocol: "x".repeat(300), state: "connected" }).length, Model.MAX_TEXT + 1 + " · connected".length)
})

// What the panel reads from OMARemote is cut after its cap, and a cut answer is never parsed.
test("answers are read up to their cap", () => {
  const run = (command, max, seconds) => {
    const [bin, ...args] = Model.boundedCommand(command, max, seconds)
    return spawnSync(bin, args, { encoding: "utf8" })
  }
  const ok = run(["printf", "%s", "x".repeat(100)], 100)
  assert.strictEqual(ok.status, 0)
  assert.strictEqual(ok.stdout, "x".repeat(100))
  // Past the cap nothing is printed and the read fails, whether the command keeps writing or has
  // finished within the pipe's buffer, and counted in bytes: 60 "ü" are 120 bytes.
  for (const command of [["yes"], ["printf", "%s", "x".repeat(101)], ["printf", "%s", "ü".repeat(60)]]) {
    const r = run(command, 100)
    assert.notStrictEqual(r.status, 0, command[0])
    assert.strictEqual(r.stdout, "", command[0])
  }
  assert.strictEqual(run(["printf", "%s", "ü".repeat(50)], 100).stdout, "ü".repeat(50))
  assert.notStrictEqual(run(["false"], 100).status, 0)
  // An answer that never comes ends at the deadline.
  const started = Date.now()
  assert.notStrictEqual(run(["sleep", "30"], 100, 1).status, 0)
  assert.ok(Date.now() - started < 5000)
  // Arguments reach the command as they are, never through a shell.
  assert.strictEqual(run(["printf", "%s", "$(id) ;"], 100).stdout, "$(id) ;")
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
  // No host: no separator left dangling at the end.
  assert.strictEqual(Model.favouriteMeta(connections[0]), "RDP")
  assert.strictEqual(Model.summary(false, false, false, 0), "Not installed")
  assert.strictEqual(Model.summary(true, false, false, 0), "Needs a newer OMARemote")
  assert.strictEqual(Model.summary(true, true, true, 2), "2 sessions running")
  assert.strictEqual(Model.summary(true, true, false, 0), "Closed")
})

test("a click opens in a tab, or with --window in a window of its own", () => {
  assert.deepStrictEqual(Model.openCommand("pi", false), ["uwsm-app", "--", "omaremote", "open", "pi"])
  assert.deepStrictEqual(Model.openCommand("pi", true), ["uwsm-app", "--", "omaremote", "open", "--window", "pi"])
})

test("a session whose connection is not saved still shows, by its own name and host", () => {
  // OMARemote 0.7's quick connections run under q- ids that never appear in `connections`, as
  // does a connection deleted while its session runs.
  const quick = { id: "s-9", connection: "q-mfx3k2a9q1", name: "", host: "kiosk01.acme.lan", protocol: "rdp", state: "connected", tab: true, view: "tab" }
  assert.deepStrictEqual(Model.activeSessions([quick]), [quick])
  assert.deepStrictEqual(Model.favourites(connections, [quick]), Model.favourites(connections, []))
  assert.strictEqual(Model.sessionMeta(quick), "RDP · connected")
  assert.ok(Model.isSafeId(quick.connection))
  assert.deepStrictEqual(Model.openCommand(quick.connection, false), ["uwsm-app", "--", "omaremote", "open", "q-mfx3k2a9q1"])
})

test("an id that would read as an option never reaches the command line", () => {
  assert.ok(Model.isSafeId("c-mfx3k2a9q1"))
  assert.ok(Model.isSafeId("pi"))
  for (const id of ["--help", "-h", "--window", "", null, undefined]) assert.ok(!Model.isSafeId(id), String(id))
})

test("a hotkey window is OMARemote's verdict, toggled like its shortcut", () => {
  const git = { protocol: "ssh", state: "connected", tab: true, view: "window", hotkey: true }
  assert.ok(Model.isHotkey(git))
  // Missing (an older OMARemote) or anything but true: an ordinary session.
  assert.ok(!Model.isHotkey({ ...git, hotkey: undefined }))
  assert.ok(!Model.isHotkey({ ...git, hotkey: "true" }))
  assert.ok(!Model.isHotkey(null))
  assert.strictEqual(Model.sessionMeta(git), "SSH · connected · hotkey window")
  // Between connecting and its window claiming it, OMARemote may still report the tab.
  assert.strictEqual(Model.sessionMeta({ ...git, state: "connecting", view: "tab" }), "SSH · connecting… · hotkey window")
  assert.deepStrictEqual(Model.toggleCommand("c-git"), ["uwsm-app", "--", "omaremote", "toggle", "c-git"])
})

test("open in own window is chosen per connection", () => {
  assert.deepStrictEqual(Model.windowConnections(undefined), [])
  assert.ok(Model.opensInWindow(["pi"], "pi"))
  assert.ok(!Model.opensInWindow(["pi"], "dc"))
  assert.deepStrictEqual(Model.setOpensInWindow([], "dc", true), ["dc"])
  assert.deepStrictEqual(Model.setOpensInWindow(["pi", "dc"], "pi", false), ["dc"])
  assert.deepStrictEqual(Model.setOpensInWindow(["pi", "dc"], "pi", true), ["dc", "pi"])
  // The panel cannot tell a deleted connection from one that is not starred: the newest choices stay.
  const many = Array.from({ length: Model.MAX_WINDOW_CONNECTIONS }, (_, i) => "c" + i)
  const out = Model.setOpensInWindow(many, "new", true)
  assert.strictEqual(out.length, Model.MAX_WINDOW_CONNECTIONS)
  assert.deepStrictEqual([out[0], out[out.length - 1]], ["c1", "new"])
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

// uwsm-app starts the terminal as a systemd unit, and systemd expands `${...}` in its command line
// (an unreadable one, like `${url##*/}`, to nothing) before the shell runs it.
test("install command has no ${...} for systemd to expand", () => {
  assert.ok(!Model.installCommand("/plugin/omaremote-release.gpg").includes("${"))
})

// sudo gets the password and grep reads the signature verdict: neither may come from the user's PATH.
test("install command takes its tools from /usr/bin, with pipefail", () => {
  assert.ok(Model.installCommand("/k.gpg").startsWith("(set -e; set -o pipefail; PATH='/usr/bin'; export PATH; "))
})

test("the bundled keyring holds OMARemote's release key", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "omaremote-key-test-"))
  try {
    const r = spawnSync("gpg", ["--homedir", home, "--batch", "--with-colons", "--show-keys",
      path.join(pluginRoot, "omaremote-release.gpg")], { encoding: "utf8" })
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
// With `swap`, the package in root's folder is replaced right after it is copied there.
function runInstall(releasesJson, files = {}, fingerprint = signer.fingerprint, systemQt = "6.11.1-1", swap = false) {
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
      'url=${@: -1}; src="$WORK/served/${url##*/}"; [[ -f $src ]] || exit 22\n' +
      // A served file holding TOO LARGE stands for one past the download's --max-filesize: curl
      // keeps what came before the cap and fails.
      'if [[ $(<"$src") == "TOO LARGE" ]]; then printf partial > "$out"; echo "curl: (63) Exceeded the maximum allowed file size" >&2; exit 63; fi\n' +
      'cp "$src" "$out"')
    stub("uname", "echo x86_64")
    // sudo runs what it is given (as this user), except pacman; root's folder goes in the log.
    stub("sudo", 'echo "sudo $*" >> "$LOG"\n' +
      'if [[ $1 == pacman ]]; then [[ -f ${@: -1} ]] && echo "package present" >> "$LOG"\n' +
      '  [[ -e ${@: -1}.sig ]] && echo "signature beside the package" >> "$LOG"; exit 0; fi\n' +
      'if [[ $1 == mktemp ]]; then out=$("$@"); echo "root $out" >> "$LOG"; echo "$out"; exit; fi\n' +
      '"$@"; [[ $1 == install && -n $SWAP ]] && echo swapped > "${@: -1}$(basename "$4")"; true')
    stub("setsid", 'echo "setsid $*" >> "$LOG"')
    stub("pacman", '[[ $* == "-Q qt6-base" && -n $QT ]] && echo "qt6-base $QT"')
    const log = path.join(work, "log")
    const script = "echo before; " + Model.installCommand(signer.keyring, fingerprint, bin + ":/usr/bin") + "; echo \"after $?\""
    const r = spawnSync("bash", ["-c", script], {
      encoding: "utf8",
      env: { PATH: bin + ":" + process.env.PATH, LOG: log, WORK: work, TMPDIR: work, HOME: work, QT: systemQt, SWAP: swap ? "1" : "" }
    })
    const logText = fs.existsSync(log) ? fs.readFileSync(log, "utf8") : ""
    const roots = [...logText.matchAll(/^root (\S+)$/gm)].map(m => m[1])
    const left = fs.readdirSync(work).filter(n => n.startsWith("tmp.")).concat(roots.filter(d => fs.existsSync(d)))
    return { stdout: r.stdout, log: logText, left }
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
  assert.match(r.log, /curl -q -fL .* -o \S+\/omaremote-0\.4\.0-1-x86_64\.pkg\.tar\.zst https:\/\/\S+\/omaremote-0\.4\.0-1-x86_64\.pkg\.tar\.zst\n/)
  assert.match(r.log, /curl -q -fL .* -o \S+\/signature https:\/\/\S+\/omaremote-0\.4\.0-1-x86_64\.pkg\.tar\.zst\.sig\n/)
  // What pacman installs is root's copy, checked again there.
  assert.match(r.log, /^root \/tmp\/omaremote-install\.\w+$/m)
  assert.match(r.log, /sudo pacman -U \/tmp\/omaremote-install\.\w+\/omaremote-0\.4\.0-1-x86_64\.pkg\.tar\.zst\npackage present\n/)
  // pacman -U would check a <package>.sig against its own keyring, which lacks OMARemote's key.
  assert.doesNotMatch(r.log, /signature beside the package/)
  assert.match(r.log, /setsid -f uwsm-app -- omaremote/)
  assert.match(r.stdout, /after 0/)
  assert.deepStrictEqual(r.left, [])
})

// Everything is downloaded before the signature check, so a server could otherwise stream without
// end (marketplace review #12133): each download is HTTPS only, capped in bytes and in time.
test("install command: every download is HTTPS only and capped in size and time", () => {
  const r = runInstall(release, { [pkg]: { signed: "pkg" } })
  const calls = r.log.split("\n").filter(l => l.startsWith("curl "))
  assert.strictEqual(calls.length, 3)
  const caps = calls.map(c => {
    assert.match(c, /^curl -q /)
    assert.match(c, / --proto =https --proto-redir =https /)
    assert.match(c, / --connect-timeout \d+ /)
    assert.match(c, / --max-time \d+ /)
    return Number(c.match(/ --max-filesize (\d+) /)[1])
  })
  assert.deepStrictEqual(caps, [4194304, 67108864, 65536])
})

test("install command: what pacman gets is checked again in root's folder", () => {
  const r = runInstall(release, { [pkg]: { signed: "pkg" } }, signer.fingerprint, "6.11.1-1", true)
  assert.match(r.stdout, /^before\nThe download is not signed by OMARemote's release key, so it is not installed\.\nafter 1\n$/)
  assert.doesNotMatch(r.log, /sudo pacman/)
  assert.deepStrictEqual(r.left, [])
})

test("install command: a package past its cap is not installed", () => {
  const r = runInstall(release, { [pkg]: "TOO LARGE", [pkg + ".sig"]: "sig" })
  assert.match(r.stdout, /^before\nThe download failed or was larger than an OMARemote package can be, so it is not installed\.\nafter 1\n$/)
  assert.doesNotMatch(r.log, /sudo/)
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

// docs/CONTRIBUTING.md: raise minimumVersion in manifest.json and Service.qml together.
test("manifest.json and Service.qml ask for the same minimum OMARemote", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, "manifest.json"), "utf8"))
  const service = fs.readFileSync(path.join(pluginRoot, "Service.qml"), "utf8")
  const match = service.match(/property string minimumVersion: "([^"]+)"/)
  assert.ok(match, "Service.qml has no minimumVersion")
  assert.strictEqual(match[1], manifest.omaremote.minimumVersion)
})

// From Qt 6.12 a bare `Color` is Qt's own type, not Omarchy's palette, and every colour reads empty.
test("QML and JS reach the palette as Commons.Color, never a bare Color", () => {
  const files = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(qml|js)$/.test(e.name) && p !== __filename) files.push(p)
    }
  }
  walk(pluginRoot)
  assert.ok(files.some(f => f.endsWith("Panel.qml")))
  for (const file of files) {
    const code = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n").filter(line => !/^\s*\/\//.test(line)).join("\n")
    const name = path.relative(pluginRoot, file)
    assert.doesNotMatch(code, /(?<![\w.])Color\s*[.[]/, name + " uses a bare Color")
    if (/\bCommons\./.test(code))
      assert.match(code, /^import qs\.Commons as Commons$/m, name + " reads Commons. without the alias import")
  }
})
