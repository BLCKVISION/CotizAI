/** Two or three small project folders; a dashed slot keeps at least two and lets the cargador add a project. */
import { Pressable, View } from 'react-native';

import { Icono, Texto } from '@/design/componentes';
import { soloWeb } from '@/design/efectos';
import { useTema } from '@/design/tema';
import { espacio } from '@/design/tokens';
import { FolderCard } from '@/features/projects/FolderCard';
import type { Proyecto } from '@/features/proyectos/api';
import { infoEstado } from '@/features/proyectos/estados';

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

function NewFolderSlot({ onPress }: { onPress: () => void }) {
  const t = useTema();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Crear otra carpeta de proyecto"
      onPress={onPress}
      style={(e: PressState) => ({ flex: 1, minHeight: 104, alignItems: 'center', justifyContent: 'center', gap: espacio.xs, borderRadius: 22, borderWidth: 2, borderStyle: 'dashed', borderColor: e.focused ? t.foco : e.hovered ? t.accentStrong : '#CBD3DE', backgroundColor: e.hovered ? '#F0FBFE' : 'transparent', ...soloWeb({ transitionProperty: 'border-color, background-color', transitionDuration: '260ms' }) })}
    >
      <Icono nombre="folder-plus" color={t.textoSuave} />
      <Texto variante="pequeno" suave style={{ textAlign: 'center' }}>
        Nuevo proyecto
      </Texto>
    </Pressable>
  );
}

type Props = { projects: Proyecto[]; counts: Record<string, number>; canCreate: boolean; onNavigate: (path: string) => void };

export function ProjectFolders({ projects, counts, canCreate, onNavigate }: Props) {
  const recent = projects.slice(0, 3);
  const needsSlot = canCreate && recent.length < 2;
  const total = recent.length + (needsSlot ? 1 : 0);
  if (total === 0) return <Texto suave>Aún no hay proyectos.</Texto>;
  // Up to two side by side; a third folder takes a second row.
  return (
    <View style={{ flex: 1, flexDirection: total > 2 ? 'column' : 'row', gap: 12 }}>
      {recent.map((p) => (
        <View key={p.id} style={{ flex: 1, minWidth: 0 }}>
          <FolderCard
            compact
            roomy={total <= 2}
            title={p.nombre}
            count={`${counts[p.id] ?? 0} ${counts[p.id] === 1 ? 'propuesta' : 'propuestas'}`}
            footer={infoEstado(p.estado).etiqueta}
            preview={p.requerimiento}
            onPress={() => onNavigate(`/proyectos/${p.id}`)}
          />
        </View>
      ))}
      {needsSlot ? (
        <View style={{ flex: 1, minWidth: 0 }}>
          <NewFolderSlot onPress={() => onNavigate('/proyectos/nuevo')} />
        </View>
      ) : null}
    </View>
  );
}
