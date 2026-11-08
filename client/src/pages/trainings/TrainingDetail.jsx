import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Badge, Card, FormModal, Loader, PageHeader, Select, Table, useAction, useFetch } from '../../components/ui';
import { useEmployeeOptions } from '../../hooks';
import { LABELS, fmtDate, fullName, options } from '../../utils';
import DocumentForm from '../documents/DocumentForm';
import { TrainingForm } from './Trainings';

export default function TrainingDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const nav = useNavigate();
  const state = useFetch(() => api.get(`/trainings/${id}`), [id]);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [cert, setCert] = useState(null);
  const [run] = useAction();
  const edit = can('trainings.edit');

  const update = async (p, data) => {
    if (await run(() => api.put(`/trainings/${id}/participants/${p.id}`, data))) state.reload();
  };

  return (
    <Loader state={state}>
      {(t) => (
        <>
          <PageHeader
            back={<Link className="back-link" to="/capacitaciones">← Capacitaciones</Link>}
            title={t.name}
            subtitle={[t.provider, LABELS.modality[t.modality], `${fmtDate(t.startDate)}${t.endDate ? ` – ${fmtDate(t.endDate)}` : ''}`, t.hours && `${t.hours} h`].filter(Boolean).join(' · ')}
            actions={
              edit && (
                <>
                  <button className="btn" onClick={() => setEditing(true)}>Editar</button>
                  <button className="btn btn-danger" onClick={async () => window.confirm('¿Eliminar la capacitación?') && (await run(() => api.del(`/trainings/${t.id}`), 'Eliminada')) && nav('/capacitaciones')}>Eliminar</button>
                </>
              )
            }
          />
          {t.description && <Card title="Descripción"><p style={{ whiteSpace: 'pre-wrap' }}>{t.description}</p></Card>}
          <div style={{ height: '1rem' }} />
          <Card
            pad={false}
            title={`Participantes (${t.participants.length})`}
            actions={edit && <button className="btn btn-sm btn-primary" onClick={() => setAdding(true)}>+ Inscribir personal</button>}
          >
            <Table
              rows={t.participants}
              empty="Aún no hay participantes inscritos."
              columns={[
                { label: 'Trabajador', render: (p) => (<><Link to={`/personal/${p.employee.id}`} className="cell-main">{fullName(p.employee)}</Link><div className="cell-sub">{p.employee.code}</div></>) },
                {
                  label: 'Resultado',
                  render: (p) => edit ? (
                    <Select value={p.status} onChange={(e) => update(p, { status: e.target.value })} options={options(LABELS.participant)} allowEmpty={false} style={{ width: 150 }} />
                  ) : LABELS.participant[p.status],
                },
                {
                  label: 'Nota',
                  render: (p) => edit ? (
                    <input type="number" step="0.1" defaultValue={p.score ?? ''} style={{ width: 80 }} onBlur={(e) => String(p.score ?? '') !== e.target.value && update(p, { score: e.target.value })} />
                  ) : p.score ?? '—',
                },
                {
                  label: 'Certificado',
                  render: (p) => {
                    const doc = t.documents.find((d) => d.employeeId === p.employee.id);
                    if (doc) return <Badge tone="green">Vence {fmtDate(doc.expiryDate)}</Badge>;
                    return can('documents.edit') && p.status === 'APROBADO' ? (
                      <button className="btn btn-sm" onClick={() => setCert(p)}>Registrar certificado</button>
                    ) : <span className="muted">—</span>;
                  },
                },
                ...(edit ? [{ label: '', className: 'right', render: (p) => <button className="btn btn-sm btn-danger" onClick={async () => window.confirm('¿Quitar participante?') && (await run(() => api.del(`/trainings/${id}/participants/${p.id}`), 'Participante retirado')) && state.reload()}>×</button> }] : []),
              ]}
            />
          </Card>
          {editing && <TrainingForm training={t} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); state.reload(); }} />}
          {adding && <AddParticipants training={t} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); state.reload(); }} />}
          {cert && (
            <DocumentForm
              employeeId={cert.employee.id}
              trainingId={t.id}
              defaultType="CERTIFICADO"
              doc={null}
              onClose={() => setCert(null)}
              onSaved={() => { setCert(null); state.reload(); }}
            />
          )}
        </>
      )}
    </Loader>
  );
}

function AddParticipants({ training, onClose, onSaved }) {
  const employees = useEmployeeOptions();
  const enrolled = new Set(training.participants.map((p) => p.employee.id));
  const [selected, setSelected] = useState([]);
  const [filter, setFilter] = useState('');
  const [run, busy] = useAction();
  const available = employees.filter((e) => !enrolled.has(e.value) && e.label.toLowerCase().includes(filter.toLowerCase()));
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <FormModal title="Inscribir personal" onClose={onClose} busy={busy} submitLabel={`Inscribir (${selected.length})`} onSubmit={async () => (await run(() => api.post(`/trainings/${training.id}/participants`, { employeeIds: selected }), (r) => `${r.added} inscrito(s)`)) && onSaved()}>
      <div className="full row">
        <input type="search" placeholder="Filtrar…" value={filter} onChange={(e) => setFilter(e.target.value)} className="grow" style={{ width: 'auto' }} />
        <button type="button" className="btn btn-sm" onClick={() => setSelected(available.map((e) => e.value))}>Todos</button>
        <button type="button" className="btn btn-sm" onClick={() => setSelected([])}>Ninguno</button>
      </div>
      <div className="full" style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
        {available.length ? available.map((e) => (
          <label key={e.value} className="check" style={{ padding: '0.3rem 0' }}>
            <input type="checkbox" checked={selected.includes(e.value)} onChange={() => toggle(e.value)} />
            {e.label} {e.raw.isFieldTech && <Badge tone="blue">Campo</Badge>}
          </label>
        )) : <p className="muted">No hay más trabajadores disponibles.</p>}
      </div>
    </FormModal>
  );
}
