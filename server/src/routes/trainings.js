// Capacitaciones y sus participantes.
import { Router } from 'express';
import { prisma } from '../prisma.js';
import { can } from '../middleware/auth.js';
import { audit, diff } from '../middleware/audit.js';
import { HttpError, clean, idParam, required, str, toDate, toFloat, toInt } from '../utils.js';

const router = Router();

function trainingData(b) {
  return clean({
    name: str(b.name),
    provider: str(b.provider),
    modality: str(b.modality),
    startDate: toDate(b.startDate),
    endDate: toDate(b.endDate),
    hours: toFloat(b.hours),
    description: str(b.description),
    validityDays: toInt(b.validityDays),
  });
}

router.get('/', can('trainings.view'), async (req, res) => {
  const { q, year } = req.query;
  const where = {};
  if (q) where.OR = [{ name: { contains: q } }, { provider: { contains: q } }];
  if (year) where.startDate = { gte: new Date(Number(year), 0, 1), lt: new Date(Number(year) + 1, 0, 1) };
  const list = await prisma.training.findMany({
    where,
    include: { _count: { select: { participants: true, documents: true } } },
    orderBy: { startDate: 'desc' },
  });
  res.json(list);
});

router.get('/:id', can('trainings.view'), async (req, res) => {
  const t = await prisma.training.findUnique({
    where: { id: idParam(req) },
    include: {
      participants: { include: { employee: { select: { id: true, code: true, firstName: true, lastName: true, email: true } } } },
      documents: { select: { id: true, employeeId: true, name: true, expiryDate: true, fileName: true } },
    },
  });
  if (!t) throw new HttpError(404, 'Capacitación no encontrada');
  res.json(t);
});

router.post('/', can('trainings.edit'), async (req, res) => {
  required(req.body, ['name', 'startDate']);
  const t = await prisma.training.create({ data: trainingData(req.body) });
  await audit(req, 'CREAR', 'Capacitación', t.id, t.name);
  res.status(201).json(t);
});

router.put('/:id', can('trainings.edit'), async (req, res) => {
  const id = idParam(req);
  const before = await prisma.training.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, 'Capacitación no encontrada');
  const data = trainingData(req.body);
  const t = await prisma.training.update({ where: { id }, data });
  await audit(req, 'EDITAR', 'Capacitación', id, diff(before, data));
  res.json(t);
});

router.delete('/:id', can('trainings.edit'), async (req, res) => {
  const id = idParam(req);
  const t = await prisma.training.delete({ where: { id } });
  await audit(req, 'ELIMINAR', 'Capacitación', id, t.name);
  res.json({ ok: true });
});

// Inscribe uno o varios trabajadores
router.post('/:id/participants', can('trainings.edit'), async (req, res) => {
  const trainingId = idParam(req);
  const ids = (Array.isArray(req.body.employeeIds) ? req.body.employeeIds : [req.body.employeeId]).map(Number).filter(Boolean);
  if (!ids.length) throw new HttpError(400, 'Seleccione al menos un trabajador');
  const existing = new Set((await prisma.trainingParticipant.findMany({ where: { trainingId } })).map((p) => p.employeeId));
  const toAdd = ids.filter((id) => !existing.has(id));
  for (const employeeId of toAdd) await prisma.trainingParticipant.create({ data: { trainingId, employeeId } });
  await audit(req, 'INSCRIBIR', 'Capacitación', trainingId, { trabajadores: toAdd });
  res.status(201).json({ added: toAdd.length });
});

router.put('/:id/participants/:pid', can('trainings.edit'), async (req, res) => {
  const pid = idParam(req, 'pid');
  const p = await prisma.trainingParticipant.update({
    where: { id: pid, trainingId: idParam(req) },
    data: clean({ status: str(req.body.status), score: toFloat(req.body.score) }),
  });
  await audit(req, 'EDITAR', 'Participante', pid, { estado: p.status, nota: p.score });
  res.json(p);
});

router.delete('/:id/participants/:pid', can('trainings.edit'), async (req, res) => {
  const pid = idParam(req, 'pid');
  await prisma.trainingParticipant.delete({ where: { id: pid, trainingId: idParam(req) } });
  await audit(req, 'ELIMINAR', 'Participante', pid);
  res.json({ ok: true });
});

export default router;
