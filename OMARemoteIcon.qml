import QtQuick
import QtQuick.Shapes
import qs.Commons

// OMARemote's mark in one colour: a monitor showing the Omarchy spiral, drawn on the 24 grid of
// the app icon (share/icons/.../omaremote.svg in OMARemote) so bar and launcher show one shape.
Item {
  id: root

  property real iconSize: Style.font.icon
  property color color: Color.foreground

  implicitWidth: iconSize
  implicitHeight: iconSize
  width: iconSize
  height: iconSize

  Shape {
    width: 24
    height: 24
    scale: root.iconSize / 24
    transformOrigin: Item.TopLeft
    antialiasing: true

    // The bezel: the screen cut out of the frame.
    ShapePath {
      fillColor: root.color
      fillRule: ShapePath.OddEvenFill
      strokeWidth: 0
      PathSvg { path: "M3.1 2.5H20.9A1.6 1.6 0 0 1 22.5 4.1V15.9A1.6 1.6 0 0 1 20.9 17.5H3.1A1.6 1.6 0 0 1 1.5 15.9V4.1A1.6 1.6 0 0 1 3.1 2.5Z M3 4V16H21V4Z" }
    }

    // Neck and foot.
    ShapePath {
      fillColor: root.color
      strokeWidth: 0
      PathSvg { path: "M10.25 17.5H13.75V19.8H10.25Z M7.7 19.8H16.3A0.7 0.7 0 0 1 17 20.5V21A0.7 0.7 0 0 1 16.3 21.7H7.7A0.7 0.7 0 0 1 7 21V20.5A0.7 0.7 0 0 1 7.7 19.8Z" }
    }

    // The spiral on the screen.
    ShapePath {
      fillColor: "transparent"
      strokeColor: root.color
      strokeWidth: 1.17
      capStyle: ShapePath.SquareCap
      joinStyle: ShapePath.MiterJoin
      PathSvg { path: "M16.05 14.05H7.95V5.95H16.05V12.25H9.75V7.75H14.25V10.45H11.55" }
    }
  }
}
