import { type AuthMode, FormHeading, NoticeBox, TextLink } from './authParts';
import { View } from 'react-native';

/** There is no mail service, so a password cannot be reset from here. The screen says so instead of pretending. */
export function ForgotPasswordForm({ onMode }: { onMode: (mode: AuthMode) => void }) {
  return (
    <>
      <FormHeading title="Recuperar acceso" detail="Por seguridad, el restablecimiento lo hace una persona." />
      <NoticeBox notice={{ tone: 'info', text: 'Pida al administrador de su organización que restablezca su contraseña. Esta versión no envía correos.' }} />
      <View style={{ alignItems: 'center' }}>
        <TextLink strong label="Volver a iniciar sesión" onPress={() => { onMode('login'); }} />
      </View>
    </>
  );
}
