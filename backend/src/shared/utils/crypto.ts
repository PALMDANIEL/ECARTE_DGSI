import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { config } from '../../infrastructure/config';

const key = () => crypto.createHash('sha256').update(config.cardTokenKey).digest();

/** Jeton opaque de 128 bits, encodé en base64url (22 caractères). Ne contient aucune donnée personnelle. */
export const generateToken = (): string => crypto.randomBytes(16).toString('base64url');

/** Empreinte de recherche : le jeton en clair n'est jamais utilisé comme clé en base. */
export const hashToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');

/** Chiffrement réversible (AES-256-GCM) pour pouvoir ré-imprimer le même QR sans stocker le jeton en clair. */
export const encryptToken = (token: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map(b => b.toString('base64url')).join('.');
};

export const decryptToken = (payload: string): string => {
  const [iv, tag, enc] = payload.split('.').map(p => Buffer.from(p, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
};

export const generatePin = (length = 6): string =>
  Array.from({ length }, () => crypto.randomInt(0, 10)).join('');

export const hashPin = (pin: string): Promise<string> => bcrypt.hash(pin, 10);
export const verifyPin = (pin: string, hash: string): Promise<boolean> => bcrypt.compare(pin, hash);

/** Secret distinct pour les jetons « agent » : un jeton agent n'est jamais accepté par le middleware authenticate. */
export const agentJwtSecret = (): string =>
  crypto.createHash('sha256').update(config.jwtSecret + ':agent-session').digest('hex');

export const sha256 = (input: string): string => crypto.createHash('sha256').update(input).digest('hex');

/** JSON canonique (clés triées) pour des empreintes reproductibles. */
export const canonicalJson = (value: unknown): string => {
  const norm = (v: any): any => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') return Object.keys(v).sort().reduce((acc: any, k) => { acc[k] = norm(v[k]); return acc; }, {});
    return v === undefined ? null : v;
  };
  return JSON.stringify(norm(JSON.parse(JSON.stringify(value ?? null))));
};
