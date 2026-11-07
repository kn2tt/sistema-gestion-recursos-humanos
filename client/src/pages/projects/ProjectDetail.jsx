import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Badge, Card, Loader, PageHeader, StatusBadge, Table, useAction, useFetch } from '../../components/ui';
import { LABELS, fmtDate, fullName } from '../../utils';
import { AssignmentForm, ProjectForm } from './ProjectForms';

export default function ProjectDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const nav = useNavigate();
  const state = useFetch(() => api.get(`/projects/${id}`), [id]);
  const [editing, setEditing] = useState(false);
  const [assign, setAssign] = useState(null);
  const [run] = useAction();
  const edit = can('projects.edit');

  const remove = async (p) => {
    if (window.confirm(`¿Eliminar el proyecto ${p.code}? Se eliminarán sus asignaciones.`) && (await run(() => api.del(`/projects/${p.id}`), 'Proyecto eliminado'))) nav('/proyectos');
  };
  const unassign = async (a) => {
    if (window.confirm(`¿Quitar a ${fullName(a.employee)} del proyecto? (Para conservar historial, cambie el estado a Finalizado)`) && (await run(() => api.del(`/projects/assignments/${a.id}`), 'Asignación eliminada'))) state.reload();
  };
  const quickStatus = async (a, status) => {
    if (await run(() => api.put(`/projects/assignments/${a.id}`, { status, ...(status === 'FINALIZADO' && { endDate: new Date().toISOString().slice(0, 10) }) }), 'Estado actualizado')) state.reload();
  };

  return (
    <Loader state={state}>
      {(p) => {
        const active = p.assignments.filter((a) => ['ASIGNADO', 'EN_CAMPO'].includes(a.status));
        return (
          <>
            <PageHeader
              back={<Link className="back-link" to="/proyectos">← Proyectos</Link>}
              title={`${p.code} · ${p.name}`}
              subtitle={[p.client, p.location].filter(Boolean).join(' · ')}
              actions={
                <>
                  <StatusBadge value={p.status} group="projectStatus" />
                  {edit && <button className="btn" onClick={() => setEditing(true)}>Editar</button>}
                  {edit && <button className="btn btn-danger" onClick={() => remove(p)}>Eliminar</button>}
                </>
              }
            />
            <div className="grid grid-stats" style={{ marginBottom: '1rem' }}>
              <div className="stat stat-primary"><span className="stat-label">Personal activo</span><span className="stat-value">{active.length}</span></div>
              <div className="stat stat-green"><span className="stat-label">En campo</span><span className="stat-value">{p.assignments.filter((a) => a.status === 'EN_CAMPO').length}</span></div>
              <div className="stat"><span className="stat-label">Inicio</span><span className="stat-value" style={{ fontSize: '1.2rem' }}>{fmtDate(p.startDate)}</span></div>
              <div className="stat"><span className="stat-label">Fin previsto</span><span className="stat-value" style={{ fontSize: '1.2rem' }}>{fmtDate(p.endDate)}</span></div>
            </div>
            {p.description && <Card title="Descripción"><p>{p.description}</p></Card>}
            <div style={{ height: '1rem' }} />
            <Card pad={false} title="Personal asignado" actions={edit && !['FINALIZADO', 'CANCELADO'].includes(p.status) && <button className="btn btn-sm btn-primary" onClick={() => setAssign({})}>+ Asignar técnico</button>}>
              <Table
                rows={p.assignments}
                empty="Aún no hay personal asignado."
                columns={[
                  { label: 'Trabajador', render: (a) => (<><Link to={`/personal/${a.employee.id}`} className="cell-main">{fullName(a.employee)}</Link><div className="cell-sub">{a.employee.position?.name || '—'} · {a.employee.phone || ''}</div></>) },
                  { label: 'Tipo', render: (a) => (a.employee.isFieldTech ? <Badge tone="blue">Campo</Badge> : <Badge>Oficina</Badge>) },
                  { label: 'Rol', render: (a) => a.role || '—' },
                  { label: 'Periodo', render: (a) => <span className="nowrap">{fmtDate(a.startDate)} – {a.endDate ? fmtDate(a.endDate) : '…'}</span> },
                  { label: 'Estado', render: (a) => <StatusBadge value={a.status} group="assignmentStatus" /> },
                  ...(edit
                    ? [{
                        label: '',
                        className: 'right nowrap',
                        render: (a) => (
                          <div className="row" style={{ justifyContent: 'flex-end' }}>
                            {a.status === 'ASIGNADO' && <button className="btn btn-sm" onClick={() => quickStatus(a, 'EN_CAMPO')}>En campo</button>}
                            {['ASIGNADO', 'EN_CAMPO'].includes(a.status) && <button className="btn btn-sm" onClick={() => quickStatus(a, 'FINALIZADO')}>Finalizar</button>}
                            <button className="btn btn-sm" onClick={() => setAssign(a)}>Editar</button>
                            <button className="btn btn-sm btn-danger" onClick={() => unassign(a)} title="Quitar">×</button>
                          </div>
                        ),
                      }]
                    : []),
                ]}
              />
            </Card>
            {editing && <ProjectForm project={p} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); state.reload(); }} />}
            {assign && <AssignmentForm projectId={p.id} assignment={assign.id ? assign : null} onClose={() => setAssign(null)} onSaved={() => { setAssign(null); state.reload(); }} />}
            <p className="muted small" style={{ marginTop: '0.75rem' }}>Estados: {Object.values(LABELS.assignmentStatus).join(' → ')}</p>
          </>
        );
      }}
    </Loader>
  );
}
