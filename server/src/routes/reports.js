// Dashboard e informes.
import { Router } from 'express';
import { prisma } from '../prisma.js';
import { can } from '../middleware/auth.js';
import { getSettings } from '../services/settings.js';
import { isWorkDay } from '../services/attendance.js';
import { daysLeft } from '../services/alerts.js';
import { addDays, eachDay, parseYmd, ymd } from '../utils.js';

const router = Router();
const ACTIVE_ASSIGN = ['ASIGNADO', 'EN_CAMPO'];
const empName = (e) => `${e.lastName}, ${e.firstName}`;

function countBy(list, keyFn) {
  const m = new Map();
  for (const x of list) {
    const k = keyFn(x);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

router.get('/dashboard', can('dashboard.view'), async (req, res) => {
  const s = await getSettings();
  const alertDays = Number(s.alertDays) || 30;
  const today = ymd();
  const todayDate = parseYmd(today);
  const year = todayDate.getFullYear();
  const from14 = ymd(addDays(todayDate, -13));
  const in30 = ymd(addDays(todayDate, 30));

  const [employees, todayAtt, trendAtt, leavesToday, pending, upcomingVac, assignments, docs, trainings, yearLeaves, projectsActive] = await Promise.all([
    prisma.employee.findMany({ include: { area: true, schedule: true } }),
    prisma.attendance.findMany({ where: { date: today } }),
    prisma.attendance.findMany({ where: { date: { gte: from14, lte: today } }, select: { date: true, status: true } }),
    prisma.leaveRequest.findMany({ where: { status: 'APROBADO', startDate: { lte: today }, endDate: { gte: today } } }),
    prisma.leaveRequest.count({ where: { status: 'PENDIENTE' } }),
    prisma.leaveRequest.findMany({
      where: { status: 'APROBADO', type: 'VACACIONES', endDate: { gte: today }, startDate: { lte: in30 } },
      include: { employee: { select: { firstName: true, lastName: true } } },
      orderBy: { startDate: 'asc' },
      take: 8,
    }),
    prisma.assignment.findMany({ where: { status: { in: ACTIVE_ASSIGN } }, include: { project: true } }),
    prisma.document.findMany({
      where: { expiryDate: { not: null, lte: addDays(todayDate, alertDays) }, employee: { status: { not: 'CESADO' } } },
      include: { employee: { select: { firstName: true, lastName: true } } },
      orderBy: { expiryDate: 'asc' },
    }),
    prisma.training.findMany({ where: { startDate: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } }, include: { participants: true } }),
    prisma.leaveRequest.findMany({ where: { status: 'APROBADO', startDate: { gte: `${year}-01-01`, lte: `${year}-12-31` } } }),
    prisma.project.count({ where: { status: 'EN_CURSO' } }),
  ]);

  const active = employees.filter((e) => e.status === 'ACTIVO');
  const onLeave = new Map(leavesToday.map((l) => [l.employeeId, l]));
  const expected = active.filter((e) => isWorkDay(e.schedule, today) && !onLeave.has(e.id) && e.hireDate <= todayDate);
  const markedIds = new Set(todayAtt.filter((a) => a.checkIn).map((a) => a.employeeId));
  const st = (k) => todayAtt.filter((a) => a.status === k).length;

  const trend = eachDay(from14, today).map((date) => {
    const day = trendAtt.filter((a) => a.date === date);
    return {
      date: date.slice(5),
      Puntual: day.filter((a) => a.status === 'PUNTUAL').length,
      Tardanza: day.filter((a) => a.status === 'TARDANZA').length,
      Falta: day.filter((a) => a.status === 'FALTA').length,
    };
  });

  const byProject = countBy(assignments, (a) => a.project.name).slice(0, 10);

  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const trainingsByMonth = monthNames.map((m, i) => {
    const list = trainings.filter((t) => t.startDate.getMonth() === i);
    return { month: m, Capacitaciones: list.length, Participantes: list.reduce((a, t) => a + t.participants.length, 0) };
  });

  const leaveTypeLabel = { VACACIONES: 'Vacaciones', PERMISO: 'Permiso', DESCANSO_MEDICO: 'Descanso médico', LICENCIA: 'Licencia', OTRO: 'Otro' };
  const leavesByType = Object.entries(
    yearLeaves.reduce((acc, l) => ({ ...acc, [l.type]: (acc[l.type] || 0) + l.days }), {}),
  ).map(([k, v]) => ({ name: leaveTypeLabel[k] || k, value: v }));

  res.json({
    today,
    companyName: s.companyName,
    personnel: {
      total: employees.length,
      active: active.length,
      fieldTechs: active.filter((e) => e.isFieldTech).length,
      newThisMonth: employees.filter((e) => ymd(e.hireDate).slice(0, 7) === today.slice(0, 7)).length,
      byArea: countBy(active, (e) => e.area?.name || 'Sin área'),
      byStatus: countBy(employees, (e) => e.status),
    },
    attendanceToday: {
      expected: expected.length,
      present: markedIds.size,
      onTime: st('PUNTUAL'),
      late: st('TARDANZA'),
      absent: st('FALTA'),
      notMarked: expected.filter((e) => !todayAtt.some((a) => a.employeeId === e.id)).length,
      rate: expected.length ? Math.round((expected.filter((e) => markedIds.has(e.id)).length / expected.length) * 100) : 0,
    },
    attendanceTrend: trend,
    leaves: {
      onVacationToday: leavesToday.filter((l) => l.type === 'VACACIONES').length,
      onLeaveToday: leavesToday.filter((l) => l.type !== 'VACACIONES').length,
      pending,
      upcomingVacations: upcomingVac.map((l) => ({ id: l.id, name: empName(l.employee), startDate: l.startDate, endDate: l.endDate, days: l.days })),
      byType: leavesByType,
    },
    projects: {
      active: projectsActive,
      assignedStaff: new Set(assignments.map((a) => a.employeeId)).size,
      byProject,
    },
    documents: {
      expired: docs.filter((d) => daysLeft(d.expiryDate) < 0).length,
      expiring: docs.filter((d) => daysLeft(d.expiryDate) >= 0).length,
      alertDays,
      list: docs.slice(0, 8).map((d) => ({ id: d.id, name: d.name, type: d.type, employee: empName(d.employee), expiryDate: d.expiryDate, daysLeft: daysLeft(d.expiryDate) })),
    },
    trainings: {
      year,
      count: trainings.length,
      hours: trainings.reduce((a, t) => a + (t.hours || 0), 0),
      participants: trainings.reduce((a, t) => a + t.participants.length, 0),
      byMonth: trainingsByMonth,
    },
  });
});

// ── Reportes tabulares (el cliente los exporta a CSV/Excel) ──

router.get('/attendance', can('reports.view'), async (req, res) => {
  const from = req.query.from || `${ymd().slice(0, 7)}-01`;
  const to = req.query.to || ymd();
  const empWhere = {};
  if (req.query.areaId) empWhere.areaId = Number(req.query.areaId);
  if (req.query.employeeId) empWhere.id = Number(req.query.employeeId);
  if (req.query.fieldOnly === 'true') empWhere.isFieldTech = true;

  const employees = await prisma.employee.findMany({
    where: { ...empWhere, status: { not: 'CESADO' } },
    include: { area: true, position: true, attendances: { where: { date: { gte: from, lte: to } } } },
    orderBy: [{ lastName: 'asc' }],
  });
  const rows = employees.map((e) => {
    const c = (k) => e.attendances.filter((a) => a.status === k).length;
    const worked = e.attendances.reduce((a, x) => a + (x.workedMinutes || 0), 0);
    return {
      code: e.code,
      name: empName(e),
      area: e.area?.name || '',
      position: e.position?.name || '',
      puntual: c('PUNTUAL'),
      tardanza: c('TARDANZA'),
      minutosTardanza: e.attendances.reduce((a, x) => a + x.lateMinutes, 0),
      falta: c('FALTA'),
      justificado: c('JUSTIFICADO'),
      vacaciones: c('VACACIONES'),
      permiso: c('PERMISO'),
      diasCampo: e.attendances.filter((a) => a.isField).length,
      horasTrabajadas: Math.round((worked / 60) * 10) / 10,
    };
  });
  res.json({ from, to, rows });
});

router.get('/personnel', can('reports.view'), async (req, res) => {
  const where = {};
  if (req.query.status) where.status = req.query.status;
  if (req.query.areaId) where.areaId = Number(req.query.areaId);
  const employees = await prisma.employee.findMany({
    where,
    include: { area: true, position: true, assignments: { where: { status: { in: ACTIVE_ASSIGN } }, include: { project: true } } },
    orderBy: [{ lastName: 'asc' }],
  });
  res.json({
    rows: employees.map((e) => ({
      code: e.code,
      docNumber: e.docNumber,
      name: empName(e),
      area: e.area?.name || '',
      position: e.position?.name || '',
      status: e.status,
      contractType: e.contractType || '',
      hireDate: ymd(e.hireDate),
      fieldTech: e.isFieldTech ? 'Sí' : 'No',
      projects: e.assignments.map((a) => a.project.code).join(', '),
      phone: e.phone || '',
      email: e.email || '',
    })),
  });
});

router.get('/leaves', can('reports.view'), async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const s = await getSettings();
  const perYear = Number(s.vacationDaysPerYear) || 30;
  const employees = await prisma.employee.findMany({
    where: { status: { not: 'CESADO' } },
    include: { area: true, leaveRequests: { where: { startDate: { gte: `${year}-01-01`, lte: `${year}-12-31` } } } },
    orderBy: [{ lastName: 'asc' }],
  });
  const sum = (list, pred) => list.filter(pred).reduce((a, l) => a + l.days, 0);
  res.json({
    year,
    rows: employees.map((e) => {
      const L = e.leaveRequests;
      const vacUsed = sum(L, (l) => l.type === 'VACACIONES' && l.status === 'APROBADO');
      const vacPending = sum(L, (l) => l.type === 'VACACIONES' && l.status === 'PENDIENTE');
      return {
        code: e.code,
        name: empName(e),
        area: e.area?.name || '',
        vacacionesDerecho: perYear,
        vacacionesGozadas: vacUsed,
        vacacionesPendientes: vacPending,
        vacacionesSaldo: perYear - vacUsed - vacPending,
        permisos: sum(L, (l) => l.type === 'PERMISO' && l.status === 'APROBADO'),
        descansoMedico: sum(L, (l) => l.type === 'DESCANSO_MEDICO' && l.status === 'APROBADO'),
        licencias: sum(L, (l) => l.type === 'LICENCIA' && l.status === 'APROBADO'),
        rechazadas: L.filter((l) => l.status === 'RECHAZADO').length,
      };
    }),
  });
});

router.get('/trainings', can('reports.view'), async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const list = await prisma.training.findMany({
    where: { startDate: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } },
    include: { participants: true },
    orderBy: { startDate: 'asc' },
  });
  res.json({
    year,
    rows: list.map((t) => ({
      name: t.name,
      provider: t.provider || '',
      modality: t.modality || '',
      startDate: ymd(t.startDate),
      hours: t.hours || 0,
      participants: t.participants.length,
      approved: t.participants.filter((p) => p.status === 'APROBADO').length,
      failed: t.participants.filter((p) => p.status === 'DESAPROBADO').length,
      totalHours: (t.hours || 0) * t.participants.filter((p) => p.status !== 'NO_ASISTIO').length,
    })),
  });
});

router.get('/projects', can('reports.view'), async (req, res) => {
  const projects = await prisma.project.findMany({
    where: req.query.status ? { status: req.query.status } : {},
    include: { assignments: { include: { employee: { include: { position: true } } } } },
    orderBy: { code: 'asc' },
  });
  const rows = [];
  for (const p of projects) {
    for (const a of p.assignments) {
      rows.push({
        project: `${p.code} - ${p.name}`,
        projectStatus: p.status,
        employee: empName(a.employee),
        position: a.employee.position?.name || '',
        role: a.role || '',
        startDate: ymd(a.startDate),
        endDate: a.endDate ? ymd(a.endDate) : '',
        status: a.status,
      });
    }
  }
  res.json({ rows });
});

router.get('/documents', can('reports.view'), async (req, res) => {
  const docs = await prisma.document.findMany({
    where: { expiryDate: { not: null }, employee: { status: { not: 'CESADO' } } },
    include: { employee: true },
    orderBy: { expiryDate: 'asc' },
  });
  res.json({
    rows: docs.map((d) => {
      const n = daysLeft(d.expiryDate);
      return {
        employee: empName(d.employee),
        docNumber: d.employee.docNumber,
        type: d.type,
        name: d.name,
        issuer: d.issuer || '',
        expiryDate: ymd(d.expiryDate),
        daysLeft: n,
        status: n < 0 ? 'VENCIDO' : n <= 30 ? 'POR VENCER' : 'VIGENTE',
      };
    }),
  });
});

export default router;
