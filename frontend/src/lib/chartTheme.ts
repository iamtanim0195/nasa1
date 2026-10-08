import type { Theme } from '@/types';

/**
 * The one chart value CSS cannot supply.
 *
 * Plot furniture — axes, grid, ticks, tooltips — and the categorical palette are
 * themed entirely in `globals.css`. Recharts emits those colours as SVG
 * *presentation attributes*, which cannot read CSS variables, but CSS outranks
 * presentation attributes, so the charts follow the theme without a single
 * component branching on it.
 *
 * Exporting a PNG is the exception: it paints onto a canvas outside the document,
 * where there is no CSS to inherit. So the background is chosen here.
 *
 * Note what is deliberately NOT here: the severity and detection-type colours
 * (`SEVERITIES`, `DETECTION_TYPES` in `src/lib/constants.ts`). Those encode data,
 * and a hazard that is "medium" must not change hue because the interface did.
 */
export function exportBackgroundFor(theme: Theme): string {
  return theme === 'light' ? '#ffffff' : '#040711';
}
