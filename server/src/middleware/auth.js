import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../prisma.js';
import { parsePermissions } from '../permissions.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: config.jwtExpires });
}

/** Verifica el token y carga el usuario con sus permisos en req.user. */
export async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return res.status(401).json({ error: 'Sesión expirada o inválida' });
  }

  const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) }, include: { role: true } });
  if (!user || !user.active) return res.status(401).json({ error: 'Usuario inactivo o inexistente' });

  const perms = parsePermissions(user.role.permissions);
  req.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    employeeId: user.employeeId,
    roleName: user.role.name,
    permissions: perms,
  };
  next();
}

export function hasPerm(user, perm) {
  return user.permissions.includes('*') || user.permissions.includes(perm);
}

/** Exige al menos uno de los permisos indicados. */
export const can = (...perms) => (req, res, next) => {
  if (perms.some((p) => hasPerm(req.user, p))) return next();
  res.status(403).json({ error: 'No tiene permiso para realizar esta acción' });
};
