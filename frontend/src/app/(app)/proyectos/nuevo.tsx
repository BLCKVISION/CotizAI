import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ErrorApi } from '@/core/api/cliente';
import { useSesion } from '@/core/sesion/SesionProvider';
import { Boton, CampoDeTexto, Chip, Icono, Tarjeta, Texto } from '@/design/componentes';
import { EncabezadoDePagina, Pagina } from '@/design/layout';
import { useTema } from '@/design/tema';
import { espacio } from '@/design/tokens';
import { crearProyectoApi, type Moneda } from '@/features/proyectos/api';
import { parsearMonto } from '@/features/proyectos/monto';

type Errores = { nombre?: string; requerimiento?: string; ubicacion?: string; presupuesto?: string; general?: string };

export default function NuevoProyecto() {
  const t = useTema();
  const router = useRouter();
  const { conSesion } = useSesion();
  const [nombre, setNombre] = useState('');
  const [requerimiento, setRequerimiento] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [presupuesto, setPresupuesto] = useState('');
  const [moneda, setMoneda] = useState<Moneda>('USD');
  const [errores, setErrores] = useState<Errores>({});
  const [cargando, setCargando] = useState(false);

  const validar = (): Errores => {
    const e: Errores = {};
    if (nombre.trim().length < 3) e.nombre = 'Escriba al menos 3 caracteres.';
    if (!requerimiento.trim()) e.requerimiento = 'Describa lo que se requiere adquirir.';
    if (!ubicacion.trim()) e.ubicacion = 'Indique la ubicación.';
    if (presupuesto.trim() && !((parsearMonto(presupuesto) ?? 0) > 0)) e.presupuesto = 'Ingrese un monto mayor que cero.';
    return e;
  };

  const guardar = async () => {
    const e = validar();
    setErrores(e);
    if (Object.keys(e).length > 0) return;
    setCargando(true);
    try {
      const p = await conSesion(
        crearProyectoApi({
          nombre: nombre.trim(),
          requerimiento: requerimiento.trim(),
          ubicacion: ubicacion.trim(),
          moneda,
          presupuesto_referencial: presupuesto.trim() ? parsearMonto(presupuesto) : null,
        }),
      );
      router.replace(`/proyectos/${p.id}`);
    } catch (err) {
      setErrores({
        general:
          err instanceof ErrorApi
            ? err.estado === 403
              ? 'Su rol no puede crear proyectos.'
              : `${err.message}${err.trackId ? ` (ref. ${err.trackId})` : ''}`
            : 'Error inesperado.',
      });
    } finally {
      setCargando(false);
    }
  };

  return (
    <Pagina>
      <EncabezadoDePagina
        sobretitulo="Nuevo"
        titulo="Nuevo proyecto"
        descripcion="Defina qué se va a adquirir. Después podrá cargar las propuestas a evaluar."
        accion={<Boton etiqueta="Volver" variante="fantasma" icono="arrow-left" onPress={() => router.back()} />}
      />
      <View style={{ width: '100%' }}>
        <Tarjeta>
          <View style={{ gap: espacio.md }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.lg, alignItems: 'flex-start' }}>
            <View style={{ flexGrow: 1, flexBasis: 360, gap: espacio.md }}>
            <CampoDeTexto etiqueta="Nombre del proyecto" icono="type" value={nombre} onChangeText={setNombre} error={errores.nombre} maxLength={120} />
            <CampoDeTexto etiqueta="Ubicación" icono="map-pin" value={ubicacion} onChangeText={setUbicacion} error={errores.ubicacion} maxLength={200} />
            <CampoDeTexto
              etiqueta="Presupuesto referencial (opcional)"
              icono="dollar-sign"
              value={presupuesto}
              onChangeText={setPresupuesto}
              error={errores.presupuesto}
              keyboardType="decimal-pad"
              ayuda="Solo como referencia; no descarta propuestas por sí solo."
            />
            <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: espacio.sm, alignItems: 'center' }}>
              <Texto variante="etiqueta">Moneda</Texto>
              {(['USD', 'VES'] as const).map((m) => (
                <Chip key={m} etiqueta={m === 'VES' ? 'Bolívares (VES)' : 'Dólares (USD)'} seleccionado={moneda === m} onPress={() => setMoneda(m)} />
              ))}
            </View>
            </View>
            <View style={{ flexGrow: 1.3, flexBasis: 420, gap: espacio.md }}>
            <CampoDeTexto
              etiqueta="Requerimiento"
              icono="file-text"
              value={requerimiento}
              onChangeText={setRequerimiento}
              error={errores.requerimiento}
              ayuda="Equipos, cantidades y condiciones (instalación, garantía, soporte)."
              multiline
              minLinesHeight={236}
              maxLength={5000}
            />
            </View>
            </View>
            {errores.general ? (
              <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: espacio.sm, alignItems: 'center' }}>
                <Icono nombre="alert-triangle" color={t.error.texto} />
                <Texto variante="pequeno" color={t.error.texto} style={{ flex: 1 }}>
                  {errores.general}
                </Texto>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: espacio.sm, flexWrap: 'wrap' }}>
              <Boton etiqueta="Crear proyecto" icono="check" onPress={guardar} cargando={cargando} />
              <Boton etiqueta="Cancelar" variante="secundario" onPress={() => router.back()} deshabilitado={cargando} />
            </View>
          </View>
        </Tarjeta>
      </View>
    </Pagina>
  );
}
