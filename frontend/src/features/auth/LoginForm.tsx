import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ErrorApi } from '@/core/api/cliente';
import { useSesion } from '@/core/sesion/SesionProvider';
import { Icono, Texto } from '@/design/componentes';
import { espacio } from '@/design/tokens';

import { type AuthMode, authColor, FormHeading, GoogleButton, LineField, type Notice, NoticeBox, SubmitButton, TextLink } from './authParts';

const USERNAME_KEY = 'cotizai.login.username';
const IDENTIFIER = /^([^@\s]+@[^@\s]+\.[^@\s]+|[A-Za-z0-9._-]{3,64})$/;

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

type Errors = { username?: string; password?: string };
type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

export function LoginForm({ onMode }: { onMode: (mode: AuthMode) => void }) {
  const { iniciarSesion } = useSesion();
  const [username, setUsername] = useState(rememberedUsername);
  const [remember, setRemember] = useState(() => rememberedUsername() !== '');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    const found: Errors = {};
    if (!IDENTIFIER.test(username.trim())) found.username = 'Ingrese su usuario o correo.';
    if (!password) found.password = 'Ingrese su contraseña.';
    setErrors(found);
    setNotice(null);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      rememberUsername(remember ? username.trim() : null);
      await iniciarSesion(username, password);
    } catch (e) {
      if (e instanceof ErrorApi) {
        if (e.estado === 401) setPassword(''); // kept on network errors or rate limit so the user can retry
        const ref = e.trackId ? ` (ref. ${e.trackId})` : '';
        const message =
          e.estado === 401 ? 'Credenciales inválidas o cuenta temporalmente bloqueada.' : e.estado === 429 ? 'Demasiados intentos. Espere un minuto.' : e.message;
        setNotice({ tone: 'error', text: `${message}${ref}` });
      } else {
        setNotice({ tone: 'error', text: 'Error inesperado.' });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <FormHeading title="Iniciar sesión" detail="Analice los presupuestos de sus proyectos." />
      <View style={{ gap: espacio.md }}>
        <LineField label="Usuario o correo" value={username} onChangeText={setUsername} error={errors.username} autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" returnKeyType="next" />
        <LineField label="Contraseña" secret value={password} onChangeText={setPassword} error={errors.password} autoCapitalize="none" autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={submit} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: espacio.sm }}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="Recordar mi usuario"
            accessibilityState={{ checked: remember }}
            aria-checked={remember}
            onPress={() => setRemember((v) => !v)}
            style={(e: PressState) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: espacio.sm, borderBottomWidth: 1, borderBottomColor: e.focused ? authColor.focus : 'transparent' })}
          >
            <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: remember ? authColor.text : authColor.underline, backgroundColor: remember ? authColor.text : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {remember ? <Icono nombre="check" tamano="sm" color="#FFFFFF" /> : null}
            </View>
            <Texto variante="pequeno" color={authColor.text}>
              Recordar mi usuario
            </Texto>
          </Pressable>
          <TextLink label="¿Olvidó su contraseña?" onPress={() => onMode('forgot')} />
        </View>
      </View>
      <NoticeBox notice={notice} />
      <SubmitButton label="Entrar" busy={busy} onPress={submit} />
      <GoogleButton onUnavailable={() => setNotice({ tone: 'info', text: 'El acceso con Google estará disponible cuando se configure en el servidor.' })} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: espacio.sm }}>
        <Texto variante="pequeno" color={authColor.soft}>
          ¿No tiene cuenta?
        </Texto>
        <TextLink strong label="Crear cuenta" onPress={() => onMode('register')} />
      </View>
    </>
  );
}
