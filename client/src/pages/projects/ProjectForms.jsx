import { api } from '../../api';
import { Field, FormModal, Select, useAction, useForm, useToast } from '../../components/ui';
import { useEmployeeOptions } from '../../hooks';
import { LABELS, options, toInputDate, todayStr } from '../../utils';

export function ProjectForm({ project, onClose, onSaved }) {
  const [f, set] = useForm({
    code: project?.code ?? '', name: project?.name ?? '', client: project?.client ?? '', location: project?.location ?? '',
    startDate: toInputDate(project?.startDate), endDate: toInputDate(project?.endDate), status: project?.status ?? 'PLANIFICADO', description: project?.description ?? '',
  });
  const [run, busy] = useAction();
  const submit = async () => {
    const r = await run(() => (project ? api.put(`/projects/${project.id}`, f) : api.post('/projects', f)), 'Proyecto guardado');
    if (r) onSaved(r);
  };
  return (
    <FormModal title={project ? 'Editar proyecto' : 'Nuevo proyecto'} onClose={onClose} onSubmit={submit} busy={busy}>
      <Field label="Código" required><input value={f.code} onChange={set('code')} required placeholder="PRY-004" /></Field>
      <Field label="Estado"><Select value={f.status} onChange={set('status')} options={options(LABELS.projectStatus)} allowEmpty={false} /></Field>
      <Field label="Nombre" required full><input value={f.name} onChange={set('name')} required /></Field>
      <Field label="Cliente"><input value={f.client} onChange={set('client')} /></Field>
      <Field label="Ubicación / sede"><input value={f.location} onChange={set('location')} /></Field>
      <Field label="Fecha de inicio"><input type="date" value={f.startDate} onChange={set('startDate')} /></Field>
      <Field label="Fecha de fin"><input type="date" value={f.endDate} onChange={set('endDate')} /></Field>
      <Field label="Descripción / alcance" full><textarea value={f.description} onChange={set('description')} /></Field>
      {project && ['FINALIZADO', 'CANCELADO'].includes(f.status) && project.status !== f.status && (
        <div className="warn-box full">Al cerrar el proyecto se finalizarán todas sus asignaciones activas.</div>
      )}
    </FormModal>
  );
}

export function AssignmentForm({ projectId, assignment, onClose, onSaved }) {
  const employees = useEmployeeOptions();
  const toast = useToast();
  const [f, set] = useForm({
    employeeId: assignment?.employeeId ?? '', role: assignment?.role ?? 'Técnico', startDate: toInputDate(assignment?.startDate) || todayStr(),
    endDate: toInputDate(assignment?.endDate), status: assignment?.status ?? 'ASIGNADO', notes: assignment?.notes ?? '',
  });
  const [run, busy] = useAction();

  const submit = async (force = false) => {
    if (assignment) {
      if (await run(() => api.put(`/projects/assignments/${assignment.id}`, f), 'Asignación actualizada')) onSaved();
      return;
    }
    try {
      await api.post(`/projects/${projectId}/assignments`, { ...f, force });
      toast('Técnico asignado');
      onSaved();
    } catch (err) {
      if (err.data?.conflict && window.confirm(`${err.message}.\n\n¿Asignarlo de todas formas?`)) return submit(true);
      if (!err.data?.conflict) toast(err.message, 'error');
    }
  };

  // Primero técnicos de campo, luego el resto
  const sorted = [...employees].sort((a, b) => Number(b.raw.isFieldTech) - Number(a.raw.isFieldTech));
  return (
    <FormModal title={assignment ? 'Editar asignación' : 'Asignar técnico'} onClose={onClose} onSubmit={() => submit(false)} busy={busy}>
      {!assignment && (
        <Field label="Trabajador" required full>
          <Select value={f.employeeId} onChange={set('employeeId')} required options={sorted.map((e) => ({ value: e.value, label: `${e.raw.isFieldTech ? '🔧 ' : ''}${e.label}` }))} />
        </Field>
      )}
      <Field label="Rol en el proyecto"><input value={f.role} onChange={set('role')} /></Field>
      <Field label="Estado"><Select value={f.status} onChange={set('status')} options={options(LABELS.assignmentStatus)} allowEmpty={false} /></Field>
      <Field label="Desde" required><input type="date" value={f.startDate} onChange={set('startDate')} required /></Field>
      <Field label="Hasta"><input type="date" value={f.endDate} onChange={set('endDate')} /></Field>
      <Field label="Observaciones" full><textarea value={f.notes} onChange={set('notes')} rows={2} /></Field>
    </FormModal>
  );
}
