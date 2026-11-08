import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Card, Field, PageHeader, useAction, useForm } from '../components/ui';
import { fmtDate } from '../utils';

export default function Profile() {
  const { user } = useAuth();
  const [f, set, setF] = useForm({ currentPassword: '', newPassword: '', confirm: '' });
  const [run, busy] = useAction();
  const emp = user.employee;

  const submit = async (e) => {
    e.preventDefault();
    if (f.newPassword !== f.confirm) return run(() => Promise.reject(new Error('Las contraseñas no coinciden')));
    const ok = await run(() => api.post('/auth/change-password', f), 'Contraseña actualizada');
    if (ok) setF({ currentPassword: '', newPassword: '', confirm: '' });
  };

  return (
    <>
      <PageHeader title="Mi perfil" />
      <div className="grid grid-2">
        <Card title="Datos de la cuenta">
          <dl className="dl">
            <div><dt>Nombre</dt><dd>{user.name}</dd></div>
            <div><dt>Correo</dt><dd>{user.email}</dd></div>
            <div><dt>Rol</dt><dd>{user.role}</dd></div>
            {emp && (
              <>
                <div><dt>Código</dt><dd>{emp.code}</dd></div>
                <div><dt>Cargo</dt><dd>{emp.position?.name || '—'}</dd></div>
                <div><dt>Área</dt><dd>{emp.area?.name || '—'}</dd></div>
                <div><dt>Horario</dt><dd>{emp.schedule ? `${emp.schedule.startTime} – ${emp.schedule.endTime}` : '—'}</dd></div>
                <div><dt>Fecha de ingreso</dt><dd>{fmtDate(emp.hireDate)}</dd></div>
              </>
            )}
          </dl>
          {emp && (
            <p style={{ marginTop: '1rem' }}>
              <Link to={`/personal/${emp.id}`}>Ver mi legajo completo →</Link>
            </p>
          )}
        </Card>
        <Card title="Cambiar contraseña">
          <form className="stack" onSubmit={submit}>
            <Field label="Contraseña actual">
              <input type="password" value={f.currentPassword} onChange={set('currentPassword')} required autoComplete="current-password" />
            </Field>
            <Field label="Nueva contraseña" hint="Mínimo 8 caracteres, con letras y números.">
              <input type="password" value={f.newPassword} onChange={set('newPassword')} required autoComplete="new-password" />
            </Field>
            <Field label="Repetir nueva contraseña">
              <input type="password" value={f.confirm} onChange={set('confirm')} required autoComplete="new-password" />
            </Field>
            <div>
              <button className="btn btn-primary" disabled={busy}>
                Actualizar contraseña
              </button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
