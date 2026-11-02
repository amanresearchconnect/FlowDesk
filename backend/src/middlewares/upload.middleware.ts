import multer from 'multer';
import { Request } from 'express';
import path from 'node:path';
import { ValidationError } from '../utils/errors.js';

const ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.xls'];
const ALLOWED_MIME_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
  'text/plain'
];

const storage = multer.memoryStorage();

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(
      new ValidationError(
        `Invalid file type '${ext}'. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`
      )
    );
  }

  if (file.mimetype && !ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(
      new ValidationError(
        `Invalid MIME type '${file.mimetype}'. Please upload a valid CSV or Excel file.`
      )
    );
  }

  cb(null, true);
}

export const uploadSpreadsheet = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB maximum
  },
  fileFilter
}).single('file');

