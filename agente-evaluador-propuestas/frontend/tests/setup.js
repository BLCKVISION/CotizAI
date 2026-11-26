// Sustituye react-native y expo-secure-store por doubles en memoria para correr en Node puro.
delete process.env.EXPO_PUBLIC_API_URL; // los tests asumen la URL por defecto
const Module = require('module');
const fakeStorage = new Map();
const doubles = {
  'react-native': { Platform: { OS: 'web' } },
  'expo-secure-store': {
    getItemAsync: async (k) => fakeStorage.get(k) ?? null,
    setItemAsync: async (k, v) => void fakeStorage.set(k, v),
    deleteItemAsync: async (k) => void fakeStorage.delete(k),
  },
};
const original = Module._load;
Module._load = function (request, ...rest) {
  return doubles[request] ?? original.call(this, request, ...rest);
};
globalThis.__doubles = { doubles, fakeStorage };
