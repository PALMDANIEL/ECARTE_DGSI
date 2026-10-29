// Point d'entrée de l'API sur Vercel : l'application Express compilée (backend/dist), servie comme une fonction.
const missing = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'CARD_TOKEN_KEY'].filter(k => !process.env[k] || /^default_/.test(process.env[k]));
if (missing.length) throw new Error(`Variables d'environnement manquantes : ${missing.join(', ')}`);
module.exports = require('../backend/dist/app').app;
