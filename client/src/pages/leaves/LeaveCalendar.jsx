import { useState } from 'react';
import { api } from '../../api';
import { Card, Loader, PageHeader, Select, useFetch } from '../../components/ui';
import { LABELS, WEEKDAYS, fullName, options, todayStr } from '../../utils';

const pad = (n) => String(n).padStart(2, '0');
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function LeaveCalendar() {
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [type, setType] = useState('');
  const state = useFetch(() => api.get('/leaves/calendar', { month, type }), [month, type]);
  const [y, m] = month.split('-').map(Number);

  const shift = (n) => {
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };

  // Semanas de lunes a domingo
  const first = new Date(y, m - 1, 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const lastRow = days.findLastIndex((d) => d.getMonth() === m - 1);
  const visible = days.slice(0, Math.ceil((lastRow + 1) / 7) * 7);
  const today = todayStr();

  return (
    <>
      <PageHeader
        title="Calendario de vacaciones y permisos"
        actions={
          <>
            <Select value={type} onChange={(e) => setType(e.target.value)} placeholder="Todos los tipos" options={options(LABELS.leaveType)} style={{ width: 'auto' }} />
            <button className="btn" onClick={() => shift(-1)}>‹</button>
            <button className="btn" onClick={() => setMonth(today.slice(0, 7))}>Hoy</button>
            <button className="btn" onClick={() => shift(1)}>›</button>
          </>
        }
      />
      <Card title={`${MONTHS[m - 1]} ${y}`} actions={
        <div className="legend">
          <span style={{ color: '#7a5af8' }}>Vacaciones</span>
          <span style={{ color: '#2e90fa' }}>Permiso</span>
          <span style={{ color: '#f04438' }}>Descanso médico</span>
          <span style={{ color: '#f79009' }}>Licencia</span>
          <span style={{ color: '#98a2b3' }}>Borde punteado = pendiente</span>
        </div>
      }>
        <Loader state={state}>
          {(leaves) => (
            <div className="calendar">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <div key={d} className="cal-head">{WEEKDAYS[d]}</div>
              ))}
              {visible.map((d) => {
                const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                const events = leaves.filter((l) => l.startDate <= ds && l.endDate >= ds);
                return (
                  <div key={ds} className={`cal-day ${d.getMonth() !== m - 1 ? 'other' : ''} ${ds === today ? 'today' : ''}`}>
                    <span className="cal-num">{d.getDate()}</span>
                    {events.slice(0, 4).map((l) => (
                      <span
                        key={l.id}
                        className={`cal-event ${l.type} ${l.status === 'PENDIENTE' ? 'pending' : ''}`}
                        title={`${fullName(l.employee)} · ${LABELS.leaveType[l.type]} (${LABELS.leaveStatus[l.status]}) ${l.startDate} → ${l.endDate}`}
                      >
                        {l.employee.firstName} {l.employee.lastName.split(' ')[0]}
                      </span>
                    ))}
                    {events.length > 4 && <span className="cal-more">+{events.length - 4} más</span>}
                  </div>
                );
              })}
            </div>
          )}
        </Loader>
      </Card>
    </>
  );
}
