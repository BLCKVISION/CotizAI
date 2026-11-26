import { useWindowDimensions } from 'react-native';

import { breakpoint } from './tokens';

export type Device = 'mobile' | 'tablet' | 'desktop';

export function useDevice(): { device: Device; width: number } {
  const { width } = useWindowDimensions();
  const device: Device =
    width >= breakpoint.desktop ? 'desktop' : width >= breakpoint.tablet ? 'tablet' : 'mobile';
  return { device, width: width };
}
