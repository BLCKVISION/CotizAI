/** The proposal's document as a small tile: it opens the readable text only when someone asks for it. */
import { Pressable, View } from 'react-native';

import { Icono, Texto } from '@/design/componentes';
import { swatch, useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

export function DocumentTile({ filename, onOpen }: { filename: string; onOpen: () => void }) {
  const t = useTema();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver el documento ${filename}`}
      onPress={onOpen}
      style={(e: PressState) => ({ flexDirection: 'row', alignItems: 'center', gap: espacio.md, padding: espacio.md, borderRadius: radio.xl, borderWidth: 2, borderColor: e.focused ? t.foco : 'transparent', backgroundColor: e.hovered ? t.superficieAlta : swatch.white })}
    >
      <View style={{ width: 48, height: 48, borderRadius: radio.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: t.superficieAlta }}>
        <Icono nombre="file-text" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texto variante="cuerpoMedio" style={{ fontFamily: 'Urbanist_600SemiBold' }}>Documento</Texto>
        <Texto variante="pequeno" suave numberOfLines={1}>{filename}</Texto>
      </View>
      <Icono nombre="arrow-right" tamano="sm" />
    </Pressable>
  );
}
