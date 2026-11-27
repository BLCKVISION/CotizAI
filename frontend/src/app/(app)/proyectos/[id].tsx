import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { can } from '@/core/auth/permissions';
import { ErrorApi } from '@/core/api/cliente';
import { useSesion } from '@/core/sesion/SesionProvider';
import { BackButton } from '@/design/BackButton';
import { CollapsibleCard } from '@/design/Collapsible';
import { Chip, Esqueleto, Icono, Insignia, Tarjeta, Texto } from '@/design/componentes';
import { useDispositivo } from '@/design/dispositivo';
import { EncabezadoDePagina, FixedPage, Pagina } from '@/design/layout';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';
import { ProjectFlow } from '@/features/flow/ProjectFlow';
import { Expediente } from '@/features/gestion/Expediente';
import { Revision } from '@/features/gestion/Revision';
import { DeleteProjectDialog } from '@/features/proyectos/DeleteProjectDialog';
import { canBeDeleted } from '@/features/proyectos/deletion';
import { obtenerProyectoApi, type Proyecto } from '@/features/proyectos/api';
import { ESTADOS, formatoDinero, formatoFecha, infoEstado, ORDEN_DE_ESTADOS } from '@/features/proyectos/estados';

function LineaDeTiempo({ actual }: { actual: Proyecto['estado'] }) {
  const t = useTema();
  const { dispositivo } = useDispositivo();
  const indiceActual = ORDEN_DE_ESTADOS.indexOf(actual);
  const horizontal = dispositivo !== 'movil';
  return (
    <View
      accessibilityRole="list"
      style={{ flexDirection: horizontal ? 'row' : 'column', gap: horizontal ? espacio.sm : espacio.md }}
    >
      {ORDEN_DE_ESTADOS.map((e, i) => {
        const hecho = i < indiceActual;
        const activo = i === indiceActual;
        const info = ESTADOS[e];
        return (
          <View
            key={e}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`Paso ${i + 1} de ${ORDEN_DE_ESTADOS.length}: ${info.etiqueta}, ${hecho ? 'completado' : activo ? 'actual' : 'pendiente'}`}
            style={{ flex: horizontal ? 1 : undefined, flexDirection: horizontal ? 'column' : 'row', gap: espacio.sm, alignItems: horizontal ? 'flex-start' : 'center' }}
          >
            {horizontal ? (
              <View style={{ height: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: hecho || activo ? t.primario : t.borde }} />
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.sm }}>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: radio.pildora,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: hecho ? t.primario : activo ? t.superficie : t.superficieAlta,
                  borderWidth: 2,
                  borderColor: hecho || activo ? t.primario : t.borde,
                }}
              >
                {hecho ? (
                  <Icono nombre="check" tamano="sm" color={t.sobrePrimario} />
                ) : (
                  <Texto variante="etiqueta" color={activo ? t.foco : t.textoSuave}>
                    {i + 1}
                  </Texto>
                )}
              </View>
              <Texto variante={activo ? 'etiqueta' : 'pequeno'} suave={!activo && !hecho} style={{ flexShrink: 1 }}>
                {info.etiqueta}
              </Texto>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Dato({ icono, etiqueta, valor }: { icono: Parameters<typeof Icono>[0]['nombre']; etiqueta: string; valor: string }) {
  const t = useTema();
  return (
    <View style={{ flexGrow: 1, flexBasis: 220, gap: espacio.xs }}>
      <View style={{ flexDirection: 'row', gap: espacio.sm, alignItems: 'center' }}>
        <Icono nombre={icono} tamano="sm" color={t.textoSuave} />
        <Texto variante="sobretitulo" suave>
          {etiqueta.toUpperCase()}
        </Texto>
      </View>
      <Texto variante="cuerpoMedio">{valor}</Texto>
    </View>
  );
}

export default function DetalleProyecto() {
  const t = useTema();
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const { conSesion, usuario } = useSesion();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [error, setError] = useState<string | null>(null);
  // `?tab=revision` lets a task open the tab where it is done.
  const [pestana, setPestana] = useState<'propuestas' | 'ficha' | 'revision'>(tab === 'revision' ? 'revision' : 'propuestas');
  const pestanas = [
      { id: 'propuestas', etiqueta: 'Evaluación' },
    { id: 'ficha', etiqueta: 'Ficha y avance' },
    // El rol Cargador no ve notas ni historial (el backend también lo impide).
    ...(can(usuario?.rol, 'seeResults') ? [{ id: 'revision', etiqueta: 'Revisión del comité' } as const] : []),
  ] as const;

  useEffect(() => {
    let vigente = true;
    void (async () => {
      try {
        const datos = await conSesion(obtenerProyectoApi(String(id)));
        if (vigente) {
          setProyecto(datos);
          setError(null);
        }
      } catch (e) {
        if (!vigente) return;
        setError(
          e instanceof ErrorApi
            ? e.estado === 404
              ? 'No se encontró el proyecto.'
              : `${e.message}${e.trackId ? ` (ref. ${e.trackId})` : ''}`
            : 'Error inesperado.',
        );
      }
    })();
    return () => {
      vigente = false;
    };
  }, [conSesion, id]);

  // Refreshes the header after an evaluation without clearing the screen (which would discard the result shown).
  const refresh = async () => {
    try {
      setProyecto(await conSesion(obtenerProyectoApi(String(id))));
    } catch {
      // The current data stays on screen; reopening the project loads it again.
    }
  };

  const volver = <BackButton fallback="/proyectos" />;

  if (error) {
    return (
      <Pagina>
        <EncabezadoDePagina titulo="Proyecto" accion={volver} />
        <Tarjeta>
          <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: espacio.sm, alignItems: 'center' }}>
            <Icono nombre="alert-triangle" color={t.error.texto} />
            <Texto color={t.error.texto} style={{ flex: 1 }}>
              {error}
            </Texto>
          </View>
        </Tarjeta>
      </Pagina>
    );
  }

  if (!proyecto) {
    return (
      <Pagina>
        <EncabezadoDePagina titulo="Cargando…" accion={volver} />
        <Tarjeta>
          <Esqueleto alto={22} ancho="50%" />
          <Esqueleto alto={14} ancho="80%" />
          <Esqueleto alto={14} ancho="65%" />
        </Tarjeta>
      </Pagina>
    );
  }

  const e = infoEstado(proyecto.estado);
  const heading = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: espacio.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.md, flexShrink: 1 }}>
        {volver}
      <View style={{ flexShrink: 1, gap: 2 }}>
        <Texto variante="subtitulo" accessibilityRole="header" numberOfLines={1} style={{ fontFamily: 'Urbanist_600SemiBold', fontSize: 22, lineHeight: 28 }}>
          {proyecto.nombre}
        </Texto>
        <View style={{ flexDirection: 'row', gap: espacio.sm, alignItems: 'center', flexWrap: 'wrap' }}>
          <Insignia etiqueta={e.etiqueta} tono={e.tono} icono={e.icono} />
          <Texto variante="pequeno" suave>
            {proyecto.ubicacion}
          </Texto>
        </View>
      </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: espacio.sm }}>
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm }}>
          {pestanas.map((x) => (
            <Chip key={x.id} etiqueta={x.etiqueta} seleccionado={pestana === x.id} onPress={() => setPestana(x.id)} />
          ))}
        </View>
        {can(usuario?.rol, 'createProject') && canBeDeleted(proyecto) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Eliminar proyecto"
            onPress={() => setDeleting(true)}
            style={(s: { pressed: boolean; hovered?: boolean; focused?: boolean }) => ({ flexDirection: 'row', alignItems: 'center', gap: espacio.xs + 2, minHeight: 44, paddingHorizontal: espacio.md, borderRadius: radio.pildora, borderWidth: 2, borderColor: s.focused ? t.foco : 'transparent', backgroundColor: s.pressed || s.hovered ? '#B91C1C' : '#DC2626' })}
          >
            <Icono nombre="trash-2" tamano="sm" color="#FFFFFF" />
            <Texto variante="etiqueta" color="#FFFFFF">Eliminar proyecto</Texto>
          </Pressable>
        ) : null}
        <DeleteProjectDialog project={deleting ? proyecto : null} onClose={() => setDeleting(false)} onDeleted={() => router.replace('/proyectos')} />
      </View>
    </View>
  );

  // The guided flow fills the window, so its action bar is always on screen.
  if (pestana === 'propuestas') {
    return (
      <FixedPage>
        {heading}
        <ProjectFlow key={proyecto.id} project={proyecto} onProjectChange={() => void refresh()} />
      </FixedPage>
    );
  }

  return (
    <Pagina>
      {heading}
      {pestana === 'revision' ? <Revision proyecto={proyecto} onCambio={setProyecto} /> : null}

      {pestana === 'ficha' ? (
      <View style={{ gap: espacio.md }}>
      <Expediente proyecto={proyecto} onCambio={() => void refresh()} />
      <CollapsibleCard title="Avance del proceso" detail={e.etiqueta} defaultOpen>
        <LineaDeTiempo actual={proyecto.estado} />
      </CollapsibleCard>

      <CollapsibleCard title="Datos y requerimiento" detail={proyecto.ubicacion}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.lg }}>
          <Dato icono="map-pin" etiqueta="Ubicación" valor={proyecto.ubicacion} />
          <Dato icono="calendar" etiqueta="Creado" valor={formatoFecha(proyecto.creado)} />
          <Dato icono="dollar-sign" etiqueta="Presupuesto referencial" valor={formatoDinero(proyecto.presupuesto_referencial, proyecto.moneda)} />
        </View>
        <View style={{ height: 1, backgroundColor: t.borde, marginVertical: espacio.sm }} />
        <Texto variante="sobretitulo" suave>
          REQUERIMIENTO
        </Texto>
        <Texto style={{ maxWidth: 720 }}>{proyecto.requerimiento}</Texto>
        {proyecto.motivo_de_cierre ? (
          <>
            <Texto variante="sobretitulo" suave>
              MOTIVO DE CIERRE
            </Texto>
            <Texto>{proyecto.motivo_de_cierre}</Texto>
          </>
        ) : null}
      </CollapsibleCard>
      </View>
      ) : null}
    </Pagina>
  );
}
