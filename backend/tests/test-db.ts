import dotenv from 'dotenv';
dotenv.config();

/** URL de la base de test : même serveur que le développement, base « <nom>_test ». */
export function testDatabaseUrl(): string {
  const base = process.env.DATABASE_URL || '';
  if (!base) throw new Error('DATABASE_URL manquante : impossible de dériver la base de test');
  const url = new URL(base);
  const name = url.pathname.replace('/', '');
  url.pathname = '/' + (name.endsWith('_test') ? name : `${name}_test`);
  return url.toString();
}
