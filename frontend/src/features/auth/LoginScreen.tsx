/** Light, editorial access screen: artwork with its message (left) and the account forms (right). */
import { useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandRow } from '@/design/Brand';
import { Texto } from '@/design/componentes';
import { useDispositivo } from '@/design/dispositivo';
import { Entrada, soloWeb } from '@/design/efectos';
import { espacio, radio } from '@/design/tokens';
import { tint } from '@/design/tema';

import { type AuthMode, authColor } from './authParts';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';

// Copy of img/Login.jpg. Replace this file (same name) to change the login artwork.
const HERO = require('../../../assets/brand/login-hero.jpg');

/** Artwork panel. The message sits on frosted glass so it stays readable over any image. */
function HeroSide() {
  return (
    <View style={{ flex: 1.08, borderRadius: radio.panel, overflow: 'hidden', justifyContent: 'flex-end', padding: espacio.lg }}>
      <Image source={HERO} resizeMode="cover" accessibilityIgnoresInvertColors style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
      <Entrada indice={3}>
        <View style={{ alignSelf: 'flex-start', maxWidth: 460, padding: espacio.lg, borderRadius: radio.xl, borderWidth: 1, borderColor: tint.white(0.8), backgroundColor: tint.white(0.76), ...soloWeb({ backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)' }) }}>
          <Texto variante="subtitulo" accessibilityRole="header" color={authColor.text} style={{ fontFamily: 'Urbanist_600SemiBold', fontSize: 22, lineHeight: 28 }}>
            La IA analiza e interpreta. La decisión final es humana.
          </Texto>
        </View>
      </Entrada>
    </View>
  );
}

const FORMS = { login: LoginForm, register: RegisterForm, forgot: ForgotPasswordForm };

export function LoginScreen() {
  const { dispositivo } = useDispositivo();
  const [mode, setMode] = useState<AuthMode>('login');
  const wide = dispositivo === 'escritorio';
  const Form = FORMS[mode];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: authColor.backdrop }}>
      <View style={{ flex: 1, flexDirection: 'row', padding: wide ? espacio.md : espacio.sm, gap: espacio.md }}>
        {wide ? <HeroSide /> : null}
        <View style={{ flex: 1, backgroundColor: authColor.panel, borderRadius: radio.panel }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: wide ? espacio.lg : espacio.md, paddingTop: wide ? espacio.xl : espacio.lg, paddingBottom: espacio.sm, gap: espacio.md }} keyboardShouldPersistTaps="handled">
            {/* The logo stays at the top; the form is centred in the remaining space. */}
            <View style={{ alignItems: 'center' }}>
              <BrandRow size={56} />
            </View>
            <View style={{ flexGrow: 1, justifyContent: 'center', width: '100%', maxWidth: 420, alignSelf: 'center' }}>
              <Entrada key={mode}>
                <View style={{ gap: espacio.sm + 4 }}>
                  <Form onMode={setMode} />
                </View>
              </Entrada>
            </View>
            <Texto variante="pequeno" color={authColor.soft} style={{ textAlign: 'center' }}>
              © 2026 CotizAI · Hackatón Venezuela INNOVA
            </Texto>
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}
