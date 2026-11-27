import { Pressable, ScrollView, View } from 'react-native';

import { Boton, Icono, type NombreIcono, Texto } from '@/design/componentes';
import { soloWeb } from '@/design/efectos';
import { innerSurface, Panel } from '@/design/Panel';
import { RollingLabel } from '@/design/RollingLabel';
import { useTema } from '@/design/tema';
import { espacio, radio, texto } from '@/design/tokens';

import type { Task, TaskKind } from './tasks';

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

const ICONS: Record<TaskKind, NombreIcono> = { upload: 'upload-cloud', evaluate: 'cpu', review: 'search', decide: 'award', close: 'lock', consult: 'eye' };

function TaskRow({ task, onPress, last }: { task: Task; onPress: () => void; last: boolean }) {
  const t = useTema();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${task.title}. ${task.detail}`}
      onPress={onPress}
      style={(e: PressState) => ({ flexDirection: 'row', alignItems: 'center', gap: espacio.sm + 2, minHeight: 56, paddingHorizontal: espacio.sm, borderRadius: radio.md, borderWidth: 2, borderColor: e.focused ? t.foco : 'transparent', borderBottomColor: e.focused ? t.foco : last ? 'transparent' : t.borde, backgroundColor: e.hovered || e.pressed ? t.superficieAlta : 'transparent', ...soloWeb({ transitionProperty: 'background-color', transitionDuration: '200ms' }) })}
    >
      {({ hovered }: PressState) => (
        <>
          <View style={{ width: 34, height: 34, borderRadius: radio.pildora, alignItems: 'center', justifyContent: 'center', backgroundColor: t.superficieAlta }}>
            <Icono nombre={ICONS[task.kind]} tamano="sm" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Texto variante="etiqueta" numberOfLines={1}>
              {task.title}
            </Texto>
            <Texto variante="pequeno" suave numberOfLines={1}>
              {task.detail}
            </Texto>
          </View>
          <View style={{ minHeight: 32, justifyContent: 'center', paddingHorizontal: espacio.sm + 4, borderRadius: radio.pildora, backgroundColor: hovered ? t.primario : t.accent, ...soloWeb({ transitionProperty: 'background-color', transitionDuration: '220ms' }) }}>
            <RollingLabel text={task.action} active={Boolean(hovered)} style={{ ...texto.etiqueta, color: hovered ? '#FFFFFF' : t.onAccent }} />
          </View>
        </>
      )}
    </Pressable>
  );
}

type Props = { tasks: Task[]; hasProjects: boolean; canCreate: boolean; onOpen: (path: string) => void; onCreate: () => void };

/** What is pending for this person. Every row names the project and what will be done there. */
export function TodoCard({ tasks, hasProjects, canCreate, onOpen, onCreate }: Props) {
  const subtitle = tasks.length === 0 ? 'Nada pendiente para usted' : `${tasks.length} ${tasks.length === 1 ? 'pendiente' : 'pendientes'} · cada botón abre su proyecto`;
  return (
    <Panel title="Tareas pendientes" subtitle={subtitle}>
      <View style={innerSurface}>
        {tasks.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: espacio.sm, padding: espacio.md }}>
            <Icono nombre="check-circle" />
            <Texto variante="pequeno" suave style={{ textAlign: 'center' }}>
              {hasProjects ? 'Está al día. Aquí aparecerá lo que le toque hacer.' : 'Todavía no hay proyectos.'}
            </Texto>
            {!hasProjects && canCreate ? <Boton etiqueta="Crear el primer proyecto" icono="plus" onPress={onCreate} /> : null}
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: espacio.xs, paddingVertical: espacio.xs }}>
            {tasks.map((task, i) => (
              <TaskRow key={`${task.projectId}-${task.kind}`} task={task} last={i === tasks.length - 1} onPress={() => onOpen(task.path)} />
            ))}
          </ScrollView>
        )}
      </View>
    </Panel>
  );
}
