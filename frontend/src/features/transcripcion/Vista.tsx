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
export type Partir = (valor: string) => { texto: string; incierto: boolean }[];

function ConInciertos({ valor, inciertos, medio = false, partir }: { valor: string; inciertos: string[]; medio?: boolean; partir?: Partir }) {
  const t = useTema();
  return (
    <Texto variante={medio ? 'cuerpoMedio' : 'cuerpo'}>
      {(partir ? partir(valor) : partirPorInciertos(valor, inciertos)).map((s, i) =>
        s.incierto ? (
          <Text key={i} accessibilityLabel={`${partir ? 'Resaltado' : 'Cifra dudosa'}: ${s.texto}`} style={{ backgroundColor: t.aviso.fondo, color: t.aviso.texto }}>
            {s.texto}
          </Text>
        ) : (
          s.texto
        ),
      )}
    </Texto>
  );
}

function Tabla({ cabecera, filas, inciertos, partir, minimo }: { cabecera: string[]; filas: string[][]; inciertos: string[]; partir?: Partir; minimo: number }) {
  const t = useTema();
  // Cada columna ocupa según su texto: en un presupuesto el detalle es mucho más largo que la cantidad.
  const pesos = cabecera.map((_, i) => Math.min(6, Math.max(1, Math.max(...[cabecera, ...filas].map((f) => Math.max(...(f[i] ?? '').split('\n').map((l) => l.length)))) / 10)));
  const fila = (celdas: string[], clave: string, encabezado = false) => (
    <View key={clave} style={{ flexDirection: 'row', backgroundColor: encabezado ? t.superficieAlta : 'transparent' }}>
      {celdas.map((c, i) => (
        <View key={i} style={{ minWidth: minimo, flex: pesos[i] ?? 1, flexBasis: 0, padding: espacio.sm, borderTopWidth: 1, borderColor: t.borde }}>
          <ConInciertos valor={c} inciertos={inciertos} medio={encabezado} partir={partir} />
        </View>
      ))}
    </View>
  );
  // `flexGrow` lets a narrow table use the whole width; a wide one still scrolls sideways.
  return (
    <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
      <View style={{ borderWidth: 1, borderColor: t.borde, borderRadius: radio.md, overflow: 'hidden', flexGrow: 1, minWidth: '100%' }}>
        {fila(cabecera, 'cabecera', true)}
        {filas.map((f, i) => fila(f, `fila-${i}`))}
      </View>
    </ScrollView>
  );
}

export function BloqueVista({ bloque, inciertos, partir, minimoDeColumna = 112 }: { bloque: Bloque; inciertos: string[]; partir?: Partir; minimoDeColumna?: number }) {
  if (bloque.tipo === 'titulo') {
    return (
      <Texto variante={bloque.nivel === 1 ? 'subtitulo' : 'cuerpoMedio'} accessibilityRole="header">
        {bloque.texto}
      </Texto>
    );
  }
  if (bloque.tipo === 'tabla') return <Tabla cabecera={bloque.cabecera} filas={bloque.filas} inciertos={inciertos} partir={partir} minimo={minimoDeColumna} />;
  return <ConInciertos valor={bloque.texto} inciertos={inciertos} partir={partir} />;
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
