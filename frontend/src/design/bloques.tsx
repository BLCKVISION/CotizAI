/** Bloques compartidos por las pantallas: errores, carga, encabezado de sección y filas. */
import { type ReactNode } from 'react';
import { View } from 'react-native';

import { Boton, Esqueleto, Icono, type NombreIcono, Tarjeta, Texto } from './componentes';
import { useTema } from './tema';
import { espacio, radio } from './tokens';

export function Aviso({ texto, tono = 'error', accion }: { texto: string; tono?: 'error' | 'aviso' | 'info' | 'exito'; accion?: ReactNode }) {
  const t = useTema();
  const icono: NombreIcono = tono === 'error' ? 'alert-triangle' : tono === 'aviso' ? 'alert-circle' : tono === 'exito' ? 'check-circle' : 'info';
  return (
    <View
      accessibilityRole={tono === 'error' ? 'alert' : 'text'}
      style={{ flexDirection: 'row', gap: espacio.sm, alignItems: 'center', backgroundColor: t[tono].fondo, borderRadius: radio.nav, padding: espacio.md }}
    >
      <Icono nombre={icono} color={t[tono].texto} />
      <Texto variante="pequeno" color={t[tono].texto} style={{ flex: 1 }}>
        {texto}
      </Texto>
      {accion}
    </View>
  );
}

export function ErrorConReintento({ texto, onReintentar }: { texto: string; onReintentar: () => void }) {
  return <Aviso texto={texto} accion={<Boton etiqueta="Reintentar" variante="secundario" onPress={onReintentar} />} />;
}

export function Cargando({ filas = 3 }: { filas?: number }) {
  return (
    <Tarjeta>
      <View accessibilityLabel="Cargando" style={{ gap: espacio.md }}>
        {Array.from({ length: filas }, (_, i) => (
          <Esqueleto key={i} alto={18} ancho={i % 2 ? '60%' : '85%'} />
        ))}
      </View>
    </Tarjeta>
  );
}

export function TituloDeSeccion({ titulo, detalle, accion }: { titulo: string; detalle?: string; accion?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espacio.sm, flexWrap: 'wrap' }}>
      <View style={{ flexShrink: 1 }}>
        <Texto variante="subtitulo" accessibilityRole="header">
          {titulo}
        </Texto>
        {detalle ? (
          <Texto variante="pequeno" suave>
            {detalle}
          </Texto>
        ) : null}
      </View>
      {accion}
    </View>
  );
}

export function Fila({ icono, titulo, detalle, derecha }: { icono: NombreIcono; titulo: string; detalle: string; derecha?: ReactNode }) {
  const t = useTema();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.md, paddingVertical: espacio.sm + 2, borderBottomWidth: 1, borderBottomColor: t.borde }}>
      <View style={{ width: 40, height: 40, borderRadius: radio.md, backgroundColor: t.superficieAlta, alignItems: 'center', justifyContent: 'center' }}>
        <Icono nombre={icono} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texto variante="etiqueta" numberOfLines={1}>
          {titulo}
        </Texto>
        <Texto variante="pequeno" suave numberOfLines={2}>
          {detalle}
        </Texto>
      </View>
      {derecha}
    </View>
  );
}

/** Rejilla fluida: cada hijo ocupa al menos `minimo` y se reparte el ancho. */
export function Columna({ children, minimo = 360 }: { children: ReactNode; minimo?: number }) {
  return <View style={{ flexGrow: 1, flexBasis: minimo, maxWidth: '100%', minWidth: 0 }}>{children}</View>;
}
export function Rejilla({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.md, alignItems: 'flex-start' }}>{children}</View>;
}
