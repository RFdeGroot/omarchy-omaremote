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
2. Update the version in `manifest.json` and commit all release changes on `main`.
3. Run the validation commands above.
4. Push `main`, tag the exact release commit as `v<version>`, push the tag, and create the GitHub
   release.
5. Only when the maintainer decides to publish: open a verification issue in
   `omacom/omarchy-plugin-marketplace` with the "Verify and publish a newer upstream commit" form,
   headings unchanged, targeting the full 40-character release commit SHA.
