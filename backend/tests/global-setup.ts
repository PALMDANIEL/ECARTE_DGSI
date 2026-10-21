import { execSync } from 'child_process';
import path from 'path';
import { testDatabaseUrl } from './test-db';

/** Crée la base de test si besoin et applique toutes les migrations (donc teste aussi les migrations). */
export default async function globalSetup() {
  const url = testDatabaseUrl();
  execSync(`node ${path.join('node_modules', 'prisma', 'build', 'index.js')} migrate deploy`, {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe'
  });
}
