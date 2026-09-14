export interface RectBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface SizeBounds {
  width: number;
  height: number;
}

export interface ViewportBounds {
  width: number;
  height: number;
}

export interface SubmenuPlacement {
  horizontal: 'left' | 'right';
  topOffset: number;
}

export const CONTEXT_SUBMENU_SIZES = {
  topic: { width: 176, height: 96 },
  media: { width: 224, height: 260 },
  numbering: { width: 192, height: 210 },
  collapse: { width: 192, height: 96 },
  expand: { width: 192, height: 96 },
  selection: { width: 208, height: 96 },
  delete: { width: 208, height: 96 },
  canvasSelect: { width: 176, height: 48 },
  expandTo: { width: 176, height: 216 },
} as const;

export type ContextSubmenuKey = keyof typeof CONTEXT_SUBMENU_SIZES;

export function computeSubmenuPlacement(
  trigger: RectBounds,
  submenu: SizeBounds,
  viewport: ViewportBounds,
  overlap = 4
): SubmenuPlacement {
  const fitsRight = trigger.right - overlap + submenu.width <= viewport.width;
  const fitsLeft = trigger.left + overlap - submenu.width >= 0;
  const horizontal = fitsRight || (!fitsLeft && viewport.width - trigger.right >= trigger.left)
    ? 'right'
    : 'left';

  const alignedTop = trigger.top;
  const alignedBottom = trigger.bottom - submenu.height;
  const submenuTop = alignedTop + submenu.height <= viewport.height
    ? alignedTop
    : Math.max(0, alignedBottom);

  return {
    horizontal,
    topOffset: submenuTop - trigger.top,
  };
}
