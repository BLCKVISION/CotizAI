/** Animated view of a running evaluation. Progress is an estimate and says so; the closing figures are real. */
import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { Aviso } from '@/design/bloques';
import { Boton, Icono, Insignia, type NombreIcono, Texto } from '@/design/componentes';
import { accentGradient, Entrada, soloWeb, useReducirMovimiento } from '@/design/efectos';
import { Lightbox } from '@/design/Lightbox';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';

import type { ProjectEvaluation } from './api';
import { estimateProgress, STAGES } from './progress';

const STAGE_ICONS: NombreIcono[] = ['file-text', 'percent', 'check-square', 'dollar-sign', 'award'];
const FILE_ICONS: Record<string, NombreIcono> = { pdf: 'file-text', jpg: 'image', jpeg: 'image', png: 'message-square', xlsx: 'grid' };
const iconFor = (name: string) => FILE_ICONS[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'file';

function useLoop(active: boolean, duration: number, delay = 0) {
  const reduce = useReducirMovimiento();
  const [value] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active || reduce) return;
    value.setValue(0);
    const loop = Animated.loop(Animated.sequence([Animated.delay(delay), Animated.timing(value, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: false })]));
    loop.start();
    return () => loop.stop();
  }, [active, reduce, value, duration, delay]);
  return value;
}

/** A document being examined: a light bar runs down it. */
function ScannedFile({ name, index, active }: { name: string; index: number; active: boolean }) {
  const t = useTema();
  const scan = useLoop(active, 1700, (index % 5) * 220);
  return (
    <View accessible accessibilityLabel={name} {...({ title: name } as object)} style={{ width: 52, height: 62, borderRadius: radio.md, alignItems: 'center', justifyContent: 'center', gap: 2, overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: t.borde }}>
      <Icono nombre={iconFor(name)} tamano="sm" />
      <Texto suave style={{ fontSize: 10, lineHeight: 12 }}>
        {(name.split('.').pop() ?? '').toUpperCase()}
      </Texto>
      {active ? (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, height: 18, top: scan.interpolate({ inputRange: [0, 1], outputRange: [-20, 64] }), ...soloWeb({ backgroundImage: 'linear-gradient(180deg, rgba(147,228,244,0) 0%, rgba(147,228,244,0.75) 50%, rgba(147,228,244,0) 100%)' }) }} />
      ) : null}
    </View>
  );
}

function StageRow({ index, current, finished }: { index: number; current: number; finished: boolean }) {
  const t = useTema();
  const done = finished || index < current;
  const active = !finished && index === current;
  const pulse = useLoop(active, 1200);
  return (
    <View accessible accessibilityLabel={`${STAGES[index].label}: ${done ? 'listo' : active ? 'en curso (estimado)' : 'pendiente'}`} style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.sm + 4, minHeight: 46, opacity: done || active ? 1 : 0.45 }}>
      <View style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
        {active ? (
          <Animated.View style={{ position: 'absolute', width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: t.accentStrong, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }] }} />
        ) : null}
        <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? t.accent : active ? '#FFFFFF' : t.superficieAlta, borderWidth: active ? 2 : 0, borderColor: t.accentStrong }}>
          <Icono nombre={done ? 'check' : STAGE_ICONS[index]} tamano="sm" color={done ? t.onAccent : t.texto} />
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <Texto variante="etiqueta">{STAGES[index].label}</Texto>
        <Texto variante="pequeno" suave>
          {STAGES[index].detail}
        </Texto>
      </View>
    </View>
  );
}

function Figures({ evaluation }: { evaluation: ProjectEvaluation }) {
  if (evaluation.restricted) {
    return <Aviso tono="exito" texto={`Se evaluaron ${evaluation.evaluated_count} propuestas. Los veredictos los ve el comité (evaluador, aprobador o auditor).`} />;
  }
  const count = (verdict: string) => evaluation.items.filter((i) => i.verdict === verdict).length;
  const best = evaluation.items.find((i) => i.verdict === 'valida');
  return (
    <View style={{ gap: espacio.sm }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm }}>
        <Insignia etiqueta={`Válidas: ${count('valida')}`} tono="exito" icono="check-circle" />
        <Insignia etiqueta={`Pendientes: ${count('pendiente_de_revision')}`} tono="aviso" icono="alert-circle" />
        <Insignia etiqueta={`Descartadas: ${count('descartada')}`} tono="error" icono="x-circle" />
      </View>
      <Texto>{best ? `Mejor propuesta: ${best.supplier ?? best.filename}` : 'Ninguna propuesta resultó válida: revise los hallazgos.'}</Texto>
    </View>
  );
}

type Props = {
  visible: boolean;
  running: boolean;
  elapsed: number;
  files: string[];
  evaluation: ProjectEvaluation | null;
  error: string | null;
  onClose: () => void;
};

export function EvaluationProcess({ visible, running, elapsed, files, evaluation, error, onClose }: Props) {
  const t = useTema();
  const progress = estimateProgress(elapsed, files.length);
  const failed = !running && error !== null;
  const finished = !running && !failed && evaluation !== null;
  const percent = finished ? 100 : progress.percent;
  const title = failed ? 'No se pudo completar la evaluación' : finished ? 'Evaluación completada' : 'El agente está evaluando';
  const description = failed
    ? 'No se guardó ningún resultado nuevo.'
    : finished
      ? `Resultado real recibido del servidor en ${elapsed} s.`
      : progress.overdue
        ? `${elapsed} s · está tardando más de lo estimado, seguimos esperando al servidor.`
        : `${elapsed} s transcurridos · quedan unos ${progress.remainingSeconds} s (estimado).`;

  return (
    <Lightbox visible={visible} title={title} description={description} onClose={onClose} maxWidth={720}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.md }}>
        <View accessibilityRole="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} style={{ flex: 1, height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: t.superficieAlta }}>
          <View style={{ height: 12, borderRadius: 6, width: `${failed ? 0 : percent}%`, ...accentGradient(90), ...soloWeb({ transitionProperty: 'width', transitionDuration: '900ms', transitionTimingFunction: 'linear' }) }} />
        </View>
        <View style={{ minWidth: 92, alignItems: 'flex-end' }}>
          <Texto variante="subtitulo">{failed ? '—' : `${percent} %`}</Texto>
          {running ? (
            <Texto variante="pequeno" suave>
              estimado
            </Texto>
          ) : null}
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm, justifyContent: 'center', padding: espacio.sm + 4, borderRadius: radio.xl, backgroundColor: t.superficieAlta }}>
        {files.map((name, i) => (
          <ScannedFile key={`${i}-${name}`} name={name} index={i} active={running} />
        ))}
      </View>

      {failed ? (
        <Aviso texto={error ?? ''} />
      ) : (
        <View style={{ gap: 4 }}>
          {STAGES.map((stage, i) => (
            <StageRow key={stage.id} index={i} current={progress.stage} finished={finished} />
          ))}
        </View>
      )}

      {finished && evaluation ? (
        <Entrada>
          <Figures evaluation={evaluation} />
        </Entrada>
      ) : null}
      {running ? (
        <Texto variante="pequeno" suave>
          El servidor responde al terminar, así que las etapas y el porcentaje son una estimación. No cierre la pestaña del navegador.
        </Texto>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Boton etiqueta={running ? 'Seguir en segundo plano' : finished ? 'Ver resultados' : 'Cerrar'} variante={running ? 'secundario' : 'primario'} icono={finished ? 'arrow-right' : undefined} onPress={onClose} />
      </View>
    </Lightbox>
  );
}
