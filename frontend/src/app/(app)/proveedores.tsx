import { useState } from 'react';
import { View } from 'react-native';

import { useSesion } from '@/core/sesion/SesionProvider';
import { mensajeDeError, useDatos } from '@/core/useDatos';
import { Aviso, Cargando, Columna, ErrorConReintento, Rejilla } from '@/design/bloques';
import { CollapsibleCard } from '@/design/Collapsible';
import { Boton, CampoDeTexto, EstadoVacio, Texto } from '@/design/componentes';
import { EncabezadoDePagina, Pagina } from '@/design/layout';
import { Lightbox } from '@/design/Lightbox';
import { NewItemTile } from '@/design/NewItemTile';
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

  const canCreate = usuario?.rol === 'cargador'; // UX only: the backend is the authority
  const cerrar = () => {
    setAbierto(false);
    setFallo(null);
  };

  const q = busqueda.trim().toLowerCase();
  const visibles = (datos ?? []).filter((p) => `${p.nombre} ${p.rif} ${p.ubicacion}`.toLowerCase().includes(q));

  return (
    <Pagina>
      <EncabezadoDePagina sobretitulo="Proveedores" titulo="Directorio de proveedores" descripcion="Las empresas que participan en sus procesos de compra, con sus datos de contacto." />
      {error ? <ErrorConReintento texto={error} onReintentar={recargar} /> : null}
      {!datos ? (
        error ? null : <Cargando />
      ) : datos.length === 0 ? (
        <EstadoVacio
          icono="briefcase"
          titulo="Sin proveedores registrados"
          descripcion={canCreate ? 'Registre el primer proveedor para llevar su ficha.' : 'Un usuario con rol Cargador puede registrarlos.'}
          accion={canCreate ? <Boton etiqueta="Nuevo proveedor" icono="plus" onPress={() => setAbierto(true)} /> : undefined}
        />
      ) : (
        <View style={{ gap: espacio.md }}>
          <CampoDeTexto etiqueta="Buscar" icono="search" value={busqueda} onChangeText={setBusqueda} />
          <Rejilla>
            {canCreate ? (
              <Columna minimo={320}>
                <View style={{ minHeight: 148 }}>
                  <NewItemTile label="Nuevo proveedor" icon="plus" minHeight={148} onPress={() => setAbierto(true)} />
                </View>
              </Columna>
            ) : null}
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
          <Aviso tono="info" texto="Al evaluar un proyecto se avisa si un proveedor ya fue descartado en una evaluación anterior." />
        </View>
      )}
      <Lightbox visible={abierto} title="Nuevo proveedor" description="Datos básicos de la ficha." onClose={cerrar}>
        <CampoDeTexto etiqueta="Nombre o razón social" icono="briefcase" {...campo('nombre')} />
        <CampoDeTexto etiqueta="RIF" icono="hash" ayuda="Ejemplo: J-12345678-9" {...campo('rif')} />
        <CampoDeTexto etiqueta="Ubicación" icono="map-pin" {...campo('ubicacion')} />
        <CampoDeTexto etiqueta="Contacto" icono="phone" {...campo('contacto')} />
        {fallo ? <Aviso texto={fallo} /> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: espacio.sm }}>
          <Boton etiqueta="Cancelar" variante="secundario" onPress={cerrar} deshabilitado={guardando} />
          <Boton etiqueta="Guardar proveedor" icono="check" onPress={guardar} cargando={guardando} />
        </View>
      </Lightbox>
    </Pagina>
  );
}
