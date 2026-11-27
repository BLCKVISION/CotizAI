/** Every file of the project next to the verification, so a new upload is visible before it is analysed. */
import { Platform, Pressable, View } from 'react-native';

import { BotonIcono, Icono, Insignia, Texto } from '@/design/componentes';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';
import type { Propuesta } from '@/features/gestion/api';

import { type DocumentStatus, documentRows } from './documents';

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

const STATUS: Record<DocumentStatus, { label: string; tone: 'aviso' | 'exito' | 'info' }> = {
  new: { label: 'Sin analizar', tone: 'aviso' },
  to_verify: { label: 'Falta verificar', tone: 'info' },
  verified: { label: 'Verificada', tone: 'exito' },
};

type Props = {
  proposals: Propuesta[];
  evaluatedIds: string[];
  verifiedIds: string[];
  currentId: string;
  onSelect: (proposal: Propuesta, status: DocumentStatus) => void;
  onDownload: (proposal: Propuesta) => void;
};

export function ProjectDocuments({ proposals, evaluatedIds, verifiedIds, currentId, onSelect, onDownload }: Props) {
  const t = useTema();
  const rows = documentRows(proposals, evaluatedIds, verifiedIds);
  const web = Platform.OS === 'web';
  return (
    <View style={{ gap: espacio.sm, padding: espacio.md, borderRadius: radio.xl, backgroundColor: '#FFFFFF' }}>
      <Texto variante="subtitulo" accessibilityRole="header">{`Documentos del proyecto (${rows.length})`}</Texto>
      {rows.map(({ proposal, status }) => {
        const selected = proposal.id === currentId;
        return (
          <View key={proposal.id} style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.xs }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${status === 'new' ? 'Ver' : 'Revisar'} ${proposal.archivo}: ${STATUS[status].label}`}
              accessibilityState={{ selected }}
              onPress={() => onSelect(proposal, status)}
              style={(e: PressState) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: espacio.sm, padding: espacio.sm, minHeight: 48, borderRadius: radio.lg, borderWidth: 2, borderColor: e.focused ? t.foco : selected ? t.accentStrong : 'transparent', backgroundColor: e.hovered || selected ? t.superficieAlta : 'transparent' })}
            >
              <Icono nombre="file-text" tamano="sm" />
              <View style={{ flex: 1, minWidth: 0, gap: 2, alignItems: 'flex-start' }}>
                <Texto variante="pequeno" numberOfLines={1}>{proposal.archivo}</Texto>
                <Insignia etiqueta={STATUS[status].label} tono={STATUS[status].tone} />
              </View>
            </Pressable>
            {web ? <BotonIcono nombre="download" etiqueta={`Descargar ${proposal.archivo}`} onPress={() => onDownload(proposal)} /> : null}
          </View>
        );
      })}
    </View>
  );
}
