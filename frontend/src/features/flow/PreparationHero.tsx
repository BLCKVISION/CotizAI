/** Before an evaluation: what is loaded and one large button. No steps here. */
import { View } from 'react-native';

import { Boton, Icono, Tarjeta, Texto } from '@/design/componentes';
import { accentGradient, Entrada } from '@/design/efectos';
import { useTema } from '@/design/tema';
import { espacio } from '@/design/tokens';

type Props = {
  title: string;
  detail: string;
  /** Why it cannot start; null when it can. */
  blocker: string | null;
  canEvaluate: boolean;
  running: boolean;
  elapsed: number;
  onEvaluate: () => void;
  onShowProcess: () => void;
  onBackToResult?: () => void;
};

export function PreparationHero({ title, detail, blocker, canEvaluate, running, elapsed, onEvaluate, onShowProcess, onBackToResult }: Props) {
  const t = useTema();
  return (
    <Entrada>
      <Tarjeta>
        <View style={{ alignItems: 'center', gap: espacio.md, paddingVertical: espacio.md }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', ...accentGradient(135) }}>
            <Icono nombre="cpu" tamano="lg" color={t.onAccent} />
          </View>
          <View style={{ alignItems: 'center', gap: espacio.xs, maxWidth: 560 }}>
            <Texto variante="titulo" accessibilityRole="header" style={{ fontFamily: 'Urbanist_600SemiBold', textAlign: 'center' }}>
              {title}
            </Texto>
            <Texto suave style={{ textAlign: 'center' }}>
              {detail}
            </Texto>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: espacio.sm }}>
            {running ? (
              <Boton large etiqueta={`Ver el proceso (${elapsed} s)`} icono="activity" onPress={onShowProcess} />
            ) : canEvaluate ? (
              <Boton large etiqueta="Evaluar" icono="cpu" deshabilitado={blocker !== null} onPress={onEvaluate} />
            ) : null}
          </View>
          {blocker && !running ? (
            <Texto variante="pequeno" color={t.aviso.texto} style={{ textAlign: 'center' }}>
              {blocker}
            </Texto>
          ) : null}
          {onBackToResult && !running ? <Boton etiqueta="Volver al resultado" variante="fantasma" icono="arrow-left" onPress={onBackToResult} /> : null}
        </View>
      </Tarjeta>
    </Entrada>
  );
}
