/** Questions in natural language, answered by the server only from the evaluated documents, with citations. */
import { useState } from 'react';
import { View } from 'react-native';

import { useSesion } from '@/core/sesion/SesionProvider';
import { mensajeDeError } from '@/core/useDatos';
import { Aviso } from '@/design/bloques';
import { CollapsibleCard } from '@/design/Collapsible';
import { Boton, CampoDeTexto, Chip, Texto } from '@/design/componentes';
import { espacio } from '@/design/tokens';

import { type Answer, askProjectApi } from './api';

const SUGGESTIONS = [
  '¿Por qué esta propuesta quedó primera?',
  '¿Qué garantía ofrece cada proveedor?',
  '¿Qué propuestas tienen cargos adicionales?',
];

export function AskCard({ projectId }: { projectId: string }) {
  const { conSesion } = useSesion();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const ask = async (text: string) => {
    if (asking || text.trim().length < 3) return;
    setQuestion(text);
    setAsking(true);
    setError(null);
    setAnswer(null);
    try {
      setAnswer(await conSesion(askProjectApi(projectId, text.trim())));
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setAsking(false);
    }
  };

  return (
    <CollapsibleCard title="Pregunte sobre las propuestas" detail="Respuestas con cita de los documentos">
      <Texto>
        ¡Hola! Soy Coti, el asistente de CotizAI, y te ayudo a analizar las cotizaciones de este proyecto: costos, descartes y
        ranking. ¿Qué necesitas saber?
      </Texto>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm }}>
        {SUGGESTIONS.map((s) => (
          <Chip key={s} etiqueta={s} seleccionado={false} onPress={() => void ask(s)} />
        ))}
      </View>
      <CampoDeTexto etiqueta="Su pregunta" value={question} onChangeText={setQuestion} maxLength={500} onSubmitEditing={() => void ask(question)} />
      <Boton etiqueta="Preguntar" icono="send" cargando={asking} deshabilitado={question.trim().length < 3} onPress={() => void ask(question)} />
      {error ? <Aviso texto={error} /> : null}
      {answer ? (
        <View accessibilityLiveRegion="polite" style={{ gap: espacio.sm }}>
          <Texto>{answer.answer}</Texto>
          {answer.citations.length === 0 ? (
            <Aviso tono="aviso" texto="La respuesta no cita ninguna fuente: verifíquela antes de usarla." />
          ) : (
            answer.citations.map((c) => (
              <Texto key={c.number} variante="pequeno" suave>
                [{c.number}] {c.filename}: «{c.excerpt}»
              </Texto>
            ))
          )}
        </View>
      ) : null}
    </CollapsibleCard>
  );
}
