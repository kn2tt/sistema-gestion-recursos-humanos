import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Card, Field, FormModal, Loader, PageHeader, Select, Table, Tabs, useAction, useFetch, useForm } from '../components/ui';
import { WEEKDAYS } from '../utils';

export default function Organization() {
  const [tab, setTab] = useState('areas');
  return (
    <>
      <PageHeader title="Áreas, cargos y horarios" subtitle="Estructura organizacional y turnos de trabajo" />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'areas', label: 'Áreas' },
          { value: 'cargos', label: 'Cargos' },
          { value: 'horarios', label: 'Horarios' },
        ]}
      />
      {tab === 'areas' && <Areas />}
      {tab === 'cargos' && <Positions />}
      {tab === 'horarios' && <Schedules />}
    </>
  );
}

/** Tabla CRUD genérica para catálogos. */
function CatalogCard({ title, url, columns, FormComp, entityLabel }) {
  const { can } = useAuth();
  const state = useFetch(() => api.get(url), [url]);
  const [form, setForm] = useState(null);
  const [run] = useAction();
  const edit = can('org.edit');
  const remove = async (row) => {
    if (!window.confirm(`¿Eliminar ${entityLabel} "${row.name}"?`)) return;
    if (await run(() => api.del(`${url}/${row.id}`), 'Eliminado')) state.reload();
  };
  return (
    <Card pad={false} title={title} actions={edit && <button className="btn btn-sm btn-primary" onClick={() => setForm({})}>+ Nuevo</button>}>
      <Loader state={state}>
        {(rows) => (
          <Table
            rows={rows}
            columns={[
              ...columns,
              ...(edit
                ? [{
                    label: '',
                    className: 'right nowrap',
                    render: (r) => (
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm" onClick={() => setForm(r)}>Editar</button>
                        <button className="btn btn-sm btn-danger" onClick={() => remove(r)}>Eliminar</button>
                      </div>
                    ),
                  }]
                : []),
            ]}
          />
        )}
      </Loader>
      {form && (
        <FormComp
          item={form.id ? form : null}
          url={url}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            state.reload();
          }}
        />
      )}
    </Card>
  );
}

function useSave(url, item, onSaved) {
  const [run, busy] = useAction();
  const save = async (data) => {
    const r = await run(() => (item ? api.put(`${url}/${item.id}`, data) : api.post(url, data)), 'Guardado');
    if (r) onSaved();
  };
  return [save, busy];
}

// ── Áreas ──
function Areas() {
  return (
    <CatalogCard
      title="Áreas"
      url="/org/areas"
      entityLabel="el área"
      FormComp={AreaForm}
      columns={[
        { label: 'Nombre', render: (a) => <span className="cell-main">{a.name}</span> },
        { label: 'Descripción', render: (a) => a.description || '—' },
        { label: 'Cargos', render: (a) => a._count.positions },
        { label: 'Trabajadores', render: (a) => a._count.employees },
      ]}
    />
  );
}
function AreaForm({ item, url, onClose, onSaved }) {
  const [f, set] = useForm({ name: item?.name ?? '', description: item?.description ?? '' });
  const [save, busy] = useSave(url, item, onSaved);
  return (
    <FormModal title={item ? 'Editar área' : 'Nueva área'} onClose={onClose} onSubmit={() => save(f)} busy={busy} size="sm">
      <Field label="Nombre" required full><input value={f.name} onChange={set('name')} required /></Field>
      <Field label="Descripción" full><textarea value={f.description} onChange={set('description')} /></Field>
    </FormModal>
  );
}

// ── Cargos ──
function Positions() {
  return (
    <CatalogCard
      title="Cargos"
      url="/org/positions"
      entityLabel="el cargo"
      FormComp={PositionForm}
      columns={[
        { label: 'Cargo', render: (p) => <span className="cell-main">{p.name}</span> },
        { label: 'Área', render: (p) => p.area?.name || '—' },
        { label: 'Descripción', render: (p) => p.description || '—' },
        { label: 'Trabajadores', render: (p) => p._count.employees },
      ]}
    />
  );
}
function PositionForm({ item, url, onClose, onSaved }) {
  const areas = useFetch(() => api.get('/org/areas'));
  const [f, set] = useForm({ name: item?.name ?? '', areaId: item?.areaId ?? '', description: item?.description ?? '' });
  const [save, busy] = useSave(url, item, onSaved);
  return (
    <FormModal title={item ? 'Editar cargo' : 'Nuevo cargo'} onClose={onClose} onSubmit={() => save(f)} busy={busy} size="sm">
      <Field label="Nombre" required full><input value={f.name} onChange={set('name')} required /></Field>
      <Field label="Área" full>
        <Select value={f.areaId} onChange={set('areaId')} placeholder="Sin área" options={(areas.data || []).map((a) => ({ value: a.id, label: a.name }))} />
      </Field>
      <Field label="Descripción / funciones" full><textarea value={f.description} onChange={set('description')} /></Field>
    </FormModal>
  );
}

// ── Horarios ──
function Schedules() {
  return (
    <CatalogCard
      title="Horarios de trabajo"
      url="/org/schedules"
      entityLabel="el horario"
      FormComp={ScheduleForm}
      columns={[
        { label: 'Horario', render: (s) => <span className="cell-main">{s.name}</span> },
        { label: 'Entrada', key: 'startTime' },
        { label: 'Salida', key: 'endTime' },
        { label: 'Tolerancia', render: (s) => `${s.toleranceMin} min` },
        { label: 'Días', render: (s) => s.workDays.split(',').map((d) => WEEKDAYS[d]).join(', ') },
        { label: 'Trabajadores', render: (s) => s._count.employees },
      ]}
    />
  );
}
function ScheduleForm({ item, url, onClose, onSaved }) {
  const [f, set, setF] = useForm({
    name: item?.name ?? '', startTime: item?.startTime ?? '08:00', endTime: item?.endTime ?? '17:00', toleranceMin: item?.toleranceMin ?? 10,
    workDays: item ? item.workDays.split(',').map(Number) : [1, 2, 3, 4, 5],
  });
  const [save, busy] = useSave(url, item, onSaved);
  const toggleDay = (d) => setF((s) => ({ ...s, workDays: s.workDays.includes(d) ? s.workDays.filter((x) => x !== d) : [...s.workDays, d].sort() }));
  return (
    <FormModal title={item ? 'Editar horario' : 'Nuevo horario'} onClose={onClose} onSubmit={() => save(f)} busy={busy}>
      <Field label="Nombre" required full><input value={f.name} onChange={set('name')} required placeholder="Ej. Oficina L-V" /></Field>
      <Field label="Hora de entrada" required><input type="time" value={f.startTime} onChange={set('startTime')} required /></Field>
      <Field label="Hora de salida" required><input type="time" value={f.endTime} onChange={set('endTime')} required /></Field>
      <Field label="Tolerancia (minutos)" hint="Después de este margen, la entrada cuenta como tardanza."><input type="number" min="0" value={f.toleranceMin} onChange={set('toleranceMin')} /></Field>
      <div className="field full">
        <span className="field-label">Días laborables</span>
        <div className="row">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <label key={d} className="check" style={{ marginRight: '0.75rem' }}>
              <input type="checkbox" checked={f.workDays.includes(d)} onChange={() => toggleDay(d)} /> {WEEKDAYS[d]}
            </label>
          ))}
        </div>
      </div>
    </FormModal>
  );
}
