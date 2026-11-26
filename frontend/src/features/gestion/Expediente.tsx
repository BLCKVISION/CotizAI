/** Expediente de un proyecto: carga y gestión de las propuestas. */
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { useSesion } from '@/core/sesion/SesionProvider';
import { mensajeDeError, useDatos } from '@/core/useDatos';
import { Aviso, Cargando, ErrorConReintento, Fila, TituloDeSeccion } from '@/design/bloques';
import { Boton, BotonIcono, Icono, type NombreIcono, Tarjeta, Texto } from '@/design/componentes';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';
import type { Proyecto } from '@/features/proyectos/api';

import { cargarPropuestaApi, descargarPropuestaApi, eliminarPropuestaApi, type Propuesta, propuestasApi } from './api';

const ICONOS: Record<string, NombreIcono> = { pdf: 'file-text', jpg: 'image', png: 'message-square', xlsx: 'grid' };
const MINIMO = 3;
const MAXIMO = 20;
const tamano = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

/** Zona de arrastrar y soltar (solo web: usa elementos del navegador). */
function ZonaDeCarga({ onArchivos, ocupado }: { onArchivos: (a: File[]) => void; ocupado: boolean }) {
  const t = useTema();
  const [encima, setEncima] = useState(false);
  const zona = useRef<ComponentRef<typeof View>>(null);
  const entregar = useRef(onArchivos);
  useEffect(() => {
    entregar.current = onArchivos;
  });
  useEffect(() => {
    const el = zona.current as unknown as HTMLElement | null;
    if (!el?.addEventListener) return;
    const sobre = (e: DragEvent) => {
      e.preventDefault();
      setEncima(true);
    };
    const fuera = () => setEncima(false);
    const soltar = (e: DragEvent) => {
      e.preventDefault();
      setEncima(false);
      entregar.current(Array.from(e.dataTransfer?.files ?? []));
    };
    el.addEventListener('dragover', sobre);
    el.addEventListener('dragleave', fuera);
    el.addEventListener('drop', soltar);
    return () => {
      el.removeEventListener('dragover', sobre);
      el.removeEventListener('dragleave', fuera);
      el.removeEventListener('drop', soltar);
    };
  }, []);

  const elegir = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.jpg,.jpeg,.png,.xlsx';
    input.onchange = () => entregar.current(Array.from(input.files ?? []));
    input.click();
  };

  return (
    <View ref={zona} style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: encima ? t.foco : t.bordeControl, backgroundColor: encima ? t.info.fondo : t.superficieAlta, borderRadius: radio.xl, padding: espacio.xl, alignItems: 'center', gap: espacio.sm }}>
      <Icono nombre="upload-cloud" tamano="xl" />
      <Texto variante="subtitulo" style={{ textAlign: 'center' }}>Arrastre aquí las propuestas</Texto>
      <Texto variante="pequeno" suave style={{ textAlign: 'center' }}>PDF, JPG, PNG o XLSX · hasta 10 MB cada una · se cifran con AES-256 al guardarlas</Texto>
      <View style={{ flexDirection: 'row' }}>
        <Boton etiqueta="Elegir archivos" icono="paperclip" onPress={elegir} cargando={ocupado} />
      </View>
    </View>
  );
}

export function Expediente({ proyecto, onCambio }: { proyecto: Proyecto; onCambio?: () => void }) {
  const t = useTema();
  const { usuario, conSesion } = useSesion();
  const { datos, error, recargar } = useDatos(propuestasApi(proyecto.id), proyecto.id);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [fallos, setFallos] = useState<string[]>([]);
  const [porEliminar, setPorEliminar] = useState<string | null>(null);
  const editable = usuario?.rol === 'cargador' && proyecto.estado === 'en_recepcion';

  const subir = async (archivos: File[]) => {
    if (progreso || archivos.length === 0) return;
    const errores: string[] = [];
    for (const [i, a] of archivos.entries()) {
      setProgreso(`Cargando ${i + 1} de ${archivos.length}: ${a.name}`);
      try {
        await conSesion(cargarPropuestaApi(proyecto.id, a.name, a));
      } catch (e) {
        errores.push(`${a.name}: ${mensajeDeError(e)}`);
      }
    }
    setProgreso(null);
    setFallos(errores);
    recargar();
    onCambio?.();
  };

  const descargar = async (p: Propuesta) => {
    try {
      const blob = await conSesion(descargarPropuestaApi(proyecto.id, p.id));
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = p.archivo;
      enlace.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setFallos([mensajeDeError(e)]);
    }
  };

  const eliminar = async (p: Propuesta) => {
    if (porEliminar !== p.id) return setPorEliminar(p.id);
    try {
      await conSesion(eliminarPropuestaApi(proyecto.id, p.id));
      recargar();
      onCambio?.();
    } catch (e) {
      setFallos([mensajeDeError(e)]);
    }
    setPorEliminar(null);
  };

  const n = datos?.length ?? 0;
  return (
    <View style={{ gap: espacio.md }}>
      {editable && Platform.OS === 'web' ? <ZonaDeCarga onArchivos={subir} ocupado={progreso !== null} /> : null}
      {editable && Platform.OS !== 'web' ? <Aviso tono="info" texto="La carga de archivos está disponible en la versión web." /> : null}
      {!editable && proyecto.estado === 'en_recepcion' ? <Aviso tono="info" texto="Solo el rol Cargador puede agregar o quitar propuestas." /> : null}
      {progreso ? <Aviso tono="info" texto={progreso} /> : null}
      {fallos.map((f) => <Aviso key={f} texto={f} />)}
      {error ? <ErrorConReintento texto={error} onReintentar={recargar} /> : null}
      {!datos ? (
        error ? null : <Cargando />
      ) : (
        <Tarjeta>
          <TituloDeSeccion titulo={`Propuestas (${n} de ${MAXIMO})`} detalle={n < MINIMO ? `Faltan ${MINIMO - n} para el mínimo de ${MINIMO}.` : 'El expediente alcanzó el mínimo requerido.'} />
          <View style={{ height: 10, borderRadius: radio.pildora, backgroundColor: t.superficieAlta, overflow: 'hidden' }}>
            <View style={{ height: 10, width: `${Math.min(100, (n / MINIMO) * 100)}%`, backgroundColor: t.primario }} />
          </View>
          {datos.map((p) => (
            <Fila key={p.id} icono={ICONOS[p.formato] ?? 'file'} titulo={p.archivo}
              detalle={porEliminar === p.id ? 'Pulse otra vez la papelera para eliminarla.' : `${p.formato.toUpperCase()} · ${tamano(p.tamano)} · huella ${p.sha256.slice(0, 10)}`}
              derecha={
                <View style={{ flexDirection: 'row' }}>
                  {usuario && Platform.OS === 'web' ? <BotonIcono nombre="download" etiqueta={`Descargar ${p.archivo}`} onPress={() => descargar(p)} /> : null}
                  {editable ? <BotonIcono nombre="trash-2" etiqueta={`Eliminar ${p.archivo}`} onPress={() => eliminar(p)} /> : null}
                </View>
              } />
          ))}
        </Tarjeta>
      )}
      <Tarjeta>
        <TituloDeSeccion titulo="Evaluación del agente" detalle="Lectura de documentos, precios en internet, costo real y ranking." />
        <Aviso tono="aviso" texto="Todavía no disponible: falta conectar el servicio de IA y construir el motor de evaluación. No se muestran resultados simulados." />
        <Boton etiqueta="Evaluar Propuestas de Servicios" icono="cpu" onPress={() => undefined} deshabilitado />
      </Tarjeta>
    </View>
  );
}
