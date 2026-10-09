import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui
import "Model.js" as Model

// What the dropdown shows: the hero, the install row when OMARemote is missing or too old, and the
// ACTIVE and FAVOURITES rows, each with a switch for opening it in a window of its own. Kept apart from Panel.qml so tests/preview can draw it from sample data; `host`
// is the Panel (cursor, colours, actions) and `host.remote` its Service.
Column {
  id: column
  property var host: null

  spacing: Style.space(12)

  // The row the panel's cursor index points at, in the order of host.rows.
  function rowItem(index) {
    if (!host.remote.canOpenInWindow && index === 0) return installRow
    if (!host.remote.compatible) return null
    var i = index - column.firstRow
    var active = host.remote.active.length
    return i < active ? activeRows.itemAt(i) : favouriteRows.itemAt(i - active)
  }

  // Sessions and favourites start below the install row, when it shows.
  readonly property int firstRow: host.remote.canOpenInWindow ? 0 : 1

  // Where a click opens this connection: a tab, or a floating window of its own.
  function windowHint(connectionId) {
    return host.opensInWindow(connectionId) ? "Opens in its own window" : "Opens in a tab"
  }

  PanelHero {
    id: hero
    width: parent.width
    title: "OMARemote"
    meta: host.summary
    foreground: host.foreground
    fontFamily: host.fontFamily
    iconOpacity: host.busy ? 1.0 : 0.6
    iconComponent: Component {
      OMARemoteIcon {
        iconSize: Style.font.display
        color: host.foreground
      }
    }
    trailingControl: Component {
      PanelActionButton {
        id: openAppButton
        visible: host.remote.installed
        iconText: "󰏌"
        tooltipText: "Open OMARemote  (o)"
        foreground: host.foreground
        fontFamily: host.fontFamily
        onClicked: { host.remote.openApp(); host.close() }
      }
    }
  }

  // Missing or too old: one action, which opens a terminal to install the newest release. Also
  // shown for an OMARemote that works but is too old to open sessions in a window of their own.
  ActionRow {
    id: installRow
    visible: !host.remote.canOpenInWindow
    width: parent.width
    rowIndex: 0
    glyph: "󰇚"
    title: host.remote.installing ? "Installing OMARemote…"
      : host.remote.installed ? "Update OMARemote" : "Install OMARemote"
    subtitle: host.remote.installing ? "Finish in the terminal; this updates by itself"
      : host.remote.compatible ? "Needs " + host.remote.windowVersion + " for own windows"
      : host.remote.installed ? "This plugin needs " + host.remote.minimumVersion + " or newer (you have " + host.remote.version + ")"
      : "RDP and VNC remote desktops, in tabs"
  }

  // omaremote-session failed: say so rather than show an empty or stale list as if it were true.
  Text {
    visible: host.remote.compatible && host.remote.readError
    width: parent.width
    text: "Could not read OMARemote's sessions. Press r to retry."
    color: host.dim
    font.family: host.fontFamily
    font.pixelSize: Style.font.bodySmall
    wrapMode: Text.WordWrap
  }

  Column {
    visible: host.remote.compatible && !host.remote.readError && host.remote.active.length > 0
    width: parent.width
    spacing: Style.space(6)

    PanelSectionHeader {
      text: "ACTIVE"
      foreground: host.foreground
      fontFamily: host.fontFamily
    }
    Repeater {
      id: activeRows
      model: host.remote.compatible ? host.remote.active : []
      ActionRow {
        required property var modelData
        required property int index
        width: parent.width
        rowIndex: column.firstRow + index
        showSwitch: host.remote.canOpenInWindow
        switchOn: host.opensInWindow(modelData.connection)
        switchHint: column.windowHint(modelData.connection)
        glyph: ""
        glyphColor: modelData.state === "connected" ? Color.accent : host.dim
        title: modelData.name || modelData.host || ""
        subtitle: Model.sessionMeta(modelData)
      }
    }
  }

  // Hidden when every favourite is running: they are all under ACTIVE then.
  Column {
    visible: host.remote.compatible && !host.remote.readError
      && (host.remote.favourites.length > 0 || !Model.hasFavourites(host.remote.connections))
    width: parent.width
    spacing: Style.space(6)

    PanelSectionHeader {
      text: "FAVOURITES"
      foreground: host.foreground
      fontFamily: host.fontFamily
    }
    Text {
      visible: host.remote.favourites.length === 0
      width: parent.width
      text: host.remote.connections.length === 0 ? "No connections yet. Press o to open OMARemote."
        : "Mark connections with ★ in OMARemote to list them here."
      color: host.dim
      font.family: host.fontFamily
      font.pixelSize: Style.font.bodySmall
      wrapMode: Text.WordWrap
    }
    Repeater {
      id: favouriteRows
      model: host.remote.compatible ? host.remote.favourites : []
      ActionRow {
        required property var modelData
        required property int index
        width: parent.width
        rowIndex: column.firstRow + host.remote.active.length + index
        showSwitch: host.remote.canOpenInWindow
        switchOn: host.opensInWindow(modelData.id)
        switchHint: column.windowHint(modelData.id)
        glyph: ""
        glyphColor: host.dim
        title: modelData.name || modelData.host || ""
        subtitle: Model.favouriteMeta(modelData)
      }
    }
  }

  // A row in the panel: glyph, name and a quiet second line; the cursor follows the mouse.
  component ActionRow: CursorSurface {
    id: actionRow
    property int rowIndex: 0
    property string glyph: ""
    property color glyphColor: column.host.foreground
    property string title: ""
    property string subtitle: ""
    property bool showSwitch: false
    property bool switchOn: false
    property string switchHint: ""

    hasCursor: column.host.rowHasCursor(rowIndex)
    foreground: column.host.foreground
    implicitHeight: rowContent.implicitHeight + Style.spacing.rowPaddingX

    MouseArea {
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      onPositionChanged: function (mouse) { column.host.pointerMoved(actionRow.rowIndex, actionRow, mouse) }
      onClicked: column.host.activate(actionRow.rowIndex)
    }

    RowLayout {
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      anchors.leftMargin: Style.space(10)
      anchors.rightMargin: Style.space(10)
      spacing: Style.space(10)

      Text {
        textFormat: Text.PlainText
        text: actionRow.glyph
        color: actionRow.glyphColor
        font.family: column.host.fontFamily
        font.pixelSize: Style.font.icon
        // One width for every glyph, so the titles line up whatever the icon.
        horizontalAlignment: Text.AlignHCenter
        Layout.preferredWidth: Math.round(Style.font.icon * 1.4)
        Layout.alignment: Qt.AlignVCenter
      }

      ColumnLayout {
        id: rowContent
        Layout.fillWidth: true
        spacing: Style.space(1)

        Text {
          textFormat: Text.PlainText
          Layout.fillWidth: true
          text: actionRow.title
          color: column.host.foreground
          font.family: column.host.fontFamily
          font.pixelSize: Style.font.body
          elide: Text.ElideRight
        }
        Text {
          textFormat: Text.PlainText
          Layout.fillWidth: true
          text: actionRow.subtitle
          color: column.host.dim
          font.family: column.host.fontFamily
          font.pixelSize: Style.font.caption
          elide: Text.ElideRight
        }
      }

      // Own window or tab for this connection; a click on the rest of the row opens it. The click
      // zone is the full row height and reaches past the compact switch to the row's right edge:
      // the switch alone is too small a target, and a near miss would open the session instead.
      Item {
        id: windowZone
        visible: actionRow.showSwitch
        Layout.fillHeight: true
        Layout.alignment: Qt.AlignVCenter
        implicitWidth: windowSwitch.implicitWidth + Style.space(16)

        ToggleSwitch {
          id: windowSwitch
          anchors.right: parent.right
          anchors.verticalCenter: parent.verticalCenter
          checked: actionRow.switchOn
          interactive: false
          cursorRing: false
          // Compact: one per row, so the names stay what the eye lands on.
          trackHeight: Math.round(Style.font.body)
          foreground: column.host.foreground
        }

        MouseArea {
          id: windowZoneMouse
          anchors.fill: parent
          anchors.topMargin: -Style.spacing.rowPaddingX / 2
          anchors.bottomMargin: -Style.spacing.rowPaddingX / 2
          anchors.rightMargin: -Style.space(10)
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onClicked: column.host.toggleWindow(actionRow.rowIndex)
        }

        PanelToolTip {
          visible: windowZoneMouse.containsMouse
          text: actionRow.switchHint + "  (w)"
          fontFamily: column.host.fontFamily
        }
      }
    }
  }
}
