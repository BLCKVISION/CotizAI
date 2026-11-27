/** Dashed "add" tile: the first slot of a grid, or the whole area when there is nothing else. */
import { Pressable, View } from 'react-native';

import { Icono, type NombreIcono } from './componentes';
import { soloWeb } from './efectos';
import { isKeyboardFocus } from './focusModality';
import { RollingLabel } from './RollingLabel';
import { swatch, tint, useTema } from './tema';
import { espacio, radio, texto } from './tokens';

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

export function NewItemTile({ label, icon, onPress, minHeight = 104 }: { label: string; icon: NombreIcono; onPress: () => void; minHeight?: number }) {
  const t = useTema();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={(e: PressState) => ({ flex: 1, minHeight, alignItems: 'center', justifyContent: 'center', gap: espacio.sm, padding: espacio.sm, borderRadius: 22, borderWidth: 2, borderStyle: 'dashed', borderColor: isKeyboardFocus(e.focused) ? t.foco : e.hovered ? t.accentStrong : swatch.gray300, backgroundColor: e.hovered ? swatch.ice50 : tint.white(0.5), ...soloWeb({ transitionProperty: 'border-color, background-color', transitionDuration: '260ms' }) })}
    >
      {({ hovered }: PressState) => (
        <>
          <View style={{ width: 48, height: 48, borderRadius: radio.pildora, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? t.accent : t.superficieAlta, ...soloWeb({ transitionProperty: 'transform, background-color', transitionDuration: '320ms', transform: hovered ? 'scale(1.1)' : 'scale(1)' }) }}>
            <Icono nombre={icon} color={hovered ? t.onAccent : t.textoSuave} />
          </View>
          <RollingLabel text={label} active={Boolean(hovered)} style={{ ...texto.etiqueta, color: t.textoSuave, textAlign: 'center' }} />
        </>
      )}
    </Pressable>
  );
}
