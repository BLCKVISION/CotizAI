import { useState } from 'react';

import { useSesion } from '@/core/sesion/SesionProvider';
import { mensajeDeError } from '@/core/useDatos';
import { cargarPropuestaApi } from '@/features/gestion/api';

export type UploadStatus = { busy: boolean; message: string | null; errors: string[] };

/** Uploads files one by one into a project and reports progress. */
export function useProposalUpload(onDone: () => void) {
  const { conSesion } = useSesion();
  const [status, setStatus] = useState<UploadStatus>({ busy: false, message: null, errors: [] });

  const upload = async (projectId: string, files: File[]) => {
    if (status.busy || files.length === 0) return;
    const errors: string[] = [];
    for (const [i, file] of files.entries()) {
      setStatus({ busy: true, message: `Cargando ${i + 1} de ${files.length}: ${file.name}`, errors: [] });
      try {
        await conSesion(cargarPropuestaApi(projectId, file.name, file));
      } catch (e) {
        errors.push(`${file.name}: ${mensajeDeError(e)}`);
      }
    }
    const ok = files.length - errors.length;
    setStatus({ busy: false, message: ok > 0 ? `${ok} archivo(s) cargado(s).` : null, errors });
    onDone();
  };

  return { status, upload };
}
