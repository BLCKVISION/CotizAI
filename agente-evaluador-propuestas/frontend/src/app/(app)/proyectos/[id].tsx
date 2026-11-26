import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ErrorApi } from '@/core/api/client';
import { useSession } from '@/core/session/SessionProvider';
import { Button, Skeleton, Icon, Badge, Card, AppText } from '@/design/components';
import { useDevice } from '@/design/device';
import { PageHeader, Page } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { spacing, radius } from '@/design/tokens';
import { getProjectApi, type Project } from '@/features/projects/api';
import { STATES, formatDate, formatAmount, stateInfo, STATE_ORDER } from '@/features/projects/states';

function Timeline({ current }: { current: Project['state'] }) {
  const t = useTheme();
  const { device } = useDevice();
  const currentIndex = STATE_ORDER.indexOf(current);
  const horizontal = device !== 'mobile';
  return (
    <View
      accessibilityRole="list"
      style={{ flexDirection: horizontal ? 'row' : 'column', gap: horizontal ? spacing.sm : spacing.md }}
    >
      {STATE_ORDER.map((e, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        const info = STATES[e];
        return (
          <View
            key={e}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`Paso ${i + 1} de ${STATE_ORDER.length}: ${info.label}, ${done ? 'completado' : active ? 'actual' : 'pendiente'}`}
            style={{ flex: horizontal ? 1 : undefined, flexDirection: horizontal ? 'column' : 'row', gap: spacing.sm, alignItems: horizontal ? 'flex-start' : 'center' }}
          >
            {horizontal ? (
              <View style={{ height: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: done || active ? t.primary : t.border }} />
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: done ? t.primary : active ? t.surface : t.highSurface,
                  borderWidth: 2,
                  borderColor: done || active ? t.primary : t.border,
                }}
              >
                {done ? (
                  <Icon name="check" size="sm" color={t.onPrimary} />
                ) : (
                  <AppText variant="label" color={active ? t.focus : t.softText}>
                    {i + 1}
                  </AppText>
                )}
              </View>
              <AppText variant={active ? 'label' : 'small'} soft={!active && !done} style={{ flexShrink: 1 }}>
                {info.label}
              </AppText>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Data({ icon, label, value }: { icon: Parameters<typeof Icon>[0]['name']; label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: 220, gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
        <Icon name={icon} size="sm" color={t.softText} />
        <AppText variant="eyebrow" soft>
          {label.toUpperCase()}
        </AppText>
      </View>
      <AppText variant="bodyMedium">{value}</AppText>
    </View>
  );
}

export default function ProjectDetail() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { withSession } = useSession();
  // El resultado lleva el id al que pertenece: al cambiar de proyecto se descarta solo, sin reiniciar estado en el efecto.
  const projectId = String(id);
  const [result, setResult] = useState<{ id: string; project?: Project; error?: string } | null>(null);
  const current = result?.id === projectId ? result : null;
  const project = current?.project ?? null;
  const error = current?.error ?? null;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await withSession(getProjectApi(projectId));
        if (active) setResult({ id: projectId, project: data });
      } catch (e) {
        if (!active) return;
        setResult({
          id: projectId,
          error:
            e instanceof ErrorApi
              ? e.status === 404
                ? 'No se encontró el proyecto.'
                : `${e.message}${e.trackId ? ` (ref. ${e.trackId})` : ''}`
              : 'Error inesperado.',
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [withSession, projectId]);

  const back = <Button label="Proyectos" variant="ghost" icon="arrow-left" onPress={() => router.replace('/proyectos')} />;

  if (error) {
    return (
      <Page>
        <PageHeader title="Proyecto" action={back} />
        <Card>
          <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            <Icon name="alert-triangle" color={t.error.text} />
            <AppText color={t.error.text} style={{ flex: 1 }}>
              {error}
            </AppText>
          </View>
        </Card>
      </Page>
    );
  }

  if (!project) {
    return (
      <Page>
        <PageHeader title="Cargando…" action={back} />
        <Card>
          <Skeleton height={22} width="50%" />
          <Skeleton height={14} width="80%" />
          <Skeleton height={14} width="65%" />
        </Card>
      </Page>
    );
  }

  const e = stateInfo(project.state);
  return (
    <Page>
      <PageHeader eyebrow="Proyecto" title={project.name} action={back} />
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' }}>
        <Badge label={e.label} tone={e.tone} icon={e.icon} />
        <AppText variant="small" soft>
          {e.description}
        </AppText>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        {project.state !== 'receiving' && project.state !== 'evaluating' ? (
          // Supuesto: la evaluación comparte id con el proyecto hasta que la API exponga la relación explícita.
          <Button label="Ver resultados" icon="bar-chart-2" onPress={() => router.push(`/resultados/${project.id}`)} />
        ) : null}
        {__DEV__ ? (
          <Button label="Ver ejemplo de resultados" variant="secondary" icon="eye" onPress={() => router.push('/resultados/demo')} />
        ) : null}
      </View>

      <Card>
        <AppText variant="eyebrow" soft>
          AVANCE DEL PROCESO
        </AppText>
        <Timeline current={project.state} />
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg }}>
          <Data icon="map-pin" label="Ubicación" value={project.location} />
          <Data icon="calendar" label="Creado" value={formatDate(project.created)} />
          <Data icon="dollar-sign" label="Presupuesto referencial" value={formatAmount(project.reference_budget)} />
        </View>
        <View style={{ height: 1, backgroundColor: t.border, marginVertical: spacing.sm }} />
        <AppText variant="eyebrow" soft>
          REQUERIMIENTO
        </AppText>
        <AppText style={{ maxWidth: 720 }}>{project.requirement}</AppText>
        {project.closing_reason ? (
          <>
            <AppText variant="eyebrow" soft>
              MOTIVO DE CIERRE
            </AppText>
            <AppText>{project.closing_reason}</AppText>
          </>
        ) : null}
      </Card>
    </Page>
  );
}
