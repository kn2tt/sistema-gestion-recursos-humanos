import { useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Card, Field, FormModal, Loader, PageHeader, Select, StatusBadge, Table, Toolbar, useAction, useFetch, useForm } from '../../components/ui';
import { useCatalogs, useEmployeeOptions } from '../../hooks';
import { LABELS, exportCsv, fmtDate, fmtMinutes, fmtTime, fullName, options, toInputTime, todayStr } from '../../utils';

function monthStart() {
  return `${todayStr().slice(0, 7)}-01`;
}

export default function AttendanceRecords() {
  const { can } = useAuth();
  const all = can('attendance.view');
  const editable = can('attendance.edit');
  const { areas } = useCatalogs();
  const employees = useEmployeeOptions();
  const [filters, setFilters] = useState({ from: monthStart(), to: todayStr(), employeeId: '', areaId: '', status: '', isField: '' });
  const state = useFetch(() => api.get('/attendance', filters), [JSON.stringify(filters)]);
  const [form, setForm] = useState(null);
  const [closing, setClosing] = useState(false);
  const setF = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  const rows = state.data || [];
  const count = (s) => rows.filter((r) => r.status === s).length;

  const exportRows = () =>
    exportCsv(`asistencia_${filters.from}_${filters.to}`, [
      { label: 'Fecha', value: (a) => fmtDate(a.date) },
      { label: 'Código', value: (a) => a.employee.code },
      { label: 'Trabajador', value: (a) => fullName(a.employee) },
      { label: 'Área', value: (a) => a.employee.area?.name },
      { label: 'Entrada', value: (a) => (a.checkIn ? fmtTime(a.checkIn) : '') },
      { label: 'Salida', value: (a) => (a.checkOut ? fmtTime(a.checkOut) : '') },
      { label: 'Estado', value: (a) => LABELS.attendance[a.status] },
      { label: 'Min. tardanza', key: 'lateMinutes' },
      { label: 'Horas trabajadas', value: (a) => (a.workedMinutes ? (a.workedMinutes / 60).toFixed(2) : '') },
      { label: 'Campo', value: (a) => (a.isField ? 'Sí' : 'No') },
      { label: 'Proyecto', value: (a) => a.project?.code },
      { label: 'Ubicación', value: (a) => (a.checkInLat ? `${a.checkInLat},${a.checkInLng}` : a.location) },
      { label: 'Origen', key: 'source' },
      { label: 'Observaciones', key: 'notes' },
    ], rows);

  return (
    <>
      <PageHeader
        title={all ? 'Registros de asistencia' : 'Mi asistencia'}
        subtitle="Entradas, salidas, tardanzas y faltas"
        actions={
          <>
            <button className="btn" onClick={exportRows} disabled={!rows.length}>Exportar</button>
            {editable && <button className="btn" onClick={() => setClosing(true)}>Generar faltas del día</button>}
            {editable && <button className="btn btn-primary" onClick={() => setForm({})}>+ Registro manual</button>}
          </>
        }
      />
      <Toolbar>
        <Field label="Desde"><input type="date" value={filters.from} onChange={setF('from')} /></Field>
        <Field label="Hasta"><input type="date" value={filters.to} onChange={setF('to')} /></Field>
        {all && (
          <>
            <Field label="Trabajador"><Select value={filters.employeeId} onChange={setF('employeeId')} placeholder="Todos" options={employees} /></Field>
            <Field label="Área"><Select value={filters.areaId} onChange={setF('areaId')} placeholder="Todas" options={areas.map((a) => ({ value: a.id, label: a.name }))} /></Field>
          </>
        )}
        <Field label="Estado"><Select value={filters.status} onChange={setF('status')} placeholder="Todos" options={options(LABELS.attendance)} /></Field>
        <Field label="Modalidad"><Select value={filters.isField} onChange={setF('isField')} placeholder="Todas" options={[{ value: 'true', label: 'Solo campo' }]} /></Field>
      </Toolbar>

      <div className="grid grid-stats" style={{ marginBottom: '1rem' }}>
        <div className="stat stat-green"><span className="stat-label">Puntual</span><span className="stat-value">{count('PUNTUAL')}</span></div>
        <div className="stat stat-amber"><span className="stat-label">Tardanzas</span><span className="stat-value">{count('TARDANZA')}</span><span className="stat-hint">{rows.reduce((a, r) => a + r.lateMinutes, 0)} min en total</span></div>
        <div className="stat stat-red"><span className="stat-label">Faltas</span><span className="stat-value">{count('FALTA')}</span></div>
        <div className="stat stat-violet"><span className="stat-label">Vacaciones / permisos / justificadas</span><span className="stat-value">{count('VACACIONES') + count('PERMISO') + count('JUSTIFICADO')}</span></div>
      </div>

      <Card pad={false}>
        <Loader state={state}>
          {(list) => (
            <Table
              rows={list}
              empty="No hay registros en el periodo seleccionado."
              columns={[
                { label: 'Fecha', render: (a) => fmtDate(a.date), className: 'nowrap' },
                ...(all ? [{ label: 'Trabajador', render: (a) => (<><div className="cell-main">{fullName(a.employee)}</div><div className="cell-sub">{a.employee.code} · {a.employee.area?.name || '—'}</div></>) }] : []),
                { label: 'Entrada', render: (a) => fmtTime(a.checkIn) },
                { label: 'Salida', render: (a) => fmtTime(a.checkOut) },
                { label: 'Horas', render: (a) => fmtMinutes(a.workedMinutes), className: 'nowrap' },
                { label: 'Estado', render: (a) => (<><StatusBadge value={a.status} group="attendance" />{a.lateMinutes > 0 && <div className="cell-sub">+{a.lateMinutes} min</div>}</>) },
                {
                  label: 'Lugar',
                  render: (a) => (
                    <>
                      <div>{a.isField ? `Campo${a.project ? ` · ${a.project.code}` : ''}` : a.location || 'Oficina'}</div>
                      {a.checkInLat && (
                        <a className="small" href={`https://www.google.com/maps?q=${a.checkInLat},${a.checkInLng}`} target="_blank" rel="noreferrer">
                          Ver en mapa
                        </a>
                      )}
                    </>
                  ),
                },
                { label: 'Obs.', render: (a) => <span className="small">{a.notes || (a.source !== 'SISTEMA' ? a.source.toLowerCase() : '')}</span> },
                ...(editable ? [{ label: '', className: 'right', render: (a) => <button className="btn btn-sm" onClick={() => setForm(a)}>Editar</button> }] : []),
              ]}
            />
          )}
        </Loader>
      </Card>
      {form && <ManualForm record={form.id ? form : null} employees={employees} onClose={() => setForm(null)} onSaved={() => { setForm(null); state.reload(); }} />}
      {closing && <CloseDay onClose={() => setClosing(false)} onDone={() => { setClosing(false); state.reload(); }} />}
    </>
  );
}

function ManualForm({ record, employees, onClose, onSaved }) {
  const [f, set] = useForm({
    employeeId: record?.employeeId ?? '',
    date: record?.date ?? todayStr(),
    checkIn: toInputTime(record?.checkIn),
    checkOut: toInputTime(record?.checkOut),
    status: '',
    notes: record?.notes ?? '',
  });
  const [run, busy] = useAction();
  const submit = async () => {
    const body = { ...f, status: f.status || undefined };
    const r = await run(() => (record ? api.put(`/attendance/${record.id}`, body) : api.post('/attendance/manual', body)), 'Asistencia guardada');
    if (r) onSaved();
  };
  const remove = async () => {
    if (window.confirm('¿Eliminar este registro de asistencia?') && (await run(() => api.del(`/attendance/${record.id}`), 'Registro eliminado'))) onSaved();
  };
  return (
    <FormModal title={record ? `Corregir asistencia · ${fullName(record.employee)} · ${fmtDate(record.date)}` : 'Registro manual de asistencia'} onClose={onClose} onSubmit={submit} busy={busy}>
      {!record && (
        <>
          <Field label="Trabajador" required full><Select value={f.employeeId} onChange={set('employeeId')} options={employees} required /></Field>
          <Field label="Fecha" required><input type="date" value={f.date} onChange={set('date')} required max={todayStr()} /></Field>
        </>
      )}
      <Field label="Hora de entrada"><input type="time" value={f.checkIn} onChange={set('checkIn')} /></Field>
      <Field label="Hora de salida"><input type="time" value={f.checkOut} onChange={set('checkOut')} /></Field>
      <Field label="Estado" hint="Vacío = se calcula según horario (puntual / tardanza / falta).">
        <Select value={f.status} onChange={set('status')} placeholder="Automático" options={options(LABELS.attendance)} />
      </Field>
      <Field label="Observaciones / justificación" full><textarea value={f.notes} onChange={set('notes')} rows={2} /></Field>
      {record && (
        <div className="full">
          <button type="button" className="btn btn-danger btn-sm" onClick={remove}>Eliminar registro</button>
        </div>
      )}
    </FormModal>
  );
}

function CloseDay({ onClose, onDone }) {
  const [date, setDate] = useState(todayStr());
  const [run, busy] = useAction();
  const submit = async () => {
    const r = await run(() => api.post('/attendance/close-day', { date }), (x) => `Cierre ${fmtDate(x.date)}: ${x.faltas} falta(s), ${x.vacaciones} vacaciones, ${x.permisos} permiso(s)`);
    if (r) onDone();
  };
  return (
    <FormModal title="Generar faltas del día" onClose={onClose} onSubmit={submit} busy={busy} size="sm" submitLabel="Generar">
      <div className="info-box full">
        Registra <b>FALTA</b> a cada trabajador activo que debía trabajar ese día según su horario y no marcó entrada. Si tiene vacaciones o
        permiso aprobado, se registra como tal. El sistema también lo hace automáticamente cada noche.
      </div>
      <Field label="Fecha" full><input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} required /></Field>
    </FormModal>
  );
}
