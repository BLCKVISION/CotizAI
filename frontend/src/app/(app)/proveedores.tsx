import { useState } from 'react';
import { View } from 'react-native';

import { can } from '@/core/auth/permissions';
import { useSesion } from '@/core/sesion/SesionProvider';
import { mensajeDeError, useDatos } from '@/core/useDatos';
import { Aviso, Cargando, ErrorConReintento } from '@/design/bloques';
import { Boton, CampoDeTexto, EstadoVacio, Texto } from '@/design/componentes';
import { useDispositivo } from '@/design/dispositivo';
import { Entrada } from '@/design/efectos';
import { EncabezadoDePagina, Pagina } from '@/design/layout';
import { Lightbox } from '@/design/Lightbox';
import { NewItemTile } from '@/design/NewItemTile';
import { espacio } from '@/design/tokens';
import { registrarProveedorApi } from '@/core/api/management';
import { supplierDirectoryApi } from '@/core/api/history';
import { SupplierBackground } from '@/features/history/SupplierBackground';
import { matchesSearch, type SupplierEntry } from '@/core/suppliers';
import { PROVIDER_CARD_HEIGHT, ProviderCard } from '@/features/projects/ProviderCard';

const VACIO = { nombre: '', rif: '', ubicacion: '', contacto: '' };

export default function Proveedores() {
  const { usuario, conSesion } = useSesion();
  const { datos, error, recargar } = useDatos(supplierDirectoryApi);
  const [formulario, setFormulario] = useState(VACIO);
  const [selected, setSelected] = useState<SupplierEntry | null>(null);
  const { ancho, dispositivo } = useDispositivo();
  const columns = dispositivo === 'movil' ? 1 : ancho < 1024 ? 2 : ancho < 1600 ? 4 : 5; // same grid as Projects
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

  const canCreate = can(usuario?.rol, 'upload'); // UX only: the backend is the authority
  const cerrar = () => {
    setAbierto(false);
    setFallo(null);
  };

  const visibles = (datos?.suppliers ?? []).filter((p) => matchesSearch(p, busqueda));

  return (
    <Pagina>
      <EncabezadoDePagina sobretitulo="Proveedores" titulo="Directorio de proveedores" descripcion="Las empresas que participan en sus procesos de compra, con su ficha y sus antecedentes." />
      {error ? <ErrorConReintento texto={error} onReintentar={recargar} /> : null}
      {!datos ? (
        error ? null : <Cargando />
      ) : datos.suppliers.length === 0 ? (
        <EstadoVacio
          icono="briefcase"
          titulo="Sin proveedores registrados"
          descripcion={canCreate ? 'Registre el primer proveedor para llevar su ficha.' : 'Un usuario con rol Cargador puede registrarlos.'}
          accion={canCreate ? <Boton etiqueta="Nuevo proveedor" icono="plus" onPress={() => setAbierto(true)} /> : undefined}
        />
      ) : (
        <View style={{ gap: espacio.md }}>
          <CampoDeTexto etiqueta="Buscar" icono="search" value={busqueda} onChangeText={setBusqueda} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -12 }}>
            {canCreate ? (
              <View style={{ width: `${100 / columns}%`, padding: 12 }}>
                <View style={{ height: PROVIDER_CARD_HEIGHT }}>
                  <NewItemTile label="Nuevo proveedor" icon="plus" onPress={() => setAbierto(true)} />
                </View>
              </View>
            ) : null}
            {visibles.map((p, i) => (
              <View key={p.registration?.id ?? p.key} style={{ width: `${100 / columns}%`, padding: 12 }}>
                <Entrada indice={Math.min(i, 8)}>
                  <ProviderCard index={Math.min(i, 8)} provider={p} onPress={() => setSelected(p)} />
                </Entrada>
              </View>
            ))}
          </View>
          {visibles.length === 0 ? <Texto suave>Sin coincidencias.</Texto> : null}
          <Aviso tono="info" texto="Los proveedores detectados al evaluar aparecen aquí solos, con una alerta si antes fueron descartados." />
        </View>
      )}
      <Lightbox visible={selected !== null} title={selected?.name ?? ''} description="Ficha y antecedentes del proveedor" onClose={() => setSelected(null)} maxWidth={560}>
        {selected ? (
          <View style={{ gap: espacio.md }}>
            <SupplierBackground supplier={selected} restricted={datos?.restricted ?? false} />
            {!selected.registration && canCreate ? (
              <Boton
                etiqueta="Completar ficha"
                icono="plus"
                onPress={() => {
                  setFormulario({ ...VACIO, nombre: selected.name });
                  setSelected(null);
                  setAbierto(true);
                }}
              />
            ) : null}
          </View>
        ) : null}
      </Lightbox>
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
