/**
 * Coti conversations kept in this browser only (a convenience, never the source of truth).
 * Answers quote project data, so every key belongs to one user: the next person to sign in on the same
 * browser must never see them. Any storage failure just means a fresh chat.
 */
export type Message = { id: number; from: 'coti' | 'user'; text: string; sources?: string[] };

const PREFIX = 'cotizai.coti.';
const OWNED_PREFIX = `${PREFIX}v2.`;
const MAX_SAVED = 50;

const removeChats = (matches: (key: string) => boolean): void => {
  try {
    const storage = globalThis.localStorage;
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    for (const key of keys) {
      if (key?.startsWith(PREFIX) && matches(key)) storage.removeItem(key);
    }
  } catch {
    /* blocked storage: there is nothing to remove */
  }
};

const storageKey = (userId: string, projectId: string | null) => `${OWNED_PREFIX}${userId}.${projectId ?? 'none'}`;

/** Earlier versions saved chats without an owner; they cannot be attributed to anyone, so they are removed. */
export const purgeUnownedChats = (): void => { removeChats((key) => !key.startsWith(OWNED_PREFIX)); };

/** Called whenever a session ends, so no answer about project data stays in a shared browser. */
export const clearChats = (): void => { removeChats(() => true); };

/** `null` when there is no saved conversation or no known user. */
export const loadChat = (userId: string | undefined, projectId: string | null): Message[] | null => {
  if (!userId) return null;
  try {
    const raw = globalThis.localStorage.getItem(storageKey(userId, projectId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as Message[]) : null;
  } catch {
    return null; // blocked or corrupt storage
  }
};

export const saveChat = (userId: string | undefined, projectId: string | null, messages: Message[]): void => {
  if (!userId) return;
  try {
    globalThis.localStorage.setItem(storageKey(userId, projectId), JSON.stringify(messages.slice(-MAX_SAVED)));
  } catch {
    /* blocked storage: the chat just is not remembered */
  }
};
