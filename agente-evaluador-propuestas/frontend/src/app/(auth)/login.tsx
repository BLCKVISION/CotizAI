import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorApi } from '@/core/api/client';
import { useSession } from '@/core/session/SessionProvider';
import { Button, TextField, Icon, Brand, type IconName, AppText } from '@/design/components';
import { useDevice } from '@/design/device';
import { Staggered, glass } from '@/design/effects';
import { useTheme } from '@/design/theme';
import { spacing, floatMargin, radius } from '@/design/tokens';

type Errors = { email?: string; password?: string; general?: string };

const POINTS: { icon: IconName; title: string; detail: string }[] = [
  { icon: 'search', title: 'Evidencia citada', detail: 'Cada hallazgo señala dónde aparece en la propuesta.' },
  { icon: 'divide-square', title: 'Aritmética exacta', detail: 'Los montos los calcula el código, no el modelo.' },
  { icon: 'users', title: 'Decide el comité', detail: 'La IA propone; las personas adjudican.' },
];

/** Panel de marca: tarjeta flotante de cristal blanco sobre los halos pastel; cada punto entra escalonado. */
function BrandPanel() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, padding: floatMargin }}>
      <View
        style={{
          ...glass({ opacity: 0.7, blur: 32, radius: radius.panel }),
          flex: 1,
          padding: spacing.xxl,
          justifyContent: 'space-between',
          overflow: 'hidden',
        }}
      >
        {/* Motivo: anillos concéntricos tenues con punto lima */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', right: -160, top: -160, width: 520, height: 520, borderRadius: 260, borderWidth: 1, borderColor: 'rgba(15,23,42,0.07)' }}
        />
        <View
          pointerEvents="none"
          style={{ position: 'absolute', right: -90, top: -90, width: 380, height: 380, borderRadius: 190, borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)' }}
        />
        <View
          pointerEvents="none"
          style={{ position: 'absolute', right: 120, top: 90, width: 14, height: 14, borderRadius: 7, backgroundColor: t.lime, borderWidth: 1, borderColor: 'rgba(0,0,0,0.2)' }}
        />
        <Brand />
        <View style={{ gap: spacing.xl, maxWidth: 520 }}>
          <View style={{ gap: spacing.md }}>
            <AppText variant="eyebrow" soft>
              HACKATÓN VENEZUELA INNOVA 2026
            </AppText>
            <AppText variant="hero">Decisiones de compra claras, explicadas y auditables.</AppText>
          </View>
          <View style={{ gap: spacing.md }}>
            <Staggered>
              {POINTS.map((p) => (
                <View
                  key={p.title}
                  style={{
                    ...glass({ opacity: 0.8, blur: 12, radius: radius.lg }),
                    flexDirection: 'row',
                    gap: spacing.md,
                    alignItems: 'center',
                    padding: spacing.md,
                  }}
                >
                  <View
                    style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: t.lime, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Icon name={p.icon} color={t.onLime} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="label">{p.title}</AppText>
                    <AppText variant="small" soft>
                      {p.detail}
                    </AppText>
                  </View>
                </View>
              ))}
            </Staggered>
          </View>
        </View>
        <AppText variant="small" soft>
          Evaluación de propuestas para dotación de laboratorios
        </AppText>
      </View>
    </View>
  );
}

export default function Login() {
  const t = useTheme();
  const { device } = useDevice();
  const { token, startSession } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);

  if (token) return <Redirect href="/proyectos" />;

  const validate = (): Errors => {
    const e: Errors = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) e.email = 'Ingrese un correo válido.';
    if (!password) e.password = 'Ingrese su contraseña.';
    return e;
  };

  const submit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setLoading(true);
    try {
      await startSession(email, password);
      setPassword(''); // no conservar la contraseña en la UI tras iniciar sesión
    } catch (err) {
      if (err instanceof ErrorApi) {
        if (err.status === 401) setPassword(''); // con fallos de red o 429 se conserva para reintentar
        const ref = err.trackId ? ` (ref. ${err.trackId})` : '';
        setErrors({
          general:
            err.status === 401
              ? `Credenciales inválidas o cuenta temporalmente bloqueada.${ref}`
              : err.status === 429
                ? `Demasiados intentos. Espere un minuto.${ref}`
                : `${err.message}${ref}`,
        });
      } else {
        setErrors({ general: 'Error inesperado.' });
      }
    } finally {
      setLoading(false);
    }
  };

  const form = (
    <View style={{ width: '100%', maxWidth: 440, gap: spacing.xl }}>
      {device !== 'desktop' ? <Brand /> : null}
      <View style={{ gap: spacing.xs }}>
        <AppText variant="title" accessibilityRole="header">
          Bienvenido
        </AppText>
        <AppText soft>Ingrese con su correo y contraseña.</AppText>
      </View>
      <View style={{ gap: spacing.md }}>
        <TextField
          label="Correo electrónico"
          icon="mail"
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="username"
          returnKeyType="next"
        />
        <TextField
          label="Contraseña"
          icon="lock"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        {errors.general ? (
          <View
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
            style={{ flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: t.error.background }}
          >
            <Icon name="alert-triangle" color={t.error.text} />
            <AppText variant="small" color={t.error.text} style={{ flex: 1 }}>
              {errors.general}
            </AppText>
          </View>
        ) : null}
        <Button label="Iniciar sesión" icon="log-in" onPress={submit} loading={loading} fullWidth />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
        <Icon name="shield" size="sm" color={t.softText} />
        <AppText variant="small" soft style={{ flex: 1 }}>
          Conexión protegida. Su sesión expira por inactividad.
        </AppText>
      </View>
    </View>
  );

  if (device === 'desktop') {
    return (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ flex: 1.05 }}>
          <BrandPanel />
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          {form}
        </ScrollView>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        {form}
      </ScrollView>
    </SafeAreaView>
  );
}
