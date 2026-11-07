import { api } from '../../api';
import { useAuth } from '../../auth';
import { Field, FormModal, Select, useAction, useForm } from '../../components/ui';
import { useCatalogs } from '../../hooks';
import { LABELS, options, toInputDate, todayStr } from '../../utils';

const EMPTY = {
  code: '', docType: 'DNI', docNumber: '', firstName: '', lastName: '', birthDate: '', gender: '', maritalStatus: '',
  nationality: 'Peruana', address: '', phone: '', email: '', emergencyContactName: '', emergencyContactPhone: '',
  hireDate: todayStr(), endDate: '', status: 'ACTIVO', contractType: 'PLAZO_FIJO', salary: '', bankName: '', bankAccount: '',
  isFieldTech: false, areaId: '', positionId: '', scheduleId: '',
};

export default function EmployeeForm({ employee, onClose, onSaved }) {
  const { can } = useAuth();
  const { areas, positions, schedules } = useCatalogs();
  const initial = employee
    ? Object.fromEntries(
        Object.keys(EMPTY).map((k) => {
          const v = employee[k];
          if (['birthDate', 'hireDate', 'endDate'].includes(k)) return [k, toInputDate(v)];
          return [k, v ?? (typeof EMPTY[k] === 'boolean' ? false : '')];
        }),
      )
    : EMPTY;
  const [f, set] = useForm(initial);
  const [run, busy] = useAction();
  const showSalary = can('employees.salary');

  const posOptions = positions
    .filter((p) => !f.areaId || !p.areaId || String(p.areaId) === String(f.areaId))
    .map((p) => ({ value: p.id, label: p.name }));

  const submit = async () => {
    const saved = await run(
      () => (employee ? api.put(`/employees/${employee.id}`, f) : api.post('/employees', f)),
      employee ? 'Trabajador actualizado' : 'Trabajador registrado',
    );
    if (saved) onSaved(saved);
  };

  return (
    <FormModal title={employee ? 'Editar trabajador' : 'Nuevo trabajador'} onClose={onClose} onSubmit={submit} busy={busy} size="lg">
      <div className="section-title">Datos personales</div>
      <Field label="Nombres" required>
        <input value={f.firstName} onChange={set('firstName')} required />
      </Field>
      <Field label="Apellidos" required>
        <input value={f.lastName} onChange={set('lastName')} required />
      </Field>
      <Field label="Tipo de documento">
        <Select value={f.docType} onChange={set('docType')} allowEmpty={false} options={['DNI', 'CE', 'PASAPORTE', 'PTP'].map((v) => ({ value: v, label: v }))} />
      </Field>
      <Field label="Número de documento" required>
        <input value={f.docNumber} onChange={set('docNumber')} required />
      </Field>
      <Field label="Fecha de nacimiento">
        <input type="date" value={f.birthDate} onChange={set('birthDate')} />
      </Field>
      <Field label="Sexo">
        <Select value={f.gender} onChange={set('gender')} options={[{ value: 'M', label: 'Masculino' }, { value: 'F', label: 'Femenino' }]} />
      </Field>
      <Field label="Estado civil">
        <Select value={f.maritalStatus} onChange={set('maritalStatus')} options={['Soltero(a)', 'Casado(a)', 'Conviviente', 'Divorciado(a)', 'Viudo(a)'].map((v) => ({ value: v, label: v }))} />
      </Field>
      <Field label="Nacionalidad">
        <input value={f.nationality} onChange={set('nationality')} />
      </Field>
      <Field label="Dirección" full>
        <input value={f.address} onChange={set('address')} />
      </Field>
      <Field label="Teléfono">
        <input value={f.phone} onChange={set('phone')} />
      </Field>
      <Field label="Correo" hint="Se usa para enviar alertas de vencimiento y avisos de solicitudes.">
        <input type="email" value={f.email} onChange={set('email')} />
      </Field>
      <Field label="Contacto de emergencia">
        <input value={f.emergencyContactName} onChange={set('emergencyContactName')} />
      </Field>
      <Field label="Teléfono de emergencia">
        <input value={f.emergencyContactPhone} onChange={set('emergencyContactPhone')} />
      </Field>

      <div className="section-title">Datos laborales</div>
      <Field label="Código" hint={employee ? undefined : 'Déjelo vacío para generarlo automáticamente'}>
        <input value={f.code} onChange={set('code')} />
      </Field>
      <Field label="Estado">
        <Select value={f.status} onChange={set('status')} allowEmpty={false} options={options(LABELS.employeeStatus)} />
      </Field>
      <Field label="Área">
        <Select value={f.areaId} onChange={set('areaId')} options={areas.map((a) => ({ value: a.id, label: a.name }))} />
      </Field>
      <Field label="Cargo">
        <Select value={f.positionId} onChange={set('positionId')} options={posOptions} />
      </Field>
      <Field label="Fecha de ingreso" required>
        <input type="date" value={f.hireDate} onChange={set('hireDate')} required />
      </Field>
      <Field label="Fecha de cese">
        <input type="date" value={f.endDate} onChange={set('endDate')} />
      </Field>
      <Field label="Tipo de contrato">
        <Select value={f.contractType} onChange={set('contractType')} options={options(LABELS.contractType)} />
      </Field>
      <Field label="Horario">
        <Select value={f.scheduleId} onChange={set('scheduleId')} options={schedules.map((s) => ({ value: s.id, label: `${s.name} (${s.startTime}–${s.endTime})` }))} />
      </Field>
      <label className="check full">
        <input type="checkbox" checked={Boolean(f.isFieldTech)} onChange={set('isFieldTech')} />
        Es técnico de campo (puede ser asignado a proyectos y marcar asistencia en campo con ubicación)
      </label>
      {showSalary && (
        <>
          <div className="section-title">Remuneración</div>
          <Field label="Sueldo (S/)">
            <input type="number" step="0.01" min="0" value={f.salary} onChange={set('salary')} />
          </Field>
          <Field label="Banco">
            <input value={f.bankName} onChange={set('bankName')} />
          </Field>
          <Field label="Cuenta bancaria / CCI" full>
            <input value={f.bankAccount} onChange={set('bankAccount')} />
          </Field>
        </>
      )}
      {f.status === 'CESADO' && employee?.status !== 'CESADO' && (
        <div className="warn-box full">Al marcar como cesado, su usuario de acceso (si tiene) se desactivará.</div>
      )}
    </FormModal>
  );
}
