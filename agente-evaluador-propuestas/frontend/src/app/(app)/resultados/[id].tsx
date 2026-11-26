import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { ErrorApi } from '@/core/api/client';
import { useSession } from '@/core/session/SessionProvider';
import { Button, EmptyState, Skeleton, Icon, Card, AppText } from '@/design/components';
import { PageHeader, Page } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { spacing } from '@/design/tokens';
import { formatDate } from '@/features/projects/states';
import { getResultApi, type Result } from '@/features/results/api';
import { CriteriaMatrix, DiscardCard, ProposalCard, RecommendedCard } from '@/features/results/components';
import { recommendationReason, organize } from '@/features/results/logic';
import { DEMO_RESULT } from '@/features/results/simulated';

const ID_DEMO = 'demo';

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.md }}>
      <AppText variant="subtitle" accessibilityRole="header">
        {title}
        {count !== undefined ? ` (${count})` : ''}
      </AppText>
      {children}
    </View>
  );
}

/** Resultados de una evaluación: recomendada, ranking, matriz, descartes y desglose, cada cifra con su evidencia. */
export default function Results() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { withSession } = useSession();
  // La carga queda asociada a su id: al cambiar de evaluación se ignora la anterior sin resetear estado en el efecto.
  const [loading, setLoading] = useState<{ id: string; result?: Result; error?: string } | null>(null);
  const isDemo = id === ID_DEMO;
  const current = loading?.id === id ? loading : null;
  const result = isDemo ? DEMO_RESULT : (current?.result ?? null);
  const error = isDemo ? null : (current?.error ?? null);

  useEffect(() => {
    if (isDemo) return;
    let current = true;
    const currentId = String(id);
    (async () => {
      try {
        const data = await withSession(getResultApi(currentId));
        if (current) setLoading({ id: currentId, result: data });
      } catch (e) {
        if (!current) return;
        setLoading({
          id: currentId,
          error:
            e instanceof ErrorApi
              ? e.status === 404
                ? 'Todavía no hay resultados para esta evaluación.'
                : `${e.message}${e.trackId ? ` (ref. ${e.trackId})` : ''}`
              : 'Error inesperado.',
        });
      }
    })();
    return () => {
      current = false;
    };
  }, [withSession, id, isDemo]);

  const org = useMemo(() => (result ? organize(result) : null), [result]);
  const back = <Button label="Proyectos" variant="ghost" icon="arrow-left" onPress={() => router.replace('/proyectos')} />;

  if (error) {
    return (
      <Page>
        <PageHeader title="Resultados" action={back} />
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

  if (!result || !org) {
    return (
      <Page>
        <PageHeader title="Cargando resultados…" action={back} />
        <Card>
          <Skeleton height={22} width="50%" />
          <Skeleton height={14} width="80%" />
          <Skeleton height={14} width="65%" />
        </Card>
      </Page>
    );
  }

  const total = result.proposals.length;
  return (
    <Page>
      <PageHeader
        eyebrow="Resultados"
        title="Evaluación de propuestas"
        description={`${total} propuestas evaluadas · ${formatDate(result.generated)}`}
        action={back}
      />

      {isDemo ? (
        <View
          accessibilityRole="alert"
          style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', backgroundColor: t.info.background, padding: spacing.md, borderRadius: 12 }}
        >
          <Icon name="info" color={t.info.text} />
          <AppText color={t.info.text} style={{ flex: 1 }}>
            Datos de demostración: no corresponden a ninguna evaluación real.
          </AppText>
        </View>
      ) : null}

      {org.recommended ? (
        <RecommendedCard p={org.recommended} reason={recommendationReason(org, result.delta)} />
      ) : (
        <EmptyState
          icon="alert-circle"
          title="Sin propuesta recomendable"
          description={recommendationReason(org, result.delta)}
        />
      )}

      <Section title="Ranking" count={org.ranked.length}>
        {org.ranked.map((p) => (
          <ProposalCard key={p.id} p={p} position={p.position} />
        ))}
      </Section>

      <CriteriaMatrix proposals={org.ranked} />

      {org.discarded.length > 0 ? (
        <Section title="Descartadas" count={org.discarded.length}>
          {org.discarded.map((p) => (
            <DiscardCard key={p.id} p={p} />
          ))}
        </Section>
      ) : null}
    </Page>
  );
}
