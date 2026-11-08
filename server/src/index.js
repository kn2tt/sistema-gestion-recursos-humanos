import { config } from './config.js';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { prisma } from './prisma.js';
import { authenticate } from './middleware/auth.js';
import { startJobs } from './services/jobs.js';

import authRoutes from './routes/auth.js';
import employeeRoutes from './routes/employees.js';
import orgRoutes from './routes/org.js';
import attendanceRoutes from './routes/attendance.js';
import leaveRoutes from './routes/leaves.js';
import projectRoutes from './routes/projects.js';
import trainingRoutes from './routes/trainings.js';
import documentRoutes from './routes/documents.js';
import securityRoutes from './routes/security.js';
import reportRoutes from './routes/reports.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: config.clientUrl }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);

// Todo lo demás requiere sesión iniciada
app.use('/api', authenticate);
app.use('/api/employees', employeeRoutes);
app.use('/api/org', orgRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/trainings', trainingRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/reports', reportRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// En producción la API también sirve el frontend compilado (client/dist)
if (fs.existsSync(config.clientDist)) {
  app.use(express.static(config.clientDist));
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
}

// Manejo centralizado de errores
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera 10 MB' : err.message });
  }
  if (err.code === 'P2002') {
    const field = [].concat(err.meta?.target || []).join(', ');
    return res.status(409).json({ error: `Ya existe un registro con el mismo valor${field ? ` (${field})` : ''}` });
  }
  if (err.code === 'P2025') return res.status(404).json({ error: 'Registro no encontrado' });
  if (err.code === 'P2003') return res.status(409).json({ error: 'El registro está relacionado con otros datos' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Error interno del servidor' : err.message });
});

app.listen(config.port, async () => {
  console.log(`API escuchando en http://localhost:${config.port}`);
  await startJobs();
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
