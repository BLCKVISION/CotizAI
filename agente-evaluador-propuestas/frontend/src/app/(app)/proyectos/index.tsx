import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import { ErrorApi } from '@/core/api/client';
import { useSession } from '@/core/session/SessionProvider';
import { Button, Chip, Skeleton, EmptyState, Icon, Badge, Card, AppText } from '@/design/components';
import { PageHeader, Metric, Page } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { spacing } from '@/design/tokens';
import { type ProjectState, listProjectsApi, type Project } from '@/features/projects/api';
import { STATES, formatDate, formatAmount, stateInfo, STATE_ORDER } from '@/features/projects/states';

type Filter = 'all' | ProjectState;

export default function Projects() {
  const t = useTheme();
  const router = useRouter();
  const { user, withSession } = useSession();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const [attempt, setAttempt] = useState(0);

  // Al volver a esta pantalla (p. ej. tras crear un proyecto) se vuelve a consultar sin vaciar la lista.
  useFocusEffect(
    useCallback(() => {
    let current = true;
    (async () => {
      try {
        const data = await withSession(listProjectsApi);
        if (current) {
          setProjects(data);
          setError(null);
        }
      } catch (e) {
        if (current) setError(e instanceof ErrorApi ? `${e.message}${e.trackId ? ` (ref. ${e.trackId})` : ''}` : 'Error inesperado.');
      }
    })();
    return () => {
      current = false;
    };
    }, [withSession, attempt]),
  );

  const retry = () => {
    setError(null);
    setProjects(null);
    setAttempt((n) => n + 1);
  };

  const visible = useMemo(
    () => (projects ?? []).filter((p) => filter === 'all' || p.state === filter),
    [projects, filter],
  );
  const count = (e: ProjectState) => (projects ?? []).filter((p) => p.state === e).length;
  const canCreate = user?.role === 'loader'; // solo UX: la autoridad es el backend

  const newButton = canCreate ? (
    <Button label="Nuevo proyecto" icon="plus" onPress={() => router.push('/proyectos/nuevo')} />
  ) : undefined;

  return (
    <Page>
      <PageHeader
        eyebrow="Panel"
        title="Proyectos"
        description="Procesos de evaluación de su organización y su estado actual."
        action={newButton}
      />

      {projects !== null && projects.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <Metric label="Total" value={projects.length} icon="layers" />
          <Metric label="En evaluación" value={count('evaluating')} icon="cpu" />
          <Metric label="En revisión" value={count('committee_review')} icon="users" />
          <Metric label="Adjudicados" value={count('awarded')} icon="award" />
        </View>
      ) : null}

      {projects !== null && projects.length > 0 ? (
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <Chip label="Todos" selected={filter === 'all'} onPress={() => setFilter('all')} />
          {STATE_ORDER.map((e) => (
            <Chip key={e} label={STATES[e].label} selected={filter === e} onPress={() => setFilter(e)} />
          ))}
        </View>
      ) : null}

      {error ? (
        <Card>
          <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            <Icon name="alert-triangle" color={t.error.text} />
            <AppText color={t.error.text} style={{ flex: 1 }}>
              {error}
            </AppText>
          </View>
          <Button label="Reintentar" variant="secondary" icon="refresh-cw" onPress={retry} />
        </Card>
      ) : projects === null ? (
        <View accessibilityLiveRegion="polite" accessibilityLabel="Cargando proyectos" style={{ gap: spacing.md }}>
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <Skeleton height={22} width="55%" />
              <Skeleton height={14} width="35%" />
              <Skeleton height={14} width="80%" />
            </Card>
          ))}
        </View>
      ) : projects.length === 0 ? (
        <EmptyState
          icon="folder-plus"
          title="Aún no hay proyectos"
          description={
            canCreate
              ? 'Cree el primer proyecto para cargar propuestas y que el agente las evalúe.'
              : 'Cuando su organización cree proyectos, aparecerán aquí.'
          }
          action={newButton}
        />
      ) : visible.length === 0 ? (
        <EmptyState icon="filter" title="Sin resultados" description="Ningún proyecto coincide con este filtro." />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {visible.map((p) => {
            const e = stateInfo(p.state);
            return (
              <View key={p.id} style={{ flexGrow: 1, flexBasis: 320, maxWidth: '100%' }}>
                <Card onPress={() => router.push(`/proyectos/${p.id}`)} accessibleLabel={`${p.name}, ${e.label}`}>
                  <Badge label={e.label} tone={e.tone} icon={e.icon} />
                  <AppText variant="subtitle" numberOfLines={2}>
                    {p.name}
                  </AppText>
                  <View style={{ gap: spacing.xs }}>
                    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                      <Icon name="map-pin" size="sm" color={t.softText} />
                      <AppText variant="small" soft numberOfLines={1} style={{ flex: 1 }}>
                        {p.location}
                      </AppText>
                    </View>
                    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                      <Icon name="calendar" size="sm" color={t.softText} />
                      <AppText variant="small" soft>
                        {formatDate(p.created)}
                      </AppText>
                    </View>
                  </View>
                  <View style={{ height: 1, backgroundColor: t.border, marginVertical: spacing.xs }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <AppText variant="small" soft>
                      Presupuesto referencial
                    </AppText>
                    <AppText variant="label">{formatAmount(p.reference_budget)}</AppText>
                  </View>
                </Card>
              </View>
            );
          })}
        </View>
      )}
    </Page>
  );
}
