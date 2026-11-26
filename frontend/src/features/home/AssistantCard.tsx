/** Guide assistant. Its messages are derived from real data; free chat stays disabled until the AI is connected. */
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Icono, type NombreIcono, Texto } from '@/design/componentes';
import { innerSurface, Panel, RoundButton } from '@/design/Panel';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';

import type { Proyecto } from '@/features/proyectos/api';

import type { Journey } from './journey';
import { ProjectFolders } from './ProjectFolders';

type Tab = 'folders' | 'chat' | 'help' | 'privacy';
const TABS: { id: Tab; icon: NombreIcono; label: string }[] = [
  { id: 'folders', icon: 'folder', label: 'Carpetas de proyectos' },
  { id: 'help', icon: 'help-circle', label: 'Cómo funciona' },
  { id: 'chat', icon: 'message-circle', label: 'Asistente' },
  { id: 'privacy', icon: 'shield', label: 'Sus documentos' },
];

const HELP = [
  'Lee PDF, fotos de presupuestos a mano, XLSX y capturas de chat.',
  'Verifica cantidad × precio y las sumas.',
  'Busca fletes, recargos y condiciones en la letra pequeña.',
  'Compara los precios con referencias de internet.',
];
const PRIVACY = [
  'Las propuestas se guardan cifradas con AES-256.',
  'Cada organización solo ve sus propios datos.',
  'Las cargas y revisiones quedan registradas.',
];

function Bubble({ text }: { text: string }) {
  const t = useTema();
  return (
    <View style={{ alignSelf: 'flex-start', maxWidth: '94%', backgroundColor: t.superficieAlta, borderRadius: radio.lg, paddingHorizontal: espacio.md, paddingVertical: espacio.sm + 2 }}>
      <Texto variante="pequeno">{text}</Texto>
    </View>
  );
}

type Props = {
  journey: Journey;
  userName: string;
  projects: Proyecto[];
  counts: Record<string, number>;
  canCreate: boolean;
  onNavigate: (path: string) => void;
  onAttach?: () => void;
};

export function AssistantCard({ journey, userName, projects, counts, canCreate, onNavigate, onAttach }: Props) {
  const t = useTema();
  const [tab, setTab] = useState<Tab>('folders');
  const next = journey.steps.find((s) => s.state === 'current') ?? journey.steps.find((s) => s.state === 'blocked');
  const lines = tab === 'help' ? HELP : tab === 'privacy' ? PRIVACY : [`¡Hola, ${userName}! Soy la guía de CotizAI.`, next ? `Siguiente paso: ${next.title.toLowerCase()}. ${next.detail}.` : journey.note];

  return (
    <Panel
      header={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.sm }}>
          {TABS.map((x) => (
            <RoundButton key={x.id} icon={x.icon} label={x.label} dark={tab === x.id} onPress={() => setTab(x.id)} />
          ))}
        </View>
      }
    >
      {tab === 'folders' ? (
        <View style={{ ...innerSurface, padding: 12 }}>
          <ProjectFolders projects={projects} counts={counts} canCreate={canCreate} onNavigate={onNavigate} />
        </View>
      ) : (
      <View style={{ ...innerSurface, padding: espacio.sm + 4, gap: espacio.sm }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 6 }}>
          {lines.map((line) => (
            <Bubble key={line} text={line} />
          ))}
          {tab === 'chat' && journey.cta ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={journey.cta.label}
              onPress={() => onNavigate(journey.cta!.path)}
              style={{ alignSelf: 'flex-end', minHeight: 40, justifyContent: 'center', backgroundColor: t.accent, borderRadius: radio.pildora, paddingHorizontal: espacio.md }}
            >
              <Texto variante="etiqueta" color={t.onAccent}>
                {journey.cta.label}
              </Texto>
            </Pressable>
          ) : null}
        </ScrollView>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.sm, borderWidth: 1, borderColor: t.borde, borderRadius: radio.pildora, paddingLeft: espacio.md, minHeight: 46 }}>
          <Texto variante="pequeno" suave style={{ flex: 1 }} numberOfLines={1}>
            Chat disponible al conectar la IA
          </Texto>
          {onAttach ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Adjuntar propuestas" onPress={onAttach} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Icono nombre="paperclip" />
            </Pressable>
          ) : null}
        </View>
      </View>
      )}
    </Panel>
  );
}
