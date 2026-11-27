/** Always in sight on the evaluation screen: the reports of the current evaluation, or why there are none yet. */
import { View } from 'react-native';

import type { ReportFormat } from '@/core/api/evaluations';
import { Boton, type NombreIcono, Texto } from '@/design/componentes';
import { swatch } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';

const FORMATS: { format: ReportFormat; label: string; icon: NombreIcono }[] = [
  { format: 'pdf', label: 'PDF', icon: 'file-text' },
  { format: 'csv', label: 'CSV', icon: 'list' },
  { format: 'xlsx', label: 'Excel', icon: 'grid' },
  { format: 'md', label: 'Markdown', icon: 'file' },
];

export function ReportBar({ available, onDownload }: { available: boolean; onDownload: (format: ReportFormat) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: espacio.sm, paddingHorizontal: espacio.md, paddingVertical: espacio.sm, borderRadius: radio.xl, backgroundColor: swatch.white }}>
      <View style={{ flexShrink: 1 }}>
        <Texto variante="etiqueta" accessibilityRole="header">
          Reportes
        </Texto>
        <Texto variante="pequeno" suave>
          {available ? 'Descargue el informe de esta evaluación.' : 'Disponibles cuando termine la primera evaluación.'}
        </Texto>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm }}>
        {FORMATS.map((f) => (
          <Boton key={f.format} etiqueta={`Descargar ${f.label}`} icono={f.icon} variante="secundario" deshabilitado={!available} onPress={() => { onDownload(f.format); }} />
        ))}
      </View>
    </View>
  );
}
