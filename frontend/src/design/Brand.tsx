/** Brand assets. Variants derive from the originals in /img (the dark wordmark only recolours the white text). */
import { Image, View } from 'react-native';

const ISOTYPE = require('../../assets/brand/isotype-tight.png');
const WORDMARK_DARK = require('../../assets/brand/wordmark-dark.png');

export function Isotype({ size = 48 }: { size?: number }) {
  return <Image source={ISOTYPE} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel="CotizAI" />;
}

export function Wordmark({ height = 24 }: { height?: number }) {
  return <Image source={WORDMARK_DARK} style={{ height, width: (height * 254) / 70 }} resizeMode="contain" accessibilityLabel="CotizAI" />;
}

export function BrandRow({ size = 40 }: { size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Isotype size={size} />
      <Wordmark height={size * 0.52} />
    </View>
  );
}
