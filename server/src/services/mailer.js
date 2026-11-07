import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transporter = null;

export function mailConfigured() {
  return Boolean(config.mail.user && config.mail.pass);
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: config.mail.user, pass: config.mail.pass },
    });
  }
  return transporter;
}

/**
 * Envía un correo por Gmail. Si no hay credenciales configuradas, lo muestra en consola
 * y devuelve { simulated: true } para que el sistema siga funcionando.
 */
export async function sendMail({ to, subject, html, text }) {
  const recipients = Array.isArray(to) ? to.filter(Boolean).join(', ') : to;
  if (!recipients) throw new Error('No hay destinatarios');

  if (!mailConfigured()) {
    console.log(`\n[correo simulado] Para: ${recipients}\nAsunto: ${subject}\n${text || html?.replace(/<[^>]+>/g, ' ')}\n`);
    return { simulated: true };
  }

  const info = await getTransporter().sendMail({
    from: `"${config.mail.fromName}" <${config.mail.user}>`,
    to: recipients,
    subject,
    html,
    text,
  });
  return { simulated: false, messageId: info.messageId };
}
