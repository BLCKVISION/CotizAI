import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { can } from '@/core/auth/permissions';
import { useSesion } from '@/core/sesion/SesionProvider';
import { useDatos } from '@/core/useDatos';
import { BackButton } from '@/design/BackButton';
import { Cargando, ErrorConReintento } from '@/design/bloques';
import { Boton, Chip, EstadoVacio, Icono, type NombreIcono, Texto } from '@/design/componentes';
import { useDispositivo } from '@/design/dispositivo';
import { Entrada, soloWeb } from '@/design/efectos';
import { FixedPage } from '@/design/layout';
import { NewItemTile } from '@/design/NewItemTile';
import { useTema } from '@/design/tema';
import { espacio, radio, texto } from '@/design/tokens';
import { estadisticasApi } from '@/features/gestion/api';
import { FOLDER_HEIGHT, FolderCard } from '@/features/projects/FolderCard';
import { NewProjectDialog } from '@/features/projects/NewProjectDialog';
import { type EstadoProyecto, listarProyectosApi } from '@/features/proyectos/api';
import { ESTADOS, formatoDinero, formatoFecha, infoEstado, ORDEN_DE_ESTADOS } from '@/features/proyectos/estados';

const FIRST_PAGE = 7;

type Filter = 'all' | EstadoProyecto;
type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

const loadProjects = async (token: string) => {
  const [projects, stats] = await Promise.all([listarProyectosApi(token), estadisticasApi(token)]);
  return { projects, counts: stats.propuestas_por_proyecto };
};

function PillButton({ icon, label, onPress, expanded, accessibilityLabel }: { icon: NombreIcono; label: string; onPress: () => void; expanded?: boolean; accessibilityLabel?: string }) {
  const t = useTema();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      onPress={onPress}
      style={(e: PressState) => ({
        minHeight: 46,
        flexDirection: 'row',
        alignItems: 'center',
        gap: espacio.sm,
        paddingHorizontal: espacio.lg,
        borderRadius: radio.pildora,
        borderWidth: 2,
        borderColor: e.focused ? t.foco : 'transparent',
        backgroundColor: e.hovered ? '#FFFFFF' : 'rgba(255,255,255,0.72)',
        ...soloWeb({ transitionProperty: 'background-color', transitionDuration: '220ms' }),
      })}
    >
      <Icono nombre={icon} tamano="sm" />
      <Texto variante="etiqueta">
        {label}
      </Texto>
    </Pressable>
  );
}

export default function Projects() {
  const t = useTema();
  const router = useRouter();
  const { usuario } = useSesion();
  const { ancho, dispositivo } = useDispositivo();
  const { datos, error, recargar } = useDatos(loadProjects);
  const [filter, setFilter] = useState<Filter>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const canCreate = can(usuario?.rol, 'createProject'); // UX only: the backend is the authority
  const params = useLocalSearchParams<{ new?: string }>();
  const [creating, setCreating] = useState(false);
  const dialogOpen = canCreate && (creating || params.new === '1');
  const create = () => setCreating(true);
  const closeDialog = () => {
    setCreating(false);
    if (params.new) router.setParams({ new: undefined });
  };

  const q = query.trim().toLowerCase();
  const visible = (datos?.projects ?? []).filter(
    (p) => (filter === 'all' || p.estado === filter) && `${p.nombre} ${p.ubicacion}`.toLowerCase().includes(q),
  );
  const searching = q !== '' || filter !== 'all';
  const shown = showAll || searching ? visible : visible.slice(0, FIRST_PAGE);
  const columns = dispositivo === 'movil' ? 1 : ancho < 1024 ? 2 : ancho < 1600 ? 4 : 5;

  return (
    <FixedPage>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: espacio.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.md, flexShrink: 1 }}>
        <BackButton fallback={'/home' as Href} />
        <View style={{ flexShrink: 1 }}>
          <Texto variante="titulo" accessibilityRole="header" style={{ fontFamily: 'Urbanist_600SemiBold' }}>
            Proyectos
          </Texto>
          <Texto suave>Cada carpeta reúne las propuestas de un proceso de compra.</Texto>
        </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: espacio.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.sm, minHeight: 46, width: 320, maxWidth: '100%', paddingHorizontal: espacio.md, borderRadius: radio.pildora, backgroundColor: 'rgba(255,255,255,0.8)' }}>
          <Icono nombre="search" tamano="sm" color={t.textoSuave} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar"
            placeholderTextColor={t.textoSuave}
            accessibilityLabel="Buscar proyectos"
            style={[{ ...texto.cuerpo, flex: 1, minWidth: 0, minHeight: 42, color: t.texto }, soloWeb({ outlineStyle: 'none' })]}
          />
        </View>
        <PillButton icon="sliders" label={filter === 'all' ? 'Filtrar' : ESTADOS[filter].etiqueta} expanded={showFilters} onPress={() => setShowFilters((v) => !v)} />
      </View>

      {showFilters ? (
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm }}>
          <Chip etiqueta="Todos" seleccionado={filter === 'all'} onPress={() => setFilter('all')} />
          {ORDEN_DE_ESTADOS.map((s) => (
            <Chip key={s} etiqueta={ESTADOS[s].etiqueta} seleccionado={filter === s} onPress={() => setFilter(s)} />
          ))}
        </View>
      ) : null}

      {error ? <ErrorConReintento texto={error} onReintentar={recargar} /> : null}
      {!datos ? (
        error ? null : <Cargando />
      ) : datos.projects.length === 0 ? (
        <EstadoVacio
          icono="folder-plus"
          titulo="Aún no hay proyectos"
          descripcion={canCreate ? 'Cree el primer proyecto para reunir sus propuestas.' : 'Cuando su organización cree proyectos, aparecerán aquí.'}
          accion={canCreate ? <Boton etiqueta="Nuevo proyecto" icono="plus" onPress={create} /> : undefined}
        />
      ) : visible.length === 0 && !canCreate ? (
        <EstadoVacio icono="filter" titulo="Sin resultados" descripcion="Ningún proyecto coincide con la búsqueda o el filtro." />
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -12, paddingTop: 8 }}>
          {visible.length === 0 ? (
            <View style={{ width: '100%', padding: 12 }}>
              <Texto suave>Ningún proyecto coincide con la búsqueda o el filtro.</Texto>
            </View>
          ) : null}
          {shown.map((p, i) => {
            const n = datos.counts[p.id] ?? 0;
            return (
              <View key={p.id} style={{ width: `${100 / columns}%`, padding: 12 }}>
                <Entrada indice={Math.min(i, 8)}>
                  <FolderCard
                    index={Math.min(i, 8)}
                    title={p.nombre}
                    count={`${n} ${n === 1 ? 'propuesta' : 'propuestas'}`}
                    footer={`${infoEstado(p.estado).etiqueta} · ${formatoFecha(p.creado)}`}
                    preview={`${formatoDinero(p.presupuesto_referencial, p.moneda)} · ${p.requerimiento}`}
                    onPress={() => router.push(`/proyectos/${p.id}` as Href)}
                  />
                </Entrada>
              </View>
            );
          })}
          {canCreate ? (
            <View style={{ width: `${100 / columns}%`, padding: 12 }}>
              <Entrada>
                <View style={{ height: FOLDER_HEIGHT }}>
                  <NewItemTile label="Crear proyecto nuevo" icon="folder-plus" onPress={create} />
                </View>
              </Entrada>
            </View>
          ) : null}
          {visible.length > FIRST_PAGE && !searching ? (
            <View style={{ width: '100%', alignItems: 'center', padding: 12 }}>
              <Boton etiqueta={showAll ? 'Ver menos' : `Ver más (${visible.length - FIRST_PAGE})`} icono={showAll ? 'chevron-up' : 'chevron-down'} variante="secundario" onPress={() => setShowAll((v) => !v)} />
            </View>
          ) : null}
        </ScrollView>
      )}
      <NewProjectDialog visible={dialogOpen} onClose={closeDialog} />
          </FixedPage>
  );
}
