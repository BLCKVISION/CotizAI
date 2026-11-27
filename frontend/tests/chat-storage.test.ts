import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { clearChats, loadChat, type Message, purgeUnownedChats, saveChat } from '../src/core/chatStorage';

const data = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    get length() {
      return data.size;
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  },
});

const chat: Message[] = [{ id: 1, from: 'coti', text: 'El menor costo es 100 USD.' }];

beforeEach(() => data.clear());

describe('Coti chat storage', () => {
  it("never shows one user's conversation to another user of the same browser", () => {
    saveChat('user-a', null, chat);
    saveChat('user-a', 'project-1', chat);
    assert.deepEqual(loadChat('user-a', null), chat);
    assert.equal(loadChat('user-b', null), null);
    assert.equal(loadChat('user-b', 'project-1'), null);
  });

  it('does not read or write anything while the user is unknown', () => {
    saveChat(undefined, null, chat);
    assert.equal(data.size, 0);
    assert.equal(loadChat(undefined, null), null);
  });

  it('removes the conversations saved without an owner and keeps everything else', () => {
    data.set('cotizai.coti.none', JSON.stringify(chat));
    data.set('cotizai.coti.project-1', JSON.stringify(chat));
    data.set('cotizai.sidebar', '1');
    saveChat('user-a', null, chat);
    purgeUnownedChats();
    assert.deepEqual([...data.keys()].sort(), ['cotizai.coti.v2.user-a.none', 'cotizai.sidebar']);
  });

  it('removes every conversation when a session ends, and nothing else', () => {
    data.set('cotizai.sidebar', '1');
    saveChat('user-a', null, chat);
    saveChat('user-b', 'project-1', chat);
    clearChats();
    assert.deepEqual([...data.keys()], ['cotizai.sidebar']);
  });

  it('starts fresh when the stored value is corrupt', () => {
    data.set('cotizai.coti.v2.user-a.none', '{not json');
    assert.equal(loadChat('user-a', null), null);
  });
});
