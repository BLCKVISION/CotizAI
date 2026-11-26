// El backend vive detrás de /api (nginx y el proxy de desarrollo quitan el prefijo al reenviar).
export const environment = {
  production: false,
  apiUrl: '/api',
  wsPath: '/api/socket.io',
};
