/**
 * Gedankenfaden 9 Signature Motion Metaphor Names & CSS Classes
 */
export const SIGNATURE_MOTIONS = {
  CREATE_GROW: 'signature-create-grow',
  CONNECT_DRAW: 'signature-connect-draw',
  SELECT_BREATHE: 'signature-select-breathe',
  FOCUS_ELEVATE: 'signature-focus-elevate',
  DESELECT_RECEDE: 'signature-deselect-recede',
  MOVE_GLIDE: 'signature-move-glide',
  EXPAND_UNFOLD: 'signature-expand-unfold',
  COLLAPSE_GATHER: 'signature-collapse-gather',
  DELETE_DISSOLVE: 'signature-delete-dissolve',
} as const;

export type SignatureMotionKey = keyof typeof SIGNATURE_MOTIONS;

/**
 * Checks if the runtime environment requests reduced motion.
 */
export function isReducedMotionPreferred(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Resolves motion class name, conditionally returning an empty string if reduced motion is preferred
 * (in addition to CSS @media query enforcement).
 */
export function getMotionClass(className: string, bypassIfReduced = false): string {
  if (bypassIfReduced && isReducedMotionPreferred()) {
    return '';
  }
  return className;
}
