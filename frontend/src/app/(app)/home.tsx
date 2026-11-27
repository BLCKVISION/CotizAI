import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';

import { useSesion } from '@/core/sesion/SesionProvider';
import { useDatos } from '@/core/useDatos';
import { Cargando, ErrorConReintento } from '@/design/bloques';
import { Boton, Icono, Texto } from '@/design/componentes';
import { useDispositivo } from '@/design/dispositivo';
import { Entrada, useContador } from '@/design/efectos';
import { FixedPage, Pagina } from '@/design/layout';
import { espacio } from '@/design/tokens';
import { estadisticasApi, type Estadisticas } from '@/features/gestion/api';
import { ActivityCard } from '@/features/home/ActivityCard';
import { ProjectsCard } from '@/features/home/ProjectsCard';
import { SummaryCard } from '@/features/home/SummaryCard';
import { buildTasks, pickFocus } from '@/features/home/tasks';
import { TodoCard } from '@/features/home/TodoCard';
import { useProposalUpload } from '@/features/home/useProposalUpload';
import { NewProjectDialog } from '@/features/projects/NewProjectDialog';
import { UploadFlow } from '@/features/uploads/UploadFlow';
import { listarProyectosApi, type Proyecto } from '@/features/proyectos/api';

type HomeData = { stats: Estadisticas; projects: Proyecto[] };

const loadHome = async (token: string): Promise<HomeData> => {
  const [stats, projects] = await Promise.all([estadisticasApi(token), listarProyectosApi(token)]);
  return { stats, projects };
};

const greeting = (hour: number) => (hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches');

function BigMetric({ label, value, onPress }: { label: string; value: number; onPress: () => void }) {
  const shown = useContador(value);
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${label}: ${value}`} onPress={onPress} style={{ minWidth: 130 }}>
      <Texto variante="pequeno" suave>
        {label}
      </Texto>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}>
        <Texto variante="metrica" style={{ fontFamily: 'Urbanist_500Medium' }}>
          {shown}
        </Texto>
        <Icono nombre="arrow-up-right" tamano="sm" />
      </View>
    </Pressable>
  );
}

export default function Home() {
  const router = useRouter();
  const { dispositivo } = useDispositivo();
  const { usuario } = useSesion();
  const { datos, error, recargar } = useDatos(loadHome);
  const flow = useProposalUpload(recargar);
  const [creating, setCreating] = useState(false);
  // "New project" opens over Home instead of leaving it.
  const go = (path: string) => (path === '/proyectos/nuevo' ? setCreating(true) : router.push(path as Href));
  const wide = dispositivo === 'escritorio';
  const Container = wide ? FixedPage : Pagina;

  const role = usuario?.rol ?? 'auditor';
  const canEdit = usuario?.rol === 'cargador';
  const userName = usuario?.display_name || (usuario?.correo ?? '').split('@')[0];
  const name = userName ? userName.charAt(0).toUpperCase() + userName.slice(1) : '';

  const tasks = datos ? buildTasks(role, datos.projects, datos.stats.propuestas_por_proyecto) : [];
  const focus = datos ? pickFocus(datos.projects) : null;
  const sendFiles = (files: File[]) => {
    if (focus) void flow.upload(focus.id, files);
  };

  const cell = (flex: number): ViewStyle => (wide ? { flex, minWidth: 0, minHeight: 0 } : { minHeight: 340 });
  const row = (flex: number): ViewStyle => (wide ? { flex, flexDirection: 'row', gap: 20, minHeight: 0 } : { gap: espacio.md });

  return (
    <Container>
      <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'flex-start', gap: wide ? espacio.xl : espacio.md }}>
        <View style={{ flex: wide ? 1 : undefined }}>
          <Texto variante="titulo" accessibilityRole="header" numberOfLines={wide ? 1 : 2} style={{ fontFamily: 'Urbanist_600SemiBold' }}>
            {`${greeting(new Date().getHours())}${name ? `, ${name}` : ''}`}
          </Texto>
          <Texto suave>Analice sus presupuestos y elija con evidencia.</Texto>
        </View>
        {datos ? (
          <View style={{ flexDirection: 'row', gap: espacio.xl }}>
            <BigMetric label="Proyectos" value={datos.stats.total_proyectos} onPress={() => go('/proyectos')} />
            <BigMetric label="Propuestas cargadas" value={datos.stats.total_propuestas} onPress={() => go('/estadisticas')} />
          </View>
        ) : null}
        {canEdit ? (
          <Boton etiqueta="Nuevo proyecto" icono="plus" onPress={() => go('/proyectos/nuevo')} />
        ) : usuario?.rol === 'auditor' ? (
          <Boton etiqueta="Abrir auditoría" icono="shield" onPress={() => go('/auditoria')} />
        ) : (
          <Boton etiqueta="Ver proyectos" icono="folder" onPress={() => go('/proyectos')} />
        )}
      </View>

      {error ? <ErrorConReintento texto={error} onReintentar={recargar} /> : null}
      {!datos ? (
        error ? null : <Cargando />
      ) : (
        <View style={wide ? { flex: 1, gap: 20, minHeight: 0 } : { gap: espacio.md }}>
          <View style={row(1.36)}>
            <Entrada indice={0} estilo={cell(0.56)}>
              <ProjectsCard
                projects={datos.projects}
                counts={datos.stats.propuestas_por_proyecto}
                canCreate={canEdit}
                onCreate={() => setCreating(true)}
                onNavigate={go}
              />
            </Entrada>
            <Entrada indice={1} estilo={cell(1)}>
              <ActivityCard
                focus={focus}
                canEdit={canEdit}
                busy={flow.busy}
                onFiles={sendFiles}
                onNavigate={go}
              />
            </Entrada>
          </View>
          <View style={row(1)}>
            <Entrada indice={2} estilo={cell(0.56)}>
              <TodoCard tasks={tasks} hasProjects={datos.projects.length > 0} canCreate={canEdit} onOpen={go} onCreate={() => setCreating(true)} />
            </Entrada>
            <Entrada indice={3} estilo={cell(1)}>
              <SummaryCard stats={datos.stats} onOpen={() => go('/estadisticas')} />
            </Entrada>
          </View>
        </View>
      )}
      <UploadFlow visible={flow.visible} items={flow.items} busy={flow.busy} onClose={flow.close} />
      <NewProjectDialog
        visible={canEdit && creating}
        onClose={() => {
          setCreating(false);
          recargar();
        }}
      />
    </Container>
  );
}
