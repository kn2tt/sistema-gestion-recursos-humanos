import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });

if (!process.env.TZ) process.env.TZ = 'America/Lima';

const isProd = process.env.NODE_ENV === 'production';
if (isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET debe tener al menos 32 caracteres en producción');
}

export const config = {
  isProd,
  port: Number(process.env.PORT || 4000),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-no-usar-en-produccion',
  jwtExpires: process.env.JWT_EXPIRES || '8h',
  uploadsDir: path.join(__dirname, '..', 'uploads'),
  clientDist: path.join(__dirname, '..', '..', 'client', 'dist'),
  mail: {
    user: process.env.GMAIL_USER || '',
    pass: process.env.GMAIL_APP_PASSWORD || '',
    fromName: process.env.MAIL_FROM_NAME || 'Sistema de Gestión de Personal',
  },
};
