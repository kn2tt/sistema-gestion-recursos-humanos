import { useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Badge, Card, Field, FormModal, Loader, PageHeader, Select, Table, useAction, useFetch, useForm } from '../../components/ui';
import { useEmployeeOptions } from '../../hooks';
import { fmtDateTime } from '../../utils';

export default function Users() {
  const { user } = useAuth();
  const state = useFetch(() => api.get('/security/users'));
  const roles = useFetch(() => api.get('/security/roles'));
  const [form, setForm] = useState(null);
  const [run] = useAction();

  const toggle = async (u) => {
    if (await run(() => api.put(`/security/users/${u.id}`, { active: !u.active }), u.active ? 'Usuario desactivado' : 'Usuario activado')) state.reload();
  };
  const remove = async (u) => {
    if (window.confirm(`¿Eliminar el usuario ${u.email}? Se recomienda desactivarlo para conservar la auditoría.`) && (await run(() => api.del(`/security/users/${u.id}`), 'Usuario eliminado'))) state.reload();
  };

  return (
    <>
      <PageHeader title="Usuarios" subtitle="Cuentas de acceso al sistema" actions={<button className="btn btn-primary" onClick={() => setForm({})}>+ Nuevo usuario</button>} />
      <Card pad={false}>
        <Loader state={state}>
          {(list) => (
            <Table
              rows={list}
              columns={[
                { label: 'Usuario', render: (u) => (<><div className="cell-main">{u.name}</div><div className="cell-sub">{u.email}</div></>) },
                { label: 'Rol', render: (u) => <Badge tone="blue">{u.role.name}</Badge> },
                { label: 'Trabajador vinculado', render: (u) => (u.employee ? `${u.employee.lastName}, ${u.employee.firstName} (${u.employee.code})` : <span className="muted">—</span>) },
                { label: 'Último acceso', render: (u) => <span className="small">{fmtDateTime(u.lastLoginAt)}</span> },
                { label: 'Estado', render: (u) => (u.active ? <Badge tone="green">Activo</Badge> : <Badge>Inactivo</Badge>) },
                {
                  label: '',
                  className: 'right nowrap',
                  render: (u) => (
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn btn-sm" onClick={() => setForm(u)}>Editar</button>
                      {u.id !== user.id && <button className="btn btn-sm" onClick={() => toggle(u)}>{u.active ? 'Desactivar' : 'Activar'}</button>}
                      {u.id !== user.id && <button className="btn btn-sm btn-danger" onClick={() => remove(u)}>×</button>}
                    </div>
                  ),
                },
              ]}
            />
          )}
        </Loader>
      </Card>
      {form && <UserForm item={form.id ? form : null} roles={roles.data || []} onClose={() => setForm(null)} onSaved={() => { setForm(null); state.reload(); }} />}
    </>
  );
}

function UserForm({ item, roles, onClose, onSaved }) {
  const employees = useEmployeeOptions();
  const [f, set, setF] = useForm({ name: item?.name ?? '', email: item?.email ?? '', password: '', roleId: item?.role.id ?? '', employeeId: item?.employee?.id ?? '' });
  const [run, busy] = useAction();

  const pickEmployee = (e) => {
    const id = e.target.value;
    const emp = employees.find((x) => String(x.value) === id)?.raw;
    setF((s) => ({
      ...s,
      employeeId: id,
      ...(emp && !s.name && { name: `${emp.firstName} ${emp.lastName}` }),
      ...(emp?.email && !s.email && { email: emp.email }),
    }));
  };

  const submit = async () => {
    const body = { ...f, employeeId: f.employeeId || null };
    if (item && !body.password) delete body.password;
    const r = await run(() => (item ? api.put(`/security/users/${item.id}`, body) : api.post('/security/users', body)), 'Usuario guardado');
    if (r) onSaved();
  };

  return (
    <FormModal title={item ? 'Editar usuario' : 'Nuevo usuario'} onClose={onClose} onSubmit={submit} busy={busy}>
      <Field label="Trabajador vinculado" full hint="Necesario para que el usuario marque asistencia y registre solicitudes propias.">
        <Select value={f.employeeId} onChange={pickEmployee} placeholder="Ninguno" options={employees} />
      </Field>
      <Field label="Nombre" required><input value={f.name} onChange={set('name')} required /></Field>
      <Field label="Correo (usuario)" required><input type="email" value={f.email} onChange={set('email')} required /></Field>
      <Field label="Rol" required><Select value={f.roleId} onChange={set('roleId')} required options={roles.map((r) => ({ value: r.id, label: r.name }))} /></Field>
      <Field label={item ? 'Nueva contraseña (opcional)' : 'Contraseña'} required={!item} hint="Mínimo 8 caracteres, con letras y números.">
        <input type="password" value={f.password} onChange={set('password')} required={!item} autoComplete="new-password" />
      </Field>
    </FormModal>
  );
}
