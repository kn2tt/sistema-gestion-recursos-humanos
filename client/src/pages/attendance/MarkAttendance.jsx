import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Card, ErrorBox, Field, Loader, PageHeader, Select, StatusBadge, Table, useAction, useFetch } from '../../components/ui';
import { WEEKDAYS, fmtDate, fmtMinutes, fmtTime, todayStr } from '../../utils';

/** Obtiene la ubicación del navegador (si el usuario la permite). */
function getPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      <div className="clock-time">{now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
      <div className="clock-date">{now.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
    </>
  );
}

export default function MarkAttendance() {
  const state = useFetch(() => api.get('/attendance/today'));
  const month = todayStr().slice(0, 7);
  const history = useFetch(() => api.get('/attendance', { from: `${month}-01`, to: todayStr() }));
  const [projectId, setProjectId] = useState('');
  const [notes, setNotes] = useState('');
  const [run, busy] = useAction();

  const mark = async (kind) => {
    const pos = await getPosition();
    const body = { ...pos, notes, projectId: kind === 'check-in' ? projectId : undefined };
    const r = await run(() => api.post(`/attendance/${kind}`, body), kind === 'check-in' ? 'Entrada registrada' : 'Salida registrada');
    if (r) {
      setNotes('');
      state.reload();
      history.reload();
    }
  };

  return (
    <>
      <PageHeader title="Marcar asistencia" subtitle="Registre su entrada y salida" />
      <Loader state={state}>
        {(d) => {
          const r = d.record;
          const s = d.employee.schedule;
          return (
            <div className="grid grid-2">
              <Card>
                <div className="clock-card">
                  <LiveClock />
                  {d.leave && <div className="info-box" style={{ marginBottom: '1rem' }}>Hoy tiene una solicitud aprobada de {d.leave.type.toLowerCase().replace('_', ' ')}.</div>}
                  {!d.workDay && !r && <div className="warn-box" style={{ marginBottom: '1rem' }}>Hoy no es un día laborable según su horario.</div>}

                  {d.employee.isFieldTech && !r?.checkIn && (
                    <div style={{ maxWidth: 360, margin: '0 auto 1rem', textAlign: 'left' }}>
                      <Field label="Proyecto donde trabaja hoy (técnicos de campo)">
                        <Select
                          value={projectId}
                          onChange={(e) => setProjectId(e.target.value)}
                          placeholder="Oficina / sin proyecto"
                          options={d.assignments.map((a) => ({ value: a.project.id, label: `${a.project.code} · ${a.project.name}` }))}
                        />
                      </Field>
                    </div>
                  )}
                  {!r?.checkOut && (
                    <div style={{ maxWidth: 360, margin: '0 auto 1rem', textAlign: 'left' }}>
                      <Field label="Observación (opcional)">
                        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. salida a visita técnica" />
                      </Field>
                    </div>
                  )}

                  <div className="mark-buttons">
                    {!r?.checkIn && (
                      <button className="btn btn-success btn-lg" disabled={busy} onClick={() => mark('check-in')}>
                        Marcar entrada
                      </button>
                    )}
                    {r?.checkIn && !r.checkOut && (
                      <button className="btn btn-primary btn-lg" disabled={busy} onClick={() => mark('check-out')}>
                        Marcar salida
                      </button>
                    )}
                    {r?.checkOut && <div className="info-box">Jornada completa registrada. ¡Hasta mañana!</div>}
                  </div>
                  <p className="muted small" style={{ marginTop: '0.75rem' }}>
                    Se registra la ubicación del dispositivo si usted lo permite.
                  </p>

                  <div className="mark-summary">
                    <div><small>Horario</small>{s ? `${s.startTime} – ${s.endTime}` : 'Sin horario'}</div>
                    <div><small>Entrada</small>{fmtTime(r?.checkIn)}</div>
                    <div><small>Salida</small>{fmtTime(r?.checkOut)}</div>
                    <div><small>Estado</small>{r ? <StatusBadge value={r.status} group="attendance" /> : '—'}</div>
                  </div>
                  {r?.lateMinutes > 0 && <p className="muted small" style={{ marginTop: '0.5rem' }}>Tardanza de {r.lateMinutes} minutos.</p>}
                  {s && <p className="muted small">Días laborables: {s.workDays.split(',').map((x) => WEEKDAYS[x]).join(', ')} · tolerancia {s.toleranceMin} min</p>}
                </div>
              </Card>
              <Card pad={false} title="Mis marcaciones del mes">
                <Loader state={history}>
                  {(list) => (
                    <Table
                      rows={list}
                      empty="Aún no hay marcaciones este mes."
                      columns={[
                        { label: 'Fecha', render: (a) => fmtDate(a.date) },
                        { label: 'Entrada', render: (a) => fmtTime(a.checkIn) },
                        { label: 'Salida', render: (a) => fmtTime(a.checkOut) },
                        { label: 'Horas', render: (a) => fmtMinutes(a.workedMinutes) },
                        { label: 'Estado', render: (a) => <StatusBadge value={a.status} group="attendance" /> },
                      ]}
                    />
                  )}
                </Loader>
              </Card>
            </div>
          );
        }}
      </Loader>
      {state.error?.status === 400 && <ErrorBox error={{ message: 'Pida al administrador que vincule su usuario con su ficha de trabajador.' }} />}
    </>
  );
}
