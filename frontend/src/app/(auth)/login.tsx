import { Redirect, type Href } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorApi } from '@/core/api/cliente';
import { useSesion } from '@/core/sesion/SesionProvider';
import { Boton, CampoDeTexto, Icono, Marca, type NombreIcono, Texto } from '@/design/componentes';
import { useDispositivo } from '@/design/dispositivo';
import { Escalonado, vidrio } from '@/design/efectos';
import { useTema } from '@/design/tema';
import { espacio, margenFlotante, radio } from '@/design/tokens';

type Errores = { correo?: string; contrasena?: string; general?: string };

const PUNTOS: { icono: NombreIcono; titulo: string; detalle: string }[] = [
  { icono: 'search', titulo: 'Evidencia citada', detalle: 'Cada hallazgo señala dónde aparece en la propuesta.' },
  { icono: 'divide-square', titulo: 'Aritmética exacta', detalle: 'Los montos los calcula el código, no el modelo.' },
  { icono: 'users', titulo: 'Decide el comité', detalle: 'La IA propone; las personas adjudican.' },
];

/** Panel de marca: tarjeta flotante de cristal blanco sobre los halos pastel; cada punto entra escalonado. */
function PanelDeMarca() {
  const t = useTema();
  return (
    <View style={{ flex: 1, padding: margenFlotante }}>
      <View
        style={{
          ...vidrio({ opacidad: 0.7, blur: 32, radio: radio.panel }),
          flex: 1,
          padding: espacio.xxl,
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
          style={{ position: 'absolute', right: 120, top: 90, width: 14, height: 14, borderRadius: 7, backgroundColor: t.lima, borderWidth: 1, borderColor: 'rgba(0,0,0,0.2)' }}
        />
        <Marca />
        <View style={{ gap: espacio.xl, maxWidth: 520 }}>
          <View style={{ gap: espacio.md }}>
            <Texto variante="sobretitulo" suave>
              HACKATÓN VENEZUELA INNOVA 2026
            </Texto>
            <Texto variante="hero">Decisiones de compra claras, explicadas y auditables.</Texto>
          </View>
          <View style={{ gap: espacio.md }}>
            <Escalonado>
              {PUNTOS.map((p) => (
                <View
                  key={p.titulo}
                  style={{
                    ...vidrio({ opacidad: 0.8, blur: 12, radio: radio.lg }),
                    flexDirection: 'row',
                    gap: espacio.md,
                    alignItems: 'center',
                    padding: espacio.md,
                  }}
                >
                  <View
                    style={{ width: 40, height: 40, borderRadius: radio.pildora, backgroundColor: t.lima, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Icono nombre={p.icono} color={t.sobreLima} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Texto variante="etiqueta">{p.titulo}</Texto>
                    <Texto variante="pequeno" suave>
                      {p.detalle}
                    </Texto>
                  </View>
                </View>
              ))}
            </Escalonado>
          </View>
        </View>
        <Texto variante="pequeno" suave>
          Evaluación de propuestas para dotación de laboratorios
        </Texto>
      </View>
    </View>
  );
}

export default function Login() {
  const t = useTema();
  const { dispositivo } = useDispositivo();
  const { token, iniciarSesion } = useSesion();
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [errores, setErrores] = useState<Errores>({});
  const [cargando, setCargando] = useState(false);

  if (token) return <Redirect href={'/resumen' as Href} />;

  const validar = (): Errores => {
    const e: Errores = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo.trim())) e.correo = 'Ingrese un correo válido.';
    if (!contrasena) e.contrasena = 'Ingrese su contraseña.';
    return e;
  };

  const enviar = async () => {
    const e = validar();
    setErrores(e);
    if (Object.keys(e).length > 0) return;
    setCargando(true);
    try {
      await iniciarSesion(correo, contrasena);
      setContrasena(''); // no conservar la contraseña en la UI tras iniciar sesión
    } catch (err) {
      if (err instanceof ErrorApi) {
        if (err.estado === 401) setContrasena(''); // con fallos de red o 429 se conserva para reintentar
        const ref = err.trackId ? ` (ref. ${err.trackId})` : '';
        setErrores({
          general:
            err.estado === 401
              ? `Credenciales inválidas o cuenta temporalmente bloqueada.${ref}`
              : err.estado === 429
                ? `Demasiados intentos. Espere un minuto.${ref}`
                : `${err.message}${ref}`,
        });
      } else {
        setErrores({ general: 'Error inesperado.' });
      }
    } finally {
      setCargando(false);
    }
  };

  const formulario = (
    <View style={{ width: '100%', maxWidth: 440, gap: espacio.xl }}>
      {dispositivo !== 'escritorio' ? <Marca /> : null}
      <View style={{ gap: espacio.xs }}>
        <Texto variante="titulo" accessibilityRole="header">
          Bienvenido
        </Texto>
        <Texto suave>Ingrese con su correo y contraseña.</Texto>
      </View>
      <View style={{ gap: espacio.md }}>
        <CampoDeTexto
          etiqueta="Correo electrónico"
          icono="mail"
          value={correo}
          onChangeText={setCorreo}
          error={errores.correo}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="username"
          returnKeyType="next"
        />
        <CampoDeTexto
          etiqueta="Contraseña"
          icono="lock"
          value={contrasena}
          onChangeText={setContrasena}
          error={errores.contrasena}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={enviar}
        />
        {errores.general ? (
          <View
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
            style={{ flexDirection: 'row', gap: espacio.sm, padding: espacio.md, borderRadius: radio.md, backgroundColor: t.error.fondo }}
          >
            <Icono nombre="alert-triangle" color={t.error.texto} />
            <Texto variante="pequeno" color={t.error.texto} style={{ flex: 1 }}>
              {errores.general}
            </Texto>
          </View>
        ) : null}
        <Boton etiqueta="Iniciar sesión" icono="log-in" onPress={enviar} cargando={cargando} anchoCompleto />
      </View>
      <View style={{ flexDirection: 'row', gap: espacio.sm, alignItems: 'center' }}>
        <Icono nombre="shield" tamano="sm" color={t.textoSuave} />
        <Texto variante="pequeno" suave style={{ flex: 1 }}>
          Conexión protegida. Su sesión expira por inactividad.
        </Texto>
      </View>
    </View>
  );

  if (dispositivo === 'escritorio') {
    return (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ flex: 1.05 }}>
          <PanelDeMarca />
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: espacio.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          {formulario}
        </ScrollView>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: espacio.lg }}
        keyboardShouldPersistTaps="handled"
      >
        {formulario}
      </ScrollView>
    </SafeAreaView>
  );
}
