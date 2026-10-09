# Repository guidance

## What this is

The Omarchy bar plugin for [OMARemote](https://github.com/RFdeGroot/OMARemote) (`rfdegroot.omaremote`):
a bar icon whose dropdown lists OMARemote's running sessions and favourite connections, and offers to
install OMARemote when it is missing or too old. `Panel.qml` is the bar button and popup (cursor,
keys, scrolling), `PanelBody.qml` the dropdown's contents, `Service.qml` reads OMARemote, `Model.js`
holds the pure logic. Look and feel follow Flea and omapods: keyboard first, quiet secondary text,
colours always from the live Omarchy theme.

## The contract with OMARemote

Read `docs/plugin-interface.md` in OMARemote before touching `Service.qml` or `Model.js`. It lists
every command, file, IPC call and format the plugin may rely on; never rely on anything not in it.
A change that needs something from OMARemote, or a contract that turns out wrong or incomplete, goes
to the OMARemote side first. Raise `minimumVersion` (in `manifest.json` and `Service.qml`) when the
plugin starts relying on something newer.

The same file's last section lists what OMARemote relies on from the plugin: its sidebar offers to
install or update the plugin. So keep the id `rfdegroot.omaremote`, keep `manifest.json` `version`
equal to the released version (no `v`), tag every release `v<version>` with a GitHub release, and
keep the plugin installable with `omarchy plugin add … --enable` and updatable with
`omarchy plugin update rfdegroot.omaremote`.

## Branches

`main` only moves at a release. `omarchy plugin add` and `omarchy plugin update` take `main`'s
latest commit, so whatever lands on `main` reaches every user who updates. Work on `dev`, and
fast-forward `main` to `dev` only when releasing.

## Validation

Before committing a change, run:

```sh
node --test tests/*.test.js
omarchy plugin validate .
git diff --check
tests/preview.sh            # for any visible change; check preview.png, commit it if it changed
```

Show visible changes with `tests/preview.sh` (sample data, the fictional ACME company) and never
with screenshots of a real bar: those show real connections. `KeyboardPanel` cannot render
offscreen; `PanelBody.qml` can, which is why it is a separate file.

Tests must not find `~/.local/bin` in PATH: a development copy of `omaremote` may live there and
answer instead of the installed one.

## Release process

1. Use the next semantic version. Never move or replace a published tag.
2. On `dev`: update the version in `manifest.json` and commit it with any other release changes.
3. Run the validation commands above.
4. Fast-forward `main` to `dev` (`git switch main && git merge --ff-only dev`); `main` never gets
   commits of its own.
5. Push `main` and `dev`, tag the exact release commit as `v<version>`, push the tag, and create
   the GitHub release.
6. Only when the maintainer decides to publish, in `omacom/omarchy-plugin-marketplace`
   (`SUBMISSION.md` there has the exact formats; show the issue to the maintainer before opening
   it): the first listing is a "[Plugin]: OMARemote" submission issue; later releases are a
   verification issue with the "Verify and publish a newer upstream commit" action, headings
   unchanged, targeting the full 40-character release commit SHA. Either way `main` must point at
   that commit: the marketplace validates the repository's current head.
