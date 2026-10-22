// En développement, l'API est sur la même machine que la page (port 3004) : l'application fonctionne
// en localhost comme depuis un téléphone du réseau local, même si l'adresse IP de la machine change.
const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

export const environment = {
  production: false,
  apiUrl: `http://${host}:3004/api`,
  qrBaseUrl: `http://${host}:4200/card/`
};
