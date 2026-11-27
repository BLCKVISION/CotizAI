import { useState } from 'react';
import { View } from 'react-native';

import { requestPasswordResetApi } from './api';
import { accountErrorNotice, type AuthMode, FormHeading, LineField, type Notice, NoticeBox, SubmitButton, TextLink } from './authParts';
import { isEmail } from './passwordRules';

export function ForgotPasswordForm({ onMode }: { onMode: (mode: AuthMode) => void }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setNotice(null);
    if (!isEmail(email)) return setError('Ingrese un correo válido.');
    setError(undefined);
    setBusy(true);
    try {
      await requestPasswordResetApi(email.trim().toLowerCase());
      // Same answer whether or not the account exists, so addresses cannot be discovered.
      setNotice({ tone: 'success', text: 'Si el correo está registrado, recibirá las instrucciones.' });
    } catch (e) {
      setNotice(accountErrorNotice(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <FormHeading title="Recuperar acceso" detail="Escriba su correo y le enviaremos las instrucciones." />
      <LineField label="Correo" value={email} onChangeText={setEmail} error={error} autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" returnKeyType="go" onSubmitEditing={submit} />
      <NoticeBox notice={notice} />
      <SubmitButton label="Enviar instrucciones" busy={busy} onPress={submit} />
      <View style={{ alignItems: 'center' }}>
        <TextLink strong label="Volver a iniciar sesión" onPress={() => onMode('login')} />
      </View>
    </>
  );
}
