/** Collapsible timeline of how the agent decided, live. Admin only: the caller decides whether to render it. */
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Aviso } from '@/design/bloques';
import { Icono, Insignia, type NombreIcono, Texto } from '@/design/componentes';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';

import { finalDecision, formatDuration, liveLabel, totalDurationMs, type TraceEvent, type TraceEventType } from './trace';
import { useTraceStream } from './useTraceStream';

const ICONS: Record<TraceEventType, NombreIcono> = {
  hypothesis: 'info',
  tool_call: 'search',
  tool_result: 'check-square',
  reflection: 'eye',
  decision: 'award',
  final_answer: 'check-circle',
};
const TYPE_LABEL: Record<TraceEventType, string> = {
  hypothesis: 'Hipótesis',
  tool_call: 'Herramienta',
  tool_result: 'Resultado',
  reflection: 'Reflexión',
  decision: 'Decisión',
  final_answer: 'Respuesta final',
};
const COMPACT_AFTER = 8; // beyond this many steps only the latest show until the person asks for all

function Step({ event }: { event: TraceEvent }) {
  const t = useTema();
  const [open, setOpen] = useState(false);
  const failed = event.metadata.status === 'failed';
  const latency = event.metadata.latency_ms;
  return (
    <View style={{ borderRadius: radio.md, backgroundColor: t.superficieAlta, overflow: 'hidden' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${TYPE_LABEL[event.type]}: ${event.title}`}
        aria-expanded={open}
        onPress={() => setOpen((v) => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.sm, padding: espacio.sm + 2, minHeight: 44 }}
      >
        <Icono nombre={failed ? 'alert-circle' : ICONS[event.type]} tamano="sm" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Texto variante="pequeno" suave>
            {TYPE_LABEL[event.type]}
            {event.metadata.tool ? ` · ${event.metadata.tool}` : ''}
          </Texto>
          <Texto numberOfLines={open ? undefined : 1}>{event.title}</Texto>
        </View>
        {typeof latency === 'number' ? (
          <Texto variante="pequeno" suave>
            {formatDuration(latency)}
          </Texto>
        ) : null}
        <Icono nombre={open ? 'chevron-up' : 'chevron-down'} tamano="sm" />
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: espacio.sm + 2, paddingBottom: espacio.sm + 2, gap: 4 }}>
          <Texto>{event.summary || 'Sin detalle.'}</Texto>
          {event.metadata.args ? (
            <Texto variante="pequeno" suave>
              {Object.entries(event.metadata.args).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}
            </Texto>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function DecisionTimeline({ projectId, runId, active }: { projectId: string; runId: string | null; active: boolean }) {
  const t = useTema();
  const { events, state, error } = useTraceStream(projectId, runId, active && runId !== null);
  const [open, setOpen] = useState(true);
  const [all, setAll] = useState(false);
  const { final, decisions, tools } = finalDecision(events);
  const compact = !all && events.length > COMPACT_AFTER;
  const shown = compact ? events.slice(-COMPACT_AFTER) : events;
  const waiting = (state === 'connecting' || state === 'live') && events.length === 0;

  if (!runId) return null;
  return (
    <View style={{ gap: espacio.sm, padding: espacio.md, borderRadius: radio.xl, borderWidth: 1, borderColor: t.borde }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen((v) => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.sm, minHeight: 44 }}
      >
        <Icono nombre="git-branch" tamano="sm" />
        <View style={{ flex: 1 }}>
          <Texto variante="cuerpoMedio">Cómo decide el agente</Texto>
          <Texto variante="pequeno" suave aria-live="polite">
            {liveLabel(events, state)} · {events.length} pasos{events.length > 1 ? ` · ${formatDuration(totalDurationMs(events))}` : ''}
          </Texto>
        </View>
        <Icono nombre={open ? 'chevron-up' : 'chevron-down'} tamano="sm" />
      </Pressable>

      {open ? (
        <View style={{ gap: espacio.sm }}>
          {error && state !== 'ended' ? <Aviso texto={state === 'failed' ? error : `Conexión interrumpida, reintentando. ${error}`} /> : null}
          {compact ? (
            <Pressable accessibilityRole="button" onPress={() => setAll(true)}>
              <Texto variante="pequeno" suave>{`Ver los ${events.length - COMPACT_AFTER} pasos anteriores`}</Texto>
            </Pressable>
          ) : null}
          {shown.map((e) => (
            <Step key={e.id} event={e} />
          ))}
          {waiting ? <Texto suave>Esperando el primer paso…</Texto> : null}
        </View>
      ) : null}

      {final ? (
        <View style={{ gap: 4, padding: espacio.sm + 2, borderRadius: radio.md, backgroundColor: t.superficieAlta }}>
          <Insignia etiqueta={final.metadata.status === 'failed' ? 'Decisión final: no completada' : 'Decisión final'} tono={final.metadata.status === 'failed' ? 'aviso' : 'exito'} />
          <Texto>{final.summary}</Texto>
          <Texto variante="pequeno" suave>
            {`Respaldada por ${decisions.length} decisión(es)${tools.length ? ` y las herramientas: ${tools.join(', ')}` : ''}.`}
          </Texto>
        </View>
      ) : null}
    </View>
  );
}
