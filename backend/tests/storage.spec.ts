import { prisma, resetDb } from './helpers';
import { putFile, getFile, deleteFile, getPublicFile } from '../src/infrastructure/storage';

beforeEach(resetDb);
afterEach(() => { delete process.env.STORAGE_DRIVER; });

describe('stockage des fichiers', () => {
  it('en base (STORAGE_DRIVER=db) : écrit, relit, remplace, supprime ; sépare les zones privée et publique', async () => {
    process.env.STORAGE_DRIVER = 'db';
    await putFile('private', 'requests/r1/v1.pdf', Buffer.from('%PDF-1 un'), 'application/pdf');
    expect((await getFile('private', 'requests/r1/v1.pdf')).toString()).toBe('%PDF-1 un');
    await putFile('private', 'requests/r1/v1.pdf', Buffer.from('%PDF-1 deux'));
    expect((await getFile('private', 'requests/r1/v1.pdf')).toString()).toBe('%PDF-1 deux');
    expect(await prisma.storedFile.count()).toBe(1);
    // un fichier privé n'est jamais servi par la route publique
    expect(await getPublicFile('requests/r1/v1.pdf')).toBeNull();
    await putFile('public', 'photo/a.png', Buffer.from('png'), 'image/png');
    expect(await getPublicFile('photo/a.png')).toMatchObject({ mime: 'image/png' });
    await deleteFile('private', 'requests/r1/v1.pdf');
    await expect(getFile('private', 'requests/r1/v1.pdf')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuse les chemins qui sortent de la zone', async () => {
    process.env.STORAGE_DRIVER = 'db';
    await expect(putFile('private', '../../etc/passwd', Buffer.from('x'))).rejects.toThrow(/invalide/);
    await expect(getFile('public', '../private/requests/r1/v1.pdf')).rejects.toThrow(/invalide/);
  });

  it('sur disque (défaut) : écrit, relit, supprime', async () => {
    await putFile('private', 'tests/storage-check.bin', Buffer.from('ok'));
    expect((await getFile('private', 'tests/storage-check.bin')).toString()).toBe('ok');
    await deleteFile('private', 'tests/storage-check.bin');
    await expect(getFile('private', 'tests/storage-check.bin')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await prisma.storedFile.count()).toBe(0);
  });
});
