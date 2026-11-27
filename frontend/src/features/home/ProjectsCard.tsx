/** Home's first card: the latest projects, plus a short step-by-step guide. */
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Boton, Texto } from '@/design/componentes';
import { soloWeb } from '@/design/efectos';
import { NewItemTile } from '@/design/NewItemTile';
import { innerSurface, Panel, RoundButton } from '@/design/Panel';
import { RollingLabel } from '@/design/RollingLabel';
import { useTema } from '@/design/tema';
import { espacio, radio, texto } from '@/design/tokens';
import { FolderCard } from '@/features/projects/FolderCard';
import type { Proyecto } from '@/features/proyectos/api';
import { infoEstado } from '@/features/proyectos/estados';

const VISIBLE_PROJECTS = 3;

const GUIDE = [
  { title: 'Cree el proyecto', detail: 'Requerimiento, ubicación y presupuesto.' },
  { title: 'Suba las propuestas', detail: 'De 3 a 20 archivos: PDF, fotos, Excel o capturas.' },
  { title: 'Evalúe', detail: 'Ordena las ofertas válidas por puntaje y costo real, con evidencia.' },
  { title: 'Decida', detail: 'El comité revisa y aprueba. La decisión es humana.' },
];

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

function SeeAll({ onPress }: { onPress: () => void }) {
  const t = useTema();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Ver más proyectos"
      onPress={onPress}
      style={(e: PressState) => ({ minHeight: 44, justifyContent: 'center', paddingHorizontal: espacio.md, borderRadius: radio.pildora, borderWidth: 2, borderColor: e.focused ? t.foco : 'transparent', backgroundColor: e.hovered ? '#FFFFFF' : 'rgba(255,255,255,0.65)', ...soloWeb({ transitionProperty: 'background-color', transitionDuration: '220ms' }) })}
    >
      {({ hovered }: PressState) => <RollingLabel text="Ver más proyectos" active={Boolean(hovered)} style={{ ...texto.etiqueta, color: t.texto }} />}
    </Pressable>
  );
}

function Guide() {
  const t = useTema();
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: espacio.md, paddingVertical: espacio.sm }}>
      {GUIDE.map((step, i) => (
        <View key={step.title} style={{ flexDirection: 'row', gap: espacio.md }}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accent }}>
              <Texto variante="etiqueta" color={t.onAccent}>
                {i + 1}
              </Texto>
            </View>
            {i < GUIDE.length - 1 ? <View style={{ flex: 1, width: 2, minHeight: 6, backgroundColor: t.borde }} /> : null}
          </View>
          <View style={{ flex: 1, paddingBottom: i < GUIDE.length - 1 ? espacio.sm + 2 : 0, paddingTop: 4 }}>
            <Texto variante="etiqueta">{step.title}</Texto>
            <Texto variante="pequeno" suave>
              {step.detail}
            </Texto>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

type Props = {
  projects: Proyecto[];
  counts: Record<string, number>;
  canCreate: boolean;
  onCreate: () => void;
  onNavigate: (path: string) => void;
};

export function ProjectsCard({ projects, counts, canCreate, onCreate, onNavigate }: Props) {
  const [tab, setTab] = useState<'projects' | 'guide'>('projects');
  const latest = [...projects].sort((a, b) => b.creado.localeCompare(a.creado)).slice(0, VISIBLE_PROJECTS);

  return (
    <Panel
      header={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.sm }}>
          <RoundButton icon="folder" label="Proyectos" dark={tab === 'projects'} onPress={() => setTab('projects')} />
          <RoundButton icon="info" label="Información: cómo se usa" dark={tab === 'guide'} onPress={() => setTab('guide')} />
          <View style={{ flex: 1 }} />
          {projects.length > 0 ? <SeeAll onPress={() => onNavigate('/proyectos')} /> : null}
        </View>
      }
    >
      <View style={{ ...innerSurface, padding: 12, gap: 12 }}>
        {tab === 'guide' ? (
          <Guide />
        ) : latest.length === 0 ? (
          canCreate ? (
            <NewItemTile label="Nuevo proyecto" icon="folder-plus" onPress={onCreate} />
          ) : (
            <Texto suave>Aún no hay proyectos.</Texto>
          )
        ) : (
          <>
            <View style={{ flex: 1, minHeight: 118, flexDirection: 'row', gap: 10 }}>
              {latest.map((p, i) => (
                <View key={p.id} style={{ flex: 1, minWidth: 0 }}>
                  <FolderCard
                    index={i}
                    compact
                    roomy
                    title={p.nombre}
                    count={`${counts[p.id] ?? 0} ${counts[p.id] === 1 ? 'propuesta' : 'propuestas'}`}
                    footer={infoEstado(p.estado).etiqueta}
                    preview={p.requerimiento}
                    onPress={() => onNavigate(`/proyectos/${p.id}`)}
                  />
                </View>
              ))}
              {/* Empty columns keep a single folder from stretching across the card. */}
              {Array.from({ length: VISIBLE_PROJECTS - latest.length }, (_, i) => (
                <View key={i} style={{ flex: 1, minWidth: 0 }} />
              ))}
            </View>
            {canCreate ? (
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <Boton etiqueta="Nuevo proyecto" icono="plus" onPress={onCreate} />
              </View>
            ) : null}
          </>
        )}
      </View>
    </Panel>
  );
}
