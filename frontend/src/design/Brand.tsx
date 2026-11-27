/** Brand assets, taken from /img. The dark logotype only recolours the white lettering so it reads on light screens. */
import { Image, View } from 'react-native';

const ISOTYPE = require('../../assets/brand/isotype-gradient.png');
const LOGOTYPE_DARK = require('../../assets/brand/logotype-dark.png');
const LOGOTYPE_RATIO = 497 / 105;

export function Isotype({ size = 48 }: { size?: number }) {
  return <Image source={ISOTYPE} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel="CotizAI" />;
}

/** Full logo: the mark plus the name. Never place the isotype next to it. */
export function Logotype({ height = 32 }: { height?: number }) {
  return <Image source={LOGOTYPE_DARK} style={{ height, width: height * LOGOTYPE_RATIO }} resizeMode="contain" accessibilityLabel="CotizAI" />;
}

export function BrandRow({ size = 40 }: { size?: number }) {
  return (
    <View style={{ alignItems: 'flex-start' }}>
      <Logotype height={Math.round(size * 0.75)} />
    </View>
  );
}
