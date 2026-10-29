import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../../database/client';
import { config } from '../config';

/**
 * Stockage des fichiers de l'application, en deux zones :
 * - `private/…` : PDF officiels et pièces jointes des demandes, servis uniquement après contrôle d'accès ;
 * - `public/…`  : photos et QR des cartes de visite, servis sous /uploads.
 *
 * Pilote `fs` (défaut) : disque local (`PRIVATE_STORAGE_DIR` et `uploads/`).
 * Pilote `db` (`STORAGE_DRIVER=db`) : table `stored_files`, pour les hébergements sans disque persistant (Vercel).
 */
export type Zone = 'private' | 'public';

const driver = () => (process.env.STORAGE_DRIVER || 'fs').toLowerCase();
export const storageInDatabase = () => driver() === 'db';

const UPLOAD_ROOT = () => path.join(process.cwd(), 'uploads');
const root = (zone: Zone) => (zone === 'private' ? config.privateStorageDir : UPLOAD_ROOT());
/** Refuse toute remontée d'arborescence (« .. », chemin absolu). */
const clean = (rel: string) => {
  const n = path.posix.normalize(rel.replace(/\\/g, '/')).replace(/^\/+/, '');
  if (!n || n.startsWith('..')) throw new Error('Chemin de fichier invalide');
  return n;
};
const key = (zone: Zone, rel: string) => `${zone}/${clean(rel)}`;

export async function putFile(zone: Zone, rel: string, data: Buffer, mime?: string) {
  if (storageInDatabase()) {
    const k = key(zone, rel);
    await prisma.storedFile.upsert({ where: { key: k }, create: { key: k, data, mime, size: data.length }, update: { data, mime, size: data.length } });
    return;
  }
  const abs = path.join(root(zone), clean(rel));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
}

export async function getFile(zone: Zone, rel: string): Promise<Buffer> {
  if (storageInDatabase()) {
    const row = await prisma.storedFile.findUnique({ where: { key: key(zone, rel) }, select: { data: true } });
    if (!row) throw Object.assign(new Error('Fichier introuvable'), { code: 'ENOENT' });
    return Buffer.from(row.data);
  }
  return fs.readFile(path.join(root(zone), clean(rel)));
}

export async function deleteFile(zone: Zone, rel: string) {
  if (storageInDatabase()) { await prisma.storedFile.deleteMany({ where: { key: key(zone, rel) } }); return; }
  await fs.rm(path.join(root(zone), clean(rel)), { force: true });
}

/** Fichier public (photo, QR) avec son type, pour la route /uploads en mode base. */
export async function getPublicFile(rel: string) {
  const row = await prisma.storedFile.findUnique({ where: { key: key('public', rel) }, select: { data: true, mime: true } });
  return row ? { data: Buffer.from(row.data), mime: row.mime || 'application/octet-stream' } : null;
}
