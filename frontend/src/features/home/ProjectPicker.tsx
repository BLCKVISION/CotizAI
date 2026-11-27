/** First step of adding proposals: choose which project receives them, or create a new one. */
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Boton, Icono, Texto } from '@/design/componentes';
import { Lightbox } from '@/design/Lightbox';
import { NewItemTile } from '@/design/NewItemTile';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';
import type { Proyecto } from '@/features/proyectos/api';

const FIRST_PAGE = 6;

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

type Props = {
  visible: boolean;
  projects: Proyecto[];
  counts: Record<string, number>;
  /** Files already dropped on Home, waiting for a destination. */
  pendingFiles: number;
  onPick: (project: Proyecto) => void;
  onCreate: () => void;
  onClose: () => void;
};

export function ProjectPicker({ visible, projects, counts, pendingFiles, onPick, onCreate, onClose }: Props) {
  const t = useTema();
  const [all, setAll] = useState(false);
  // Only projects still collecting offers accept new files.
  const open = projects.filter((p) => p.estado === 'en_recepcion' || p.estado === 'en_revision_del_comite').sort((a, b) => b.creado.localeCompare(a.creado));
  const shown = all ? open : open.slice(0, FIRST_PAGE);
  const description = pendingFiles > 0 ? `Tiene ${pendingFiles} ${pendingFiles === 1 ? 'archivo' : 'archivos'} por cargar. Elija el proyecto.` : 'Paso 1 de 2: elija el proyecto. Después seleccione los archivos.';
  return (
    <Lightbox visible={visible} title="¿A cuál proyecto va a agregar propuestas?" description={description} onClose={onClose} maxWidth={640}>
      {/* Square folders, three to a row; the last tile always creates a new project. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm }}>
        {shown.map((p) => (
          <View key={p.id} style={{ flexBasis: '31%', flexGrow: 1, aspectRatio: 1, minWidth: 130 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Agregar a ${p.nombre}`}
              onPress={() => onPick(p)}
              style={(e: PressState) => ({ flex: 1, alignItems: 'center', justifyContent: 'center', gap: espacio.xs, padding: espacio.sm, borderRadius: 22, borderWidth: 2, borderColor: e.focused ? t.foco : e.hovered ? t.accentStrong : t.borde, backgroundColor: e.hovered ? '#F0FBFE' : '#FFFFFF' })}
            >
              <View style={{ width: 48, height: 48, borderRadius: radio.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accent }}>
                <Icono nombre="folder" color={t.onAccent} />
              </View>
              <Texto variante="etiqueta" numberOfLines={2} style={{ textAlign: 'center' }}>
                {p.nombre}
              </Texto>
              <Texto variante="pequeno" suave numberOfLines={1}>
                {counts[p.id] ?? 0} {counts[p.id] === 1 ? 'propuesta' : 'propuestas'}
              </Texto>
            </Pressable>
          </View>
        ))}
        <View style={{ flexBasis: '31%', flexGrow: 1, aspectRatio: 1, minWidth: 130 }}>
          <NewItemTile label="Crear proyecto nuevo" icon="folder-plus" onPress={onCreate} />
        </View>
      </View>
      {open.length > FIRST_PAGE ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
          <Boton etiqueta={all ? 'Ver menos' : `Ver más (${open.length - FIRST_PAGE})`} icono={all ? 'chevron-up' : 'chevron-down'} variante="secundario" onPress={() => setAll((v) => !v)} />
        </View>
      ) : null}
      {open.length === 0 ? <Texto suave>Ningún proyecto está recibiendo propuestas. Cree uno nuevo.</Texto> : null}
    </Lightbox>
  );
}
