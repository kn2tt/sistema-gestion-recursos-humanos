import { useState } from 'react';
import { api } from '../api';
import { Card, Field, Loader, PageHeader, Select, Table, Tabs, Toolbar, useFetch } from '../components/ui';
import { useCatalogs } from '../hooks';
import { LABELS, exportCsv, fmtDate, options, todayStr } from '../utils';

// Definición de cada reporte: endpoint, filtros y columnas (tabla + CSV).
const REPORTS = {
  asistencia: {
    label: 'Asistencia',
    url: '/reports/attendance',
    filters: ['from', 'to', 'areaId', 'fieldOnly'],
    columns: [
      { label: 'Código', key: 'code' },
      { label: 'Trabajador', key: 'name' },
      { label: 'Área', key: 'area' },
      { label: 'Puntual', key: 'puntual' },
      { label: 'Tardanzas', key: 'tardanza' },
      { label: 'Min. tardanza', key: 'minutosTardanza' },
      { label: 'Faltas', key: 'falta' },
      { label: 'Justificadas', key: 'justificado' },
      { label: 'Vacaciones', key: 'vacaciones' },
      { label: 'Permisos', key: 'permiso' },
      { label: 'Días en campo', key: 'diasCampo' },
      { label: 'Horas trabajadas', key: 'horasTrabajadas' },
    ],
  },
  personal: {
    label: 'Personal activo',
    url: '/reports/personnel',
    filters: ['status', 'areaId'],
    defaults: { status: 'ACTIVO' },
    columns: [
      { label: 'Código', key: 'code' },
      { label: 'Documento', key: 'docNumber' },
      { label: 'Trabajador', key: 'name' },
      { label: 'Área', key: 'area' },
      { label: 'Cargo', key: 'position' },
      { label: 'Estado', value: (r) => LABELS.employeeStatus[r.status] },
      { label: 'Contrato', value: (r) => LABELS.contractType[r.contractType] || '' },
      { label: 'Ingreso', value: (r) => fmtDate(r.hireDate) },
      { label: 'Campo', key: 'fieldTech' },
      { label: 'Proyectos', key: 'projects' },
      { label: 'Teléfono', key: 'phone' },
      { label: 'Correo', key: 'email' },
    ],
  },
  vacaciones: {
    label: 'Vacaciones y permisos',
    url: '/reports/leaves',
    filters: ['year'],
    columns: [
      { label: 'Código', key: 'code' },
      { label: 'Trabajador', key: 'name' },
      { label: 'Área', key: 'area' },
      { label: 'Derecho', key: 'vacacionesDerecho' },
      { label: 'Gozadas', key: 'vacacionesGozadas' },
      { label: 'Pendientes', key: 'vacacionesPendientes' },
      { label: 'Saldo', key: 'vacacionesSaldo' },
      { label: 'Días permiso', key: 'permisos' },
      { label: 'Descanso médico', key: 'descansoMedico' },
      { label: 'Licencias', key: 'licencias' },
      { label: 'Rechazadas', key: 'rechazadas' },
    ],
  },
  capacitaciones: {
    label: 'Capacitaciones',
    url: '/reports/trainings',
    filters: ['year'],
    columns: [
      { label: 'Capacitación', key: 'name' },
      { label: 'Proveedor', key: 'provider' },
      { label: 'Modalidad', value: (r) => LABELS.modality[r.modality] || '' },
      { label: 'Fecha', value: (r) => fmtDate(r.startDate) },
      { label: 'Horas', key: 'hours' },
      { label: 'Participantes', key: 'participants' },
      { label: 'Aprobados', key: 'approved' },
      { label: 'Desaprobados', key: 'failed' },
      { label: 'Horas-hombre', key: 'totalHours' },
    ],
  },
  proyectos: {
    label: 'Personal por proyecto',
    url: '/reports/projects',
    filters: ['projectStatus'],
    columns: [
      { label: 'Proyecto', key: 'project' },
      { label: 'Estado proyecto', value: (r) => LABELS.projectStatus[r.projectStatus] },
      { label: 'Trabajador', key: 'employee' },
      { label: 'Cargo', key: 'position' },
      { label: 'Rol', key: 'role' },
      { label: 'Desde', value: (r) => fmtDate(r.startDate) },
      { label: 'Hasta', value: (r) => fmtDate(r.endDate) },
      { label: 'Estado', value: (r) => LABELS.assignmentStatus[r.status] },
    ],
  },
  documentos: {
    label: 'Vencimiento de documentos',
    url: '/reports/documents',
    filters: [],
    columns: [
      { label: 'Trabajador', key: 'employee' },
      { label: 'DNI', key: 'docNumber' },
      { label: 'Tipo', value: (r) => LABELS.docType[r.type] },
      { label: 'Documento', key: 'name' },
      { label: 'Emisor', key: 'issuer' },
      { label: 'Vencimiento', value: (r) => fmtDate(r.expiryDate) },
      { label: 'Días restantes', key: 'daysLeft' },
      { label: 'Estado', key: 'status' },
    ],
  },
};

export default function Reports() {
  const [tab, setTab] = useState('asistencia');
  return (
    <>
      <PageHeader title="Reportes" subtitle="Consulte y exporte a Excel (CSV) la información del personal" />
      <Tabs value={tab} onChange={setTab} tabs={Object.entries(REPORTS).map(([value, r]) => ({ value, label: r.label }))} />
      <Report key={tab} id={tab} def={REPORTS[tab]} />
    </>
  );
}

function Report({ id, def }) {
  const { areas } = useCatalogs();
  const [f, setF] = useState({ from: `${todayStr().slice(0, 7)}-01`, to: todayStr(), year: String(new Date().getFullYear()), areaId: '', status: '', fieldOnly: '', projectStatus: '', ...def.defaults });
  const params = Object.fromEntries(def.filters.map((k) => [k === 'projectStatus' ? 'status' : k, f[k]]));
  const state = useFetch(() => api.get(def.url, params), [id, JSON.stringify(params)]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const has = (k) => def.filters.includes(k);
  const years = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i));
  const rows = state.data?.rows || [];

  return (
    <>
      <Toolbar>
        {has('from') && <Field label="Desde"><input type="date" value={f.from} onChange={set('from')} /></Field>}
        {has('to') && <Field label="Hasta"><input type="date" value={f.to} onChange={set('to')} /></Field>}
        {has('year') && <Field label="Año"><Select value={f.year} onChange={set('year')} allowEmpty={false} options={years.map((y) => ({ value: y, label: y }))} /></Field>}
        {has('areaId') && <Field label="Área"><Select value={f.areaId} onChange={set('areaId')} placeholder="Todas" options={areas.map((a) => ({ value: a.id, label: a.name }))} /></Field>}
        {has('status') && <Field label="Estado"><Select value={f.status} onChange={set('status')} placeholder="Todos" options={options(LABELS.employeeStatus)} /></Field>}
        {has('projectStatus') && <Field label="Estado del proyecto"><Select value={f.projectStatus} onChange={set('projectStatus')} placeholder="Todos" options={options(LABELS.projectStatus)} /></Field>}
        {has('fieldOnly') && <Field label="Personal"><Select value={f.fieldOnly} onChange={set('fieldOnly')} placeholder="Todos" options={[{ value: 'true', label: 'Solo técnicos de campo' }]} /></Field>}
        <div className="grow" />
        <button className="btn btn-primary" disabled={!rows.length} onClick={() => exportCsv(`reporte_${id}_${todayStr()}`, def.columns, rows)}>
          Exportar a Excel (CSV)
        </button>
      </Toolbar>
      <Card pad={false} title={`${def.label} · ${rows.length} fila(s)`}>
        <Loader state={state}>
          {() => (
            <Table
              rows={rows}
              rowKey="__i"
              empty="Sin datos para los filtros seleccionados."
              columns={def.columns.map((c) => ({ label: c.label, render: (r) => (c.value ? c.value(r) : r[c.key]) ?? '—' }))}
            />
          )}
        </Loader>
      </Card>
    </>
  );
}
