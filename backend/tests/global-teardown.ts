import fs from 'fs';
import os from 'os';
import path from 'path';

export default async function globalTeardown() {
  fs.rmSync(path.join(os.tmpdir(), 'ecarte-test-storage'), { recursive: true, force: true });
}
