import { useState } from 'react';
import { api } from '../../api';
import { Badge, Card, Field, FormModal, Loader, PageHeader, Table, useAction, useFetch, useForm } from '../../components/ui';

export default function Roles() {
  const state = useFetch(() => api.get('/security/roles'));
  const catalog = useFetch(() => api.get('/security/roles/permissions'));
  const [form, setForm] = useState(null);
  const [run] = useAction();

  const label = (key) => catalog.data?.find((p) => p.key === key)?.label || key;

  return (
    <>
      <PageHeader title="Roles y permisos" subtitle="Defina qué puede hacer cada tipo de usuario" actions={<button className="btn btn-primary" onClick={() => setForm({})}>+ Nuevo rol</button>} />
      <Card pad={false}>
        <Loader state={state}>
          {(list) => (
            <Table
              rows={list}
              columns={[
                { label: 'Rol', render: (r) => (<><div className="cell-main">{r.name}</div><div className="cell-sub">{r.description}</div></>) },
                {
                  label: 'Permisos',
                  render: (r) => r.permissions.includes('*')
                    ? <Badge tone="violet">Acceso total</Badge>
                    : <div className="row" style={{ gap: 4 }}>{r.permissions.map((p) => <Badge key={p}>{label(p)}</Badge>)}</div>,
                },
                { label: 'Usuarios', render: (r) => r._count.users },
                {
                  label: '',
                  className: 'right nowrap',
                  render: (r) => (
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      {!r.permissions.includes('*') && <button className="btn btn-sm" onClick={() => setForm(r)}>Editar</button>}
                      {!r.isSystem && <button className="btn btn-sm btn-danger" onClick={async () => window.confirm(`¿Eliminar el rol ${r.name}?`) && (await run(() => api.del(`/security/roles/${r.id}`), 'Rol eliminado')) && state.reload()}>×</button>}
                    </div>
                  ),
                },
              ]}
            />
          )}
        </Loader>
      </Card>
      {form && catalog.data && <RoleForm item={form.id ? form : null} catalog={catalog.data} onClose={() => setForm(null)} onSaved={() => { setForm(null); state.reload(); }} />}
    </>
  );
}

function RoleForm({ item, catalog, onClose, onSaved }) {
  const [f, set, setF] = useForm({ name: item?.name ?? '', description: item?.description ?? '', permissions: item?.permissions ?? [] });
  const [run, busy] = useAction();
  const groups = [...new Set(catalog.map((p) => p.group))];
  const toggle = (key) => setF((s) => ({ ...s, permissions: s.permissions.includes(key) ? s.permissions.filter((k) => k !== key) : [...s.permissions, key] }));
  const toggleGroup = (g, on) => {
    const keys = catalog.filter((p) => p.group === g).map((p) => p.key);
    setF((s) => ({ ...s, permissions: on ? [...new Set([...s.permissions, ...keys])] : s.permissions.filter((k) => !keys.includes(k)) }));
  };
  const submit = async () => {
    const r = await run(() => (item ? api.put(`/security/roles/${item.id}`, f) : api.post('/security/roles', f)), 'Rol guardado');
    if (r) onSaved();
  };
  return (
    <FormModal title={item ? `Editar rol · ${item.name}` : 'Nuevo rol'} onClose={onClose} onSubmit={submit} busy={busy} size="lg">
      <Field label="Nombre" required><input value={f.name} onChange={set('name')} required /></Field>
      <Field label="Descripción"><input value={f.description} onChange={set('description')} /></Field>
      <div className="full stack">
        {groups.map((g) => {
          const perms = catalog.filter((p) => p.group === g);
          const allOn = perms.every((p) => f.permissions.includes(p.key));
          return (
            <div key={g} className="perm-group">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3>{g}</h3>
                <button type="button" className="btn-link small" onClick={() => toggleGroup(g, !allOn)}>{allOn ? 'Quitar todos' : 'Marcar todos'}</button>
              </div>
              <div className="perm-list">
                {perms.map((p) => (
                  <label key={p.key} className="check">
                    <input type="checkbox" checked={f.permissions.includes(p.key)} onChange={() => toggle(p.key)} />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </FormModal>
  );
}
