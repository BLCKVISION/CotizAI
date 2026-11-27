/** The proposal as Markdown, next to its evaluation, with the problematic parts marked. */
import { View } from 'react-native';

import { useDatos } from '@/core/useDatos';
import { Cargando, ErrorConReintento } from '@/design/bloques';
import { Icono, Texto } from '@/design/componentes';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';
import { type Propuesta, proposalMarkdownApi } from '@/features/gestion/api';
import { type Bloque, bloquesDeMarkdown } from '@/features/transcripcion/markdown';
import { BloqueVista } from '@/features/transcripcion/Vista';

import { splitHighlights } from './flow';

const HIDDEN_TITLE = 'Texto oculto detectado';

export function DocumentPanel({ projectId, proposalId, filename, terms }: { projectId: string; proposalId: Propuesta['id']; filename: string; terms: string[] }) {
  const t = useTema();
  const { datos, error, recargar } = useDatos(proposalMarkdownApi(projectId, proposalId), proposalId);
  const split = (value: string) => splitHighlights(value, terms).map((f) => ({ texto: f.text, incierto: f.marked }));
  const blocks = datos ? bloquesDeMarkdown(datos.markdown) : [];
  const cut = blocks.findIndex((b) => b.tipo === 'titulo' && b.texto === HIDDEN_TITLE);
  const visible = cut < 0 ? blocks : blocks.slice(0, cut);
  const hidden = cut < 0 ? [] : blocks.slice(cut + 1);
  const draw = (list: Bloque[]) => list.map((block, i) => <BloqueVista key={i} bloque={block} inciertos={[]} partir={split} minimoDeColumna={64} />);

  return (
    <View style={{ gap: espacio.md, padding: espacio.lg, borderRadius: radio.xl, backgroundColor: '#FFFFFF' }}>
      <View style={{ gap: 2 }}>
        <Texto variante="subtitulo" accessibilityRole="header">
          Documento
        </Texto>
        <Texto variante="pequeno" suave numberOfLines={1}>
          {filename}
          {datos ? ` · leído con ${datos.engine}` : ''}
        </Texto>
        {terms.length > 0 ? (
          <Texto variante="pequeno" suave>
            Lo resaltado se relaciona con los puntos que no cumplen.
          </Texto>
        ) : null}
      </View>
      {error ? <ErrorConReintento texto={error} onReintentar={recargar} /> : null}
      {!datos && !error ? <Cargando /> : null}
      {draw(visible)}
      {hidden.length > 0 ? (
        <View style={{ gap: espacio.sm, padding: espacio.md, borderRadius: radio.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: t.aviso.texto, backgroundColor: t.aviso.fondo }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.sm }}>
            <Icono nombre="eye-off" tamano="sm" color={t.aviso.texto} />
            <Texto variante="etiqueta" color={t.aviso.texto} style={{ flex: 1 }}>
              Texto oculto: no se ve al abrir el documento
            </Texto>
          </View>
          {draw(hidden)}
        </View>
      ) : null}
      {datos && blocks.length === 0 ? <Texto suave>No se encontró texto en el archivo.</Texto> : null}
    </View>
  );
}
