import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';
import { Badge, Card, Loader, PageHeader, Stat, useFetch } from '../components/ui';
import { LABELS, fmtDate } from '../utils';

const C = { green: '#12b76a', amber: '#f79009', red: '#f04438', blue: '#2e90fa', violet: '#7a5af8', teal: '#15b79e', gray: '#98a2b3', indigo: '#444ce7' };
const SERIES = [C.blue, C.violet, C.teal, C.amber, C.indigo, C.green, C.red, C.gray];
const axis = { fontSize: 12, fill: '#697586' };

function daysTag(n) {
  if (n < 0) return <Badge tone="red">Vencido ({-n} d)</Badge>;
  if (n === 0) return <Badge tone="red">Vence hoy</Badge>;
  return <Badge tone={n <= 7 ? 'red' : 'amber'}>{n} días</Badge>;
}

export default function Dashboard() {
  const state = useFetch(() => api.get('/reports/dashboard'));
  const nav = useNavigate();

  return (
    <Loader state={state}>
      {(d) => (
        <>
          <PageHeader title="Dashboard" subtitle={`${d.companyName} · ${fmtDate(d.today)}`} />

          <div className="grid grid-stats" style={{ marginBottom: '1rem' }}>
            <Stat tone="primary" label="Personal activo" value={d.personnel.active} hint={`${d.personnel.fieldTechs} técnicos de campo`} onClick={() => nav('/personal')} />
            <Stat tone="green" label="Asistencia hoy" value={`${d.attendanceToday.rate}%`} hint={`${d.attendanceToday.present} de ${d.attendanceToday.expected} esperados`} onClick={() => nav('/asistencia')} />
            <Stat tone="amber" label="Tardanzas hoy" value={d.attendanceToday.late} hint={`${d.attendanceToday.notMarked} sin marcar`} onClick={() => nav('/asistencia')} />
            <Stat tone="violet" label="De vacaciones hoy" value={d.leaves.onVacationToday} hint={`${d.leaves.onLeaveToday} con permiso/licencia`} onClick={() => nav('/calendario')} />
            <Stat tone="amber" label="Solicitudes pendientes" value={d.leaves.pending} hint="Por aprobar" onClick={() => nav('/solicitudes')} />
            <Stat tone="red" label="Documentos por vencer" value={d.documents.expiring} hint={`${d.documents.expired} ya vencidos`} onClick={() => nav('/documentos')} />
          </div>

          <div className="grid grid-3" style={{ marginBottom: '1rem' }}>
            <Card title="Asistencia de los últimos 14 días" className="span-2" >
              <div className="chart-box">
                <ResponsiveContainer>
                  <BarChart data={d.attendanceTrend} barCategoryGap="25%">
                    <CartesianGrid vertical={false} stroke="#eef2f6" />
                    <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} width={30} />
                    <Tooltip cursor={{ fill: '#f2f4f7' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Puntual" stackId="a" fill={C.green} />
                    <Bar dataKey="Tardanza" stackId="a" fill={C.amber} />
                    <Bar dataKey="Falta" stackId="a" fill={C.red} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Personal activo por área">
              <div className="chart-box">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={d.personnel.byArea} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} stroke="#fff" strokeWidth={2}>
                      {d.personnel.byArea.map((_, i) => (
                        <Cell key={i} fill={SERIES[i % SERIES.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid grid-3" style={{ marginBottom: '1rem' }}>
            <Card title="Personal por proyecto" actions={<span className="muted small">{d.projects.active} proyectos en curso</span>}>
              {d.projects.byProject.length ? (
                <div className="chart-box">
                  <ResponsiveContainer>
                    <BarChart data={d.projects.byProject} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid horizontal={false} stroke="#eef2f6" />
                      <XAxis type="number" allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" tick={axis} width={130} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: '#f2f4f7' }} />
                      <Bar dataKey="value" name="Técnicos" fill={C.blue} radius={[0, 4, 4, 0]} barSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="muted">No hay asignaciones activas.</p>
              )}
            </Card>
            <Card title={`Días de permisos y vacaciones ${new Date().getFullYear()}`}>
              {d.leaves.byType.length ? (
                <div className="chart-box">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={d.leaves.byType} dataKey="value" nameKey="name" outerRadius={90} stroke="#fff" strokeWidth={2}>
                        {d.leaves.byType.map((_, i) => (
                          <Cell key={i} fill={[C.violet, C.blue, C.red, C.amber, C.gray][i % 5]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="muted">Sin solicitudes aprobadas este año.</p>
              )}
            </Card>
            <Card title={`Capacitaciones ${d.trainings.year}`} actions={<span className="muted small">{d.trainings.count} cursos · {d.trainings.hours} h</span>}>
              <div className="chart-box">
                <ResponsiveContainer>
                  <BarChart data={d.trainings.byMonth}>
                    <CartesianGrid vertical={false} stroke="#eef2f6" />
                    <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} width={30} />
                    <Tooltip cursor={{ fill: '#f2f4f7' }} />
                    <Bar dataKey="Participantes" fill={C.teal} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid grid-2">
            <Card title="Certificados y documentos por vencer" actions={<button className="btn btn-sm" onClick={() => nav('/documentos')}>Ver todos</button>}>
              {d.documents.list.length ? (
                <ul className="list-plain">
                  {d.documents.list.map((x) => (
                    <li key={x.id}>
                      <div>
                        <div className="cell-main">{x.name}</div>
                        <div className="cell-sub">
                          {x.employee} · {LABELS.docType[x.type]} · vence {fmtDate(x.expiryDate)}
                        </div>
                      </div>
                      {daysTag(x.daysLeft)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Ningún documento vence en los próximos {d.documents.alertDays} días.</p>
              )}
            </Card>
            <Card title="Próximas vacaciones (30 días)" actions={<button className="btn btn-sm" onClick={() => nav('/calendario')}>Calendario</button>}>
              {d.leaves.upcomingVacations.length ? (
                <ul className="list-plain">
                  {d.leaves.upcomingVacations.map((v) => (
                    <li key={v.id}>
                      <div>
                        <div className="cell-main">{v.name}</div>
                        <div className="cell-sub">
                          {fmtDate(v.startDate)} al {fmtDate(v.endDate)}
                        </div>
                      </div>
                      <Badge tone="violet">{v.days} días</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No hay vacaciones programadas.</p>
              )}
            </Card>
          </div>
        </>
      )}
    </Loader>
  );
}
