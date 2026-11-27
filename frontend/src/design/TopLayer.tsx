/** Native: the content is already drawn above the screen. */
import { type ReactNode } from 'react';

export function TopLayer({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
