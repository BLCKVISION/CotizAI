/** Help bubble under an input. It floats over the page, so showing it never moves the form. */
import { type ReactNode, useState } from 'react';
import { View } from 'react-native';

import { soloWeb, vidrio } from './efectos';
import { espacio, radio } from './tokens';
import { tint } from './tema';

/** Hover state for a field wrapper. Focus is tracked by the field, which also covers touch and keyboard. */
export function useHover() {
  const [hovered, setHovered] = useState(false);
  return { hovered, hoverProps: { onPointerEnter: () => { setHovered(true); }, onPointerLeave: () => { setHovered(false); } } };
}

export function FieldHint({ visible, children }: { visible: boolean; children: ReactNode }) {
  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{ position: 'absolute', top: '100%', left: 0, minWidth: '100%', width: 300, maxWidth: 340, marginTop: 6, zIndex: 20, opacity: visible ? 1 : 0, ...soloWeb({ visibility: visible ? 'visible' : 'hidden', transitionProperty: 'opacity, transform, visibility', transitionDuration: '200ms', transform: visible ? 'translateY(0px)' : 'translateY(-4px)' }) }}
    >
      <View style={{ ...vidrio({ opacidad: 0.98, radio: radio.md, elevado: true }), borderColor: tint.navy(0.08), paddingHorizontal: espacio.sm + 4, paddingVertical: espacio.sm }}>{children}</View>
    </View>
  );
}
