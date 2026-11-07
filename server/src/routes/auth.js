import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { prisma } from '../prisma.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { HttpError, required } from '../utils.js';
import { parsePermissions } from '../permissions.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intente nuevamente en 15 minutos.' },
});

export function validatePassword(pw) {
  if (!pw || pw.length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres');
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw new HttpError(400, 'La contraseña debe incluir letras y números');
}

async function profile(userId) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true, employee: { include: { area: true, position: true, schedule: true } } },
  });
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role.name,
    permissions: parsePermissions(u.role.permissions),
    employee: u.employee,
  };
}

router.post('/login', loginLimiter, async (req, res) => {
  required(req.body, ['email', 'password']);
  const email = String(req.body.email).trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user && user.active && (await bcrypt.compare(req.body.password, user.passwordHash));
  if (!ok) {
    await audit(req, 'LOGIN_FALLIDO', 'Usuario', user?.id, { email });
    throw new HttpError(401, 'Correo o contraseña incorrectos');
  }
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  req.user = { id: user.id, name: user.name, email: user.email };
  await audit(req, 'LOGIN', 'Usuario', user.id);
  res.json({ token: signToken(user), user: await profile(user.id) });
});

router.get('/me', authenticate, async (req, res) => {
  res.json(await profile(req.user.id));
});

router.post('/change-password', authenticate, async (req, res) => {
  required(req.body, ['currentPassword', 'newPassword']);
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) {
    throw new HttpError(400, 'La contraseña actual no es correcta');
  }
  validatePassword(req.body.newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(req.body.newPassword, 10) } });
  await audit(req, 'CAMBIAR_CLAVE', 'Usuario', user.id);
  res.json({ ok: true });
});

export default router;
