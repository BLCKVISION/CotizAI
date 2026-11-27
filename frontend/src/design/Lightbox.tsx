/** Centred dialog over a blurred backdrop, used for short creation forms. */
import { type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import { BotonIcono, Texto } from './componentes';
import { Entrada, soloWeb } from './efectos';
import { espacio, radio } from './tokens';
import { swatch, tint } from './tema';

type Props = { visible: boolean; title: string; description?: string; onClose: () => void; maxWidth?: number; children: ReactNode };

export function Lightbox({ visible, title, description, onClose, maxWidth = 640, children }: Props) {
  if (!visible) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: espacio.md }}>
        <Pressable
          accessibilityLabel="Cerrar ventana"
          onPress={onClose}
          tabIndex={-1}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: tint.navy(0.34), ...soloWeb({ backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }) }}
        />
        <Entrada estilo={{ width: '100%', maxWidth, maxHeight: '100%' }}>
          <View accessibilityViewIsModal style={{ maxHeight: '100%', flexShrink: 1, backgroundColor: swatch.white, borderRadius: radio.panel, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: espacio.md, paddingHorizontal: espacio.lg, paddingTop: espacio.lg, paddingBottom: espacio.sm }}>
              <View style={{ flex: 1, gap: espacio.xs }}>
                <Texto variante="subtitulo" accessibilityRole="header" style={{ fontFamily: 'Urbanist_600SemiBold', fontSize: 22, lineHeight: 28 }}>
                  {title}
                </Texto>
                {description ? <Texto suave>{description}</Texto> : null}
              </View>
              <BotonIcono nombre="x" etiqueta="Cerrar" onPress={onClose} />
            </View>
            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ padding: espacio.lg, paddingTop: espacio.sm, gap: espacio.md }} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          </View>
        </Entrada>
      </View>
    </Modal>
  );
}
