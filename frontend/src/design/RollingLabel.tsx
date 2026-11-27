/** Button label that rolls up on hover while a copy enters from below (web only). */
import { Platform, Text, type TextStyle, View } from 'react-native';

import { soloWeb } from './efectos';

const motion = { transitionProperty: 'transform', transitionDuration: '420ms', transitionTimingFunction: 'cubic-bezier(0.65, 0, 0.35, 1)' };

export function RollingLabel({ text, active, style }: { text: string; active: boolean; style: TextStyle }) {
  if (Platform.OS !== 'web') return <Text style={style}>{text}</Text>;
  const lineHeight = style.lineHeight ?? 18;
  const shift = soloWeb({ ...motion, transform: active ? `translateY(-${lineHeight}px)` : 'translateY(0px)' });
  return (
    <View style={{ height: lineHeight, overflow: 'hidden' }}>
      <View style={shift}>
        <Text numberOfLines={1} style={[style, { lineHeight }]}>
          {text}
        </Text>
        <Text aria-hidden numberOfLines={1} style={[style, { lineHeight }]}>
          {text}
        </Text>
      </View>
    </View>
  );
}
