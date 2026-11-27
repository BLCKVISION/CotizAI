/** Web: draws at the end of the page so notices stay above dialogs, which also live there. */
import { type ReactNode, useEffect, useState } from 'react';
// @ts-expect-error -- react-dom ships without bundled types and only this function is used.
import { createPortal } from 'react-dom';

const createHost = () => {
  if (typeof document === 'undefined') return null;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;top:0;left:0;right:0;height:0;z-index:2147483000';
  return host;
};

export function TopLayer({ children }: { children: ReactNode }) {
  const [host] = useState(createHost);
  useEffect(() => {
    if (!host) return;
    document.body.appendChild(host);
    return () => host.remove();
  }, [host]);
  // Dialogs are appended after this host when they open, so it is moved back to the end on every change.
  useEffect(() => {
    if (host && host.parentNode && host.parentNode.lastChild !== host) host.parentNode.appendChild(host);
  });
  return host ? createPortal(children, host) : null;
}
