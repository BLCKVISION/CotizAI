/** Expediente de un proyecto: carga y gestión de las propuestas. */
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { can } from '@/core/auth/permissions';
import { useSesion } from '@/core/sesion/SesionProvider';
import { mensajeDeError, useDatos } from '@/core/useDatos';
import { Aviso, Cargando, ErrorConReintento, Fila } from '@/design/bloques';
import { CollapsibleCard } from '@/design/Collapsible';
import { Boton, BotonIcono, Icono, type NombreIcono, Texto } from '@/design/componentes';
import { useTema } from '@/design/tema';
import { showToast } from '@/design/toastStore';
import { espacio, radio } from '@/design/tokens';
import { useProposalUpload } from '@/features/home/useProposalUpload';
import type { Proyecto } from '@/features/proyectos/api';
import { UploadFlow } from '@/features/uploads/UploadFlow';

import { descargarPropuestaApi, eliminarPropuestaApi, type Propuesta, propuestasApi } from './api';

const ICONOS: Record<string, NombreIcono> = { pdf: 'file-text', jpg: 'image', png: 'message-square', xlsx: 'grid' };
const MINIMO = 1;
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
    const keepBrowserFromOpening = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', keepBrowserFromOpening);
    window.addEventListener('drop', keepBrowserFromOpening);
    el.addEventListener('dragover', sobre);
    el.addEventListener('dragleave', fuera);
    el.addEventListener('drop', soltar);
    return () => {
      window.removeEventListener('dragover', keepBrowserFromOpening);
      window.removeEventListener('drop', keepBrowserFromOpening);
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
  const flow = useProposalUpload(() => {
    recargar();
    onCambio?.();
  });
  const subir = (archivos: File[]) => void flow.upload(proyecto.id, archivos);
  const [porEliminar, setPorEliminar] = useState<string | null>(null);
  // New offers are accepted until the project is awarded or closed; evaluated evidence cannot be deleted.
  const editable = can(usuario?.rol, 'upload') && (proyecto.estado === 'en_recepcion' || proyecto.estado === 'en_revision_del_comite');
  const removable = editable && proyecto.estado === 'en_recepcion';

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
      showToast({ tone: 'error', title: mensajeDeError(e), detail: p.archivo });
    }
  };

  const eliminar = async (p: Propuesta) => {
    if (porEliminar !== p.id) return setPorEliminar(p.id);
    try {
      await conSesion(eliminarPropuestaApi(proyecto.id, p.id));
      recargar();
      onCambio?.();
    } catch (e) {
      showToast({ tone: 'error', title: mensajeDeError(e), detail: p.archivo });
    }
    setPorEliminar(null);
  };

  const n = datos?.length ?? 0;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.md, alignItems: 'flex-start' }}>
      {/* Without anything to show, this column is not rendered so the proposal list takes the full width. */}
      {editable || proyecto.estado === 'en_recepcion' ? (
      <View style={{ flexGrow: 1, flexBasis: 360, gap: espacio.md }}>
      {editable && Platform.OS === 'web' ? <ZonaDeCarga onArchivos={subir} ocupado={flow.busy} /> : null}
      {editable && Platform.OS !== 'web' ? <Aviso tono="info" texto="La carga de archivos está disponible en la versión web." /> : null}
      {!editable && proyecto.estado === 'en_recepcion' ? <Aviso tono="info" texto="Su rol no agrega ni quita propuestas." /> : null}
      {flow.busy && !flow.visible ? <Aviso tono="info" texto="La carga continúa en segundo plano." /> : null}
      </View>
      ) : null}
      <View style={{ flexGrow: 1.3, flexBasis: 420, gap: espacio.md }}>
      {error ? <ErrorConReintento texto={error} onReintentar={recargar} /> : null}
      {!datos ? (
        error ? null : <Cargando />
      ) : (
        <CollapsibleCard title={`Propuestas (${n} de ${MAXIMO})`} detail={n < MINIMO ? 'Agregue al menos una para analizar.' : 'Se analizan hasta 5 por tanda.'} defaultOpen={n > 0 && n <= 3}>
          <View style={{ height: 10, borderRadius: radio.pildora, backgroundColor: t.superficieAlta, overflow: 'hidden' }}>
            <View style={{ height: 10, width: `${Math.min(100, (n / MINIMO) * 100)}%`, backgroundColor: t.primario }} />
          </View>
          {datos.map((p) => (
            <Fila key={p.id} icono={ICONOS[p.formato] ?? 'file'} titulo={p.archivo}
              detalle={porEliminar === p.id ? 'Pulse otra vez la papelera para eliminarla.' : `${p.formato.toUpperCase()} · ${tamano(p.tamano)} · huella ${p.sha256.slice(0, 10)}`}
              derecha={
                <View style={{ flexDirection: 'row' }}>
                  {usuario && Platform.OS === 'web' ? <BotonIcono nombre="download" etiqueta={`Descargar ${p.archivo}`} onPress={() => descargar(p)} /> : null}
                  {removable ? <BotonIcono nombre="trash-2" etiqueta={`Eliminar ${p.archivo}`} onPress={() => eliminar(p)} /> : null}
                </View>
              } />
          ))}
        </CollapsibleCard>
      )}
      </View>
      <UploadFlow visible={flow.visible} items={flow.items} busy={flow.busy} onClose={flow.close} />
    </View>
  );
}
