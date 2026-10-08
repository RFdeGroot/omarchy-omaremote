import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui
import "Model.js" as Model

// What the dropdown shows: the hero, the install row when OMARemote is missing, and the ACTIVE and
// FAVOURITES rows. Kept apart from Panel.qml so tests/preview can draw it from sample data; `host`
// is the Panel (cursor, colours, actions) and `host.remote` its Service.
Column {
  id: column
  property var host: null

  spacing: Style.space(12)

  // The row the panel's cursor index points at, in the order of host.rows.
  function rowItem(index) {
    if (!host.remote.compatible) return index === 0 ? installRow : null
    var active = host.remote.active.length
    return index < active ? activeRows.itemAt(index) : favouriteRows.itemAt(index - active)
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

  // Missing or too old: one action, which opens a terminal to install the newest release.
  ActionRow {
    id: installRow
    visible: !host.remote.compatible
    width: parent.width
    rowIndex: 0
    glyph: "󰇚"
    title: host.remote.installing ? "Installing OMARemote…"
      : host.remote.installed ? "Update OMARemote" : "Install OMARemote"
    subtitle: host.remote.installing ? "Finish in the terminal; this updates by itself"
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
        rowIndex: index
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
        rowIndex: host.remote.active.length + index
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
    }
  }
}
