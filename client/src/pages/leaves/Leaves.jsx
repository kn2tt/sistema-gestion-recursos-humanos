import { useState } from 'react';
import { api, downloadFile } from '../../api';
import { useAuth } from '../../auth';
import { Card, Field, FileInput, FormModal, Loader, PageHeader, Select, StatusBadge, Table, Tabs, Toolbar, useAction, useFetch, useForm, useToast } from '../../components/ui';
import { useEmployeeOptions } from '../../hooks';
import { LABELS, exportCsv, fmtDate, fmtDateTime, fullName, options, todayStr } from '../../utils';

export default function Leaves() {
  const { can, user } = useAuth();
  const viewAll = can('leave.view', 'leave.approve');
  const approver = can('leave.approve');
  const [tab, setTab] = useState(approver ? 'PENDIENTE' : '');
  const [type, setType] = useState('');
  const state = useFetch(() => api.get('/leaves', { status: tab, type }), [tab, type]);
  const balance = useFetch(() => (user.employee ? api.get('/leaves/balance') : Promise.resolve(null)));
  const [creating, setCreating] = useState(false);
  const [deciding, setDeciding] = useState(null);
  const [run] = useAction();
  const toast = useToast();

  const reload = () => {
    state.reload();
    balance.reload();
  };

  const cancel = async (l) => {
    if (window.confirm('¿Cancelar esta solicitud?') && (await run(() => api.post(`/leaves/${l.id}/cancel`), 'Solicitud cancelada'))) reload();
  };

  const exportRows = () =>
    exportCsv('solicitudes', [
      { label: 'N°', key: 'id' },
      { label: 'Trabajador', value: (l) => fullName(l.employee) },
      { label: 'Área', value: (l) => l.employee.area?.name },
      { label: 'Tipo', value: (l) => LABELS.leaveType[l.type] },
      { label: 'Desde', value: (l) => fmtDate(l.startDate) },
      { label: 'Hasta', value: (l) => fmtDate(l.endDate) },
      { label: 'Días', key: 'days' },
      { label: 'Motivo', key: 'reason' },
      { label: 'Estado', value: (l) => LABELS.leaveStatus[l.status] },
      { label: 'Revisado por', value: (l) => l.reviewedBy?.name },
      { label: 'Fecha revisión', value: (l) => (l.reviewedAt ? fmtDateTime(l.reviewedAt) : '') },
      { label: 'Comentario', key: 'reviewComment' },
    ], state.data || []);

  return (
    <>
      <PageHeader
        title="Permisos y vacaciones"
        subtitle={viewAll ? 'Solicitudes del personal, aprobación e historial' : 'Mis solicitudes'}
        actions={
          <>
            {viewAll && <button className="btn" onClick={exportRows} disabled={!state.data?.length}>Exportar</button>}
            {can('leave.request', 'leave.view', 'leave.approve') && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Nueva solicitud</button>}
          </>
        }
      />
      {balance.data && (
        <div className="grid grid-stats" style={{ marginBottom: '1rem' }}>
          <div className="stat stat-primary"><span className="stat-label">Mis vacaciones {balance.data.year}</span><span className="stat-value">{balance.data.perYear} d</span></div>
          <div className="stat stat-violet"><span className="stat-label">Gozadas</span><span className="stat-value">{balance.data.used} d</span></div>
          <div className="stat stat-amber"><span className="stat-label">Por aprobar</span><span className="stat-value">{balance.data.pending} d</span></div>
          <div className="stat stat-green"><span className="stat-label">Disponibles</span><span className="stat-value">{balance.data.available} d</span></div>
        </div>
      )}
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'PENDIENTE', label: 'Pendientes' },
          { value: 'APROBADO', label: 'Aprobadas' },
          { value: 'RECHAZADO', label: 'Rechazadas' },
          { value: '', label: 'Historial completo' },
        ]}
      />
      <Toolbar>
        <Select value={type} onChange={(e) => setType(e.target.value)} placeholder="Todos los tipos" options={options(LABELS.leaveType)} />
      </Toolbar>
      <Card pad={false}>
        <Loader state={state}>
          {(list) => (
            <Table
              rows={list}
              empty="No hay solicitudes."
              columns={[
                { label: 'N°', render: (l) => <span className="muted">#{l.id}</span> },
                ...(viewAll ? [{ label: 'Trabajador', render: (l) => (<><div className="cell-main">{fullName(l.employee)}</div><div className="cell-sub">{l.employee.area?.name || '—'}</div></>) }] : []),
                { label: 'Tipo', render: (l) => LABELS.leaveType[l.type] },
                { label: 'Periodo', render: (l) => <span className="nowrap">{fmtDate(l.startDate)} – {fmtDate(l.endDate)}</span> },
                { label: 'Días', key: 'days' },
                {
                  label: 'Motivo',
                  render: (l) => (
                    <>
                      <div className="small">{l.reason || '—'}</div>
                      {l.fileName && <button className="btn-link small" onClick={() => downloadFile(`/leaves/${l.id}/file`, l.fileName).catch((e) => toast(e.message, 'error'))}>📎 {l.fileName}</button>}
                    </>
                  ),
                },
                {
                  label: 'Estado',
                  render: (l) => (
                    <>
                      <StatusBadge value={l.status} group="leaveStatus" />
                      {l.reviewedBy && <div className="cell-sub">{l.reviewedBy.name}</div>}
                      {l.reviewComment && <div className="cell-sub">“{l.reviewComment}”</div>}
                    </>
                  ),
                },
                {
                  label: '',
                  className: 'right nowrap',
                  render: (l) => (
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      {approver && l.status === 'PENDIENTE' && l.employee.id !== user.employee?.id && (
                        <button className="btn btn-sm btn-primary" onClick={() => setDeciding(l)}>Revisar</button>
                      )}
                      {(l.status === 'PENDIENTE' || (approver && l.status === 'APROBADO')) && (l.employee.id === user.employee?.id || approver) && (
                        <button className="btn btn-sm" onClick={() => cancel(l)}>Cancelar</button>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          )}
        </Loader>
      </Card>
      {creating && <LeaveForm viewAll={viewAll} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
      {deciding && <DecisionModal leave={deciding} onClose={() => setDeciding(null)} onDone={() => { setDeciding(null); reload(); }} />}
    </>
  );
}

function daysBetween(a, b) {
  if (!a || !b || b < a) return 0;
  return Math.round((new Date(b) - new Date(a)) / 86400000) + 1;
}

function LeaveForm({ viewAll, onClose, onSaved }) {
  const { user } = useAuth();
  const employees = useEmployeeOptions();
  const [f, set] = useForm({ employeeId: '', type: 'VACACIONES', startDate: todayStr(), endDate: todayStr(), reason: '' });
  const [file, setFile] = useState(null);
  const [run, busy] = useAction();
  const days = daysBetween(f.startDate, f.endDate);

  const submit = async () => {
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => v && fd.append(k, v));
    if (file) fd.append('file', file);
    if (await run(() => api.post('/leaves', fd), 'Solicitud registrada')) onSaved();
  };

  return (
    <FormModal title="Nueva solicitud" onClose={onClose} onSubmit={submit} busy={busy} submitLabel="Enviar solicitud">
      {viewAll && (
        <Field label="Trabajador" full hint={user.employee ? 'Déjelo vacío para registrar una solicitud propia.' : 'Registrar a nombre de un trabajador.'}>
          <Select value={f.employeeId} onChange={set('employeeId')} placeholder={user.employee ? 'Yo mismo' : 'Seleccione…'} options={employees} />
        </Field>
      )}
      <Field label="Tipo" required full>
        <Select value={f.type} onChange={set('type')} options={options(LABELS.leaveType)} allowEmpty={false} />
      </Field>
      <Field label="Desde" required><input type="date" value={f.startDate} onChange={set('startDate')} required /></Field>
      <Field label="Hasta" required><input type="date" value={f.endDate} min={f.startDate} onChange={set('endDate')} required /></Field>
      <div className="full muted">Total: <b>{days}</b> día(s) calendario</div>
      <Field label="Motivo" full><textarea value={f.reason} onChange={set('reason')} rows={3} /></Field>
      <Field label="Sustento (opcional)" full hint="Ej. certificado médico, citación, etc."><FileInput onChange={setFile} /></Field>
    </FormModal>
  );
}

function DecisionModal({ leave, onClose, onDone }) {
  const [comment, setComment] = useState('');
  const [run, busy] = useAction();
  const decide = async (action) => {
    if (await run(() => api.post(`/leaves/${leave.id}/${action}`, { comment }), action === 'approve' ? 'Solicitud aprobada' : 'Solicitud rechazada')) onDone();
  };
  return (
    <FormModal title={`Solicitud #${leave.id}`} onClose={onClose} onSubmit={() => decide('approve')} busy={busy} submitLabel="Aprobar">
      <dl className="dl full">
        <div><dt>Trabajador</dt><dd>{fullName(leave.employee)}</dd></div>
        <div><dt>Tipo</dt><dd>{LABELS.leaveType[leave.type]}</dd></div>
        <div><dt>Periodo</dt><dd>{fmtDate(leave.startDate)} – {fmtDate(leave.endDate)} ({leave.days} d)</dd></div>
        <div><dt>Registrada</dt><dd>{fmtDateTime(leave.createdAt)}</dd></div>
      </dl>
      {leave.reason && <div className="full"><span className="field-label">Motivo</span><p>{leave.reason}</p></div>}
      <Field label="Comentario (se envía al trabajador por correo)" full><textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} /></Field>
      <div className="full">
        <button type="button" className="btn btn-danger" disabled={busy} onClick={() => decide('reject')}>Rechazar solicitud</button>
      </div>
    </FormModal>
  );
}
