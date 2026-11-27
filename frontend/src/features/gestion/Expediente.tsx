/** Expediente de un proyecto: carga y gestión de las propuestas. */
import { type ComponentRef, type ReactNode, useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { can } from '@/core/auth/permissions';
import { useSesion } from '@/core/sesion/SesionProvider';
import { mensajeDeError, useDatos } from '@/core/useDatos';
import { Aviso, Cargando, ErrorConReintento, Fila } from '@/design/bloques';
import { CollapsibleCard } from '@/design/Collapsible';
import { Boton, BotonIcono, Icono, type NombreIcono, Tarjeta, Texto } from '@/design/componentes';
import { ConfirmDialog } from '@/design/ConfirmDialog';
import { useTema } from '@/design/tema';
import { showToast } from '@/design/toastStore';
import { espacio, radio } from '@/design/tokens';
import { SelectBox, SelectionChips, type Selection } from '@/features/flow/ProposalSelection';
import { useProposalUpload } from '@/features/home/useProposalUpload';
import type { Proyecto } from '@/features/proyectos/api';
import { UploadFlow } from '@/features/uploads/UploadFlow';

import { descargarPropuestaApi, eliminarPropuestaApi, type Propuesta, propuestasApi } from './api';
import { MarkdownDialog } from './MarkdownDialog';

const ICONOS: Record<string, NombreIcono> = { pdf: 'file-text', jpg: 'image', png: 'message-square', xlsx: 'grid' };
const MINIMO = 1;
const MAXIMO = 20;
const tamano = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

/** Zona de arrastrar y soltar (solo web: usa elementos del navegador). */
export function ZonaDeCarga({ onArchivos, ocupado, compact = false }: { onArchivos: (a: File[]) => void; ocupado: boolean; compact?: boolean }) {
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
    <View ref={zona} style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: encima ? t.foco : t.bordeControl, backgroundColor: encima ? t.info.fondo : t.superficieAlta, borderRadius: radio.xl, padding: compact ? espacio.md : espacio.xl, alignItems: 'center', gap: espacio.sm }}>
      <Icono nombre="upload-cloud" tamano={compact ? 'lg' : 'xl'} />
      <Texto variante="subtitulo" style={{ textAlign: 'center' }}>Arrastre aquí las propuestas</Texto>
      <Texto variante="pequeno" suave style={{ textAlign: 'center' }}>PDF, JPG, PNG o XLSX · hasta 10 MB cada una · se cifran con AES-256 al guardarlas</Texto>
      <View style={{ flexDirection: 'row' }}>
        <Boton etiqueta="Elegir archivos" icono="paperclip" onPress={elegir} cargando={ocupado} />
      </View>
    </View>
  );
}

/** The proposals list container: a plain card inside a project (with selection), a foldable card elsewhere. */
function ProposalsCard({ n, selecting, children }: { n: number; selecting: boolean; children: ReactNode }) {
  const title = `Propuestas (${n} de ${MAXIMO})`;
  if (!selecting) {
    return (
      <CollapsibleCard title={title} detail={n < MINIMO ? 'Agregue al menos una para analizar.' : 'Se analizan hasta 20 a la vez.'} defaultOpen={n > 0 && n <= 3}>
        {children}
      </CollapsibleCard>
    );
  }
  return (
    <Tarjeta style={{ flex: 1 }}>
      <Texto variante="subtitulo" accessibilityRole="header">{title}</Texto>
      <Texto variante="pequeno" suave>{n < MINIMO ? 'Agregue al menos una para analizar.' : 'Marque las que la IA va a leer. Se analizan hasta 20 a la vez.'}</Texto>
      {children}
    </Tarjeta>
  );
}

/**
 * `selection` turns it into the proposals column of a project: upload zone on top, one list below with a checkbox on each
 * row. Without it, the upload zone and the list sit side by side.
 */
export function Expediente({ proyecto, onCambio, selection }: { proyecto: Proyecto; onCambio?: () => void; selection?: Selection }) {
  const t = useTema();
  const { usuario, conSesion } = useSesion();
  const { datos, error, recargar } = useDatos(propuestasApi(proyecto.id), proyecto.id);
  const flow = useProposalUpload(() => {
    recargar();
    onCambio?.();
  });
  const subir = (archivos: File[]) => void flow.upload(proyecto.id, archivos);
  const [toDelete, setToDelete] = useState<Propuesta | null>(null);
  const [asMarkdown, setAsMarkdown] = useState<Propuesta | null>(null);
  // Same rule as downloading the file: the text is its content.
  const canRead = can(usuario?.rol, 'upload') || can(usuario?.rol, 'seeResults');
  // New offers are accepted until the project is awarded or closed; evaluated evidence cannot be deleted.
  const editable = can(usuario?.rol, 'upload') && (proyecto.estado === 'en_recepcion' || proyecto.estado === 'en_revision_del_comite');
  const removable = editable; // evaluated files can be deleted too: their result goes with them

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

  const remove = async () => {
    const p = toDelete;
    if (!p) return;
    setToDelete(null);
    try {
      await conSesion(eliminarPropuestaApi(proyecto.id, p.id));
      showToast({ tone: 'success', title: 'Archivo eliminado', detail: p.archivo });
      recargar();
      onCambio?.();
    } catch (e) {
      showToast({ tone: 'error', title: mensajeDeError(e), detail: p.archivo });
    }
  };

  const n = datos?.length ?? 0;
  return (
    <View style={{ flex: selection ? 1 : undefined, flexDirection: selection ? 'column' : 'row', flexWrap: selection ? 'nowrap' : 'wrap', gap: espacio.md, alignItems: selection ? 'stretch' : 'flex-start' }}>
      {/* In a project the upload zone lives in ProjectFlow, under both panels. Elsewhere it sits beside the list. */}
      {!selection && (editable || proyecto.estado === 'en_recepcion') ? (
      <View style={{ flexGrow: 1, flexBasis: selection ? undefined : 360, gap: espacio.md }}>
      {editable && Platform.OS === 'web' ? <ZonaDeCarga onArchivos={subir} ocupado={flow.busy} compact={selection !== undefined && n > 0} /> : null}
      {editable && Platform.OS !== 'web' ? <Aviso tono="info" texto="La carga de archivos está disponible en la versión web." /> : null}
      {!editable && proyecto.estado === 'en_recepcion' ? <Aviso tono="info" texto="Su rol no agrega ni quita propuestas." /> : null}
      {flow.busy && !flow.visible ? <Aviso tono="info" texto="La carga continúa en segundo plano." /> : null}
      </View>
      ) : null}
      <View style={{ flexGrow: selection ? 1 : 1.3, flexBasis: selection ? undefined : 420, gap: espacio.md }}>
      {error ? <ErrorConReintento texto={error} onReintentar={recargar} /> : null}
      {!datos ? (
        error ? null : <Cargando />
      ) : (
        <ProposalsCard n={n} selecting={selection !== undefined}>
          {selection && n > 1 ? <SelectionChips proposals={datos} selection={selection} /> : null}
          <View style={{ height: 10, borderRadius: radio.pildora, backgroundColor: t.superficieAlta, overflow: 'hidden' }}>
            <View style={{ height: 10, width: `${Math.min(100, (n / MINIMO) * 100)}%`, backgroundColor: t.primario }} />
          </View>
          {datos.map((p) => (
            <Fila key={p.id} icono={ICONOS[p.formato] ?? 'file'} titulo={p.archivo}
              detalle={`${p.formato.toUpperCase()} · ${tamano(p.tamano)} · huella ${p.sha256.slice(0, 10)}`}
              derecha={
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {selection ? <SelectBox proposal={p} selection={selection} /> : null}
                  {canRead ? <BotonIcono nombre="file-text" etiqueta={`Ver ${p.archivo} en Markdown`} onPress={() => setAsMarkdown(p)} /> : null}
                  {usuario && Platform.OS === 'web' ? <BotonIcono nombre="download" etiqueta={`Descargar ${p.archivo}`} onPress={() => descargar(p)} /> : null}
                  {removable ? <BotonIcono nombre="trash-2" etiqueta={`Eliminar ${p.archivo}`} onPress={() => setToDelete(p)} /> : null}
                </View>
              } />
          ))}
        </ProposalsCard>
      )}
      </View>
      <ConfirmDialog
        visible={toDelete !== null}
        title="¿Eliminar este archivo?"
        description={`Se borrará «${toDelete?.archivo ?? ''}». Si ya fue evaluado, también se borran su resultado y su verificación. No se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        confirmIcon="trash-2"
        onCancel={() => setToDelete(null)}
        onConfirm={() => void remove()}
      />
      <MarkdownDialog projectId={proyecto.id} proposal={asMarkdown} onClose={() => setAsMarkdown(null)} />
      <UploadFlow visible={flow.visible} items={flow.items} busy={flow.busy} onClose={flow.close} />
    </View>
  );
}
