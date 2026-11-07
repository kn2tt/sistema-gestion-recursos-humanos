import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Badge, Card, Field, Loader, PageHeader, StatusBadge, Table, Toolbar, useFetch } from '../../components/ui';
import { fmtTime, todayStr } from '../../utils';

export default function FieldTechs() {
  const [date, setDate] = useState(todayStr());
  const state = useFetch(() => api.get('/attendance/field', { date }), [date]);

  return (
    <>
      <PageHeader title="Técnicos de campo" subtitle="Seguimiento diario: marcación, proyecto y ubicación" />
      <Toolbar>
        <Field label="Fecha"><input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} /></Field>
        <button className="btn" onClick={state.reload}>Actualizar</button>
      </Toolbar>
      <Loader state={state}>
        {(list) => {
          const present = list.filter((t) => t.attendance?.checkIn).length;
          const inField = list.filter((t) => t.attendance?.isField).length;
          return (
            <>
              <div className="grid grid-stats" style={{ marginBottom: '1rem' }}>
                <div className="stat stat-primary"><span className="stat-label">Técnicos activos</span><span className="stat-value">{list.length}</span></div>
                <div className="stat stat-green"><span className="stat-label">Marcaron entrada</span><span className="stat-value">{present}</span></div>
                <div className="stat stat-violet"><span className="stat-label">Trabajando en campo</span><span className="stat-value">{inField}</span></div>
                <div className="stat stat-red"><span className="stat-label">Sin marcar</span><span className="stat-value">{list.length - present}</span></div>
              </div>
              <Card pad={false}>
                <Table
                  rows={list}
                  empty="No hay técnicos de campo registrados. Marque la opción 'técnico de campo' en la ficha del trabajador."
                  columns={[
                    { label: 'Técnico', render: (t) => (<><Link to={`/personal/${t.id}`} className="cell-main">{t.name}</Link><div className="cell-sub">{t.code} · {t.position || '—'} · {t.phone || 'sin teléfono'}</div></>) },
                    { label: 'Asignaciones activas', render: (t) => (t.assignments.length ? t.assignments.map((a) => <div key={a.id}><Link to={`/proyectos/${a.project.id}`}>{a.project.code}</Link> <span className="cell-sub">{a.project.location}</span> <StatusBadge value={a.status} group="assignmentStatus" /></div>) : <span className="muted">Sin asignar</span>) },
                    { label: 'Entrada', render: (t) => fmtTime(t.attendance?.checkIn) },
                    { label: 'Salida', render: (t) => fmtTime(t.attendance?.checkOut) },
                    { label: 'Estado', render: (t) => (t.attendance ? <StatusBadge value={t.attendance.status} group="attendance" /> : <Badge>Sin marcar</Badge>) },
                    { label: 'Proyecto hoy', render: (t) => t.attendance?.project ? `${t.attendance.project.code} · ${t.attendance.project.name}` : t.attendance?.checkIn ? 'Oficina' : '—' },
                    { label: 'Ubicación', render: (t) => t.attendance?.checkInLat ? <a href={`https://www.google.com/maps?q=${t.attendance.checkInLat},${t.attendance.checkInLng}`} target="_blank" rel="noreferrer">Ver mapa</a> : '—' },
                  ]}
                />
              </Card>
            </>
          );
        }}
      </Loader>
    </>
  );
}
