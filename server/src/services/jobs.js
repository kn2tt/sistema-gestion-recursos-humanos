import cron from 'node-cron';
import { getSettings } from './settings.js';
import { checkExpiringDocuments } from './alerts.js';
import { closeDay } from './attendance.js';

let tasks = [];

function cronAt(hhmm) {
  const [h, m] = String(hhmm || '08:00').split(':').map(Number);
  return `${m || 0} ${h || 0} * * *`;
}

/** Programa las tareas diarias según la configuración guardada. */
export async function startJobs() {
  for (const t of tasks) t.stop();
  tasks = [];
  const s = await getSettings();
  const timezone = process.env.TZ;

  tasks.push(
    cron.schedule(
      cronAt(s.alertHour),
      async () => {
        try {
          const r = await checkExpiringDocuments();
          console.log('[tarea] alertas de vencimiento:', r.message);
        } catch (err) {
          console.error('[tarea] error en alertas:', err);
        }
      },
      { timezone },
    ),
  );

  if (s.autoAbsences === 'true') {
    tasks.push(
      cron.schedule(
        cronAt(s.absenceHour),
        async () => {
          try {
            const r = await closeDay();
            console.log('[tarea] cierre de asistencia:', r);
          } catch (err) {
            console.error('[tarea] error en cierre de asistencia:', err);
          }
        },
        { timezone },
      ),
    );
  }
  console.log(`Tareas programadas: alertas ${s.alertHour}${s.autoAbsences === 'true' ? `, cierre de asistencia ${s.absenceHour}` : ''} (${timezone})`);
}
