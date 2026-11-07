import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, downloadFile } from '../../api';
import { useAuth } from '../../auth';
import {
  Badge, Card, Field, FormModal, Loader, PageHeader, Select, StatusBadge, Table, Tabs, useAction, useFetch, useForm, useToast,
} from '../../components/ui';
import { LABELS, fmtDate, fmtMinutes, fmtMoney, fmtTime, fullName, options, toInputDate, todayStr, yearsSince } from '../../utils';
import EmployeeForm from './EmployeeForm';
import DocumentForm from '../documents/DocumentForm';

export default function EmployeeDetail() {
  const { id } = useParams();
  const state = useFetch(() => api.get(`/employees/${id}`), [id]);
  return <Loader state={state}>{(emp) => <Detail emp={emp} reload={state.reload} />}</Loader>;
}

function Detail({ emp, reload }) {
  const { can } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState('datos');
  const [editing, setEditing] = useState(false);
  const [run] = useAction();
  const edit = can('employees.edit');

  const remove = async () => {
    if (!window.confirm(`¿Eliminar definitivamente a ${fullName(emp)} y todos sus registros? Para conservar el historial, márquelo como "Cesado".`)) return;
    if (await run(() => api.del(`/employees/${emp.id}`), 'Trabajador eliminado')) nav('/personal');
  };

  const initials = `${emp.firstName[0]}${emp.lastName[0]}`.toUpperCase();

  return (
    <>
      <PageHeader
        back={can('employees.view') && <Link className="back-link" to="/personal">← Trabajadores</Link>}
        title={
          <span className="profile-head">
            <span className="avatar">{initials}</span>
            <span>
              {emp.firstName} {emp.lastName}
              <span className="muted small" style={{ display: 'block', fontWeight: 400 }}>
                {emp.code} · {emp.position?.name || 'Sin cargo'} · {emp.area?.name || 'Sin área'}
              </span>
            </span>
          </span>
        }
        actions={
          <>
            <StatusBadge value={emp.status} group="employeeStatus" />
            {emp.isFieldTech && <Badge tone="blue">Técnico de campo</Badge>}
            {edit && (
              <>
                <button className="btn" onClick={() => setEditing(true)}>Editar</button>
                <button className="btn btn-danger" onClick={remove}>Eliminar</button>
              </>
            )}
          </>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'datos', label: 'Datos' },
          { value: 'historial', label: 'Historial laboral y CV', count: emp.history.length + emp.experiences.length },
          { value: 'documentos', label: 'Documentos', count: emp.documents.length },
          { value: 'asistencia', label: 'Asistencia' },
          { value: 'permisos', label: 'Permisos y vacaciones', count: emp.leaveRequests.length },
          { value: 'proyectos', label: 'Proyectos y capacitaciones' },
        ]}
      />
      {tab === 'datos' && <DataTab emp={emp} />}
      {tab === 'historial' && <HistoryTab emp={emp} reload={reload} edit={edit} />}
      {tab === 'documentos' && <DocumentsTab emp={emp} reload={reload} edit={can('documents.edit')} />}
      {tab === 'asistencia' && <AttendanceTab emp={emp} />}
      {tab === 'permisos' && <LeavesTab emp={emp} />}
      {tab === 'proyectos' && <ProjectsTab emp={emp} />}
      {editing && (
        <EmployeeForm
          employee={emp}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            reload();
          }}
        />
      )}
    </>
  );
}

const D = ({ label, children }) => (
  <div>
    <dt>{label}</dt>
    <dd>{children || '—'}</dd>
  </div>
);

function DataTab({ emp }) {
  const years = yearsSince(emp.hireDate);
  return (
    <div className="grid grid-2">
      <Card title="Datos personales">
        <dl className="dl">
          <D label="Documento">{emp.docType} {emp.docNumber}</D>
          <D label="Fecha de nacimiento">{emp.birthDate && `${fmtDate(emp.birthDate)} (${yearsSince(emp.birthDate)} años)`}</D>
          <D label="Sexo">{{ M: 'Masculino', F: 'Femenino' }[emp.gender]}</D>
          <D label="Estado civil">{emp.maritalStatus}</D>
          <D label="Nacionalidad">{emp.nationality}</D>
          <D label="Teléfono">{emp.phone}</D>
          <D label="Correo">{emp.email}</D>
          <D label="Dirección">{emp.address}</D>
          <D label="Contacto de emergencia">{emp.emergencyContactName && `${emp.emergencyContactName} · ${emp.emergencyContactPhone || ''}`}</D>
        </dl>
      </Card>
      <Card title="Datos laborales">
        <dl className="dl">
          <D label="Código">{emp.code}</D>
          <D label="Área">{emp.area?.name}</D>
          <D label="Cargo">{emp.position?.name}</D>
          <D label="Fecha de ingreso">{`${fmtDate(emp.hireDate)}${years != null ? ` (${years} año/s)` : ''}`}</D>
          {emp.endDate && <D label="Fecha de cese">{fmtDate(emp.endDate)}</D>}
          <D label="Contrato">{LABELS.contractType[emp.contractType]}</D>
          <D label="Horario">{emp.schedule && `${emp.schedule.name} (tolerancia ${emp.schedule.toleranceMin} min)`}</D>
          <D label="Modalidad">{emp.isFieldTech ? 'Técnico de campo' : 'Oficina'}</D>
          {'salary' in emp && <D label="Sueldo">{emp.salary != null && fmtMoney(emp.salary)}</D>}
          {'bankAccount' in emp && <D label="Cuenta bancaria">{emp.bankAccount && `${emp.bankName || ''} ${emp.bankAccount}`}</D>}
          <D label="Usuario del sistema">{emp.user ? `${emp.user.email} (${emp.user.role.name}${emp.user.active ? '' : ', inactivo'})` : 'Sin acceso'}</D>
        </dl>
      </Card>
    </div>
  );
}

function HistoryTab({ emp, reload, edit }) {
  const [adding, setAdding] = useState(false);
  const [exp, setExp] = useState(null); // null | {} (nuevo) | experiencia
  const [run, busy] = useAction();
  const toast = useToast();

  const uploadCv = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    if (await run(() => api.post(`/employees/${emp.id}/cv`, fd), 'CV cargado')) reload();
  };

  return (
    <div className="stack">
      <Card title="Currículum vitae (CV)">
        <div className="row">
          {emp.cvName ? (
            <>
              <span>📄 {emp.cvName}</span>
              <button className="btn btn-sm" onClick={() => downloadFile(`/employees/${emp.id}/cv`, emp.cvName).catch((e) => toast(e.message, 'error'))}>
                Descargar
              </button>
              {edit && (
                <button className="btn btn-sm btn-danger" onClick={async () => window.confirm('¿Eliminar el CV?') && (await run(() => api.del(`/employees/${emp.id}/cv`), 'CV eliminado')) && reload()}>
                  Eliminar
                </button>
              )}
            </>
          ) : (
            <span className="muted">No se ha cargado un CV.</span>
          )}
          {edit && (
            <label className="btn btn-sm btn-primary" style={{ marginLeft: 'auto' }}>
              {busy ? 'Subiendo…' : emp.cvName ? 'Reemplazar CV' : 'Subir CV'}
              <input type="file" hidden accept=".pdf,.doc,.docx" onChange={(e) => uploadCv(e.target.files?.[0])} />
            </label>
          )}
        </div>
      </Card>

      <div className="grid grid-2">
        <Card title="Movimientos en la empresa" actions={edit && <button className="btn btn-sm" onClick={() => setAdding(true)}>+ Registrar</button>}>
          {emp.history.length ? (
            <ul className="timeline">
              {emp.history.map((h) => (
                <li key={h.id}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong>{LABELS.history[h.type] || h.type}</strong>
                    <span className="muted small">{fmtDate(h.date)}</span>
                  </div>
                  <div>{h.description}</div>
                  <div className="cell-sub">
                    {h.createdBy && `Registrado por ${h.createdBy}`}
                    {edit && (
                      <>
                        {' · '}
                        <button className="btn-link danger small" onClick={async () => window.confirm('¿Eliminar este movimiento?') && (await run(() => api.del(`/employees/${emp.id}/history/${h.id}`), 'Eliminado')) && reload()}>
                          eliminar
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Sin movimientos registrados.</p>
          )}
        </Card>
        <Card title="Experiencia laboral previa" actions={edit && <button className="btn btn-sm" onClick={() => setExp({})}>+ Agregar</button>}>
          {emp.experiences.length ? (
            <ul className="list-plain">
              {emp.experiences.map((x) => (
                <li key={x.id}>
                  <div>
                    <div className="cell-main">{x.position} — {x.company}</div>
                    <div className="cell-sub">
                      {fmtDate(x.startDate)} – {x.endDate ? fmtDate(x.endDate) : 'actualidad'}
                    </div>
                    {x.description && <div className="small">{x.description}</div>}
                  </div>
                  {edit && (
                    <div className="row">
                      <button className="btn-link small" onClick={() => setExp(x)}>editar</button>
                      <button className="btn-link danger small" onClick={async () => window.confirm('¿Eliminar esta experiencia?') && (await run(() => api.del(`/employees/${emp.id}/experiences/${x.id}`), 'Eliminado')) && reload()}>
                        eliminar
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Sin experiencia previa registrada.</p>
          )}
        </Card>
      </div>
      {adding && <HistoryForm empId={emp.id} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
      {exp && <ExperienceForm empId={emp.id} exp={exp.id ? exp : null} onClose={() => setExp(null)} onSaved={() => { setExp(null); reload(); }} />}
    </div>
  );
}

function HistoryForm({ empId, onClose, onSaved }) {
  const [f, set] = useForm({ date: todayStr(), type: 'ASCENSO', description: '' });
  const [run, busy] = useAction();
  return (
    <FormModal title="Registrar movimiento" onClose={onClose} busy={busy} size="sm" onSubmit={async () => (await run(() => api.post(`/employees/${empId}/history`, f), 'Movimiento registrado')) && onSaved()}>
      <Field label="Fecha" required>
        <input type="date" value={f.date} onChange={set('date')} required />
      </Field>
      <Field label="Tipo" required>
        <Select value={f.type} onChange={set('type')} options={options(LABELS.history)} allowEmpty={false} />
      </Field>
      <Field label="Descripción" required full>
        <textarea value={f.description} onChange={set('description')} required />
      </Field>
    </FormModal>
  );
}

function ExperienceForm({ empId, exp, onClose, onSaved }) {
  const [f, set] = useForm({
    company: exp?.company ?? '', position: exp?.position ?? '', startDate: toInputDate(exp?.startDate), endDate: toInputDate(exp?.endDate), description: exp?.description ?? '',
  });
  const [run, busy] = useAction();
  const submit = async () => {
    const r = await run(() => (exp ? api.put(`/employees/${empId}/experiences/${exp.id}`, f) : api.post(`/employees/${empId}/experiences`, f)), 'Experiencia guardada');
    if (r) onSaved();
  };
  return (
    <FormModal title={exp ? 'Editar experiencia' : 'Agregar experiencia previa'} onClose={onClose} onSubmit={submit} busy={busy}>
      <Field label="Empresa" required>
        <input value={f.company} onChange={set('company')} required />
      </Field>
      <Field label="Cargo" required>
        <input value={f.position} onChange={set('position')} required />
      </Field>
      <Field label="Desde">
        <input type="date" value={f.startDate} onChange={set('startDate')} />
      </Field>
      <Field label="Hasta">
        <input type="date" value={f.endDate} onChange={set('endDate')} />
      </Field>
      <Field label="Funciones / logros" full>
        <textarea value={f.description} onChange={set('description')} />
      </Field>
    </FormModal>
  );
}

export function expiryBadge(d) {
  if (!d.expiryDate) return <Badge>Sin vencimiento</Badge>;
  const n = Math.round((new Date(toInputDate(d.expiryDate)) - new Date(todayStr())) / 86400000);
  if (n < 0) return <Badge tone="red">Vencido</Badge>;
  if (n <= 30) return <Badge tone="amber">Vence en {n} d</Badge>;
  return <Badge tone="green">Vigente</Badge>;
}

function DocumentsTab({ emp, reload, edit }) {
  const [form, setForm] = useState(null);
  const [run] = useAction();
  const toast = useToast();
  return (
    <Card pad={false} title="Certificados, contratos y otros documentos" actions={edit && <button className="btn btn-sm btn-primary" onClick={() => setForm({})}>+ Registrar documento</button>}>
      <Table
        rows={emp.documents}
        empty="No hay documentos registrados."
        columns={[
          { label: 'Documento', render: (d) => (<><div className="cell-main">{d.name}</div><div className="cell-sub">{LABELS.docType[d.type]}{d.issuer ? ` · ${d.issuer}` : ''}{d.training ? ` · ${d.training.name}` : ''}</div></>) },
          { label: 'Emisión', render: (d) => fmtDate(d.issueDate) },
          { label: 'Vencimiento', render: (d) => fmtDate(d.expiryDate) },
          { label: 'Estado', render: expiryBadge },
          {
            label: '',
            className: 'right nowrap',
            render: (d) => (
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                {d.fileName && <button className="btn btn-sm" onClick={() => downloadFile(`/documents/${d.id}/file`, d.fileName).catch((e) => toast(e.message, 'error'))}>Descargar</button>}
                {edit && <button className="btn btn-sm" onClick={() => setForm(d)}>Editar</button>}
                {edit && <button className="btn btn-sm btn-danger" onClick={async () => window.confirm('¿Eliminar documento?') && (await run(() => api.del(`/documents/${d.id}`), 'Documento eliminado')) && reload()}>×</button>}
              </div>
            ),
          },
        ]}
      />
      {form && <DocumentForm doc={form.id ? form : null} employeeId={emp.id} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </Card>
  );
}

function AttendanceTab({ emp }) {
  const list = emp.attendances;
  const c = (s) => list.filter((a) => a.status === s).length;
  return (
    <div className="stack">
      <div className="grid grid-stats">
        <div className="stat stat-green"><span className="stat-label">Puntual</span><span className="stat-value">{c('PUNTUAL')}</span></div>
        <div className="stat stat-amber"><span className="stat-label">Tardanzas</span><span className="stat-value">{c('TARDANZA')}</span><span className="stat-hint">{list.reduce((a, x) => a + x.lateMinutes, 0)} min acumulados</span></div>
        <div className="stat stat-red"><span className="stat-label">Faltas</span><span className="stat-value">{c('FALTA')}</span></div>
        <div className="stat stat-violet"><span className="stat-label">Vacaciones / permisos</span><span className="stat-value">{c('VACACIONES') + c('PERMISO') + c('JUSTIFICADO')}</span></div>
      </div>
      <Card pad={false} title="Últimos 60 registros">
        <Table
          rows={list}
          columns={[
            { label: 'Fecha', render: (a) => fmtDate(a.date) },
            { label: 'Entrada', render: (a) => fmtTime(a.checkIn) },
            { label: 'Salida', render: (a) => fmtTime(a.checkOut) },
            { label: 'Horas', render: (a) => fmtMinutes(a.workedMinutes) },
            { label: 'Estado', render: (a) => (<><StatusBadge value={a.status} group="attendance" />{a.lateMinutes > 0 && <span className="cell-sub"> +{a.lateMinutes} min</span>}</>) },
            { label: 'Lugar', render: (a) => (a.isField ? `Campo${a.project ? ` · ${a.project.code}` : ''}` : a.location || 'Oficina') },
          ]}
        />
      </Card>
    </div>
  );
}

function LeavesTab({ emp }) {
  const bal = useFetch(() => api.get('/leaves/balance', { employeeId: emp.id }), [emp.id]);
  return (
    <div className="stack">
      {bal.data && (
        <div className="grid grid-stats">
          <div className="stat stat-primary"><span className="stat-label">Vacaciones {bal.data.year}</span><span className="stat-value">{bal.data.perYear} d</span><span className="stat-hint">Derecho anual</span></div>
          <div className="stat stat-violet"><span className="stat-label">Gozadas</span><span className="stat-value">{bal.data.used} d</span></div>
          <div className="stat stat-amber"><span className="stat-label">Pendientes de aprobación</span><span className="stat-value">{bal.data.pending} d</span></div>
          <div className="stat stat-green"><span className="stat-label">Saldo disponible</span><span className="stat-value">{bal.data.available} d</span></div>
        </div>
      )}
      <Card pad={false} title="Historial de solicitudes">
        <Table
          rows={emp.leaveRequests}
          columns={[
            { label: 'Tipo', render: (l) => LABELS.leaveType[l.type] },
            { label: 'Periodo', render: (l) => `${fmtDate(l.startDate)} – ${fmtDate(l.endDate)}` },
            { label: 'Días', key: 'days' },
            { label: 'Motivo', render: (l) => l.reason || '—' },
            { label: 'Estado', render: (l) => <StatusBadge value={l.status} group="leaveStatus" /> },
          ]}
        />
      </Card>
    </div>
  );
}

function ProjectsTab({ emp }) {
  return (
    <div className="grid grid-2">
      <Card pad={false} title="Asignaciones a proyectos">
        <Table
          rows={emp.assignments}
          empty="Sin asignaciones."
          columns={[
            { label: 'Proyecto', render: (a) => (<Link to={`/proyectos/${a.project.id}`}>{a.project.code} · {a.project.name}</Link>) },
            { label: 'Rol', render: (a) => a.role || '—' },
            { label: 'Periodo', render: (a) => `${fmtDate(a.startDate)} – ${a.endDate ? fmtDate(a.endDate) : '…'}` },
            { label: 'Estado', render: (a) => <StatusBadge value={a.status} group="assignmentStatus" /> },
          ]}
        />
      </Card>
      <Card pad={false} title="Capacitaciones">
        <Table
          rows={emp.participations}
          empty="Sin capacitaciones."
          columns={[
            { label: 'Capacitación', render: (p) => p.training.name },
            { label: 'Fecha', render: (p) => fmtDate(p.training.startDate) },
            { label: 'Horas', render: (p) => p.training.hours ?? '—' },
            { label: 'Resultado', render: (p) => (<><StatusBadge value={p.status} group="participant" />{p.score != null && <span className="cell-sub"> Nota {p.score}</span>}</>) },
          ]}
        />
      </Card>
    </div>
  );
}
