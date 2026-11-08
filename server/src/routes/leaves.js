// Permisos, vacaciones y licencias.
import { Router } from 'express';
import { prisma } from '../prisma.js';
import { can, hasPerm } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { uploader, storedPath, sendStored, removeFile } from '../middleware/upload.js';
import { getSettings } from '../services/settings.js';
import { sendMail } from '../services/mailer.js';
import { HttpError, daysBetween, eachDay, idParam, parseYmd, required, str, toInt, ymd } from '../utils.js';

const router = Router();
const upload = uploader('permisos');

const TYPES = ['VACACIONES', 'PERMISO', 'DESCANSO_MEDICO', 'LICENCIA', 'OTRO'];
const TYPE_LABEL = { VACACIONES: 'Vacaciones', PERMISO: 'Permiso', DESCANSO_MEDICO: 'Descanso médico', LICENCIA: 'Licencia', OTRO: 'Otro' };

const INCLUDE = {
  employee: { select: { id: true, code: true, firstName: true, lastName: true, email: true, area: { select: { name: true } } } },
  reviewedBy: { select: { id: true, name: true } },
};

const canViewAll = (user) => hasPerm(user, 'leave.view') || hasPerm(user, 'leave.approve');

/** Días de vacaciones aprobados/pendientes en el año y saldo disponible. */
async function vacationBalance(employeeId, year = new Date().getFullYear()) {
  const s = await getSettings();
  const perYear = Number(s.vacationDaysPerYear) || 30;
  const list = await prisma.leaveRequest.findMany({
    where: { employeeId, type: 'VACACIONES', status: { in: ['APROBADO', 'PENDIENTE'] }, startDate: { gte: `${year}-01-01`, lte: `${year}-12-31` } },
  });
  const used = list.filter((l) => l.status === 'APROBADO').reduce((a, l) => a + l.days, 0);
  const pending = list.filter((l) => l.status === 'PENDIENTE').reduce((a, l) => a + l.days, 0);
  return { year, perYear, used, pending, available: perYear - used - pending };
}

router.get('/', async (req, res) => {
  const { status, type, employeeId, from, to } = req.query;
  const where = {};
  if (status) where.status = status;
  if (type) where.type = type;
  if (from) where.endDate = { gte: from };
  if (to) where.startDate = { lte: to };
  if (canViewAll(req.user)) {
    if (employeeId) where.employeeId = Number(employeeId);
  } else if (hasPerm(req.user, 'leave.request') && req.user.employeeId) {
    where.employeeId = req.user.employeeId;
  } else {
    throw new HttpError(403, 'No tiene permiso');
  }
  res.json(await prisma.leaveRequest.findMany({ where, include: INCLUDE, orderBy: [{ status: 'desc' }, { startDate: 'desc' }] }));
});

router.get('/balance', async (req, res) => {
  const employeeId = canViewAll(req.user) && req.query.employeeId ? Number(req.query.employeeId) : req.user.employeeId;
  if (!employeeId) throw new HttpError(400, 'Indique el trabajador');
  res.json(await vacationBalance(employeeId, Number(req.query.year) || undefined));
});

router.get('/calendar', async (req, res) => {
  const month = req.query.month || ymd().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, 'Mes inválido');
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const last = ymd(new Date(y, m, 0));
  const where = { status: { in: ['APROBADO', 'PENDIENTE'] }, startDate: { lte: last }, endDate: { gte: first } };
  if (req.query.type) where.type = req.query.type;
  if (!canViewAll(req.user)) where.employeeId = req.user.employeeId ?? -1;
  res.json(await prisma.leaveRequest.findMany({ where, include: INCLUDE, orderBy: { startDate: 'asc' } }));
});

router.post('/', can('leave.request', 'leave.view', 'leave.approve'), upload.single('file'), async (req, res) => {
  required(req.body, ['type', 'startDate', 'endDate']);
  const { type, startDate, endDate } = req.body;
  if (!TYPES.includes(type)) throw new HttpError(400, 'Tipo de solicitud inválido');
  parseYmd(startDate);
  parseYmd(endDate);
  if (endDate < startDate) throw new HttpError(400, 'La fecha final no puede ser anterior a la inicial');

  const forOther = req.body.employeeId && Number(req.body.employeeId) !== req.user.employeeId;
  if (forOther && !canViewAll(req.user)) throw new HttpError(403, 'Solo puede registrar solicitudes propias');
  const employeeId = forOther ? toInt(req.body.employeeId) : req.user.employeeId;
  if (!employeeId) throw new HttpError(400, 'Su usuario no está vinculado a un trabajador');

  const overlap = await prisma.leaveRequest.findFirst({
    where: { employeeId, status: { in: ['PENDIENTE', 'APROBADO'] }, startDate: { lte: endDate }, endDate: { gte: startDate } },
  });
  if (overlap) throw new HttpError(409, `Ya existe una solicitud (#${overlap.id}) que se cruza con esas fechas`);

  const days = daysBetween(startDate, endDate);
  if (type === 'VACACIONES' && !forOther) {
    const bal = await vacationBalance(employeeId, parseYmd(startDate).getFullYear());
    if (days > bal.available) throw new HttpError(400, `Saldo de vacaciones insuficiente: disponible ${bal.available} día(s)`);
  }

  const lr = await prisma.leaveRequest.create({
    data: {
      employeeId,
      type,
      startDate,
      endDate,
      days,
      reason: str(req.body.reason),
      filePath: req.file ? storedPath(req.file) : null,
      fileName: req.file?.originalname ?? null,
    },
    include: INCLUDE,
  });
  await audit(req, 'CREAR', 'Solicitud', lr.id, { tipo: type, desde: startDate, hasta: endDate });
  res.status(201).json(lr);
});

async function notifyDecision(lr) {
  if (!lr.employee.email) return;
  const s = await getSettings();
  const ok = lr.status === 'APROBADO';
  sendMail({
    to: lr.employee.email,
    subject: `[${s.companyName}] Tu solicitud de ${TYPE_LABEL[lr.type].toLowerCase()} fue ${ok ? 'aprobada' : 'rechazada'}`,
    html: `<div style="font-family:Arial,sans-serif"><p>Hola ${lr.employee.firstName},</p>
      <p>Tu solicitud de <b>${TYPE_LABEL[lr.type]}</b> del <b>${lr.startDate}</b> al <b>${lr.endDate}</b> (${lr.days} día/s)
      fue <b style="color:${ok ? '#067647' : '#b42318'}">${ok ? 'APROBADA' : 'RECHAZADA'}</b>.</p>
      ${lr.reviewComment ? `<p>Comentario: ${lr.reviewComment}</p>` : ''}</div>`,
  }).catch((err) => console.error('[correo] notificación de solicitud:', err.message));
}

async function decide(req, status) {
  const id = idParam(req);
  const lr = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!lr) throw new HttpError(404, 'Solicitud no encontrada');
  if (lr.status !== 'PENDIENTE') throw new HttpError(409, 'La solicitud ya fue procesada');
  if (lr.employeeId === req.user.employeeId && !req.user.permissions.includes('*')) {
    throw new HttpError(403, 'No puede aprobar o rechazar su propia solicitud');
  }
  const updated = await prisma.leaveRequest.update({
    where: { id },
    data: { status, reviewedById: req.user.id, reviewedAt: new Date(), reviewComment: str(req.body.comment) },
    include: INCLUDE,
  });

  // Si se aprueba con fechas ya cerradas como FALTA, se corrigen.
  if (status === 'APROBADO') {
    const newStatus = lr.type === 'VACACIONES' ? 'VACACIONES' : 'PERMISO';
    await prisma.attendance.updateMany({
      where: { employeeId: lr.employeeId, date: { in: eachDay(lr.startDate, lr.endDate) }, status: 'FALTA' },
      data: { status: newStatus, notes: `Justificado por solicitud #${lr.id}` },
    });
  }
  await audit(req, status === 'APROBADO' ? 'APROBAR' : 'RECHAZAR', 'Solicitud', id, { comentario: updated.reviewComment });
  notifyDecision(updated).catch((err) => console.error('[correo]', err.message));
  return updated;
}

router.post('/:id/approve', can('leave.approve'), async (req, res) => res.json(await decide(req, 'APROBADO')));
router.post('/:id/reject', can('leave.approve'), async (req, res) => res.json(await decide(req, 'RECHAZADO')));

router.post('/:id/cancel', async (req, res) => {
  const id = idParam(req);
  const lr = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!lr) throw new HttpError(404, 'Solicitud no encontrada');
  const own = lr.employeeId === req.user.employeeId;
  if (!own && !hasPerm(req.user, 'leave.approve')) throw new HttpError(403, 'No tiene permiso');
  if (own && lr.status !== 'PENDIENTE' && !hasPerm(req.user, 'leave.approve')) {
    throw new HttpError(409, 'Solo puede cancelar solicitudes pendientes');
  }
  const updated = await prisma.leaveRequest.update({ where: { id }, data: { status: 'CANCELADO' }, include: INCLUDE });
  await audit(req, 'CANCELAR', 'Solicitud', id);
  res.json(updated);
});

router.get('/:id/file', async (req, res) => {
  const lr = await prisma.leaveRequest.findUnique({ where: { id: idParam(req) } });
  if (!lr) throw new HttpError(404, 'Solicitud no encontrada');
  if (lr.employeeId !== req.user.employeeId && !canViewAll(req.user)) throw new HttpError(403, 'No tiene permiso');
  sendStored(res, lr.filePath, lr.fileName);
});

router.delete('/:id', can('leave.approve'), async (req, res) => {
  const id = idParam(req);
  const lr = await prisma.leaveRequest.delete({ where: { id } });
  removeFile(lr.filePath);
  await audit(req, 'ELIMINAR', 'Solicitud', id);
  res.json({ ok: true });
});

export default router;
