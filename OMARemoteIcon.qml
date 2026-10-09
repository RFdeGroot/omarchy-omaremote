import QtQuick
import QtQuick.Shapes
import qs.Commons

// OMARemote's mark in one colour: a monitor showing the Omarchy mark, whose left connector runs on
// into an arrow. The paths are the app icon's (share/icons/.../omaremote.svg in OMARemote), so bar
// and launcher show one shape: filled unit squares on a 24 grid, no strokes. Below about 20 px its
// one-cell lines would blur together, so small sizes (the bar) get a 13 grid drawing of the monitor
// with just the arrow.
Item {
  id: root

  property real iconSize: Style.font.icon
  property color color: Color.foreground

  readonly property bool small: iconSize < 20
  // Whole pixels per cell, so every line stays one sharp pixel wide: 16 px draws it 1:1, centred.
  readonly property int smallScale: Math.max(1, Math.floor(iconSize / 13))

  implicitWidth: iconSize
  implicitHeight: iconSize
  width: iconSize
  height: iconSize

  Shape {
    visible: !root.small
    // Shifted half a cell, as in the app icon: the mark is an odd number of cells wide. Rounded to
    // a whole pixel, or at 24 px every line would straddle two pixels and turn grey.
    x: Math.round(0.5 * root.iconSize / 24)
    width: 24
    height: 24
    scale: root.iconSize / 24
    transformOrigin: Item.TopLeft
    // Square cells want hard edges; antialiasing would blur every one-cell line.
    antialiasing: false

    // The monitor: frame, stand, and the gap in the bottom frame beside the stand.
    ShapePath {
      fillColor: root.color
      fillRule: ShapePath.WindingFill
      strokeWidth: -1
      PathSvg { path: "M1 1h21v1h-21zM1 2h1v17h-1zM21 2h1v17h-1zM1 19h11v1h-11zM13 19h9v1h-9zM11 20h1v2h-1zM7 22h9v1h-9z" }
    }

    // The Omarchy mark on the screen.
    ShapePath {
      fillColor: root.color
      fillRule: ShapePath.WindingFill
      strokeWidth: -1
      PathSvg { path: "M4 3h15v1h-15zM4 4h1v1h-1zM11 4h1v1h-1zM18 4h1v1h-1zM4 5h1v1h-1zM6 5h6v1h-6zM15 5h2v1h-2zM18 5h1v1h-1zM4 6h1v1h-1zM6 6h1v1h-1zM16 6h1v1h-1zM18 6h1v1h-1zM4 7h1v1h-1zM6 7h1v1h-1zM16 7h1v1h-1zM18 7h1v1h-1zM4 8h1v1h-1zM6 8h1v1h-1zM12 8h1v1h-1zM16 8h1v1h-1zM18 8h1v1h-1zM4 9h1v1h-1zM6 9h1v1h-1zM12 9h2v1h-2zM16 9h1v1h-1zM18 9h1v1h-1zM4 10h11v1h-11zM16 10h1v1h-1zM18 10h1v1h-1zM4 11h1v1h-1zM6 11h1v1h-1zM12 11h2v1h-2zM16 11h1v1h-1zM18 11h1v1h-1zM4 12h1v1h-1zM6 12h1v1h-1zM12 12h1v1h-1zM16 12h1v1h-1zM18 12h1v1h-1zM4 13h1v1h-1zM6 13h1v1h-1zM16 13h1v1h-1zM18 13h1v1h-1zM4 14h1v1h-1zM6 14h1v1h-1zM16 14h1v1h-1zM18 14h1v1h-1zM4 15h1v1h-1zM6 15h11v1h-11zM18 15h1v1h-1zM4 16h1v1h-1zM11 16h1v1h-1zM18 16h1v1h-1zM4 17h8v1h-8zM13 17h6v1h-6z" }
    }
  }

  Shape {
    visible: root.small
    x: Math.round((root.iconSize - 13 * root.smallScale) / 2)
    y: Math.round((root.iconSize - 13 * root.smallScale) / 2)
    width: 13
    height: 13
    scale: root.smallScale
    transformOrigin: Item.TopLeft
    antialiasing: false

    // The monitor, with the stand and the gap beside it as in the big icon.
    ShapePath {
      fillColor: root.color
      fillRule: ShapePath.WindingFill
      strokeWidth: -1
      PathSvg { path: "M0 0h13v1h-13zM0 1h1v9h-1zM12 1h1v9h-1zM0 10h7v1h-7zM8 10h5v1h-5zM6 11h1v1h-1zM3 12h7v1h-7z" }
    }

    // The arrow: a desktop coming in.
    ShapePath {
      fillColor: root.color
      fillRule: ShapePath.WindingFill
      strokeWidth: -1
      PathSvg { path: "M7 3h1v1h-1zM7 4h2v1h-2zM1 5h9v1h-9zM7 6h2v1h-2zM7 7h1v1h-1z" }
    }
  }
}
