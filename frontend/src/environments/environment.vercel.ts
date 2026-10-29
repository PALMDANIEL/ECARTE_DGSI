// Déploiement Vercel : l'API est servie par le même domaine que l'interface (/api).
export const environment = {
  production: true,
  apiUrl: '/api',
  qrBaseUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/card/`
};
