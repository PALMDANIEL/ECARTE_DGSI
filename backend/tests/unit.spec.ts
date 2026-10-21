import { generateToken, hashToken, encryptToken, decryptToken, canonicalJson, generatePin } from '../src/shared/utils/crypto';
import { parseCsv, parseDate } from '../src/shared/utils/csv';
import { generateSlug } from '../src/shared/utils/slugify';

describe('crypto', () => {
  it('génère des jetons opaques, uniques et sans donnée personnelle', () => {
    const a = generateToken(), b = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(a).not.toBe(b);
  });
  it('hache de façon déterministe et ne renvoie jamais le jeton', () => {
    const t = generateToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t);
    expect(hashToken(t)).toHaveLength(64);
  });
  it('chiffre puis déchiffre un jeton, et refuse une donnée altérée', () => {
    const t = generateToken();
    const enc = encryptToken(t);
    expect(enc).not.toContain(t);
    expect(decryptToken(enc)).toBe(t);
    const [iv, tag, data] = enc.split('.');
    const tampered = [iv, tag, Buffer.from('x' + Buffer.from(data, 'base64url').toString('latin1')).toString('base64url')].join('.');
    expect(() => decryptToken(tampered)).toThrow();
  });
  it('génère un PIN numérique de la longueur demandée', () => {
    expect(generatePin(6)).toMatch(/^\d{6}$/);
    expect(generatePin(4)).toMatch(/^\d{4}$/);
  });
  it('produit un JSON canonique indépendant de l\'ordre des clés', () => {
    expect(canonicalJson({ b: 1, a: { d: 1, c: 2 } })).toBe(canonicalJson({ a: { c: 2, d: 1 }, b: 1 }));
  });
});

describe('csv', () => {
  it('lit un CSV Excel français (point-virgule, BOM, guillemets, accents dans les en-têtes)', () => {
    const { headers, rows } = parseCsv('﻿Matricule;Nom;Prénom;Date d\'intégration\r\n386239D;"PALM; Jr";Romeo;01/03/2018\r\n');
    expect(headers).toEqual(['matricule', 'nom', 'prenom', 'date_d\'integration']);
    expect(rows).toHaveLength(1);
    expect(rows[0].values.nom).toBe('PALM; Jr');
    expect(rows[0].line).toBe(2);
  });
  it('gère les virgules, guillemets doublés, lignes vides et retours à la ligne dans un champ', () => {
    const { rows } = parseCsv('a,b\n"x ""y""","l1\nl2"\n\n3,4\n');
    expect(rows.map(r => r.values)).toEqual([{ a: 'x "y"', b: 'l1\nl2' }, { a: '3', b: '4' }]);
    expect(rows[1].line).toBe(5);
  });
  it('analyse les dates JJ/MM/AAAA et AAAA-MM-JJ et rejette les dates invalides', () => {
    expect(parseDate('05/06/2026')?.toISOString()).toBe('2026-06-05T00:00:00.000Z');
    expect(parseDate('2026-06-05')?.toISOString()).toBe('2026-06-05T00:00:00.000Z');
    expect(parseDate('')).toBeNull();
    expect(() => parseDate('31/02/2026')).toThrow(/inexistante/);
    expect(() => parseDate('hier')).toThrow(/invalide/);
  });
});

describe('slugify', () => {
  it('conserve les lettres accentuées sous forme simple', () => {
    expect(generateSlug('Awa Koné')).toBe('awa-kone');
    expect(generateSlug("Éloïse N'Guessan")).toBe('eloise-nguessan');
  });
});
