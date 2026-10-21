import multer from 'multer';

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 Mo

export const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Format non supporté. Utilisez JPG, PNG ou WebP.'));
    }
    cb(null, true);
  },
}).single('file');
