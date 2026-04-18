const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadDirectory = path.resolve(__dirname, '../../uploads/evidences');

if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, { recursive: true });
}

const allowedMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

function decodeFileName(fileName) {
  if (!fileName) {
    return 'arquivo';
  }

  try {
    return Buffer.from(fileName, 'latin1').toString('utf8');
  } catch (error) {
    return fileName;
  }
}

function sanitizeFileName(fileName) {
  return decodeFileName(fileName)
    .normalize('NFC')
    .trim();
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },
  filename: (req, file, cb) => {
    const normalizedOriginalName = sanitizeFileName(file.originalname);
    const extension = path.extname(normalizedOriginalName);
    const fileNameWithoutExtension = path
      .basename(normalizedOriginalName, extension)
      .replace(/\s+/g, '-')
      .replace(/[^\p{L}\p{N}._-]/gu, '_')
      .replace(/_+/g, '_')
      .replace(/-+/g, '-')
      .replace(/^[-_.]+|[-_.]+$/g, '') || 'evidencia';

    file.originalname = normalizedOriginalName;

    cb(null, `${Date.now()}-${fileNameWithoutExtension}${extension}`);
  },
});

const uploadEvidence = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    file.originalname = sanitizeFileName(file.originalname);

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
      return;
    }

    cb(
      new Error(
        'Tipo de arquivo não permitido. Envie imagem, PDF, Excel ou Word.'
      )
    );
  },
});

module.exports = uploadEvidence;
