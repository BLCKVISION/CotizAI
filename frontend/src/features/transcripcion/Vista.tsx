import { ScrollView, Text, View } from 'react-native';

import { Aviso } from '@/design/bloques';
import { Insignia, type Tono, Texto } from '@/design/componentes';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';

import type { Calidad, Transcripcion } from './api';
import { type Bloque, bloquesDeMarkdown, partirPorInciertos } from './markdown';

const CALIDAD: Record<Calidad, { tono: Tono; etiqueta: string; icono: 'check-circle' | 'alert-triangle' | 'alert-circle' }> = {
  alta: { tono: 'exito', etiqueta: 'Calidad alta', icono: 'check-circle' },
  media: { tono: 'aviso', etiqueta: 'Calidad media: revise las cifras marcadas', icono: 'alert-triangle' },
  baja: { tono: 'error', etiqueta: 'Calidad baja: requiere revisión humana', icono: 'alert-circle' },
};

/** Texto con las cifras inciertas resaltadas (fondo + etiqueta accesible: nunca solo color). */
function ConInciertos({ valor, inciertos, medio = false }: { valor: string; inciertos: string[]; medio?: boolean }) {
  const t = useTema();
  return (
    <Texto variante={medio ? 'cuerpoMedio' : 'cuerpo'}>
      {partirPorInciertos(valor, inciertos).map((s, i) =>
        s.incierto ? (
          <Text key={i} accessibilityLabel={`Cifra dudosa: ${s.texto}`} style={{ backgroundColor: t.aviso.fondo, color: t.aviso.texto }}>
            {s.texto}
          </Text>
        ) : (
          s.texto
        ),
      )}
    </Texto>
  );
}

function Tabla({ cabecera, filas, inciertos }: { cabecera: string[]; filas: string[][]; inciertos: string[] }) {
  const t = useTema();
  const fila = (celdas: string[], clave: string, encabezado = false) => (
    <View key={clave} style={{ flexDirection: 'row', backgroundColor: encabezado ? t.superficieAlta : 'transparent' }}>
      {celdas.map((c, i) => (
        <View key={i} style={{ minWidth: 120, flex: 1, padding: espacio.sm, borderTopWidth: 1, borderColor: t.borde }}>
          <ConInciertos valor={c} inciertos={inciertos} medio={encabezado} />
        </View>
      ))}
    </View>
  );
  return (
    <ScrollView horizontal>
      <View style={{ borderWidth: 1, borderColor: t.borde, borderRadius: radio.md, overflow: 'hidden', minWidth: '100%' }}>
        {fila(cabecera, 'cabecera', true)}
        {filas.map((f, i) => fila(f, `fila-${i}`))}
      </View>
    </ScrollView>
  );
}

function BloqueVista({ bloque, inciertos }: { bloque: Bloque; inciertos: string[] }) {
  if (bloque.tipo === 'titulo') {
    return (
      <Texto variante={bloque.nivel === 1 ? 'subtitulo' : 'cuerpoMedio'} accessibilityRole="header">
        {bloque.texto}
      </Texto>
    );
  }
  if (bloque.tipo === 'tabla') return <Tabla cabecera={bloque.cabecera} filas={bloque.filas} inciertos={inciertos} />;
  return <ConInciertos valor={bloque.texto} inciertos={inciertos} />;
}

export function VistaTranscripcion({ resultado }: { resultado: Transcripcion }) {
  const calidad = CALIDAD[resultado.calidad];
  const bloques = bloquesDeMarkdown(resultado.markdown);
  return (
    <View style={{ gap: espacio.md }}>
      <Insignia etiqueta={calidad.etiqueta} tono={calidad.tono} icono={calidad.icono} />
      {resultado.avisos.map((a) => (
        <Aviso key={a} tono="aviso" texto={a} />
      ))}
      {bloques.length === 0 ? (
        <Texto suave>No se pudo leer texto en la imagen.</Texto>
      ) : (
        bloques.map((b, i) => <BloqueVista key={i} bloque={b} inciertos={resultado.inciertos} />)
      )}
    </View>
  );
}
