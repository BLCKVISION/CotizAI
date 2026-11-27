import { createElement } from 'react';

import { type IconPath, SVG_ICONS, type SvgIconName } from './paths';

/** Web renderer for the project's own icons. Native callers fall back to their font icons. */
export function SvgIcon({ name, size, color }: { name: SvgIconName; size: number; color: string }) {
  const paths: IconPath[] = SVG_ICONS[name];
  return createElement(
    'svg',
    { width: size, height: size, viewBox: '0 0 24 24', fill: color, 'aria-hidden': true, focusable: false, style: { display: 'block', flexShrink: 0 } },
    paths.map((p, i) => createElement('path', { key: i, d: p.d, fillRule: p.evenOdd ? 'evenodd' : undefined, clipRule: p.evenOdd ? 'evenodd' : undefined })),
  );
}
