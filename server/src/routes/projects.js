// Proyectos y asignación de técnicos.
import { Router } from 'express';
import { prisma } from '../prisma.js';
import { can } from '../middleware/auth.js';
import { audit, diff } from '../middleware/audit.js';
import { HttpError, clean, idParam, required, str, toBool, toDate, toInt } from '../utils.js';

const router = Router();

const ACTIVE = ['ASIGNADO', 'EN_CAMPO'];
const EMP_SELECT = { select: { id: true, code: true, firstName: true, lastName: true, phone: true, isFieldTech: true, status: true, position: { select: { name: true } } } };

function projectData(b) {
  return clean({
    code: str(b.code),
    name: str(b.name),
    client: str(b.client),
    location: str(b.location),
    description: str(b.description),
    startDate: toDate(b.startDate),
    endDate: toDate(b.endDate),
    status: str(b.status),
  });
}

function assignmentData(b) {
  return clean({
    employeeId: toInt(b.employeeId),
    role: str(b.role),
    startDate: toDate(b.startDate),
    endDate: toDate(b.endDate),
    status: str(b.status),
    notes: str(b.notes),
  });
}

/** Otras asignaciones activas del trabajador que se cruzan con el rango indicado. */
async function conflicts(employeeId, startDate, endDate, excludeId) {
  const list = await prisma.assignment.findMany({
    where: { employeeId, status: { in: ACTIVE }, ...(excludeId && { id: { not: excludeId } }) },
    include: { project: true },
  });
  const s = startDate.getTime();
  const e = endDate ? endDate.getTime() : Infinity;
  return list.filter((a) => a.startDate.getTime() <= e && (a.endDate ? a.endDate.getTime() : Infinity) >= s);
}

// ── Asignaciones (listado general / seguimiento) ──
router.get('/assignments', can('projects.view'), async (req, res) => {
  const { status, employeeId, projectId } = req.query;
  const where = {};
  if (status === 'ACTIVAS') where.status = { in: ACTIVE };
  else if (status) where.status = status;
  if (employeeId) where.employeeId = Number(employeeId);
  if (projectId) where.projectId = Number(projectId);
  res.json(
    await prisma.assignment.findMany({
      where,
      include: { employee: EMP_SELECT, project: { select: { id: true, code: true, name: true, status: true, location: true } } },
      orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
    }),
  );
});

router.put('/assignments/:aid', can('projects.edit'), async (req, res) => {
  const aid = idParam(req, 'aid');
  const before = await prisma.assignment.findUnique({ where: { id: aid } });
  if (!before) throw new HttpError(404, 'Asignación no encontrada');
  const data = assignmentData(req.body);
  delete data.employeeId;
  const a = await prisma.assignment.update({ where: { id: aid }, data, include: { employee: EMP_SELECT, project: true } });
  await audit(req, 'EDITAR', 'Asignación', aid, diff(before, data));
  res.json(a);
});

router.delete('/assignments/:aid', can('projects.edit'), async (req, res) => {
  const aid = idParam(req, 'aid');
  await prisma.assignment.delete({ where: { id: aid } });
  await audit(req, 'ELIMINAR', 'Asignación', aid);
  res.json({ ok: true });
});

// ── Proyectos ──
router.get('/', can('projects.view'), async (req, res) => {
  const { status, q } = req.query;
  const where = {};
  if (status) where.status = status;
  if (q) where.OR = [{ name: { contains: q } }, { code: { contains: q } }, { client: { contains: q } }];
  const list = await prisma.project.findMany({
    where,
    include: { assignments: { where: { status: { in: ACTIVE } }, select: { id: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(list.map(({ assignments, ...p }) => ({ ...p, activeStaff: assignments.length })));
});

router.get('/:id', can('projects.view'), async (req, res) => {
  const p = await prisma.project.findUnique({
    where: { id: idParam(req) },
    include: { assignments: { include: { employee: EMP_SELECT }, orderBy: [{ status: 'asc' }, { startDate: 'desc' }] } },
  });
  if (!p) throw new HttpError(404, 'Proyecto no encontrado');
  res.json(p);
});

router.post('/', can('projects.edit'), async (req, res) => {
  required(req.body, ['code', 'name']);
  const p = await prisma.project.create({ data: projectData(req.body) });
  await audit(req, 'CREAR', 'Proyecto', p.id, { code: p.code, name: p.name });
  res.status(201).json(p);
});

router.put('/:id', can('projects.edit'), async (req, res) => {
  const id = idParam(req);
  const before = await prisma.project.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, 'Proyecto no encontrado');
  const data = projectData(req.body);
  const p = await prisma.project.update({ where: { id }, data });
  // Al cerrar un proyecto se finalizan sus asignaciones activas
  if (['FINALIZADO', 'CANCELADO'].includes(p.status) && before.status !== p.status) {
    await prisma.assignment.updateMany({
      where: { projectId: id, status: { in: ACTIVE } },
      data: { status: p.status === 'FINALIZADO' ? 'FINALIZADO' : 'CANCELADO', endDate: p.endDate || new Date() },
    });
  }
  await audit(req, 'EDITAR', 'Proyecto', id, diff(before, data));
  res.json(p);
});

router.delete('/:id', can('projects.edit'), async (req, res) => {
  const id = idParam(req);
  const p = await prisma.project.delete({ where: { id } });
  await audit(req, 'ELIMINAR', 'Proyecto', id, { code: p.code, name: p.name });
  res.json({ ok: true });
});

router.post('/:id/assignments', can('projects.edit'), async (req, res) => {
  const projectId = idParam(req);
  required(req.body, ['employeeId', 'startDate']);
  const data = assignmentData(req.body);
  const emp = await prisma.employee.findUnique({ where: { id: data.employeeId } });
  if (!emp || emp.status !== 'ACTIVO') throw new HttpError(400, 'El trabajador no está activo');

  const clash = (await conflicts(data.employeeId, data.startDate, data.endDate)).filter((a) => a.projectId !== projectId);
  if (clash.length && !toBool(req.body.force)) {
    return res.status(409).json({
      error: `${emp.firstName} ${emp.lastName} ya está asignado en ese periodo a: ${clash.map((a) => `${a.project.code} ${a.project.name}`).join(', ')}`,
      conflict: true,
    });
  }
  const a = await prisma.assignment.create({ data: { ...data, projectId }, include: { employee: EMP_SELECT, project: true } });
  await audit(req, 'ASIGNAR', 'Asignación', a.id, { proyecto: a.project.code, trabajador: emp.code });
  res.status(201).json(a);
});

export default router;
