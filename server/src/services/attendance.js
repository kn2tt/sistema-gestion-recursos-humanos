import { prisma } from '../prisma.js';
import { minutesOfDay, parseYmd, timeToMin, ymd } from '../utils.js';

const DEFAULT_WORKDAYS = [1, 2, 3, 4, 5];

export function workDaysOf(schedule) {
  return schedule?.workDays ? schedule.workDays.split(',').map(Number) : DEFAULT_WORKDAYS;
}

export function isWorkDay(schedule, dateStr) {
  return workDaysOf(schedule).includes(parseYmd(dateStr).getDay());
}

/** Calcula estado (PUNTUAL/TARDANZA) y minutos de tardanza para una hora de entrada. */
export function evaluateCheckIn(schedule, checkIn) {
  if (!schedule || !checkIn) return { status: 'PUNTUAL', lateMinutes: 0 };
  const start = timeToMin(schedule.startTime);
  const arrived = minutesOfDay(checkIn);
  if (arrived > start + (schedule.toleranceMin ?? 0)) return { status: 'TARDANZA', lateMinutes: arrived - start };
  return { status: 'PUNTUAL', lateMinutes: 0 };
}

export function workedMinutes(checkIn, checkOut) {
  if (!checkIn || !checkOut) return null;
  return Math.max(0, Math.round((new Date(checkOut) - new Date(checkIn)) / 60000));
}

/** Solicitud aprobada que cubre la fecha, si existe. */
export async function approvedLeaveOn(employeeId, dateStr) {
  return prisma.leaveRequest.findFirst({
    where: { employeeId, status: 'APROBADO', startDate: { lte: dateStr }, endDate: { gte: dateStr } },
  });
}

/**
 * Cierre del día: para cada trabajador activo que debía trabajar y no marcó,
 * registra FALTA, o VACACIONES/PERMISO si tiene una solicitud aprobada.
 */
export async function closeDay(dateStr = ymd()) {
  const date = parseYmd(dateStr);
  const employees = await prisma.employee.findMany({
    where: { status: 'ACTIVO', hireDate: { lte: date } },
    include: { schedule: true },
  });
  const marked = new Set(
    (await prisma.attendance.findMany({ where: { date: dateStr }, select: { employeeId: true } })).map((a) => a.employeeId),
  );
  const leaves = await prisma.leaveRequest.findMany({
    where: { status: 'APROBADO', startDate: { lte: dateStr }, endDate: { gte: dateStr } },
  });
  const leaveBy = new Map(leaves.map((l) => [l.employeeId, l]));

  const result = { date: dateStr, faltas: 0, vacaciones: 0, permisos: 0 };
  for (const emp of employees) {
    if (marked.has(emp.id)) continue;
    const leave = leaveBy.get(emp.id);
    if (!leave && !isWorkDay(emp.schedule, dateStr)) continue;

    let status = 'FALTA';
    if (leave) status = leave.type === 'VACACIONES' ? 'VACACIONES' : 'PERMISO';
    await prisma.attendance.create({
      data: {
        employeeId: emp.id,
        date: dateStr,
        status,
        source: 'AUTOMATICO',
        notes: leave ? `Solicitud #${leave.id} (${leave.type})` : 'Sin marcación',
      },
    });
    if (status === 'FALTA') result.faltas++;
    else if (status === 'VACACIONES') result.vacaciones++;
    else result.permisos++;
  }
  return result;
}
