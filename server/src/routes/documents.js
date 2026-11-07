// Documentos del personal: certificados, contratos, SCTR, exámenes médicos, etc.
import { Router } from 'express';
import { prisma } from '../prisma.js';
import { can, hasPerm } from '../middleware/auth.js';
import { audit, diff } from '../middleware/audit.js';
import { uploader, storedPath, removeFile, sendStored } from '../middleware/upload.js';
import { checkExpiringDocuments, daysLeft } from '../services/alerts.js';
import { getSettings } from '../services/settings.js';
import { HttpError, addDays, clean, idParam, parseYmd, required, str, toDate, toInt, ymd } from '../utils.js';

const router = Router();
const upload = uploader('documentos');

const INCLUDE = {
  employee: { select: { id: true, code: true, firstName: true, lastName: true, docNumber: true, email: true, status: true } },
  training: { select: { id: true, name: true } },
};

function docData(b) {
  return clean({
    employeeId: toInt(b.employeeId),
    type: str(b.type),
    name: str(b.name),
    issuer: str(b.issuer),
    issueDate: toDate(b.issueDate),
    expiryDate: toDate(b.expiryDate),
    trainingId: toInt(b.trainingId),
    notes: str(b.notes),
  });
}

function withStatus(d, alertDays) {
  if (!d.expiryDate) return { ...d, daysLeft: null, expiryStatus: 'SIN_VENCIMIENTO' };
  const n = daysLeft(d.expiryDate);
  return { ...d, daysLeft: n, expiryStatus: n < 0 ? 'VENCIDO' : n <= alertDays ? 'POR_VENCER' : 'VIGENTE' };
}

router.get('/', async (req, res) => {
  const { employeeId, type, expiry, q, trainingId } = req.query;
  const s = await getSettings();
  const alertDays = Number(s.alertDays) || 30;
  const today = parseYmd(ymd());
  const where = {};
  if (type) where.type = type;
  if (trainingId) where.trainingId = Number(trainingId);
  if (expiry === 'VENCIDO') where.expiryDate = { lt: today };
  if (expiry === 'POR_VENCER') where.expiryDate = { gte: today, lte: addDays(today, alertDays) };
  if (expiry === 'VIGENTE') where.expiryDate = { gt: addDays(today, alertDays) };
  if (expiry === 'SIN_VENCIMIENTO') where.expiryDate = null;
  if (q) where.OR = [{ name: { contains: q } }, { employee: { lastName: { contains: q } } }, { employee: { firstName: { contains: q } } }, { employee: { docNumber: { contains: q } } }];

  if (hasPerm(req.user, 'documents.view')) {
    if (employeeId) where.employeeId = Number(employeeId);
  } else if (req.user.employeeId) {
    where.employeeId = req.user.employeeId; // cada trabajador ve sus propios documentos
  } else {
    throw new HttpError(403, 'No tiene permiso');
  }

  const list = await prisma.document.findMany({ where, include: INCLUDE, orderBy: [{ expiryDate: 'asc' }, { createdAt: 'desc' }] });
  res.json(list.map((d) => withStatus(d, alertDays)));
});

router.post('/', can('documents.edit'), upload.single('file'), async (req, res) => {
  required(req.body, ['employeeId', 'type', 'name']);
  const data = docData(req.body);
  // Si es certificado de una capacitación con vigencia y no se indicó vencimiento, se calcula.
  if (data.trainingId && !data.expiryDate) {
    const t = await prisma.training.findUnique({ where: { id: data.trainingId } });
    if (t?.validityDays) data.expiryDate = addDays(data.issueDate || t.endDate || t.startDate, t.validityDays);
  }
  const d = await prisma.document.create({
    data: { ...data, filePath: req.file ? storedPath(req.file) : null, fileName: req.file?.originalname ?? null },
    include: INCLUDE,
  });
  await audit(req, 'CREAR', 'Documento', d.id, { tipo: d.type, nombre: d.name, trabajador: d.employee.code });
  res.status(201).json(d);
});

router.put('/:id', can('documents.edit'), upload.single('file'), async (req, res) => {
  const id = idParam(req);
  const before = await prisma.document.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, 'Documento no encontrado');
  const data = docData(req.body);
  if (req.file) {
    removeFile(before.filePath);
    data.filePath = storedPath(req.file);
    data.fileName = req.file.originalname;
  }
  // Si se renueva (cambia vencimiento) se reinicia el control de alertas
  if (data.expiryDate !== undefined && data.expiryDate?.getTime() !== before.expiryDate?.getTime()) data.lastAlertAt = null;
  const d = await prisma.document.update({ where: { id }, data, include: INCLUDE });
  await audit(req, 'EDITAR', 'Documento', id, diff(before, data));
  res.json(d);
});

router.delete('/:id', can('documents.edit'), async (req, res) => {
  const id = idParam(req);
  const d = await prisma.document.delete({ where: { id } });
  removeFile(d.filePath);
  await audit(req, 'ELIMINAR', 'Documento', id, { nombre: d.name });
  res.json({ ok: true });
});

router.get('/:id/file', async (req, res) => {
  const d = await prisma.document.findUnique({ where: { id: idParam(req) } });
  if (!d) throw new HttpError(404, 'Documento no encontrado');
  if (!hasPerm(req.user, 'documents.view') && d.employeeId !== req.user.employeeId) throw new HttpError(403, 'No tiene permiso');
  sendStored(res, d.filePath, d.fileName);
});

// ── Alertas de vencimiento ──
router.post('/alerts/run', can('documents.edit', 'settings.manage'), async (req, res) => {
  const result = await checkExpiringDocuments({ force: req.body.force === true });
  await audit(req, 'ENVIAR_ALERTAS', 'Documento', null, result);
  res.json(result);
});

router.get('/alerts/log', can('documents.view', 'settings.manage'), async (req, res) => {
  res.json(await prisma.alertLog.findMany({ orderBy: { sentAt: 'desc' }, take: 100 }));
});

export default router;
