/** First step of adding proposals: choose which project receives them, or create a new one. */
import { Pressable, View } from 'react-native';

import { Boton, Icono, Texto } from '@/design/componentes';
import { Lightbox } from '@/design/Lightbox';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';
import type { Proyecto } from '@/features/proyectos/api';

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
  // Only projects still collecting offers accept new files.
  const open = projects.filter((p) => p.estado === 'en_recepcion' || p.estado === 'en_revision_del_comite').sort((a, b) => b.creado.localeCompare(a.creado));
  const description = pendingFiles > 0 ? `Tiene ${pendingFiles} ${pendingFiles === 1 ? 'archivo' : 'archivos'} por cargar. Elija el proyecto.` : 'Paso 1 de 2: elija el proyecto. Después seleccione los archivos.';
  return (
    <Lightbox visible={visible} title="¿A cuál proyecto va a agregar propuestas?" description={description} onClose={onClose} maxWidth={560}>
      <View style={{ gap: espacio.sm }}>
        {open.map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            accessibilityLabel={`Agregar a ${p.nombre}`}
            onPress={() => onPick(p)}
            style={(e: PressState) => ({ flexDirection: 'row', alignItems: 'center', gap: espacio.sm + 4, padding: espacio.sm + 4, borderRadius: radio.lg, borderWidth: 2, borderColor: e.focused ? t.foco : e.hovered ? t.accentStrong : t.borde, backgroundColor: e.hovered ? '#F0FBFE' : '#FFFFFF' })}
          >
            <View style={{ width: 42, height: 42, borderRadius: radio.md, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accent }}>
              <Icono nombre="folder" color={t.onAccent} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Texto variante="etiqueta" numberOfLines={1}>
                {p.nombre}
              </Texto>
              <Texto variante="pequeno" suave numberOfLines={1}>
                {p.ubicacion} · {counts[p.id] ?? 0} {counts[p.id] === 1 ? 'propuesta' : 'propuestas'}
              </Texto>
            </View>
            <Icono nombre="chevron-right" tamano="sm" color={t.textoSuave} />
          </Pressable>
        ))}
        {open.length === 0 ? <Texto suave>Ningún proyecto está recibiendo propuestas. Cree uno nuevo.</Texto> : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
        <Boton etiqueta="Crear un proyecto nuevo" icono="folder-plus" variante="secundario" onPress={onCreate} />
      </View>
    </Lightbox>
  );
}
