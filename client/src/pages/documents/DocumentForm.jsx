import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Field, FileInput, FormModal, Select, useAction, useForm } from '../../components/ui';
import { useEmployeeOptions } from '../../hooks';
import { LABELS, options, toInputDate } from '../../utils';

/** Alta/edición de un documento (certificado, contrato...) con archivo adjunto. */
export default function DocumentForm({ doc, employeeId, trainingId, defaultType = 'CERTIFICADO', onClose, onSaved }) {
  const employees = useEmployeeOptions();
  const [trainings, setTrainings] = useState([]);
  const [f, set] = useForm({
    employeeId: doc?.employeeId ?? employeeId ?? '',
    type: doc?.type ?? defaultType,
    name: doc?.name ?? '',
    issuer: doc?.issuer ?? '',
    issueDate: toInputDate(doc?.issueDate),
    expiryDate: toInputDate(doc?.expiryDate),
    trainingId: doc?.trainingId ?? trainingId ?? '',
    notes: doc?.notes ?? '',
  });
  const [file, setFile] = useState(null);
  const [run, busy] = useAction();

  useEffect(() => {
    api.get('/trainings').then(setTrainings).catch(() => setTrainings([]));
  }, []);

  const submit = async () => {
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => fd.append(k, v ?? ''));
    if (file) fd.append('file', file);
    const saved = await run(
      () => (doc ? api.put(`/documents/${doc.id}`, fd) : api.post('/documents', fd)),
      doc ? 'Documento actualizado' : 'Documento registrado',
    );
    if (saved) onSaved(saved);
  };

  return (
    <FormModal title={doc ? 'Editar documento' : 'Registrar documento'} onClose={onClose} onSubmit={submit} busy={busy}>
      {!employeeId && (
        <Field label="Trabajador" required full>
          <Select value={f.employeeId} onChange={set('employeeId')} options={employees} required disabled={Boolean(doc)} />
        </Field>
      )}
      <Field label="Tipo" required>
        <Select value={f.type} onChange={set('type')} options={options(LABELS.docType)} allowEmpty={false} />
      </Field>
      <Field label="Nombre del documento" required>
        <input value={f.name} onChange={set('name')} required placeholder="Ej. Certificado de trabajos en altura" />
      </Field>
      <Field label="Emisor / entidad">
        <input value={f.issuer} onChange={set('issuer')} />
      </Field>
      {f.type === 'CERTIFICADO' && (
        <Field label="Capacitación relacionada" hint="Si la capacitación tiene vigencia, el vencimiento se calcula solo.">
          <Select value={f.trainingId} onChange={set('trainingId')} placeholder="Ninguna" options={trainings.map((t) => ({ value: t.id, label: t.name }))} />
        </Field>
      )}
      <Field label="Fecha de emisión / inicio">
        <input type="date" value={f.issueDate} onChange={set('issueDate')} />
      </Field>
      <Field label="Fecha de vencimiento" hint="Se enviará una alerta por correo antes de esta fecha.">
        <input type="date" value={f.expiryDate} onChange={set('expiryDate')} />
      </Field>
      <Field label={doc?.fileName ? `Reemplazar archivo (actual: ${doc.fileName})` : 'Archivo (PDF, Word o imagen, máx. 10 MB)'} full>
        <FileInput onChange={setFile} />
      </Field>
      <Field label="Observaciones" full>
        <textarea value={f.notes} onChange={set('notes')} rows={2} />
      </Field>
    </FormModal>
  );
}
