import {
  createElement,
  Clapperboard,
  ClipboardPaste,
  Download,
  FolderOpen,
  Minus,
  Music,
  RotateCcw,
  Settings,
  X,
  ArrowRight,
  type IconNode,
} from "lucide";

export const icons = {
  video: Clapperboard,
  music: Music,
  download: Download,
  paste: ClipboardPaste,
  settings: Settings,
  cancel: X,
  folderOpen: FolderOpen,
  retry: RotateCcw,
  back: ArrowRight,
  minimize: Minus,
  close: X,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof icons;

/** Build an inline Lucide SVG. Colour is inherited from `currentColor`. */
export function icon(name: IconName, size = 24): SVGElement {
  const svg = createElement(icons[name], {
    width: size,
    height: size,
    "stroke-width": 2.25,
    "aria-hidden": "true",
    focusable: "false",
    class: "icon",
  });
  return svg;
}
