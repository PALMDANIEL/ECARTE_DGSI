import os from 'os';
import path from 'path';
import { testDatabaseUrl } from './test-db';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDatabaseUrl();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
// Les documents générés par les tests ne doivent jamais atterrir dans le stockage réel
process.env.PRIVATE_STORAGE_DIR = path.join(os.tmpdir(), 'ecarte-test-storage');
process.env.CARD_TOKEN_KEY = 'test-card-token-key';
process.env.ACCESS_BASE_URL = 'http://test.local/q/';
