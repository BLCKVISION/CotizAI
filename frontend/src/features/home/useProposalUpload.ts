import { useRef, useState } from 'react';

import { ErrorApi } from '@/core/api/cliente';
import { useSesion } from '@/core/sesion/SesionProvider';
import { showToast } from '@/design/toastStore';
import { cargarPropuestaApi } from '@/features/gestion/api';

export type UploadState = 'waiting' | 'uploading' | 'saved' | 'rejected';
export type UploadItem = { key: string; name: string; size: number; state: UploadState; reason?: string };

const MAX_REJECTION_TOASTS = 3;

/** Uploads files one by one into a project. Each item reports what the server really answered. */
export function useProposalUpload(onDone: () => void) {
  const { conSesion } = useSesion();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const running = useRef(false); // a ref: a second drop can arrive before the state updates

  const upload = async (projectId: string, files: File[]) => {
    if (files.length === 0) return;
    if (running.current) return showToast({ tone: 'info', title: 'Espere a que termine la carga actual' });
    running.current = true;
    setBusy(true);
    setVisible(true);
    const batch: UploadItem[] = files.map((f, i) => ({ key: `${i}-${f.name}`, name: f.name, size: f.size, state: 'waiting' }));
    setItems(batch);
    const update = (index: number, change: Partial<UploadItem>) => setItems((list) => list.map((item, i) => (i === index ? { ...item, ...change } : item)));

    const rejected: { name: string; reason: string }[] = [];
    for (const [i, file] of files.entries()) {
      update(i, { state: 'uploading' });
      try {
        await conSesion(cargarPropuestaApi(projectId, file.name, file));
        update(i, { state: 'saved' });
      } catch (e) {
        const reason = e instanceof ErrorApi ? e.message : 'No se pudo cargar el archivo.';
        rejected.push({ name: file.name, reason });
        update(i, { state: 'rejected', reason });
        if (rejected.length <= MAX_REJECTION_TOASTS) showToast({ tone: 'error', title: reason, detail: file.name });
      }
    }
    const saved = files.length - rejected.length;
    if (saved > 0) showToast({ tone: 'success', title: saved === 1 ? '1 propuesta guardada' : `${saved} propuestas guardadas`, detail: 'Cifradas con AES-256' });
    running.current = false;
    setBusy(false);
    onDone();
  };

  return { items, busy, visible, close: () => setVisible(false), upload };
}
