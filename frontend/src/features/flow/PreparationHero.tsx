/** Before an evaluation: what is loaded and one large button. No steps here. */
import type { ReactNode } from 'react';
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
  /** Extra information under the button, such as the exchange rate. */
  children?: ReactNode;
};

export function PreparationHero({ title, detail, blocker, canEvaluate, running, elapsed, onEvaluate, onShowProcess, onBackToResult, children }: Props) {
  const t = useTema();
  return (
    <Entrada>
      <Tarjeta>
        <View style={{ gap: espacio.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.md }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', ...accentGradient(135) }}>
              <Icono nombre="cpu" tamano="md" color={t.onAccent} />
            </View>
            <Texto variante="subtitulo" accessibilityRole="header" style={{ flex: 1, fontFamily: 'Urbanist_600SemiBold' }}>
              {title}
            </Texto>
          </View>
          <Texto suave>{detail}</Texto>
          {running ? (
            <Boton large etiqueta={`Ver el proceso (${elapsed} s)`} icono="activity" onPress={onShowProcess} />
          ) : canEvaluate ? (
            <Boton large etiqueta="Evaluar Propuestas de Servicios" icono="cpu" deshabilitado={blocker !== null} onPress={onEvaluate} />
          ) : null}
          {blocker && !running ? (
            <Texto variante="pequeno" color={t.aviso.texto}>
              {blocker}
            </Texto>
          ) : null}
          {onBackToResult && !running ? <Boton etiqueta="Volver al resultado" variante="fantasma" icono="arrow-left" onPress={onBackToResult} /> : null}
          {children ? <View style={{ gap: espacio.sm, paddingTop: espacio.md, borderTopWidth: 1, borderTopColor: t.borde }}>{children}</View> : null}
        </View>
      </Tarjeta>
    </Entrada>
  );
}
