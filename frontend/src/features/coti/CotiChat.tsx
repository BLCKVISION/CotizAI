/** Coti: floating assistant with a chat. It answers about the quotes of the project that is open, from the evaluated documents. */
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { usePathname } from 'expo-router';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';

import { ErrorApi } from '@/core/api/cliente';
import { loadChat, type Message, purgeUnownedChats, saveChat } from '@/core/chatStorage';
import { useSesion } from '@/core/sesion/SesionProvider';
import { mensajeDeError } from '@/core/useDatos';
import { Boton, BotonIcono, CampoDeTexto, Icono, Texto } from '@/design/componentes';
import { soloWeb, vidrio } from '@/design/efectos';
import { tint, useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';
import { askPortfolioApi, askProjectApi } from '@/core/api/evaluations';

const GREETING =
  '¡Hola! Soy Coti, tu asistente de CotizAI. Te ayudo a analizar las cotizaciones de tus proyectos: costos, descartes y ranking. ¿Qué necesitas saber?';
const SUGGESTIONS = ['¿Cuál es la mejor cotización?', '¿Qué cotizaciones se descartaron y por qué?', '¿Cuál tiene el menor costo total?'];

/** `/proyectos/<id>` → the id; the list and the "new" screen have no project to ask about. */
const projectIdFrom = (path: string): string | null => {
  const match = /^\/proyectos\/([^/]+)/.exec(path);
  return match && match[1] !== 'nuevo' ? match[1] : null;
};

const firstMessage = (): Message => ({ id: 0, from: 'coti', text: GREETING });

const loadMessages = (userId: string | undefined, projectId: string | null): Message[] =>
  loadChat(userId, projectId) ?? [firstMessage()];

/** Remounts on every change of user, so no message in memory outlives the session that asked for it. */
export function CotiChat() {
  const { usuario } = useSesion();
  return <UserChat key={usuario?.id ?? 'unknown'} userId={usuario?.id} />;
}

function UserChat({ userId }: { userId: string | undefined }) {
  const t = useTema();
  const { conSesion } = useSesion();
  const { width, height } = useWindowDimensions();
  const projectId = projectIdFrom(usePathname());
  const [open, setOpen] = useState(false);
  // The panel stays mounted while it fades out, so closing is as smooth as opening.
  const [mounted, setMounted] = useState(false);
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (open) setMounted(true); // eslint-disable-line react-hooks/set-state-in-effect -- mount first so the animation has something to move
    Animated.timing(progress, { toValue: open ? 1 : 0, duration: open ? 480 : 360, easing: Easing.bezier(0.33, 1, 0.68, 1), useNativeDriver: true }).start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
  }, [open, progress]);
  const [messages, setMessages] = useState<Message[]>(() => loadMessages(userId, projectId));
  const skipSave = useRef(false); // right after a project switch `messages` still hold the previous project's chat
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const nextId = useRef(1);

  useEffect(purgeUnownedChats, []);

  // Each project has its own saved conversation: switching project loads that one.
  useEffect(() => {
    const saved = loadMessages(userId, projectId);
    skipSave.current = true;
    nextId.current = Math.max(...saved.map((m) => m.id)) + 1;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload the saved chat when the project changes
    setMessages(saved);
    setDraft('');
  }, [userId, projectId]);

  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    saveChat(userId, projectId, messages);
  }, [userId, projectId, messages]);

  const push = (m: Omit<Message, 'id'>) => setMessages((all) => [...all, { ...m, id: nextId.current++ }]);

  const send = async (override?: string) => {
    const text = (override ?? draft).trim();
    if (thinking || text.length < 2) return;
    setDraft('');
    push({ from: 'user', text });
    setThinking(true);
    try {
      const askAll = async () => push({ from: 'coti', text: (await conSesion(askPortfolioApi(text))).answer });
      if (!projectId) return await askAll();
      try {
        const reply = await conSesion(askProjectApi(projectId, text));
        push({ from: 'coti', text: reply.answer, sources: reply.citations.map((c) => `[${c.number}] ${c.filename}`) });
      } catch (e) {
        // A project without results yet (404), or a role that only sees status (403): answer from the project records.
        if (!(e instanceof ErrorApi) || (e.estado !== 404 && e.estado !== 403)) throw e;
        await askAll();
      }
    } catch (e) {
      push({ from: 'coti', text: `Uy, no pude responder ahora. ${mensajeDeError(e)}` });
    } finally {
      setThinking(false);
    }
  };

  const BUBBLE = 60;
  const panelWidth = Math.min(380, width - BUBBLE - espacio.md * 3);
  const panelHeight = Math.min(520, height - 140);

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', right: espacio.md, bottom: espacio.md, flexDirection: 'row', alignItems: 'flex-end', gap: espacio.sm, zIndex: 60 }}>
      {mounted ? (
        <Animated.View
          pointerEvents={open ? 'auto' : 'none'}
          accessibilityViewIsModal={false}
          style={{
            ...vidrio({ opacidad: 0.96, blur: 32, radio: radio.xl }),
            width: panelWidth,
            height: panelHeight,
            overflow: 'hidden',
            opacity: progress,
            transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [48, 0] }) }, { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
            ...soloWeb({ transformOrigin: 'right bottom' }),
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: espacio.md, gap: espacio.sm, borderBottomWidth: 1, borderBottomColor: t.borde }}>
            <View style={{ width: 36, height: 36, borderRadius: radio.pildora, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name="robot-happy-outline" size={22} color={t.onAccent} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
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

          {projectId && messages.length === 1 && !thinking ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.xs, paddingHorizontal: espacio.md, paddingBottom: espacio.sm }}>
              {SUGGESTIONS.map((q) => (
                <Boton key={q} etiqueta={q} variante="secundario" onPress={() => void send(q)} />
              ))}
            </View>
          ) : null}

          <View style={{ padding: espacio.md, gap: espacio.sm, borderTopWidth: 1, borderTopColor: t.borde }}>
            <CampoDeTexto etiqueta="Mensaje para Coti" value={draft} onChangeText={setDraft} maxLength={500} onSubmitEditing={() => void send()} />
            <Boton etiqueta="Enviar" icono="send" cargando={thinking} deshabilitado={draft.trim().length < 2} onPress={() => void send()} />
          </View>
        </Animated.View>
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
          ...soloWeb({ boxShadow: `0 8px 24px ${tint.navy(0.22)}`, transitionProperty: 'background-color, transform', transitionDuration: '260ms', transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }),
        })}
      >
        {/* The two icons cross-fade and turn a little, instead of swapping abruptly. */}
        <Animated.View style={{ position: 'absolute', opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-90deg'] }) }, { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }) }] }}>
          <MaterialCommunityIcons name="robot-happy-outline" size={30} color={t.onAccent} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        </Animated.View>
        <Animated.View style={{ position: 'absolute', opacity: progress, transform: [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['90deg', '0deg'] }) }, { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
          <Icono nombre="x" tamano="lg" color={t.onAccent} />
        </Animated.View>
      </Pressable>
    </View>
  );
}
