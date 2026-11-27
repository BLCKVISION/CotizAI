import { useState } from 'react';
import { View } from 'react-native';

import { Icono, Texto } from '@/design/componentes';
import { espacio } from '@/design/tokens';

import { registerAccountApi } from './api';
import { accountErrorNotice, type AuthMode, authColor, FormHeading, LineField, type Notice, NoticeBox, SubmitButton, TextLink } from './authParts';
import { checkPassword, isEmail, isStrongPassword } from './passwordRules';

type Errors = { name?: string; email?: string; password?: string; confirmation?: string };

function PasswordRules({ password, email }: { password: string; email: string }) {
  return (
    <View accessibilityLabel="Requisitos de la contraseña" style={{ gap: 2 }}>
      {checkPassword(password, email).map((rule) => (
        <View key={rule.id} accessible accessibilityLabel={`${rule.label}: ${rule.passes ? 'cumplido' : 'pendiente'}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icono nombre={rule.passes ? 'check-circle' : 'circle'} tamano="sm" color={rule.passes ? '#166534' : authColor.underline} />
          <Texto variante="pequeno" color={rule.passes ? '#166534' : authColor.soft} style={{ flex: 1 }}>
            {rule.label}
          </Texto>
        </View>
      ))}
    </View>
  );
}

export function RegisterForm({ onMode }: { onMode: (mode: AuthMode) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    const found: Errors = {};
    if (name.trim().length < 3) found.name = 'Escriba su nombre (mínimo 3 caracteres).';
    if (!isEmail(email)) found.email = 'Ingrese un correo válido.';
    if (!isStrongPassword(password, email)) found.password = 'La contraseña no cumple todos los requisitos.';
    if (confirmation !== password || !confirmation) found.confirmation = 'Las contraseñas no coinciden.';
    setErrors(found);
    setNotice(null);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      await registerAccountApi(name.trim(), email.trim().toLowerCase(), password);
      setPassword('');
      setConfirmation('');
      // The server answers the same for a new and an existing address, so accounts cannot be discovered.
      setNotice({ tone: 'success', text: 'Listo. Inicie sesión con su correo y contraseña. Si no puede entrar, es posible que ese correo ya tuviera una cuenta.' });
    } catch (e) {
      setNotice(accountErrorNotice(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <FormHeading title="Crear cuenta" detail="Empiece a comparar propuestas con evidencia." />
      {/* Raised so the hint bubbles are painted over the buttons below. */}
      <View style={{ gap: espacio.sm + 4, zIndex: 10 }}>
        <LineField label="Nombre completo" value={name} onChangeText={setName} error={errors.name} autoComplete="name" />
        <LineField label="Correo" value={email} onChangeText={setEmail} error={errors.email} autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" />
        {/* Side by side when there is room, so the whole form fits without scrolling. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.md, zIndex: 2 }}>
          <View style={{ flexGrow: 1, flexBasis: 180 }}>
            <LineField label="Contraseña" hint={<PasswordRules password={password} email={email} />} secret value={password} onChangeText={setPassword} error={errors.password} autoCapitalize="none" autoComplete="new-password" />
          </View>
          <View style={{ flexGrow: 1, flexBasis: 180 }}>
            <LineField label="Confirmar contraseña" secret value={confirmation} onChangeText={setConfirmation} error={errors.confirmation} autoCapitalize="none" autoComplete="new-password" returnKeyType="go" onSubmitEditing={submit} />
          </View>
        </View>
      </View>
      <NoticeBox notice={notice} />
      <SubmitButton label="Crear cuenta" busy={busy} onPress={submit} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: espacio.sm }}>
        <Texto variante="pequeno" color={authColor.soft}>
          ¿Ya tiene cuenta?
        </Texto>
        <TextLink strong label="Iniciar sesión" onPress={() => onMode('login')} />
      </View>
    </>
  );
}
