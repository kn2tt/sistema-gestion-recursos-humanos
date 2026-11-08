import { Router } from 'express';
import { prisma } from '../prisma.js';
import { can, hasPerm } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { closeDay, evaluateCheckIn, workedMinutes, approvedLeaveOn, isWorkDay } from '../services/attendance.js';
import { HttpError, idParam, parseYmd, required, str, toBool, toFloat, toInt, ymd } from '../utils.js';

const router = Router();

const INCLUDE = {
  employee: { select: { id: true, code: true, firstName: true, lastName: true, docNumber: true, isFieldTech: true, area: { select: { name: true } } } },
  project: { select: { id: true, code: true, name: true } },
};

async function myEmployee(req) {
  if (!req.user.employeeId) throw new HttpError(400, 'Su usuario no está vinculado a un trabajador');
  const emp = await prisma.employee.findUnique({ where: { id: req.user.employeeId }, include: { schedule: true } });
  if (!emp || emp.status !== 'ACTIVO') throw new HttpError(400, 'Trabajador inactivo');
  return emp;
}

/** Combina "YYYY-MM-DD" y "HH:MM" en un Date local. */
function at(dateStr, hhmm) {
  if (!hhmm) return null;
  if (!/^\d{2}:\d{2}$/.test(hhmm)) throw new HttpError(400, 'Hora inválida (HH:MM)');
  const d = parseYmd(dateStr);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

// ── Marcación propia ──
router.get('/today', can('attendance.mark'), async (req, res) => {
  const emp = await myEmployee(req);
  const today = ymd();
  const [record, assignments, leave] = await Promise.all([
    prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: emp.id, date: today } }, include: INCLUDE }),
    prisma.assignment.findMany({
      where: { employeeId: emp.id, status: { in: ['ASIGNADO', 'EN_CAMPO'] }, project: { status: { in: ['PLANIFICADO', 'EN_CURSO'] } } },
      include: { project: true },
    }),
    approvedLeaveOn(emp.id, today),
  ]);
  res.json({ today, employee: emp, record, assignments, leave, workDay: isWorkDay(emp.schedule, today) });
});

router.post('/check-in', can('attendance.mark'), async (req, res) => {
  const emp = await myEmployee(req);
  const today = ymd();
  const now = new Date();
  const existing = await prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: emp.id, date: today } } });
  if (existing?.checkIn) throw new HttpError(409, 'Ya registró su entrada hoy');

  const { status, lateMinutes } = evaluateCheckIn(emp.schedule, now);
  const projectId = toInt(req.body.projectId) ?? null;
  const data = {
    checkIn: now,
    status,
    lateMinutes,
    isField: emp.isFieldTech && (toBool(req.body.isField) ?? Boolean(projectId)),
    projectId,
    location: str(req.body.location) ?? null,
    checkInLat: toFloat(req.body.lat) ?? null,
    checkInLng: toFloat(req.body.lng) ?? null,
    notes: str(req.body.notes) ?? null,
    source: 'SISTEMA',
  };
  const record = existing
    ? await prisma.attendance.update({ where: { id: existing.id }, data, include: INCLUDE })
    : await prisma.attendance.create({ data: { employeeId: emp.id, date: today, ...data }, include: INCLUDE });

  if (projectId) {
    await prisma.assignment.updateMany({ where: { employeeId: emp.id, projectId, status: 'ASIGNADO' }, data: { status: 'EN_CAMPO' } });
  }
  await audit(req, 'MARCAR_ENTRADA', 'Asistencia', record.id, { estado: status, tardanza: lateMinutes });
  res.json(record);
});

router.post('/check-out', can('attendance.mark'), async (req, res) => {
  const emp = await myEmployee(req);
  const existing = await prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: emp.id, date: ymd() } } });
  if (!existing?.checkIn) throw new HttpError(409, 'Primero debe registrar su entrada');
  if (existing.checkOut) throw new HttpError(409, 'Ya registró su salida hoy');
  const now = new Date();
  const record = await prisma.attendance.update({
    where: { id: existing.id },
    data: {
      checkOut: now,
      workedMinutes: workedMinutes(existing.checkIn, now),
      checkOutLat: toFloat(req.body.lat) ?? null,
      checkOutLng: toFloat(req.body.lng) ?? null,
      notes: [existing.notes, str(req.body.notes)].filter(Boolean).join(' | ') || null,
    },
    include: INCLUDE,
  });
  await audit(req, 'MARCAR_SALIDA', 'Asistencia', record.id);
  res.json(record);
});

// ── Consulta ──
router.get('/', async (req, res) => {
  const { from, to, employeeId, areaId, status, isField, projectId } = req.query;
  const where = {};
  if (from || to) where.date = { ...(from && { gte: from }), ...(to && { lte: to }) };
  if (status) where.status = status;
  if (isField === 'true') where.isField = true;
  if (projectId) where.projectId = Number(projectId);
  if (areaId) where.employee = { areaId: Number(areaId) };

  if (hasPerm(req.user, 'attendance.view')) {
    if (employeeId) where.employeeId = Number(employeeId);
  } else if (hasPerm(req.user, 'attendance.mark') && req.user.employeeId) {
    where.employeeId = req.user.employeeId;
  } else {
    throw new HttpError(403, 'No tiene permiso para ver asistencia');
  }

  const list = await prisma.attendance.findMany({
    where,
    include: INCLUDE,
    orderBy: [{ date: 'desc' }, { checkIn: 'desc' }],
    take: 5000,
  });
  res.json(list);
});

// Técnicos de campo: dónde están hoy
router.get('/field', can('attendance.view', 'projects.view'), async (req, res) => {
  const date = req.query.date || ymd();
  const techs = await prisma.employee.findMany({
    where: { isFieldTech: true, status: 'ACTIVO' },
    include: {
      position: true,
      attendances: { where: { date }, include: { project: true } },
      assignments: { where: { status: { in: ['ASIGNADO', 'EN_CAMPO'] } }, include: { project: true } },
    },
    orderBy: { lastName: 'asc' },
  });
  res.json(
    techs.map((t) => ({
      id: t.id,
      code: t.code,
      name: `${t.lastName}, ${t.firstName}`,
      phone: t.phone,
      position: t.position?.name,
      attendance: t.attendances[0] || null,
      assignments: t.assignments.map((a) => ({ id: a.id, status: a.status, role: a.role, project: a.project })),
    })),
  );
});

// ── Registro manual y correcciones (RRHH) ──
router.post('/manual', can('attendance.edit'), async (req, res) => {
  required(req.body, ['employeeId', 'date']);
  const employeeId = toInt(req.body.employeeId);
  const date = req.body.date;
  parseYmd(date);
  const emp = await prisma.employee.findUnique({ where: { id: employeeId }, include: { schedule: true } });
  if (!emp) throw new HttpError(404, 'Trabajador no encontrado');

  const checkIn = at(date, req.body.checkIn);
  const checkOut = at(date, req.body.checkOut);
  let { status, lateMinutes } = checkIn ? evaluateCheckIn(emp.schedule, checkIn) : { status: 'FALTA', lateMinutes: 0 };
  if (req.body.status) status = req.body.status;
  if (status !== 'TARDANZA') lateMinutes = 0;

  const data = {
    checkIn,
    checkOut,
    status,
    lateMinutes,
    workedMinutes: workedMinutes(checkIn, checkOut),
    isField: toBool(req.body.isField) ?? false,
    projectId: toInt(req.body.projectId) ?? null,
    location: str(req.body.location) ?? null,
    notes: str(req.body.notes) ?? null,
    source: 'MANUAL',
  };
  const record = await prisma.attendance.upsert({
    where: { employeeId_date: { employeeId, date } },
    update: data,
    create: { employeeId, date, ...data },
    include: INCLUDE,
  });
  await audit(req, 'REGISTRO_MANUAL', 'Asistencia', record.id, { trabajador: emp.code, fecha: date, estado: status });
  res.json(record);
});

router.put('/:id', can('attendance.edit'), async (req, res) => {
  const id = idParam(req);
  const before = await prisma.attendance.findUnique({ where: { id }, include: { employee: { include: { schedule: true } } } });
  if (!before) throw new HttpError(404, 'Registro no encontrado');
  const checkIn = req.body.checkIn !== undefined ? at(before.date, req.body.checkIn) : before.checkIn;
  const checkOut = req.body.checkOut !== undefined ? at(before.date, req.body.checkOut) : before.checkOut;
  let { status, lateMinutes } = checkIn ? evaluateCheckIn(before.employee.schedule, checkIn) : { status: before.status, lateMinutes: 0 };
  if (req.body.status) status = req.body.status;
  if (status !== 'TARDANZA') lateMinutes = 0;

  const record = await prisma.attendance.update({
    where: { id },
    data: {
      checkIn,
      checkOut,
      status,
      lateMinutes,
      workedMinutes: workedMinutes(checkIn, checkOut),
      notes: req.body.notes !== undefined ? str(req.body.notes) : before.notes,
      projectId: req.body.projectId !== undefined ? toInt(req.body.projectId) : before.projectId,
      isField: req.body.isField !== undefined ? toBool(req.body.isField) : before.isField,
      source: 'MANUAL',
    },
    include: INCLUDE,
  });
  await audit(req, 'EDITAR', 'Asistencia', id, { fecha: before.date, estado: `${before.status} → ${status}` });
  res.json(record);
});

router.delete('/:id', can('attendance.edit'), async (req, res) => {
  const id = idParam(req);
  const r = await prisma.attendance.delete({ where: { id } });
  await audit(req, 'ELIMINAR', 'Asistencia', id, { trabajador: r.employeeId, fecha: r.date });
  res.json({ ok: true });
});

// Cierre del día: genera faltas / vacaciones / permisos para quienes no marcaron
router.post('/close-day', can('attendance.edit'), async (req, res) => {
  const date = req.body.date || ymd();
  if (date > ymd()) throw new HttpError(400, 'No se puede cerrar un día futuro');
  const result = await closeDay(date);
  await audit(req, 'CERRAR_DIA', 'Asistencia', null, result);
  res.json(result);
});

export default router;
