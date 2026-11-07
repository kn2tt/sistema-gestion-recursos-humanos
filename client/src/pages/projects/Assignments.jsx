import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Card, Loader, PageHeader, Select, StatusBadge, Table, Toolbar, useFetch } from '../../components/ui';
import { useEmployeeOptions } from '../../hooks';
import { LABELS, exportCsv, fmtDate, fullName, options } from '../../utils';

export default function Assignments() {
  const employees = useEmployeeOptions();
  const projects = useFetch(() => api.get('/projects'));
  const [f, setF] = useState({ status: 'ACTIVAS', employeeId: '', projectId: '' });
  const state = useFetch(() => api.get('/projects/assignments', f), [f.status, f.employeeId, f.projectId]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const exportRows = () =>
    exportCsv('asignaciones', [
      { label: 'Proyecto', value: (a) => `${a.project.code} - ${a.project.name}` },
      { label: 'Ubicación', value: (a) => a.project.location },
      { label: 'Trabajador', value: (a) => fullName(a.employee) },
      { label: 'Cargo', value: (a) => a.employee.position?.name },
      { label: 'Rol', key: 'role' },
      { label: 'Desde', value: (a) => fmtDate(a.startDate) },
      { label: 'Hasta', value: (a) => (a.endDate ? fmtDate(a.endDate) : '') },
      { label: 'Estado', value: (a) => LABELS.assignmentStatus[a.status] },
    ], state.data || []);

  return (
    <>
      <PageHeader title="Asignaciones de personal" subtitle="Seguimiento del personal asignado a proyectos" actions={<button className="btn" onClick={exportRows} disabled={!state.data?.length}>Exportar</button>} />
      <Toolbar>
        <Select value={f.status} onChange={set('status')} placeholder="Todos los estados" options={[{ value: 'ACTIVAS', label: 'Activas (asignado / en campo)' }, ...options(LABELS.assignmentStatus)]} />
        <Select value={f.projectId} onChange={set('projectId')} placeholder="Todos los proyectos" options={(projects.data || []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
        <Select value={f.employeeId} onChange={set('employeeId')} placeholder="Todo el personal" options={employees} />
      </Toolbar>
      <Card pad={false}>
        <Loader state={state}>
          {(list) => (
            <Table
              rows={list}
              empty="No hay asignaciones con esos filtros."
              columns={[
                { label: 'Trabajador', render: (a) => (<><Link to={`/personal/${a.employee.id}`} className="cell-main">{fullName(a.employee)}</Link><div className="cell-sub">{a.employee.position?.name || '—'}</div></>) },
                { label: 'Proyecto', render: (a) => (<><Link to={`/proyectos/${a.project.id}`}>{a.project.code} · {a.project.name}</Link><div className="cell-sub">{a.project.location || ''}</div></>) },
                { label: 'Rol', render: (a) => a.role || '—' },
                { label: 'Periodo', render: (a) => <span className="nowrap">{fmtDate(a.startDate)} – {a.endDate ? fmtDate(a.endDate) : '…'}</span> },
                { label: 'Asignación', render: (a) => <StatusBadge value={a.status} group="assignmentStatus" /> },
                { label: 'Proyecto', render: (a) => <StatusBadge value={a.project.status} group="projectStatus" /> },
              ]}
            />
          )}
        </Loader>
      </Card>
    </>
  );
}
