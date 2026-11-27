/** The text extracted from one proposal, as Markdown: rendered or raw, with copy and download. */
import { useState } from 'react';
import { Text, View } from 'react-native';

import { useSesion } from '@/core/sesion/SesionProvider';
import { useDatos } from '@/core/useDatos';
import { Aviso, Cargando, ErrorConReintento } from '@/design/bloques';
import { Boton, Chip, Insignia, Texto } from '@/design/componentes';
import { Lightbox } from '@/design/Lightbox';
import { showToast } from '@/design/toastStore';
import { espacio } from '@/design/tokens';
import { bloquesDeMarkdown } from '@/features/transcripcion/markdown';
import { BloqueVista } from '@/features/transcripcion/Vista';

import { type Propuesta, proposalMarkdownApi } from './api';

function Content({ projectId, proposal }: { projectId: string; proposal: Propuesta }) {
  const { usuario } = useSesion();
  const { datos, error, recargar } = useDatos(proposalMarkdownApi(projectId, proposal.id), proposal.id);
  const [raw, setRaw] = useState(false);
  if (error) return <ErrorConReintento texto={error} onReintentar={recargar} />;
  if (!datos || !usuario) {
    return (
      <View style={{ gap: espacio.sm }}>
        <Texto suave>Extrayendo el texto… una foto o una página escaneada puede tardar unos segundos.</Texto>
        <Cargando />
      </View>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(datos.markdown);
      showToast({ tone: 'success', title: 'Markdown copiado' });
    } catch {
      showToast({ tone: 'error', title: 'No se pudo copiar. Use «Código» y cópielo a mano.' });
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([datos.markdown], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${datos.filename.replace(/\.[^.]+$/, '')}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <View style={{ gap: espacio.md }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: espacio.sm }}>
        <Insignia etiqueta={`Extraído con ${datos.engine}`} tono="info" icono="cpu" />
        <View style={{ flex: 1 }} />
        <Chip etiqueta="Vista" seleccionado={!raw} onPress={() => setRaw(false)} />
        <Chip etiqueta="Código" seleccionado={raw} onPress={() => setRaw(true)} />
        <Boton etiqueta="Copiar" icono="copy" variante="secundario" onPress={() => void copy()} />
        <Boton etiqueta="Descargar .md" icono="download" variante="secundario" onPress={download} />
      </View>
      {datos.notices.map((n) => (
        <Aviso key={n} tono="aviso" texto={n} />
      ))}
      {datos.markdown.trim() === '' ? (
        <Texto suave>No se encontró texto en el archivo.</Texto>
      ) : raw ? (
        <Text selectable style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 18 }}>
          {datos.markdown}
        </Text>
      ) : (
        bloquesDeMarkdown(datos.markdown).map((block, i) => <BloqueVista key={i} bloque={block} inciertos={[]} />)
      )}
    </View>
  );
}

export function MarkdownDialog({ projectId, proposal, onClose }: { projectId: string; proposal: Propuesta | null; onClose: () => void }) {
  return (
    <Lightbox visible={proposal !== null} title="Texto en Markdown" description={proposal?.archivo} onClose={onClose} maxWidth={1100}>
      {proposal ? <Content projectId={projectId} proposal={proposal} /> : null}
    </Lightbox>
  );
}
