import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';

import { useDatos } from '@/core/useDatos';
import { listarProyectosApi } from '@/features/proyectos/api';

import { BotonIcono, Icono, Texto } from './componentes';
import { soloWeb, vidrio } from './efectos';
import { useTema } from './tema';
import { espacio, radio, texto } from './tokens';

function Results({ query, onPick }: { query: string; onPick: (id: string) => void }) {
  const t = useTema();
  const { datos, error } = useDatos(listarProyectosApi);
  if (error) return <Texto color={t.error.texto}>{error}</Texto>;
  if (!datos) return <Texto suave>Buscando…</Texto>;
  const q = query.trim().toLowerCase();
  const found = datos.filter((p) => `${p.nombre} ${p.ubicacion}`.toLowerCase().includes(q)).slice(0, 8);
  if (found.length === 0) return <Texto suave>Sin coincidencias.</Texto>;
  return (
    <ScrollView style={{ maxHeight: 320 }}>
      {found.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="link"
          accessibilityLabel={p.nombre}
          onPress={() => onPick(p.id)}
          style={(e: { pressed: boolean; hovered?: boolean }) => ({ padding: espacio.md, borderRadius: radio.md, backgroundColor: e.hovered || e.pressed ? t.superficieAlta : 'transparent' })}
        >
          <Texto variante="etiqueta">{p.nombre}</Texto>
          <Texto variante="pequeno" suave>
            {p.ubicacion}
          </Texto>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** Quick project search opened from the top bar. */
export function SearchOverlay({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTema();
  const router = useRouter();
  const [query, setQuery] = useState('');
  if (!visible) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, alignItems: 'center', paddingTop: 96, paddingHorizontal: espacio.md }}>
        <Pressable accessibilityLabel="Cerrar búsqueda" onPress={onClose} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(15,23,42,0.28)', ...soloWeb({ backdropFilter: 'blur(6px)' }) }} />
        <View style={{ ...vidrio({ opacidad: 0.97, radio: radio.panel }), width: '100%', maxWidth: 560, padding: espacio.md, gap: espacio.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.sm }}>
            <Icono nombre="search" color={t.textoSuave} />
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar proyecto por nombre o ubicación"
              placeholderTextColor={t.textoSuave}
              accessibilityLabel="Buscar proyecto"
              style={{ ...texto.cuerpo, flex: 1, color: t.texto, minHeight: 44, outlineWidth: 0 }}
            />
            <BotonIcono nombre="x" etiqueta="Cerrar" onPress={onClose} />
          </View>
          <Results
            query={query}
            onPick={(id) => {
              onClose();
              setQuery('');
              router.push(`/proyectos/${id}` as Href);
            }}
          />
        </View>
      </View>
    </Modal>
  );
}
