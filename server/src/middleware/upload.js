import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from '../utils.js';

const ALLOWED = new Set(['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.webp', '.xls', '.xlsx']);

/** Crea un middleware multer que guarda en uploads/<folder> con nombre aleatorio. */
export function uploader(folder) {
  const dir = path.join(config.uploadsDir, folder);
  fs.mkdirSync(dir, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ALLOWED.has(ext)) cb(null, true);
      else cb(new HttpError(400, `Tipo de archivo no permitido (${ext}). Use PDF, Word, Excel o imagen.`));
    },
  });
}

/** Ruta relativa a uploads/ para guardar en la base de datos. */
export function storedPath(file) {
  return path.relative(config.uploadsDir, file.path).split(path.sep).join('/');
}

export function absolutePath(rel) {
  const abs = path.resolve(config.uploadsDir, rel);
  if (!abs.startsWith(path.resolve(config.uploadsDir))) throw new HttpError(400, 'Ruta inválida');
  return abs;
}

export function removeFile(rel) {
  if (!rel) return;
  fs.promises.unlink(absolutePath(rel)).catch(() => {});
}

/** Envía un archivo subido para descarga con su nombre original. */
export function sendStored(res, rel, name) {
  if (!rel) throw new HttpError(404, 'Archivo no encontrado');
  const abs = absolutePath(rel);
  if (!fs.existsSync(abs)) throw new HttpError(404, 'Archivo no encontrado en el servidor');
  res.download(abs, name || path.basename(abs));
}
