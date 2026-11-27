/** A yes/no question before an action the person may not have meant. */
import { View } from 'react-native';

import { Boton, type NombreIcono } from './componentes';
import { Lightbox } from './Lightbox';
import { espacio } from './tokens';

type Props = { visible: boolean; title: string; description: string; confirmLabel: string; confirmIcon?: NombreIcono; onConfirm: () => void; onCancel: () => void };

export function ConfirmDialog({ visible, title, description, confirmLabel, confirmIcon, onConfirm, onCancel }: Props) {
  return (
    <Lightbox visible={visible} title={title} description={description} onClose={onCancel} maxWidth={440}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: espacio.sm }}>
        <Boton etiqueta="Cancelar" variante="secundario" onPress={onCancel} />
        <Boton etiqueta={confirmLabel} icono={confirmIcon} onPress={onConfirm} />
      </View>
    </Lightbox>
  );
}
