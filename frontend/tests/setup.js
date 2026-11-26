// Sustituye react-native y expo-secure-store por dobles en memoria para correr en Node puro.
delete process.env.EXPO_PUBLIC_API_URL; // los tests asumen la URL por defecto
const Module = require('module');
const almacenFalso = new Map();
const dobles = {
  'react-native': { Platform: { OS: 'web' } },
  'expo-secure-store': {
    getItemAsync: async (k) => almacenFalso.get(k) ?? null,
    setItemAsync: async (k, v) => void almacenFalso.set(k, v),
    deleteItemAsync: async (k) => void almacenFalso.delete(k),
  },
};
const original = Module._load;
Module._load = function (peticion, ...resto) {
  return dobles[peticion] ?? original.call(this, peticion, ...resto);
};
globalThis.__dobles = { dobles, almacenFalso };
