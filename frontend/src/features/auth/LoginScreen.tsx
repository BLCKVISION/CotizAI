/** Light, editorial login: a full image with its message (left) and a quiet form panel (right). */
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, TextInput, type TextInputProps, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorApi } from '@/core/api/cliente';
import { useSesion } from '@/core/sesion/SesionProvider';
import { BrandRow } from '@/design/Brand';
import { Icono, Texto } from '@/design/componentes';
import { useDispositivo } from '@/design/dispositivo';
import { accentGradient, Entrada, soloWeb } from '@/design/efectos';
import { espacio, radio, texto } from '@/design/tokens';

// Copy of img/Login.jpg. Replace this file (same name) to change the login artwork.
const HERO = require('../../../assets/brand/login-hero.jpg');
const USERNAME_KEY = 'cotizai.login.username';
const IDENTIFIER = /^([^@\s]+@[^@\s]+\.[^@\s]+|[A-Za-z0-9._-]{3,64})$/;

const color = {
  backdrop: '#E9EBEF',
  panel: '#FFFFFF',
  text: '#0B1220',
  soft: '#556070',
  underline: '#8591A3',
  focus: '#0369A1',
  error: '#B91C1C',
  onAccent: '#06283D',
} as const;

type Errors = { username?: string; password?: string; general?: string };
type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

/** Only the user name may be remembered. The password and the session token are never stored. */
const rememberedUsername = () => {
  try {
    return (typeof window !== 'undefined' && window.localStorage?.getItem(USERNAME_KEY)) || '';
  } catch {
    return '';
  }
};
const rememberUsername = (value: string | null) => {
  try {
    if (value) window.localStorage.setItem(USERNAME_KEY, value);
    else window.localStorage.removeItem(USERNAME_KEY);
  } catch {
    /* storage blocked: nothing is remembered */
  }
};

/** Artwork panel. The message sits on frosted glass so it stays readable over any image. */
function HeroSide() {
  return (
    <View style={{ flex: 1.08, borderRadius: radio.panel, overflow: 'hidden', justifyContent: 'space-between', padding: espacio.lg }}>
      <Image source={HERO} resizeMode="cover" accessibilityIgnoresInvertColors style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
      <View style={{ alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: radio.pildora, paddingVertical: espacio.xs, paddingLeft: espacio.xs, paddingRight: espacio.md, ...soloWeb({ backdropFilter: 'blur(18px)' }) }}>
        <BrandRow size={40} />
      </View>
      <Entrada indice={3}>
        <View style={{ alignSelf: 'flex-start', maxWidth: 460, gap: espacio.sm, padding: espacio.lg, borderRadius: radio.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)', backgroundColor: 'rgba(255,255,255,0.76)', ...soloWeb({ backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)' }) }}>
          <Texto variante="subtitulo" color={color.text} style={{ fontFamily: 'Urbanist_600SemiBold', fontSize: 22, lineHeight: 28 }}>
            Compare presupuestos y elija con evidencia.
          </Texto>
          <Texto variante="pequeno" color="#334155">
            Suba su proyecto y de 3 a 20 propuestas: PDF, fotos, hojas de cálculo o capturas de chat.
          </Texto>
        </View>
      </Entrada>
    </View>
  );
}

function LineField({ label, error, secret = false, ...props }: TextInputProps & { label: string; error?: string; secret?: boolean }) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  return (
    <View style={{ width: '100%', gap: espacio.xs }}>
      <Texto variante="etiqueta" color={color.text}>
        {label}
      </Texto>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: focused ? 2 : 1, paddingBottom: focused ? 0 : 1, borderBottomColor: error ? color.error : focused ? color.focus : color.underline }}>
        <TextInput
          {...props}
          accessibilityLabel={label}
          accessibilityHint={error}
          aria-invalid={Boolean(error)}
          secureTextEntry={secret && !visible}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[{ ...texto.cuerpo, fontSize: 17, flex: 1, minWidth: 0, minHeight: 44, color: color.text }, soloWeb({ outlineStyle: 'none', backgroundColor: 'transparent' })]}
        />
        {secret ? (
          <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} onPress={() => setVisible((v) => !v)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Icono nombre={visible ? 'eye-off' : 'eye'} tamano="sm" color={color.soft} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Texto variante="pequeno" color={color.error} accessibilityLiveRegion="polite">
          {error}
        </Texto>
      ) : null}
    </View>
  );
}

function TextLink({ label, onPress, expanded }: { label: string; onPress: () => void; expanded?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      onPress={onPress}
      style={(e: PressState) => ({ minHeight: 44, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: e.focused ? color.focus : 'transparent' })}
    >
      <Texto variante="pequeno" color={color.soft}>
        {label}
      </Texto>
    </Pressable>
  );
}

export function LoginScreen() {
  const { dispositivo } = useDispositivo();
  const { iniciarSesion } = useSesion();
  const [username, setUsername] = useState(rememberedUsername);
  const [remember, setRemember] = useState(() => rememberedUsername() !== '');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState<'about' | 'forgot' | null>(null);
  const wide = dispositivo === 'escritorio';

  const submit = async () => {
    if (busy) return;
    const found: Errors = {};
    if (!IDENTIFIER.test(username.trim())) found.username = 'Ingrese su usuario o correo.';
    if (!password) found.password = 'Ingrese su contraseña.';
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      rememberUsername(remember ? username.trim() : null);
      await iniciarSesion(username, password);
    } catch (e) {
      if (e instanceof ErrorApi) {
        if (e.estado === 401) setPassword(''); // kept on network errors or rate limit so the user can retry
        const ref = e.trackId ? ` (ref. ${e.trackId})` : '';
        setErrors({
          general:
            e.estado === 401
              ? `Credenciales inválidas o cuenta temporalmente bloqueada.${ref}`
              : e.estado === 429
                ? `Demasiados intentos. Espere un minuto.${ref}`
                : `${e.message}${ref}`,
        });
      } else {
        setErrors({ general: 'Error inesperado.' });
      }
    } finally {
      setBusy(false);
    }
  };

  const panel = (
    <View style={{ flex: 1, backgroundColor: color.panel, borderRadius: radio.panel }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: wide ? espacio.xl : espacio.lg, justifyContent: 'space-between', gap: espacio.lg }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: wide ? 'row' : 'column', justifyContent: wide ? 'flex-end' : 'space-between', alignItems: wide ? 'center' : 'flex-start', gap: espacio.md }}>
          {wide ? null : <BrandRow size={36} />}
          <TextLink label="¿Qué hace CotizAI?" expanded={help === 'about'} onPress={() => setHelp((h) => (h === 'about' ? null : 'about'))} />
        </View>

        <View style={{ gap: espacio.xl, width: '100%', maxWidth: 480, alignSelf: 'center' }}>
          {help === 'about' ? (
            <Texto variante="pequeno" color={color.soft} accessibilityLiveRegion="polite">
              CotizAI reúne las propuestas de sus proveedores para compararlas contra su proyecto: cálculos, costos ocultos y precios, con la evidencia de cada hallazgo. La evaluación automática estará disponible al conectar el motor.
            </Texto>
          ) : null}
          <View style={{ gap: espacio.xs }}>
            <Texto accessibilityRole="header" color={color.text} style={{ fontFamily: 'Urbanist_400Regular', fontSize: wide ? 52 : 40, lineHeight: wide ? 60 : 48, letterSpacing: -1.4 }}>
              Iniciar sesión
            </Texto>
            <Texto color={color.soft}>Analice los presupuestos de sus proyectos.</Texto>
          </View>
          <View style={{ gap: espacio.lg }}>
            <LineField label="Usuario o correo" value={username} onChangeText={setUsername} error={errors.username} autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" returnKeyType="next" />
            <LineField label="Contraseña" secret value={password} onChangeText={setPassword} error={errors.password} autoCapitalize="none" autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={submit} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: espacio.md }}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel="Recordar mi usuario"
              accessibilityState={{ checked: remember }}
              aria-checked={remember}
              onPress={() => setRemember((v) => !v)}
              style={(e: PressState) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: espacio.sm, borderBottomWidth: 1, borderBottomColor: e.focused ? color.focus : 'transparent' })}
            >
              <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: remember ? color.text : color.underline, backgroundColor: remember ? color.text : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {remember ? <Icono nombre="check" tamano="sm" color="#FFFFFF" /> : null}
              </View>
              <Texto variante="pequeno" color={color.text}>
                Recordar mi usuario
              </Texto>
            </Pressable>
            <TextLink label="¿Olvidó su contraseña?" expanded={help === 'forgot'} onPress={() => setHelp((h) => (h === 'forgot' ? null : 'forgot'))} />
          </View>
          {help === 'forgot' ? (
            <Texto variante="pequeno" color={color.soft} accessibilityLiveRegion="polite">
              Pida una nueva contraseña a quien administra CotizAI en su organización.
            </Texto>
          ) : null}
          {errors.general ? (
            <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ flexDirection: 'row', gap: espacio.sm, alignItems: 'center' }}>
              <Icono nombre="alert-triangle" tamano="sm" color={color.error} />
              <Texto variante="pequeno" color={color.error} style={{ flex: 1 }}>
                {errors.general}
              </Texto>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Entrar"
            accessibilityState={{ disabled: busy, busy }}
            disabled={busy}
            onPress={submit}
            style={(e: PressState) => ({
              alignSelf: wide ? 'flex-start' : 'stretch',
              minWidth: 168,
              height: 48,
              flexDirection: 'row',
              gap: espacio.sm,
              borderRadius: radio.pildora,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: e.focused ? color.focus : 'transparent',
              ...accentGradient(100),
              ...soloWeb({ transitionProperty: 'transform, box-shadow', transitionDuration: '260ms', transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)', ...(e.hovered ? { transform: 'translateY(-2px)', boxShadow: '0 14px 28px -16px rgba(14,143,168,0.65)' } : null) }),
            })}
          >
            {busy ? (
              <ActivityIndicator color={color.onAccent} />
            ) : (
              <>
                <Texto variante="etiqueta" color={color.onAccent}>
                  Entrar
                </Texto>
                <Icono nombre="arrow-right" tamano="sm" color={color.onAccent} />
              </>
            )}
          </Pressable>
        </View>

        {/* Balances the top row so the form stays optically centred. */}
        <Texto variante="pequeno" color={color.soft} style={{ textAlign: wide ? 'right' : 'center' }}>
          © 2026 CotizAI · Hackatón Venezuela INNOVA
        </Texto>
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.backdrop }}>
      <View style={{ flex: 1, flexDirection: 'row', padding: wide ? espacio.md : espacio.sm, gap: espacio.md }}>
        {wide ? <HeroSide /> : null}
        <View style={{ flex: 1 }}>{panel}</View>
      </View>
    </SafeAreaView>
  );
}
