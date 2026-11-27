/** Closes a floating menu on a click or tap outside of it, or with Escape (web). */
import { type ComponentRef, useEffect, useRef } from 'react';
import { type View } from 'react-native';

export function useDismiss(open: boolean, onDismiss: () => void) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const callback = useRef(onDismiss);
  useEffect(() => {
    callback.current = onDismiss;
  });
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const onPointer = (event: Event) => {
      const element = ref.current as unknown as HTMLElement | null;
      if (element && !element.contains(event.target as Node)) callback.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') callback.current();
    };
    // Capture phase: the click is seen even if another element stops its propagation.
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return ref;
}
