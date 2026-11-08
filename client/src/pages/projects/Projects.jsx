import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Card, Loader, PageHeader, Select, StatusBadge, Table, Toolbar, useFetch } from '../../components/ui';
import { LABELS, fmtDate, options } from '../../utils';
import { ProjectForm } from './ProjectForms';

export default function Projects() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [filters, setFilters] = useState({ q: '', status: '' });
  const state = useFetch(() => api.get('/projects', filters), [filters.q, filters.status]);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Proyectos"
        subtitle="Registro de proyectos y personal asignado"
        actions={can('projects.edit') && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Nuevo proyecto</button>}
      />
      <Toolbar>
        <input type="search" placeholder="Buscar por código, nombre o cliente…" value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} />
        <Select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} placeholder="Todos los estados" options={options(LABELS.projectStatus)} />
      </Toolbar>
      <Card pad={false}>
        <Loader state={state}>
          {(list) => (
            <Table
              rows={list}
              onRowClick={(p) => nav(`/proyectos/${p.id}`)}
              empty="No hay proyectos registrados."
              columns={[
                { label: 'Proyecto', render: (p) => (<><div className="cell-main">{p.name}</div><div className="cell-sub">{p.code}</div></>) },
                { label: 'Cliente', render: (p) => p.client || '—' },
                { label: 'Ubicación', render: (p) => p.location || '—' },
                { label: 'Periodo', render: (p) => <span className="nowrap">{fmtDate(p.startDate)} – {p.endDate ? fmtDate(p.endDate) : '…'}</span> },
                { label: 'Personal activo', render: (p) => p.activeStaff },
                { label: 'Estado', render: (p) => <StatusBadge value={p.status} group="projectStatus" /> },
              ]}
            />
          )}
        </Loader>
      </Card>
      {creating && <ProjectForm onClose={() => setCreating(false)} onSaved={(p) => nav(`/proyectos/${p.id}`)} />}
    </>
  );
}
