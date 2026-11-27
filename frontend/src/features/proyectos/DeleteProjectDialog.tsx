/** Asks before erasing a project, then does it. */
import { useState } from 'react';

import { useSesion } from '@/core/sesion/SesionProvider';
import { mensajeDeError } from '@/core/useDatos';
import { ConfirmDialog } from '@/design/ConfirmDialog';
import { showToast } from '@/core/toastStore';

import { deleteProjectApi, type Proyecto } from '../../core/api/projects';

export function DeleteProjectDialog({ project, onClose, onDeleted }: { project: Proyecto | null; onClose: () => void; onDeleted: () => void }) {
  const { conSesion } = useSesion();
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!project || busy) return;
    setBusy(true);
    try {
      await conSesion(deleteProjectApi(project.id));
      showToast({ tone: 'success', title: 'Proyecto eliminado', detail: project.nombre });
      onClose();
      onDeleted();
    } catch (e) {
      showToast({ tone: 'error', title: mensajeDeError(e), detail: project.nombre });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      visible={project !== null}
      title="¿Eliminar este proyecto?"
      description={`Se borrarán «${project?.nombre ?? ''}», sus archivos subidos, la evaluación y las notas. No se puede deshacer. La auditoría conserva el registro.`}
      confirmLabel={busy ? 'Eliminando…' : 'Sí, eliminar'}
      confirmIcon="trash-2"
      onCancel={onClose}
      onConfirm={() => void remove()}
    />
  );
}
