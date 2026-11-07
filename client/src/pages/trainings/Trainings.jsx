import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Card, Field, FormModal, Loader, PageHeader, Select, Table, Toolbar, useAction, useFetch, useForm } from '../../components/ui';
import { LABELS, fmtDate, options, toInputDate } from '../../utils';

export function TrainingForm({ training, onClose, onSaved }) {
  const [f, set] = useForm({
    name: training?.name ?? '', provider: training?.provider ?? '', modality: training?.modality ?? 'PRESENCIAL',
    startDate: toInputDate(training?.startDate), endDate: toInputDate(training?.endDate), hours: training?.hours ?? '',
    validityDays: training?.validityDays ?? '', description: training?.description ?? '',
  });
  const [run, busy] = useAction();
  const submit = async () => {
    const r = await run(() => (training ? api.put(`/trainings/${training.id}`, f) : api.post('/trainings', f)), 'Capacitación guardada');
    if (r) onSaved(r);
  };
  return (
    <FormModal title={training ? 'Editar capacitación' : 'Nueva capacitación'} onClose={onClose} onSubmit={submit} busy={busy}>
      <Field label="Nombre" required full><input value={f.name} onChange={set('name')} required /></Field>
      <Field label="Proveedor / institución"><input value={f.provider} onChange={set('provider')} /></Field>
      <Field label="Modalidad"><Select value={f.modality} onChange={set('modality')} options={options(LABELS.modality)} /></Field>
      <Field label="Fecha de inicio" required><input type="date" value={f.startDate} onChange={set('startDate')} required /></Field>
      <Field label="Fecha de fin"><input type="date" value={f.endDate} onChange={set('endDate')} /></Field>
      <Field label="Horas lectivas"><input type="number" min="0" step="0.5" value={f.hours} onChange={set('hours')} /></Field>
      <Field label="Vigencia del certificado (días)" hint="Ej. 365. Se usa para calcular el vencimiento de los certificados."><input type="number" min="0" value={f.validityDays} onChange={set('validityDays')} /></Field>
      <Field label="Descripción / temario" full><textarea value={f.description} onChange={set('description')} /></Field>
    </FormModal>
  );
}

export default function Trainings() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const state = useFetch(() => api.get('/trainings', { q, year }), [q, year]);
  const [creating, setCreating] = useState(false);
  const years = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() + 1 - i));

  return (
    <>
      <PageHeader title="Capacitaciones" subtitle="Registro de cursos, participantes y certificados" actions={can('trainings.edit') && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Nueva capacitación</button>} />
      <Toolbar>
        <input type="search" placeholder="Buscar capacitación o proveedor…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={year} onChange={(e) => setYear(e.target.value)} placeholder="Todos los años" options={years.map((y) => ({ value: y, label: y }))} />
      </Toolbar>
      <Card pad={false}>
        <Loader state={state}>
          {(list) => (
            <Table
              rows={list}
              onRowClick={(t) => nav(`/capacitaciones/${t.id}`)}
              empty="No hay capacitaciones registradas."
              columns={[
                { label: 'Capacitación', render: (t) => (<><div className="cell-main">{t.name}</div><div className="cell-sub">{t.provider || '—'}</div></>) },
                { label: 'Modalidad', render: (t) => LABELS.modality[t.modality] || '—' },
                { label: 'Fecha', render: (t) => <span className="nowrap">{fmtDate(t.startDate)}{t.endDate ? ` – ${fmtDate(t.endDate)}` : ''}</span> },
                { label: 'Horas', render: (t) => t.hours ?? '—' },
                { label: 'Vigencia', render: (t) => (t.validityDays ? `${t.validityDays} días` : '—') },
                { label: 'Participantes', render: (t) => t._count.participants },
                { label: 'Certificados', render: (t) => t._count.documents },
              ]}
            />
          )}
        </Loader>
      </Card>
      {creating && <TrainingForm onClose={() => setCreating(false)} onSaved={(t) => nav(`/capacitaciones/${t.id}`)} />}
    </>
  );
}
