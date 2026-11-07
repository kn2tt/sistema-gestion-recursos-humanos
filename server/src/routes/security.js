// Usuarios, roles, auditoría y configuración del sistema.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma.js';
import { can } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { PERMISSIONS, ALL_KEYS, parsePermissions } from '../permissions.js';
import { validatePassword } from './auth.js';
import { getSettings, saveSettings } from '../services/settings.js';
import { mailConfigured, sendMail } from '../services/mailer.js';
import { startJobs } from '../services/jobs.js';
import { config } from '../config.js';
import { HttpError, idParam, paging, required, str, toBool, toInt } from '../utils.js';

const router = Router();

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  active: true,
  lastLoginAt: true,
  createdAt: true,
  role: { select: { id: true, name: true } },
  employee: { select: { id: true, code: true, firstName: true, lastName: true } },
};

// ── Usuarios ──
router.get('/users', can('users.manage'), async (req, res) => {
  res.json(await prisma.user.findMany({ select: USER_SELECT, orderBy: { name: 'asc' } }));
});

router.post('/users', can('users.manage'), async (req, res) => {
  required(req.body, ['email', 'name', 'password', 'roleId']);
  validatePassword(req.body.password);
  const email = String(req.body.email).trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) throw new HttpError(409, 'Ya existe un usuario con ese correo');
  const u = await prisma.user.create({
    data: {
      email,
      name: str(req.body.name),
      passwordHash: await bcrypt.hash(req.body.password, 10),
      roleId: toInt(req.body.roleId),
      employeeId: toInt(req.body.employeeId) ?? null,
      active: toBool(req.body.active) ?? true,
    },
    select: USER_SELECT,
  });
  await audit(req, 'CREAR', 'Usuario', u.id, { email, rol: u.role.name });
  res.status(201).json(u);
});

router.put('/users/:id', can('users.manage'), async (req, res) => {
  const id = idParam(req);
  const before = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!before) throw new HttpError(404, 'Usuario no encontrado');
  const data = {};
  if (req.body.name !== undefined) data.name = str(req.body.name);
  if (req.body.email !== undefined) data.email = String(req.body.email).trim().toLowerCase();
  if (req.body.roleId !== undefined) data.roleId = toInt(req.body.roleId);
  if (req.body.employeeId !== undefined) data.employeeId = toInt(req.body.employeeId);
  if (req.body.active !== undefined) data.active = toBool(req.body.active);
  if (req.body.password) {
    validatePassword(req.body.password);
    data.passwordHash = await bcrypt.hash(req.body.password, 10);
  }
  if (id === req.user.id && (data.active === false || (data.roleId && data.roleId !== before.roleId))) {
    throw new HttpError(400, 'No puede desactivarse ni cambiar su propio rol');
  }
  const u = await prisma.user.update({ where: { id }, data, select: USER_SELECT });
  const { passwordHash, ...logged } = data;
  await audit(req, 'EDITAR', 'Usuario', id, { ...logged, ...(passwordHash && { clave: 'restablecida' }) });
  res.json(u);
});

router.delete('/users/:id', can('users.manage'), async (req, res) => {
  const id = idParam(req);
  if (id === req.user.id) throw new HttpError(400, 'No puede eliminar su propio usuario');
  const u = await prisma.user.delete({ where: { id } });
  await audit(req, 'ELIMINAR', 'Usuario', id, { email: u.email });
  res.json({ ok: true });
});

// ── Roles ──
router.get('/roles/permissions', can('roles.manage', 'users.manage'), (req, res) => res.json(PERMISSIONS));

router.get('/roles', can('roles.manage', 'users.manage'), async (req, res) => {
  const roles = await prisma.role.findMany({ include: { _count: { select: { users: true } } }, orderBy: { name: 'asc' } });
  res.json(roles.map((r) => ({ ...r, permissions: parsePermissions(r.permissions) })));
});

function cleanPerms(list) {
  if (!Array.isArray(list)) throw new HttpError(400, 'Permisos inválidos');
  return list.filter((p) => p === '*' || ALL_KEYS.includes(p));
}

router.post('/roles', can('roles.manage'), async (req, res) => {
  required(req.body, ['name']);
  const r = await prisma.role.create({
    data: { name: str(req.body.name), description: str(req.body.description), permissions: JSON.stringify(cleanPerms(req.body.permissions || [])) },
  });
  await audit(req, 'CREAR', 'Rol', r.id, { nombre: r.name, permisos: req.body.permissions });
  res.status(201).json(r);
});

router.put('/roles/:id', can('roles.manage'), async (req, res) => {
  const id = idParam(req);
  const before = await prisma.role.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, 'Rol no encontrado');
  const data = {};
  if (req.body.name !== undefined) data.name = str(req.body.name);
  if (req.body.description !== undefined) data.description = str(req.body.description);
  if (req.body.permissions !== undefined) {
    if (parsePermissions(before.permissions).includes('*')) throw new HttpError(400, 'Los permisos del rol Administrador no se pueden modificar');
    data.permissions = JSON.stringify(cleanPerms(req.body.permissions));
  }
  const r = await prisma.role.update({ where: { id }, data });
  await audit(req, 'EDITAR', 'Rol', id, { nombre: r.name, antes: parsePermissions(before.permissions), despues: parsePermissions(r.permissions) });
  res.json(r);
});

router.delete('/roles/:id', can('roles.manage'), async (req, res) => {
  const id = idParam(req);
  const r = await prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
  if (!r) throw new HttpError(404, 'Rol no encontrado');
  if (r.isSystem) throw new HttpError(400, 'Este rol es del sistema y no se puede eliminar');
  if (r._count.users) throw new HttpError(409, `El rol tiene ${r._count.users} usuario(s) asignados`);
  await prisma.role.delete({ where: { id } });
  await audit(req, 'ELIMINAR', 'Rol', id, r.name);
  res.json({ ok: true });
});

// ── Auditoría ──
router.get('/audit', can('audit.view'), async (req, res) => {
  const { userId, action, entity, from, to, q } = req.query;
  const where = {};
  if (userId) where.userId = Number(userId);
  if (action) where.action = action;
  if (entity) where.entity = entity;
  if (from || to) where.createdAt = { ...(from && { gte: new Date(`${from}T00:00:00`) }), ...(to && { lte: new Date(`${to}T23:59:59`) }) };
  if (q) where.OR = [{ details: { contains: q } }, { userName: { contains: q } }, { entityId: q }];
  const { skip, take, page, size } = paging(req);
  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
  ]);
  res.json({ total, page, size, items });
});

router.get('/audit/facets', can('audit.view'), async (req, res) => {
  const [actions, entities] = await Promise.all([
    prisma.auditLog.findMany({ distinct: ['action'], select: { action: true } }),
    prisma.auditLog.findMany({ distinct: ['entity'], select: { entity: true } }),
  ]);
  res.json({ actions: actions.map((a) => a.action).sort(), entities: entities.map((e) => e.entity).sort() });
});

// ── Configuración ──
router.get('/settings', async (req, res) => {
  const s = await getSettings();
  res.json({ ...s, mailConfigured: mailConfigured(), mailUser: config.mail.user, timezone: process.env.TZ });
});

router.put('/settings', can('settings.manage'), async (req, res) => {
  const s = await saveSettings(req.body);
  await startJobs();
  await audit(req, 'EDITAR', 'Configuración', null, req.body);
  res.json({ ...s, mailConfigured: mailConfigured(), mailUser: config.mail.user, timezone: process.env.TZ });
});

router.post('/settings/test-mail', can('settings.manage'), async (req, res) => {
  const to = str(req.body.to) || req.user.email;
  const r = await sendMail({
    to,
    subject: 'Prueba de correo — Sistema de Gestión de Personal',
    html: '<p>Si recibes este mensaje, el envío de alertas por correo está configurado correctamente.</p>',
  });
  res.json({ ok: true, simulated: r.simulated, to });
});

export default router;
