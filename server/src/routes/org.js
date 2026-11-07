// Áreas, cargos y horarios.
import { Router } from 'express';
import { prisma } from '../prisma.js';
import { can } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { HttpError, clean, idParam, required, str, toInt } from '../utils.js';

const router = Router();

// Lectura disponible para cualquier usuario autenticado (se usa en formularios y filtros)
router.get('/areas', async (req, res) => {
  res.json(await prisma.area.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { employees: true, positions: true } } } }));
});
router.get('/positions', async (req, res) => {
  res.json(await prisma.position.findMany({ orderBy: { name: 'asc' }, include: { area: true, _count: { select: { employees: true } } } }));
});
router.get('/schedules', async (req, res) => {
  res.json(await prisma.schedule.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { employees: true } } } }));
});

// ── Áreas ──
router.post('/areas', can('org.edit'), async (req, res) => {
  required(req.body, ['name']);
  const a = await prisma.area.create({ data: { name: str(req.body.name), description: str(req.body.description) } });
  await audit(req, 'CREAR', 'Área', a.id, a.name);
  res.status(201).json(a);
});
router.put('/areas/:id', can('org.edit'), async (req, res) => {
  const a = await prisma.area.update({ where: { id: idParam(req) }, data: clean({ name: str(req.body.name), description: str(req.body.description) }) });
  await audit(req, 'EDITAR', 'Área', a.id, a.name);
  res.json(a);
});
router.delete('/areas/:id', can('org.edit'), async (req, res) => {
  const id = idParam(req);
  const count = await prisma.employee.count({ where: { areaId: id } });
  if (count) throw new HttpError(409, `No se puede eliminar: ${count} trabajador(es) pertenecen a esta área`);
  await prisma.area.delete({ where: { id } });
  await audit(req, 'ELIMINAR', 'Área', id);
  res.json({ ok: true });
});

// ── Cargos ──
router.post('/positions', can('org.edit'), async (req, res) => {
  required(req.body, ['name']);
  const p = await prisma.position.create({ data: { name: str(req.body.name), description: str(req.body.description), areaId: toInt(req.body.areaId) } });
  await audit(req, 'CREAR', 'Cargo', p.id, p.name);
  res.status(201).json(p);
});
router.put('/positions/:id', can('org.edit'), async (req, res) => {
  const p = await prisma.position.update({
    where: { id: idParam(req) },
    data: clean({ name: str(req.body.name), description: str(req.body.description), areaId: toInt(req.body.areaId) }),
  });
  await audit(req, 'EDITAR', 'Cargo', p.id, p.name);
  res.json(p);
});
router.delete('/positions/:id', can('org.edit'), async (req, res) => {
  const id = idParam(req);
  const count = await prisma.employee.count({ where: { positionId: id } });
  if (count) throw new HttpError(409, `No se puede eliminar: ${count} trabajador(es) tienen este cargo`);
  await prisma.position.delete({ where: { id } });
  await audit(req, 'ELIMINAR', 'Cargo', id);
  res.json({ ok: true });
});

// ── Horarios ──
function scheduleData(b) {
  for (const t of ['startTime', 'endTime']) {
    if (b[t] !== undefined && !/^\d{2}:\d{2}$/.test(b[t])) throw new HttpError(400, 'Formato de hora inválido (HH:MM)');
  }
  return clean({
    name: str(b.name),
    startTime: str(b.startTime),
    endTime: str(b.endTime),
    toleranceMin: toInt(b.toleranceMin),
    workDays: Array.isArray(b.workDays) ? b.workDays.join(',') : str(b.workDays),
  });
}
router.post('/schedules', can('org.edit'), async (req, res) => {
  required(req.body, ['name', 'startTime', 'endTime']);
  const s = await prisma.schedule.create({ data: scheduleData(req.body) });
  await audit(req, 'CREAR', 'Horario', s.id, s.name);
  res.status(201).json(s);
});
router.put('/schedules/:id', can('org.edit'), async (req, res) => {
  const s = await prisma.schedule.update({ where: { id: idParam(req) }, data: scheduleData(req.body) });
  await audit(req, 'EDITAR', 'Horario', s.id, s.name);
  res.json(s);
});
router.delete('/schedules/:id', can('org.edit'), async (req, res) => {
  const id = idParam(req);
  const count = await prisma.employee.count({ where: { scheduleId: id } });
  if (count) throw new HttpError(409, `No se puede eliminar: ${count} trabajador(es) usan este horario`);
  await prisma.schedule.delete({ where: { id } });
  await audit(req, 'ELIMINAR', 'Horario', id);
  res.json({ ok: true });
});

export default router;
