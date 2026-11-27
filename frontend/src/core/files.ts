/** Browser file helpers (web only). */
export function pickFiles(accept: string, onPick: (files: File[]) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = accept;
  input.onchange = () => onPick(Array.from(input.files ?? []));
  input.click();
}

/** Saves a file the server returned, with its own name. */
export function saveFile(content: Blob, filename: string) {
  const url = URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link); // some browsers ignore a click on a detached link
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000); // revoking at once can cancel the download
}

export const ACCEPT_PHOTOS = '.jpg,.jpeg,.png';
export const ACCEPT_DOCUMENTS = '.pdf,.xlsx';
