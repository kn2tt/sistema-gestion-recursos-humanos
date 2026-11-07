import { Router } from 'express';
import { prisma } from '../prisma.js';
import { can, hasPerm } from '../middleware/auth.js';
import { audit, diff } from '../middleware/audit.js';
import { uploader, storedPath, removeFile, sendStored } from '../middleware/upload.js';
import { HttpError, clean, idParam, required, str, toBool, toDate, toFloat, toInt } from '../utils.js';

const router = Router();
const cvUpload = uploader('cv');

const EMP_INCLUDE = { area: true, position: true, schedule: true };

/** Oculta sueldo y datos bancarios a quien no tiene permiso. */
function scrub(req, emp) {
  if (!emp || hasPerm(req.user, 'employees.salary')) return emp;
  const { salary, bankName, bankAccount, ...rest } = emp;
  return rest;
}

function employeeData(b) {
  return clean({
    code: str(b.code),
    docType: str(b.docType),
    docNumber: str(b.docNumber),
    firstName: str(b.firstName),
    lastName: str(b.lastName),
    birthDate: toDate(b.birthDate),
    gender: str(b.gender),
    maritalStatus: str(b.maritalStatus),
    nationality: str(b.nationality),
    address: str(b.address),
    phone: str(b.phone),
    email: str(b.email)?.toLowerCase(),
    emergencyContactName: str(b.emergencyContactName),
    emergencyContactPhone: str(b.emergencyContactPhone),
    hireDate: toDate(b.hireDate),
    endDate: toDate(b.endDate),
    status: str(b.status),
    contractType: str(b.contractType),
    salary: toFloat(b.salary),
    bankName: str(b.bankName),
    bankAccount: str(b.bankAccount),
    isFieldTech: toBool(b.isFieldTech),
    areaId: toInt(b.areaId),
    positionId: toInt(b.positionId),
    scheduleId: toInt(b.scheduleId),
  });
}

async function nextCode() {
  const last = await prisma.employee.findFirst({ where: { code: { startsWith: 'EMP-' } }, orderBy: { code: 'desc' } });
  const n = last ? Number(last.code.slice(4)) + 1 || 1 : 1;
  return `EMP-${String(n).padStart(4, '0')}`;
}

function canSee(req, id) {
  return hasPerm(req.user, 'employees.view') || req.user.employeeId === id;
}

// Lista resumida para selectores (asignaciones, documentos, solicitudes...)
router.get(
  '/options',
  can('employees.view', 'attendance.view', 'leave.view', 'projects.view', 'trainings.view', 'documents.view', 'users.manage', 'reports.view'),
  async (req, res) => {
    const where = req.query.all === 'true' ? {} : { status: { not: 'CESADO' } };
    if (req.query.fieldOnly === 'true') where.isFieldTech = true;
    const list = await prisma.employee.findMany({
      where,
      select: { id: true, code: true, firstName: true, lastName: true, docNumber: true, isFieldTech: true, status: true, email: true, position: { select: { name: true } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    res.json(list);
  },
);

router.get('/', can('employees.view'), async (req, res) => {
  const { q, status, areaId, positionId, fieldTech } = req.query;
  const where = {};
  if (status) where.status = status;
  if (areaId) where.areaId = Number(areaId);
  if (positionId) where.positionId = Number(positionId);
  if (fieldTech === 'true') where.isFieldTech = true;
  if (q) {
    where.OR = [
      { firstName: { contains: q } },
      { lastName: { contains: q } },
      { docNumber: { contains: q } },
      { code: { contains: q } },
      { email: { contains: q } },
    ];
  }
  const list = await prisma.employee.findMany({ where, include: EMP_INCLUDE, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] });
  res.json(list.map((e) => scrub(req, e)));
});

router.get('/:id', async (req, res) => {
  const id = idParam(req);
  if (!canSee(req, id)) throw new HttpError(403, 'No tiene permiso para ver este trabajador');
  const emp = await prisma.employee.findUnique({
    where: { id },
    include: {
      ...EMP_INCLUDE,
      user: { select: { id: true, email: true, active: true, role: { select: { name: true } } } },
      history: { orderBy: { date: 'desc' } },
      experiences: { orderBy: { startDate: 'desc' } },
      documents: { orderBy: { expiryDate: 'asc' }, include: { training: { select: { name: true } } } },
      assignments: { include: { project: true }, orderBy: { startDate: 'desc' } },
      participations: { include: { training: true } },
      leaveRequests: { orderBy: { startDate: 'desc' }, take: 50 },
      attendances: { orderBy: { date: 'desc' }, take: 60, include: { project: { select: { code: true, name: true } } } },
    },
  });
  if (!emp) throw new HttpError(404, 'Trabajador no encontrado');
  res.json(scrub(req, emp));
});

router.post('/', can('employees.edit'), async (req, res) => {
  required(req.body, ['docNumber', 'firstName', 'lastName', 'hireDate']);
  const data = employeeData(req.body);
  if (!data.code) data.code = await nextCode();
  if (!hasPerm(req.user, 'employees.salary')) {
    delete data.salary;
    delete data.bankName;
    delete data.bankAccount;
  }
  const emp = await prisma.employee.create({ data, include: EMP_INCLUDE });
  await prisma.employmentHistory.create({
    data: {
      employeeId: emp.id,
      date: emp.hireDate,
      type: 'INGRESO',
      description: `Ingreso como ${emp.position?.name || 'trabajador'}${emp.area ? ` en ${emp.area.name}` : ''}`,
      createdBy: req.user.name,
    },
  });
  await audit(req, 'CREAR', 'Trabajador', emp.id, { code: emp.code, nombre: `${emp.firstName} ${emp.lastName}` });
  res.status(201).json(emp);
});

router.put('/:id', can('employees.edit'), async (req, res) => {
  const id = idParam(req);
  const before = await prisma.employee.findUnique({ where: { id }, include: EMP_INCLUDE });
  if (!before) throw new HttpError(404, 'Trabajador no encontrado');
  const data = employeeData(req.body);
  if (!hasPerm(req.user, 'employees.salary')) {
    delete data.salary;
    delete data.bankName;
    delete data.bankAccount;
  }
  const emp = await prisma.employee.update({ where: { id }, data, include: EMP_INCLUDE });

  // Historial automático de movimientos laborales
  const moves = [];
  const today = new Date();
  if (before.positionId !== emp.positionId)
    moves.push({ type: 'CAMBIO_CARGO', description: `Cargo: ${before.position?.name || '—'} → ${emp.position?.name || '—'}` });
  if (before.areaId !== emp.areaId)
    moves.push({ type: 'CAMBIO_AREA', description: `Área: ${before.area?.name || '—'} → ${emp.area?.name || '—'}` });
  if (before.contractType !== emp.contractType)
    moves.push({ type: 'CAMBIO_CONTRATO', description: `Contrato: ${before.contractType || '—'} → ${emp.contractType || '—'}` });
  if (before.status !== emp.status)
    moves.push({
      type: emp.status === 'CESADO' ? 'CESE' : 'CAMBIO_ESTADO',
      description: `Estado: ${before.status} → ${emp.status}`,
      date: emp.status === 'CESADO' && emp.endDate ? emp.endDate : today,
    });
  for (const m of moves) {
    await prisma.employmentHistory.create({ data: { employeeId: id, date: m.date || today, type: m.type, description: m.description, createdBy: req.user.name } });
  }
  // Un trabajador cesado no debe poder ingresar al sistema
  if (emp.status === 'CESADO') await prisma.user.updateMany({ where: { employeeId: id }, data: { active: false } });

  await audit(req, 'EDITAR', 'Trabajador', id, diff(before, data));
  res.json(emp);
});

router.delete('/:id', can('employees.edit'), async (req, res) => {
  const id = idParam(req);
  const emp = await prisma.employee.findUnique({ where: { id }, include: { documents: true } });
  if (!emp) throw new HttpError(404, 'Trabajador no encontrado');
  await prisma.user.updateMany({ where: { employeeId: id }, data: { employeeId: null, active: false } });
  await prisma.employee.delete({ where: { id } });
  removeFile(emp.cvPath);
  emp.documents.forEach((d) => removeFile(d.filePath));
  await audit(req, 'ELIMINAR', 'Trabajador', id, { code: emp.code, nombre: `${emp.firstName} ${emp.lastName}` });
  res.json({ ok: true });
});

// ── CV ──
router.post('/:id/cv', can('employees.edit'), cvUpload.single('file'), async (req, res) => {
  const id = idParam(req);
  if (!req.file) throw new HttpError(400, 'Adjunte el archivo del CV');
  const emp = await prisma.employee.findUnique({ where: { id } });
  if (!emp) throw new HttpError(404, 'Trabajador no encontrado');
  removeFile(emp.cvPath);
  const updated = await prisma.employee.update({
    where: { id },
    data: { cvPath: storedPath(req.file), cvName: req.file.originalname },
  });
  await audit(req, 'SUBIR_CV', 'Trabajador', id, req.file.originalname);
  res.json({ cvName: updated.cvName });
});

router.get('/:id/cv', async (req, res) => {
  const id = idParam(req);
  if (!canSee(req, id)) throw new HttpError(403, 'No tiene permiso');
  const emp = await prisma.employee.findUnique({ where: { id } });
  sendStored(res, emp?.cvPath, emp?.cvName);
});

router.delete('/:id/cv', can('employees.edit'), async (req, res) => {
  const id = idParam(req);
  const emp = await prisma.employee.findUnique({ where: { id } });
  removeFile(emp?.cvPath);
  await prisma.employee.update({ where: { id }, data: { cvPath: null, cvName: null } });
  await audit(req, 'ELIMINAR_CV', 'Trabajador', id);
  res.json({ ok: true });
});

// ── Historial laboral (movimientos internos) ──
router.post('/:id/history', can('employees.edit'), async (req, res) => {
  const id = idParam(req);
  required(req.body, ['date', 'type', 'description']);
  const h = await prisma.employmentHistory.create({
    data: { employeeId: id, date: toDate(req.body.date), type: str(req.body.type), description: str(req.body.description), createdBy: req.user.name },
  });
  await audit(req, 'CREAR', 'HistorialLaboral', h.id, { trabajador: id, tipo: h.type });
  res.status(201).json(h);
});

router.delete('/:id/history/:hid', can('employees.edit'), async (req, res) => {
  const hid = idParam(req, 'hid');
  await prisma.employmentHistory.delete({ where: { id: hid, employeeId: idParam(req) } });
  await audit(req, 'ELIMINAR', 'HistorialLaboral', hid);
  res.json({ ok: true });
});

// ── Experiencia laboral previa ──
function expData(b) {
  return clean({
    company: str(b.company),
    position: str(b.position),
    startDate: toDate(b.startDate),
    endDate: toDate(b.endDate),
    description: str(b.description),
  });
}

router.post('/:id/experiences', can('employees.edit'), async (req, res) => {
  required(req.body, ['company', 'position']);
  const e = await prisma.workExperience.create({ data: { employeeId: idParam(req), ...expData(req.body) } });
  await audit(req, 'CREAR', 'ExperienciaLaboral', e.id, { empresa: e.company });
  res.status(201).json(e);
});

router.put('/:id/experiences/:eid', can('employees.edit'), async (req, res) => {
  const e = await prisma.workExperience.update({ where: { id: idParam(req, 'eid'), employeeId: idParam(req) }, data: expData(req.body) });
  await audit(req, 'EDITAR', 'ExperienciaLaboral', e.id);
  res.json(e);
});

router.delete('/:id/experiences/:eid', can('employees.edit'), async (req, res) => {
  const eid = idParam(req, 'eid');
  await prisma.workExperience.delete({ where: { id: eid, employeeId: idParam(req) } });
  await audit(req, 'ELIMINAR', 'ExperienciaLaboral', eid);
  res.json({ ok: true });
});

export default router;
