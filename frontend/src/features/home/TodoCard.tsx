import { type ReactNode, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Boton, Icono, type NombreIcono, Texto } from '@/design/componentes';
import { soloWeb } from '@/design/efectos';
import { innerSurface, Panel } from '@/design/Panel';
import { RollingLabel } from '@/design/RollingLabel';
import { swatch, tint, useTema } from '@/design/tema';
import { espacio, radio, texto } from '@/design/tokens';
import { formatMoney } from '@/core/evaluationFormat';

import type { Task, TaskKind } from './tasks';
import type { VerifiedProposal } from './verified';

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
            <RollingLabel text={task.action} active={Boolean(hovered)} style={{ ...texto.etiqueta, color: hovered ? swatch.white : t.onAccent }} />
          </View>
        </>
      )}
    </Pressable>
  );
}

const VERDICT_LOOK: Record<VerifiedProposal['verdict'], { label: string; icon: NombreIcono; tone: 'exito' | 'error' | 'aviso' }> = {
  valida: { label: 'Válida', icon: 'check', tone: 'exito' },
  descartada: { label: 'Descartada', icon: 'x', tone: 'error' },
  pendiente_de_revision: { label: 'Por revisar', icon: 'alert-circle', tone: 'aviso' },
};

function VerifiedRow({ row, onPress, last }: { row: VerifiedProposal; onPress: () => void; last: boolean }) {
  const t = useTema();
  const look = VERDICT_LOOK[row.verdict];
  const tone = t[look.tone];
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${row.title}, ${look.label}, ${row.projectName}`}
      onPress={onPress}
      style={(e: PressState) => ({ flexDirection: 'row', alignItems: 'center', gap: espacio.sm + 2, minHeight: 52, paddingHorizontal: espacio.sm, borderRadius: radio.md, borderWidth: 2, borderColor: e.focused ? t.foco : 'transparent', borderBottomColor: e.focused ? t.foco : last ? 'transparent' : t.borde, backgroundColor: e.hovered || e.pressed ? t.superficieAlta : 'transparent', ...soloWeb({ transitionProperty: 'background-color', transitionDuration: '200ms' }) })}
    >
      <View style={{ width: 30, height: 30, borderRadius: radio.pildora, alignItems: 'center', justifyContent: 'center', backgroundColor: tone.fondo }}>
        <Icono nombre={look.icon} tamano="sm" color={tone.texto} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texto variante="etiqueta" numberOfLines={1}>
          {row.title}
        </Texto>
        <Texto variante="pequeno" suave numberOfLines={1}>
          {row.projectName}
        </Texto>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Texto variante="etiqueta" color={tone.texto}>
          {look.label}
        </Texto>
        {row.cost !== null ? (
          <Texto variante="pequeno" suave>
            {formatMoney(row.cost, row.currency)}
          </Texto>
        ) : null}
      </View>
    </Pressable>
  );
}

function Tab({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const t = useTema();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      aria-selected={selected}
      onPress={onPress}
      style={(e: PressState) => ({ minHeight: 34, justifyContent: 'center', paddingHorizontal: espacio.sm + 4, borderRadius: radio.pildora, borderWidth: 2, borderColor: e.focused ? t.foco : 'transparent', backgroundColor: selected ? t.primario : e.hovered ? swatch.white : tint.white(0.65) })}
    >
      <Texto variante="etiqueta" color={selected ? swatch.white : t.texto}>
        {label}
      </Texto>
    </Pressable>
  );
}

function Empty({ icon, text, children }: { icon: NombreIcono; text: string; children?: ReactNode }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: espacio.sm, padding: espacio.md }}>
      <Icono nombre={icon} />
      <Texto variante="pequeno" suave style={{ textAlign: 'center' }}>
        {text}
      </Texto>
      {children}
    </View>
  );
}

type Props = {
  tasks: Task[];
  verified: VerifiedProposal[] | null;
  verifiedError: string | null;
  canSeeResults: boolean;
  hasProjects: boolean;
  canCreate: boolean;
  onOpen: (path: string) => void;
  onCreate: () => void;
};

/** Latest verified proposals, with this person's pending tasks one tab away. */
export function TodoCard({ tasks, verified, verifiedError, canSeeResults, hasProjects, canCreate, onOpen, onCreate }: Props) {
  // Roles that cannot read results start on what they can act on.
  const [tab, setTab] = useState<'verified' | 'tasks'>(canSeeResults ? 'verified' : 'tasks');
  const showingVerified = tab === 'verified';
  return (
    <Panel
      header={
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', gap: espacio.sm, paddingLeft: espacio.sm + 2, paddingTop: 2 }}>
          <Texto variante="cuerpoMedio" accessibilityRole="header" numberOfLines={1} style={{ fontFamily: 'Urbanist_600SemiBold', flexShrink: 1 }}>
            {showingVerified ? 'Últimas verificadas' : 'Tareas pendientes'}
          </Texto>
          <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 6 }}>
            <Tab label="Verificadas" selected={showingVerified} onPress={() => setTab('verified')} />
            <Tab label={tasks.length > 0 ? `Pendientes ${tasks.length}` : 'Pendientes'} selected={!showingVerified} onPress={() => setTab('tasks')} />
          </View>
        </View>
      }
    >
      <View style={innerSurface}>
        {showingVerified ? (
          !canSeeResults ? (
            <Empty icon="shield" text="Los veredictos los ve el comité: evaluador, aprobador o auditor." />
          ) : verifiedError ? (
            <Empty icon="alert-triangle" text={verifiedError} />
          ) : verified === null ? (
            <Empty icon="clock" text="Cargando…" />
          ) : verified.length === 0 ? (
            <Empty icon="search" text="Aún no hay propuestas verificadas. Aparecerán al evaluar un proyecto." />
          ) : (
            <ScrollView contentContainerStyle={{ paddingHorizontal: espacio.xs, paddingVertical: espacio.xs }}>
              {verified.map((row, i) => (
                <VerifiedRow key={row.id} row={row} last={i === verified.length - 1} onPress={() => onOpen(`/proyectos/${row.projectId}`)} />
              ))}
            </ScrollView>
          )
        ) : tasks.length === 0 ? (
          <Empty icon="check-circle" text={hasProjects ? 'Está al día. Aquí aparecerá lo que le toque hacer.' : 'Todavía no hay proyectos.'}>
            {!hasProjects && canCreate ? <Boton etiqueta="Crear el primer proyecto" icono="plus" onPress={onCreate} /> : null}
          </Empty>
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
