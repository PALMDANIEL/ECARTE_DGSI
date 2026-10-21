import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export class FileService {
  private uploadDir = path.join(__dirname, '../../../../uploads');
  constructor() {
    fs.mkdir(this.uploadDir, { recursive: true });
  }
  async saveQRCode(filename: string, buffer: Buffer): Promise<string> {
    const filePath = path.join(this.uploadDir, filename);
    await fs.writeFile(filePath, buffer);
    return '/uploads/' + filename;
  }
  async saveFile(file: Express.Multer.File, prefix: string = ''): Promise<string> {
    const ext = path.extname(file.originalname);
    const name = prefix + '-' + uuidv4() + ext;
    const filePath = path.join(this.uploadDir, name);
    await fs.writeFile(filePath, file.buffer);
    return '/uploads/' + name;
  }
  async deleteFile(filePath: string): Promise<void> {
    const fullPath = path.join(this.uploadDir, path.basename(filePath));
    try {
      await fs.unlink(fullPath);
    } catch (error) {}
  }
}
