import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Card, Field, Loader, PageHeader, Select, useAction, useFetch } from '../../components/ui';

export default function Settings() {
  const state = useFetch(() => api.get('/security/settings'));
  return <Loader state={state}>{(s) => <SettingsForm initial={s} onSaved={state.setData} />}</Loader>;
}

function SettingsForm({ initial, onSaved }) {
  const [f, setF] = useState(initial);
  const [testTo, setTestTo] = useState('');
  const [run, busy] = useAction();
  useEffect(() => setF(initial), [initial]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? String(e.target.checked) : e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    const r = await run(() => api.put('/security/settings', f), 'Configuración guardada');
    if (r && r !== true) onSaved(r);
  };

  return (
    <>
      <PageHeader title="Configuración" subtitle="Parámetros generales, vacaciones, asistencia y alertas por correo" />
      <form className="stack" onSubmit={save}>
        <div className="grid grid-2">
          <Card title="General">
            <div className="form-grid">
              <Field label="Nombre de la empresa" full><input value={f.companyName} onChange={set('companyName')} /></Field>
              <Field label="Días de vacaciones por año"><input type="number" min="0" value={f.vacationDaysPerYear} onChange={set('vacationDaysPerYear')} /></Field>
              <Field label="Zona horaria del servidor"><input value={f.timezone} disabled /></Field>
              <label className="check full">
                <input type="checkbox" checked={f.autoAbsences === 'true'} onChange={set('autoAbsences')} />
                Registrar faltas automáticamente al cierre de cada día
              </label>
              <Field label="Hora del cierre diario"><input type="time" value={f.absenceHour} onChange={set('absenceHour')} /></Field>
            </div>
          </Card>
          <Card title="Alertas de vencimiento por correo">
            <div className="form-grid">
              <div className={`full ${f.mailConfigured ? 'info-box' : 'warn-box'}`}>
                {f.mailConfigured ? (
                  <>Enviando desde <b>{f.mailUser}</b> (Gmail).</>
                ) : (
                  <>Gmail no configurado. Edite <code>server/.env</code> con <code>GMAIL_USER</code> y <code>GMAIL_APP_PASSWORD</code> (contraseña de aplicación de Google) y reinicie el servidor.</>
                )}
              </div>
              <Field label="Correos de RRHH que reciben el resumen" full hint="Separe varios correos con comas.">
                <input value={f.alertEmails} onChange={set('alertEmails')} placeholder="rrhh@empresa.com, jefe@empresa.com" />
              </Field>
              <Field label="Avisar con anticipación de (días)"><input type="number" min="1" value={f.alertDays} onChange={set('alertDays')} /></Field>
              <Field label="Repetir alerta cada (días)"><input type="number" min="1" value={f.alertRepeatDays} onChange={set('alertRepeatDays')} /></Field>
              <Field label="Hora de envío diario"><input type="time" value={f.alertHour} onChange={set('alertHour')} /></Field>
              <Field label="Avisar también al trabajador">
                <Select value={f.alertNotifyEmployee} onChange={set('alertNotifyEmployee')} allowEmpty={false} options={[{ value: 'true', label: 'Sí, a su correo' }, { value: 'false', label: 'No' }]} />
              </Field>
            </div>
          </Card>
        </div>
        <div>
          <button className="btn btn-primary" disabled={busy}>Guardar configuración</button>
        </div>
      </form>
      <div style={{ height: '1rem' }} />
      <Card title="Probar envío de correo">
        <div className="row">
          <input type="email" placeholder="Correo de destino (vacío = su correo)" value={testTo} onChange={(e) => setTestTo(e.target.value)} style={{ maxWidth: 320 }} />
          <button className="btn" disabled={busy} onClick={() => run(() => api.post('/security/settings/test-mail', { to: testTo }), (r) => (r.simulated ? `Simulado (Gmail no configurado). Revise la consola del servidor.` : `Correo de prueba enviado a ${r.to}`))}>
            Enviar prueba
          </button>
        </div>
      </Card>
    </>
  );
}
