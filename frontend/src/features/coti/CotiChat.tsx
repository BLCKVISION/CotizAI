/** Coti: floating assistant with a chat. It answers about the quotes of the project that is open, from the evaluated documents. */
import { usePathname } from 'expo-router';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';

import { useSesion } from '@/core/sesion/SesionProvider';
import { mensajeDeError } from '@/core/useDatos';
import { Boton, BotonIcono, CampoDeTexto, Icono, Texto } from '@/design/componentes';
import { soloWeb, vidrio } from '@/design/efectos';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';
import { askProjectApi } from '@/features/evaluations/api';

type Message = { id: number; from: 'coti' | 'user'; text: string; sources?: string[] };

const GREETING =
  '¡Hola! Soy Coti, tu asistente de CotizAI. Te ayudo a analizar las cotizaciones de tus proyectos: costos, descartes y ranking. ¿Qué necesitas saber?';
const NO_PROJECT =
  'Para ayudarte con las cotizaciones, abre primero un proyecto con su evaluación y luego pregúntame lo que necesites.';

/** `/proyectos/<id>` → the id; the list and the "new" screen have no project to ask about. */
const projectIdFrom = (path: string): string | null => {
  const match = /^\/proyectos\/([^/]+)/.exec(path);
  return match && match[1] !== 'nuevo' ? match[1] : null;
};

const firstMessage = (): Message => ({ id: 0, from: 'coti', text: GREETING });

const MAX_SAVED = 50;
const storageKey = (projectId: string | null) => `cotizai.coti.${projectId ?? 'none'}`;

/** Conversation kept in this browser only (a convenience, never data); any storage failure just means a fresh chat. */
const loadMessages = (projectId: string | null): Message[] => {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage?.getItem(storageKey(projectId)) : null;
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as Message[];
  } catch {
    /* blocked or corrupt storage */
  }
  return [firstMessage()];
};

const saveMessages = (projectId: string | null, messages: Message[]) => {
  try {
    window.localStorage.setItem(storageKey(projectId), JSON.stringify(messages.slice(-MAX_SAVED)));
  } catch {
    /* blocked storage: the chat just is not remembered */
  }
};

export function CotiChat() {
  const t = useTema();
  const { conSesion } = useSesion();
  const { width, height } = useWindowDimensions();
  const projectId = projectIdFrom(usePathname());
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => loadMessages(projectId));
  const skipSave = useRef(false); // right after a project switch `messages` still hold the previous project's chat
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const nextId = useRef(1);

  // Each project has its own saved conversation: switching project loads that one.
  useEffect(() => {
    const saved = loadMessages(projectId);
    skipSave.current = true;
    nextId.current = Math.max(...saved.map((m) => m.id)) + 1;
    setMessages(saved);
    setDraft('');
  }, [projectId]);

  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    saveMessages(projectId, messages);
  }, [projectId, messages]);

  const push = (m: Omit<Message, 'id'>) => setMessages((all) => [...all, { ...m, id: nextId.current++ }]);

  const send = async () => {
    const text = draft.trim();
    if (thinking || text.length < 2) return;
    setDraft('');
    push({ from: 'user', text });
    if (!projectId) {
      push({ from: 'coti', text: NO_PROJECT });
      return;
    }
    setThinking(true);
    try {
      const reply = await conSesion(askProjectApi(projectId, text));
      push({ from: 'coti', text: reply.answer, sources: reply.citations.map((c) => `[${c.number}] ${c.filename}`) });
    } catch (e) {
      push({ from: 'coti', text: `Uy, no pude responder ahora. ${mensajeDeError(e)}` });
    } finally {
      setThinking(false);
    }
  };

  const panelWidth = Math.min(380, width - espacio.md * 2);
  const panelHeight = Math.min(520, height - 140);

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', right: espacio.md, bottom: espacio.md, alignItems: 'flex-end', gap: espacio.sm, zIndex: 60 }}>
      {open ? (
        <View
          accessibilityViewIsModal={false}
          style={{ ...vidrio({ opacidad: 0.96, blur: 32, radio: radio.xl }), width: panelWidth, height: panelHeight, overflow: 'hidden' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: espacio.md, gap: espacio.sm, borderBottomWidth: 1, borderBottomColor: t.borde }}>
            <View style={{ width: 36, height: 36, borderRadius: radio.pildora, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Icono nombre="message-circle" color={t.onAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Texto variante="etiqueta">Coti</Texto>
              <Texto variante="pequeno" suave>Asistente de cotizaciones</Texto>
            </View>
            <BotonIcono nombre="x" etiqueta="Cerrar chat con Coti" onPress={() => setOpen(false)} />
          </View>

          <ScrollView
            ref={scroller}
            onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: espacio.md, gap: espacio.sm }}
          >
            <View accessibilityLiveRegion="polite" style={{ gap: espacio.sm }}>
              {messages.map((m) => (
                <View key={m.id} style={{ alignSelf: m.from === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', gap: 2 }}>
                  <View
                    style={{
                      backgroundColor: m.from === 'user' ? t.primario : t.superficieAlta,
                      borderRadius: radio.lg,
                      paddingHorizontal: espacio.md,
                      paddingVertical: espacio.sm,
                    }}
                  >
                    <Texto color={m.from === 'user' ? t.sobrePrimario : t.texto}>{m.text}</Texto>
                  </View>
                  {m.sources?.map((s) => (
                    <Texto key={s} variante="pequeno" suave>{s}</Texto>
                  ))}
                </View>
              ))}
              {thinking ? <Texto suave>Coti está escribiendo…</Texto> : null}
            </View>
          </ScrollView>

          <View style={{ padding: espacio.md, gap: espacio.sm, borderTopWidth: 1, borderTopColor: t.borde }}>
            <CampoDeTexto etiqueta="Mensaje para Coti" value={draft} onChangeText={setDraft} maxLength={500} onSubmitEditing={() => void send()} />
            <Boton etiqueta="Enviar" icono="send" cargando={thinking} deshabilitado={draft.trim().length < 2} onPress={() => void send()} />
          </View>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? 'Cerrar chat con Coti' : 'Abrir chat con Coti'}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={(e: { pressed: boolean; hovered?: boolean; focused?: boolean }) => ({
          width: 60,
          height: 60,
          borderRadius: radio.pildora,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: e.pressed || e.hovered ? t.accentPressed : t.accent,
          borderWidth: 2,
          borderColor: e.focused ? t.foco : 'transparent',
          ...soloWeb({ boxShadow: '0 8px 24px rgba(15,23,42,0.22)', transitionProperty: 'background-color', transitionDuration: '160ms' }),
        })}
      >
        <Icono nombre={open ? 'x' : 'message-circle'} tamano="lg" color={t.onAccent} />
      </Pressable>
    </View>
  );
}
