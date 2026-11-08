import { prisma } from '../prisma.js';

export const DEFAULT_SETTINGS = {
  companyName: 'Mi Empresa S.A.C.',
  alertDays: '30', // anticipación para alertar vencimientos
  alertRepeatDays: '7', // cada cuántos días repetir la alerta de un mismo documento
  alertEmails: '', // correos de RRHH separados por coma
  alertNotifyEmployee: 'true', // enviar copia al trabajador dueño del documento
  alertHour: '08:00',
  vacationDaysPerYear: '30',
  autoAbsences: 'true', // registrar faltas automáticamente al cierre del día
  absenceHour: '23:30',
};

export async function getSettings() {
  const rows = await prisma.setting.findMany();
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export async function saveSettings(values) {
  const keys = Object.keys(DEFAULT_SETTINGS);
  const ops = Object.entries(values)
    .filter(([k]) => keys.includes(k))
    .map(([key, value]) =>
      prisma.setting.upsert({ where: { key }, update: { value: String(value ?? '') }, create: { key, value: String(value ?? '') } }),
    );
  await prisma.$transaction(ops);
  return getSettings();
}
