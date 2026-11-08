import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Badge, Card, Loader, PageHeader, Select, StatusBadge, Table, Toolbar, useFetch } from '../../components/ui';
import { useCatalogs } from '../../hooks';
import { LABELS, exportCsv, fmtDate, fullName, options } from '../../utils';
import EmployeeForm from './EmployeeForm';

export default function EmployeeList() {
  const { can } = useAuth();
  const nav = useNavigate();
  const { areas } = useCatalogs();
  const [filters, setFilters] = useState({ q: '', status: 'ACTIVO', areaId: '', fieldTech: '' });
  const state = useFetch(() => api.get('/employees', filters), [JSON.stringify(filters)]);
  const [creating, setCreating] = useState(false);
  const setF = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  const exportList = () =>
    exportCsv('trabajadores', [
      { label: 'Código', key: 'code' },
      { label: 'Documento', value: (e) => `${e.docType} ${e.docNumber}` },
      { label: 'Apellidos', key: 'lastName' },
      { label: 'Nombres', key: 'firstName' },
      { label: 'Área', value: (e) => e.area?.name },
      { label: 'Cargo', value: (e) => e.position?.name },
      { label: 'Estado', value: (e) => LABELS.employeeStatus[e.status] },
      { label: 'Contrato', value: (e) => LABELS.contractType[e.contractType] },
      { label: 'Ingreso', value: (e) => fmtDate(e.hireDate) },
      { label: 'Técnico de campo', value: (e) => (e.isFieldTech ? 'Sí' : 'No') },
      { label: 'Teléfono', key: 'phone' },
      { label: 'Correo', key: 'email' },
    ], state.data || []);

  return (
    <>
      <PageHeader
        title="Trabajadores"
        subtitle="Registro del personal, datos personales y laborales"
        actions={
          <>
            <button className="btn" onClick={exportList} disabled={!state.data?.length}>
              Exportar
            </button>
            {can('employees.edit') && (
              <button className="btn btn-primary" onClick={() => setCreating(true)}>
                + Nuevo trabajador
              </button>
            )}
          </>
        }
      />
      <Toolbar>
        <input type="search" placeholder="Buscar por nombre, DNI, código o correo…" value={filters.q} onChange={setF('q')} />
        <Select value={filters.status} onChange={setF('status')} placeholder="Todos los estados" options={options(LABELS.employeeStatus)} />
        <Select value={filters.areaId} onChange={setF('areaId')} placeholder="Todas las áreas" options={areas.map((a) => ({ value: a.id, label: a.name }))} />
        <Select value={filters.fieldTech} onChange={setF('fieldTech')} placeholder="Todo el personal" options={[{ value: 'true', label: 'Solo técnicos de campo' }]} />
      </Toolbar>
      <Card pad={false}>
        <Loader state={state}>
          {(list) => (
            <Table
              rows={list}
              onRowClick={(e) => nav(`/personal/${e.id}`)}
              empty="No se encontraron trabajadores."
              columns={[
                {
                  label: 'Trabajador',
                  render: (e) => (
                    <>
                      <div className="cell-main">{fullName(e)}</div>
                      <div className="cell-sub">
                        {e.code} · {e.docType} {e.docNumber}
                      </div>
                    </>
                  ),
                },
                { label: 'Área', render: (e) => e.area?.name || '—' },
                { label: 'Cargo', render: (e) => e.position?.name || '—' },
                { label: 'Ingreso', render: (e) => fmtDate(e.hireDate), className: 'nowrap' },
                { label: 'Tipo', render: (e) => (e.isFieldTech ? <Badge tone="blue">Campo</Badge> : <Badge>Oficina</Badge>) },
                { label: 'Estado', render: (e) => <StatusBadge value={e.status} group="employeeStatus" /> },
              ]}
            />
          )}
        </Loader>
      </Card>
      {creating && (
        <EmployeeForm
          onClose={() => setCreating(false)}
          onSaved={(e) => {
            setCreating(false);
            nav(`/personal/${e.id}`);
          }}
        />
      )}
    </>
  );
}
