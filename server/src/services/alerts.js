import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { getSettings } from './settings.js';
import { sendMail } from './mailer.js';
import { addDays, parseYmd, ymd } from '../utils.js';

const TYPE_LABEL = {
  CERTIFICADO: 'Certificado',
  CONTRATO: 'Contrato',
  CV: 'CV',
  SCTR: 'SCTR',
  EXAMEN_MEDICO: 'Examen médico',
  LICENCIA_CONDUCIR: 'Licencia de conducir',
  OTRO: 'Otro',
};

export function daysLeft(expiryDate, today = parseYmd(ymd())) {
  return Math.round((parseYmd(ymd(expiryDate)) - today) / 86400000);
}

function fmt(d) {
  return new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function statusText(n) {
  if (n < 0) return `<b style="color:#b42318">Vencido hace ${-n} día(s)</b>`;
  if (n === 0) return '<b style="color:#b42318">Vence hoy</b>';
  return `<b style="color:${n <= 7 ? '#b42318' : '#b54708'}">Vence en ${n} día(s)</b>`;
}

function buildTable(docs, withEmployee) {
  const rows = docs
    .map(
      (d) => `<tr>
        ${withEmployee ? `<td>${d.employee.lastName}, ${d.employee.firstName}<br><small>${d.employee.docNumber}</small></td>` : ''}
        <td>${d.name}</td><td>${TYPE_LABEL[d.type] || d.type}</td>
        <td>${fmt(d.expiryDate)}</td><td>${statusText(d.daysLeft)}</td></tr>`,
    )
    .join('');
  const th = 'style="text-align:left;padding:6px 8px;background:#f2f4f7;border-bottom:1px solid #d0d5dd"';
  return `<table cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
    <thead><tr>${withEmployee ? `<th ${th}>Trabajador</th>` : ''}<th ${th}>Documento</th><th ${th}>Tipo</th><th ${th}>Vencimiento</th><th ${th}>Estado</th></tr></thead>
    <tbody>${rows.replace(/<td>/g, '<td style="padding:6px 8px;border-bottom:1px solid #eaecf0">')}</tbody></table>`;
}

/**
 * Busca documentos vencidos o por vencer y envía alertas por correo a RRHH y (opcionalmente)
 * a cada trabajador. Con force=true ignora el intervalo de repetición.
 */
export async function checkExpiringDocuments({ force = false } = {}) {
  const s = await getSettings();
  const alertDays = Number(s.alertDays) || 30;
  const repeatMs = (Number(s.alertRepeatDays) || 7) * 86400000;
  const today = parseYmd(ymd());
  const now = Date.now();

  const docs = await prisma.document.findMany({
    where: { expiryDate: { not: null, lte: addDays(today, alertDays) }, employee: { status: { not: 'CESADO' } } },
    include: { employee: true },
    orderBy: { expiryDate: 'asc' },
  });

  const due = docs
    .filter((d) => force || !d.lastAlertAt || now - d.lastAlertAt.getTime() >= repeatMs)
    .map((d) => ({ ...d, daysLeft: daysLeft(d.expiryDate, today) }));

  if (!due.length) return { documents: 0, emails: 0, message: 'No hay documentos pendientes de alerta' };

  const hr = s.alertEmails.split(/[,;\s]+/).filter(Boolean);
  if (!hr.length && config.mail.user) hr.push(config.mail.user);

  let emails = 0;
  const errors = [];

  if (hr.length) {
    const expired = due.filter((d) => d.daysLeft < 0).length;
    const subject = `[${s.companyName}] ${due.length} documento(s) vencidos o por vencer${expired ? ` (${expired} vencido/s)` : ''}`;
    const html = `<div style="font-family:Arial,sans-serif">
      <h2 style="color:#101828">Alerta de vencimiento de documentos</h2>
      <p>Los siguientes certificados/documentos del personal vencen en los próximos ${alertDays} días o ya vencieron:</p>
      ${buildTable(due, true)}
      <p style="color:#667085;font-size:12px">Mensaje automático del Sistema de Gestión de Personal.</p></div>`;
    try {
      await sendMail({ to: hr, subject, html });
      emails++;
      await prisma.alertLog.create({ data: { recipients: hr.join(', '), subject, documents: due.length, success: true } });
    } catch (err) {
      errors.push(err.message);
      await prisma.alertLog.create({ data: { recipients: hr.join(', '), subject, documents: due.length, success: false, error: err.message } });
    }
  }

  if (s.alertNotifyEmployee === 'true') {
    const byEmployee = new Map();
    for (const d of due) {
      if (!d.employee.email) continue;
      if (!byEmployee.has(d.employeeId)) byEmployee.set(d.employeeId, []);
      byEmployee.get(d.employeeId).push(d);
    }
    for (const list of byEmployee.values()) {
      const emp = list[0].employee;
      const subject = `[${s.companyName}] Tienes ${list.length} documento(s) por vencer`;
      const html = `<div style="font-family:Arial,sans-serif">
        <p>Hola ${emp.firstName},</p>
        <p>Te recordamos que los siguientes documentos están vencidos o próximos a vencer. Por favor coordina su renovación con Recursos Humanos.</p>
        ${buildTable(list, false)}
        <p style="color:#667085;font-size:12px">Mensaje automático del Sistema de Gestión de Personal.</p></div>`;
      try {
        await sendMail({ to: emp.email, subject, html });
        emails++;
        await prisma.alertLog.create({ data: { recipients: emp.email, subject, documents: list.length, success: true } });
      } catch (err) {
        errors.push(`${emp.email}: ${err.message}`);
        await prisma.alertLog.create({ data: { recipients: emp.email, subject, documents: list.length, success: false, error: err.message } });
      }
    }
  }

  if (emails > 0) {
    await prisma.document.updateMany({ where: { id: { in: due.map((d) => d.id) } }, data: { lastAlertAt: new Date() } });
  }

  return {
    documents: due.length,
    emails,
    errors,
    message: hr.length || emails ? `Se enviaron ${emails} correo(s) sobre ${due.length} documento(s)` : 'No hay destinatarios configurados',
  };
}
