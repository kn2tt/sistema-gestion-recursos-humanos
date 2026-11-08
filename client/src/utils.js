// Formateadores, etiquetas y exportación.

const pad = (n) => String(n).padStart(2, '0');

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Fecha ISO o "YYYY-MM-DD" → "dd/mm/aaaa". */
export function fmtDate(v) {
  if (!v) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-');
    return `${d}/${m}/${y}`;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function fmtTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDateTime(v) {
  return v ? `${fmtDate(v)} ${fmtTime(v)}` : '—';
}

/** Date/ISO → "YYYY-MM-DD" (para inputs type=date). */
export function toInputDate(v) {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toInputTime(v) {
  return v ? fmtTime(v) : '';
}

export function fmtMinutes(min) {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h ${pad(m)} min` : `${m} min`;
}

export function fmtMoney(n) {
  return n == null ? '—' : `S/ ${Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const fullName = (e) => (e ? `${e.lastName}, ${e.firstName}` : '—');

export function yearsSince(date) {
  if (!date) return null;
  const ms = Date.now() - new Date(date).getTime();
  return Math.floor(ms / (365.25 * 86400000));
}

// ── Etiquetas ──
export const LABELS = {
  employeeStatus: { ACTIVO: 'Activo', SUSPENDIDO: 'Suspendido', CESADO: 'Cesado' },
  contractType: { INDETERMINADO: 'Plazo indeterminado', PLAZO_FIJO: 'Plazo fijo', LOCACION: 'Locación de servicios', PRACTICAS: 'Prácticas' },
  attendance: { PUNTUAL: 'Puntual', TARDANZA: 'Tardanza', FALTA: 'Falta', JUSTIFICADO: 'Justificado', VACACIONES: 'Vacaciones', PERMISO: 'Permiso' },
  leaveType: { VACACIONES: 'Vacaciones', PERMISO: 'Permiso', DESCANSO_MEDICO: 'Descanso médico', LICENCIA: 'Licencia', OTRO: 'Otro' },
  leaveStatus: { PENDIENTE: 'Pendiente', APROBADO: 'Aprobado', RECHAZADO: 'Rechazado', CANCELADO: 'Cancelado' },
  projectStatus: { PLANIFICADO: 'Planificado', EN_CURSO: 'En curso', PAUSADO: 'Pausado', FINALIZADO: 'Finalizado', CANCELADO: 'Cancelado' },
  assignmentStatus: { ASIGNADO: 'Asignado', EN_CAMPO: 'En campo', FINALIZADO: 'Finalizado', CANCELADO: 'Cancelado' },
  docType: { CERTIFICADO: 'Certificado', CONTRATO: 'Contrato', CV: 'CV', SCTR: 'SCTR', EXAMEN_MEDICO: 'Examen médico', LICENCIA_CONDUCIR: 'Licencia de conducir', OTRO: 'Otro' },
  expiry: { VENCIDO: 'Vencido', POR_VENCER: 'Por vencer', VIGENTE: 'Vigente', SIN_VENCIMIENTO: 'Sin vencimiento' },
  participant: { INSCRITO: 'Inscrito', APROBADO: 'Aprobado', DESAPROBADO: 'Desaprobado', NO_ASISTIO: 'No asistió' },
  modality: { PRESENCIAL: 'Presencial', VIRTUAL: 'Virtual', MIXTA: 'Mixta' },
  history: { INGRESO: 'Ingreso', CAMBIO_CARGO: 'Cambio de cargo', CAMBIO_AREA: 'Cambio de área', CAMBIO_ESTADO: 'Cambio de estado', CAMBIO_CONTRATO: 'Cambio de contrato', ASCENSO: 'Ascenso', AMONESTACION: 'Amonestación', RECONOCIMIENTO: 'Reconocimiento', CESE: 'Cese', OTRO: 'Otro' },
};

// Tono visual de cada estado (clases .badge-*)
export const TONES = {
  ACTIVO: 'green', SUSPENDIDO: 'amber', CESADO: 'gray',
  PUNTUAL: 'green', TARDANZA: 'amber', FALTA: 'red', JUSTIFICADO: 'blue', VACACIONES: 'violet', PERMISO: 'blue',
  PENDIENTE: 'amber', APROBADO: 'green', RECHAZADO: 'red', CANCELADO: 'gray',
  PLANIFICADO: 'blue', EN_CURSO: 'green', PAUSADO: 'amber', FINALIZADO: 'gray',
  ASIGNADO: 'blue', EN_CAMPO: 'green',
  VENCIDO: 'red', POR_VENCER: 'amber', VIGENTE: 'green', SIN_VENCIMIENTO: 'gray',
  INSCRITO: 'blue', DESAPROBADO: 'red', NO_ASISTIO: 'gray',
};

export const options = (map) => Object.entries(map).map(([value, label]) => ({ value, label }));

export const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// ── Exportación CSV (compatible con Excel en español: separador ";" y BOM UTF-8) ──
export function exportCsv(filename, columns, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => esc(c.label)).join(';')];
  for (const r of rows) lines.push(columns.map((c) => esc(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(';'));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
