/** Thin-line icons for navigation chrome. Names stay Feather-like so callers do not change. */
import SimpleLineIcons from '@expo/vector-icons/SimpleLineIcons';
import { type ComponentProps } from 'react';
import { Platform } from 'react-native';

import { hasSvgIcon } from './icons/paths';
import { SvgIcon } from './icons/SvgIcon';
import { useTema } from './tema';

const GLYPHS = {
  home: 'home',
  'bar-chart-2': 'chart',
  folder: 'folder',
  briefcase: 'briefcase',
  shield: 'lock',
  menu: 'menu',
  'log-out': 'logout',
  search: 'magnifier',
  'help-circle': 'question',
  'message-circle': 'bubble',
  calendar: 'calendar',
  user: 'user',
  play: 'graduation',
  x: 'close',
  bell: 'bell',
  info: 'info',
  sliders: 'equalizer',
  'arrow-up-right': 'arrow-up',
  'folder-plus': 'folder-alt',
  'file-text': 'doc',
} as const satisfies Record<string, ComponentProps<typeof SimpleLineIcons>['name']>;

export type LineIconName = keyof typeof GLYPHS;
export const isLineIcon = (name: string): name is LineIconName => name in GLYPHS;

export function LineIcon({ name, color, size = 17 }: { name: LineIconName; color?: string; size?: number }) {
  const t = useTema();
  // The project's own icons win; the line font covers the rest.
  if (Platform.OS === 'web' && hasSvgIcon(name)) return <SvgIcon name={name} size={size + 3} color={color ?? t.texto} />;
  return <SimpleLineIcons name={GLYPHS[name]} size={size} color={color ?? t.texto} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
}
