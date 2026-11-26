import { useState } from 'react';
import { View } from 'react-native';

import { useSesion } from '@/core/sesion/SesionProvider';
import { mensajeDeError, useDatos } from '@/core/useDatos';
import { Aviso, Cargando, Columna, ErrorConReintento, Rejilla, TituloDeSeccion } from '@/design/bloques';
import { CollapsibleCard } from '@/design/Collapsible';
import { Boton, CampoDeTexto, EstadoVacio, Tarjeta, Texto } from '@/design/componentes';
import { EncabezadoDePagina, Pagina } from '@/design/layout';
import { espacio } from '@/design/tokens';
import { proveedoresApi, registrarProveedorApi } from '@/features/gestion/api';

const VACIO = { nombre: '', rif: '', ubicacion: '', contacto: '' };

export default function Proveedores() {
  const { usuario, conSesion } = useSesion();
  const { datos, error, recargar } = useDatos(proveedoresApi);
  const [formulario, setFormulario] = useState(VACIO);
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [fallo, setFallo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const campo = (k: keyof typeof VACIO) => ({ value: formulario[k], onChangeText: (v: string) => setFormulario((f) => ({ ...f, [k]: v })) });

  const guardar = async () => {
    if (Object.values(formulario).some((v) => v.trim().length < 3)) return setFallo('Complete todos los campos (mínimo 3 caracteres).');
    if (!/^[JGVEP]-?\d{7,9}-?\d?$/i.test(formulario.rif.trim())) return setFallo('RIF no válido. Ejemplo de formato: J-12345678-9.');
    setGuardando(true);
    try {
      await conSesion(registrarProveedorApi(formulario));
      setFormulario(VACIO);
      setAbierto(false);
      setFallo(null);
      recargar();
    } catch (e) {
      setFallo(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };

  const q = busqueda.trim().toLowerCase();
  const visibles = (datos ?? []).filter((p) => `${p.nombre} ${p.rif} ${p.ubicacion}`.toLowerCase().includes(q));

  return (
    <Pagina>
      <EncabezadoDePagina
        sobretitulo="Proveedores"
        titulo="Directorio de proveedores"
        descripcion="Datos básicos de quienes participan en los procesos de compra."
        accion={usuario?.rol === 'cargador' ? <Boton etiqueta={abierto ? 'Cerrar formulario' : 'Nuevo proveedor'} icono={abierto ? 'x' : 'plus'} onPress={() => setAbierto((v) => !v)} /> : undefined}
      />
      {abierto ? (
        <Tarjeta>
          <TituloDeSeccion titulo="Nuevo proveedor" />
          <View style={{ gap: espacio.md }}>
            <CampoDeTexto etiqueta="Nombre o razón social" icono="briefcase" {...campo('nombre')} />
            <CampoDeTexto etiqueta="RIF" icono="hash" {...campo('rif')} />
            <CampoDeTexto etiqueta="Ubicación" icono="map-pin" {...campo('ubicacion')} />
            <CampoDeTexto etiqueta="Contacto" icono="phone" {...campo('contacto')} />
            {fallo ? <Aviso texto={fallo} /> : null}
            <Boton etiqueta="Guardar proveedor" icono="check" onPress={guardar} cargando={guardando} />
          </View>
        </Tarjeta>
      ) : null}
      {error ? <ErrorConReintento texto={error} onReintentar={recargar} /> : null}
      {!datos ? (
        error ? null : <Cargando />
      ) : datos.length === 0 ? (
        <EstadoVacio icono="briefcase" titulo="Sin proveedores registrados" descripcion="Un usuario con rol Cargador puede registrarlos." />
      ) : (
        <View style={{ gap: espacio.md }}>
          <CampoDeTexto etiqueta="Buscar" icono="search" value={busqueda} onChangeText={setBusqueda} />
          <Rejilla>
            {visibles.map((p) => (
              <Columna key={p.id} minimo={320}>
                <CollapsibleCard title={p.nombre} detail={p.rif}>
                  <Texto variante="pequeno">Ubicación: {p.ubicacion}</Texto>
                  <Texto variante="pequeno">Contacto: {p.contacto}</Texto>
                </CollapsibleCard>
              </Columna>
            ))}
          </Rejilla>
          {visibles.length === 0 ? <Texto suave>Sin coincidencias.</Texto> : null}
          <Aviso tono="info" texto="El historial de participaciones y las alertas de descartes previos dependen del motor de evaluación, que aún no está conectado." />
        </View>
      )}
    </Pagina>
  );
}
