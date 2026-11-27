/** Browser file helpers (web only). */
export function pickFiles(accept: string, onPick: (files: File[]) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = accept;
  input.onchange = () => { onPick(Array.from(input.files ?? [])); };
  input.click();
}

export const ACCEPT_PHOTOS = '.jpg,.jpeg,.png';
export const ACCEPT_DOCUMENTS = '.pdf,.xlsx';
