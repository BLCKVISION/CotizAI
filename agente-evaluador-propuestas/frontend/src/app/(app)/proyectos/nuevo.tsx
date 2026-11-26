import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ErrorApi } from '@/core/api/client';
import { useSession } from '@/core/session/SessionProvider';
import { Button, TextField, Icon, Card, AppText } from '@/design/components';
import { PageHeader, Page } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { maxReadingWidth, spacing } from '@/design/tokens';
import { createProjectApi } from '@/features/projects/api';
import { parseAmount } from '@/features/projects/amount';

type Errors = { name?: string; requirement?: string; location?: string; budget?: string; general?: string };

export default function NewProject() {
  const t = useTheme();
  const router = useRouter();
  const { withSession } = useSession();
  const [name, setName] = useState('');
  const [requirement, setRequirement] = useState('');
  const [location, setLocation] = useState('');
  const [budget, setBudget] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);

  const validate = (): Errors => {
    const e: Errors = {};
    if (name.trim().length < 3) e.name = 'Escriba al menos 3 caracteres.';
    if (!requirement.trim()) e.requirement = 'Describa lo que se requiere adquirir.';
    if (!location.trim()) e.location = 'Indique la ubicación.';
    if (budget.trim() && !((parseAmount(budget) ?? 0) > 0)) e.budget = 'Ingrese un monto mayor que cero.';
    return e;
  };

  const save = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setLoading(true);
    try {
      const p = await withSession(
        createProjectApi({
          name: name.trim(),
          requirement: requirement.trim(),
          location: location.trim(),
          reference_budget: budget.trim() ? parseAmount(budget) : null,
        }),
      );
      router.replace(`/proyectos/${p.id}`);
    } catch (err) {
      setErrors({
        general:
          err instanceof ErrorApi
            ? err.status === 403
              ? 'Su rol no puede crear proyectos.'
              : `${err.message}${err.trackId ? ` (ref. ${err.trackId})` : ''}`
            : 'Error inesperado.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Nuevo"
        title="Nuevo proyecto"
        description="Defina qué se va a adquirir. Después podrá cargar las propuestas a evaluar."
        action={<Button label="Volver" variant="ghost" icon="arrow-left" onPress={() => router.back()} />}
      />
      <View style={{ maxWidth: maxReadingWidth, width: '100%' }}>
        <Card>
          <View style={{ gap: spacing.md }}>
            <TextField label="Nombre del proyecto" icon="type" value={name} onChangeText={setName} error={errors.name} maxLength={120} />
            <TextField
              label="Requerimiento"
              icon="file-text"
              value={requirement}
              onChangeText={setRequirement}
              error={errors.requirement}
              help="Equipos, cantidades y condiciones (instalación, garantía, soporte)."
              multiline
              maxLength={5000}
            />
            <TextField label="Ubicación" icon="map-pin" value={location} onChangeText={setLocation} error={errors.location} maxLength={200} />
            <TextField
              label="Presupuesto referencial (opcional)"
              icon="dollar-sign"
              value={budget}
              onChangeText={setBudget}
              error={errors.budget}
              keyboardType="decimal-pad"
              help="Solo como referencia; no descarta propuestas por sí solo."
            />
            {errors.general ? (
              <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                <Icon name="alert-triangle" color={t.error.text} />
                <AppText variant="small" color={t.error.text} style={{ flex: 1 }}>
                  {errors.general}
                </AppText>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
              <Button label="Crear proyecto" icon="check" onPress={save} loading={loading} />
              <Button label="Cancelar" variant="secondary" onPress={() => router.back()} disabled={loading} />
            </View>
          </View>
        </Card>
      </View>
    </Page>
  );
}
