import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import { ErrorApi } from '@/core/api/cliente';
import { useSesion } from '@/core/sesion/SesionProvider';
import { Boton, Chip, Esqueleto, EstadoVacio, Icono, Insignia, Tarjeta, Texto } from '@/design/componentes';
import { EncabezadoDePagina, Metrica, Pagina } from '@/design/layout';
import { useTema } from '@/design/tema';
import { espacio } from '@/design/tokens';
import { type EstadoProyecto, listarProyectosApi, type Proyecto } from '@/features/proyectos/api';
import { ESTADOS, formatoFecha, formatoMonto, infoEstado, ORDEN_DE_ESTADOS } from '@/features/proyectos/estados';

type Filtro = 'todos' | EstadoProyecto;

export default function Proyectos() {
  const t = useTema();
  const router = useRouter();
  const { usuario, conSesion } = useSesion();
  const [proyectos, setProyectos] = useState<Proyecto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const [intento, setIntento] = useState(0);

  // Al volver a esta pantalla (p. ej. tras crear un proyecto) se vuelve a consultar sin vaciar la lista.
  useFocusEffect(
    useCallback(() => {
    let vigente = true;
    (async () => {
      try {
        const datos = await conSesion(listarProyectosApi);
        if (vigente) {
          setProyectos(datos);
          setError(null);
        }
      } catch (e) {
        if (vigente) setError(e instanceof ErrorApi ? `${e.message}${e.trackId ? ` (ref. ${e.trackId})` : ''}` : 'Error inesperado.');
      }
    })();
    return () => {
      vigente = false;
    };
    }, [conSesion, intento]),
  );

  const reintentar = () => {
    setError(null);
    setProyectos(null);
    setIntento((n) => n + 1);
  };

  const visibles = useMemo(
    () => (proyectos ?? []).filter((p) => filtro === 'todos' || p.estado === filtro),
    [proyectos, filtro],
  );
  const cuenta = (e: EstadoProyecto) => (proyectos ?? []).filter((p) => p.estado === e).length;
  const puedeCrear = usuario?.rol === 'cargador'; // solo UX: la autoridad es el backend

  const botonNuevo = puedeCrear ? (
    <Boton etiqueta="Nuevo proyecto" icono="plus" onPress={() => router.push('/proyectos/nuevo')} />
  ) : undefined;

  return (
    <Pagina>
      <EncabezadoDePagina
        sobretitulo="Panel"
        titulo="Proyectos"
        descripcion="Procesos de evaluación de su organización y su estado actual."
        accion={botonNuevo}
      />

      {proyectos !== null && proyectos.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.md }}>
          <Metrica etiqueta="Total" valor={proyectos.length} icono="layers" />
          <Metrica etiqueta="En evaluación" valor={cuenta('en_evaluacion')} icono="cpu" />
          <Metrica etiqueta="En revisión" valor={cuenta('en_revision_del_comite')} icono="users" />
          <Metrica etiqueta="Adjudicados" valor={cuenta('adjudicado')} icono="award" />
        </View>
      ) : null}

      {proyectos !== null && proyectos.length > 0 ? (
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm }}>
          <Chip etiqueta="Todos" seleccionado={filtro === 'todos'} onPress={() => setFiltro('todos')} />
          {ORDEN_DE_ESTADOS.map((e) => (
            <Chip key={e} etiqueta={ESTADOS[e].etiqueta} seleccionado={filtro === e} onPress={() => setFiltro(e)} />
          ))}
        </View>
      ) : null}

      {error ? (
        <Tarjeta>
          <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: espacio.sm, alignItems: 'center' }}>
            <Icono nombre="alert-triangle" color={t.error.texto} />
            <Texto color={t.error.texto} style={{ flex: 1 }}>
              {error}
            </Texto>
          </View>
          <Boton etiqueta="Reintentar" variante="secundario" icono="refresh-cw" onPress={reintentar} />
        </Tarjeta>
      ) : proyectos === null ? (
        <View accessibilityLiveRegion="polite" accessibilityLabel="Cargando proyectos" style={{ gap: espacio.md }}>
          {[0, 1, 2].map((i) => (
            <Tarjeta key={i}>
              <Esqueleto alto={22} ancho="55%" />
              <Esqueleto alto={14} ancho="35%" />
              <Esqueleto alto={14} ancho="80%" />
            </Tarjeta>
          ))}
        </View>
      ) : proyectos.length === 0 ? (
        <EstadoVacio
          icono="folder-plus"
          titulo="Aún no hay proyectos"
          descripcion={
            puedeCrear
              ? 'Cree el primer proyecto para cargar propuestas y que el agente las evalúe.'
              : 'Cuando su organización cree proyectos, aparecerán aquí.'
          }
          accion={botonNuevo}
        />
      ) : visibles.length === 0 ? (
        <EstadoVacio icono="filter" titulo="Sin resultados" descripcion="Ningún proyecto coincide con este filtro." />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.md }}>
          {visibles.map((p) => {
            const e = infoEstado(p.estado);
            return (
              <View key={p.id} style={{ flexGrow: 1, flexBasis: 320, maxWidth: '100%' }}>
                <Tarjeta onPress={() => router.push(`/proyectos/${p.id}`)} etiquetaAccesible={`${p.nombre}, ${e.etiqueta}`}>
                  <Insignia etiqueta={e.etiqueta} tono={e.tono} icono={e.icono} />
                  <Texto variante="subtitulo" numberOfLines={2}>
                    {p.nombre}
                  </Texto>
                  <View style={{ gap: espacio.xs }}>
                    <View style={{ flexDirection: 'row', gap: espacio.sm, alignItems: 'center' }}>
                      <Icono nombre="map-pin" tamano="sm" color={t.textoSuave} />
                      <Texto variante="pequeno" suave numberOfLines={1} style={{ flex: 1 }}>
                        {p.ubicacion}
                      </Texto>
                    </View>
                    <View style={{ flexDirection: 'row', gap: espacio.sm, alignItems: 'center' }}>
                      <Icono nombre="calendar" tamano="sm" color={t.textoSuave} />
                      <Texto variante="pequeno" suave>
                        {formatoFecha(p.creado)}
                      </Texto>
                    </View>
                  </View>
                  <View style={{ height: 1, backgroundColor: t.borde, marginVertical: espacio.xs }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Texto variante="pequeno" suave>
                      Presupuesto referencial
                    </Texto>
                    <Texto variante="etiqueta">{formatoMonto(p.presupuesto_referencial)}</Texto>
                  </View>
                </Tarjeta>
              </View>
            );
          })}
        </View>
      )}
    </Pagina>
  );
}
