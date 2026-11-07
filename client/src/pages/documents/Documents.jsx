import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadFile } from '../../api';
import { useAuth } from '../../auth';
import { Badge, Card, Loader, Modal, PageHeader, Select, Table, Tabs, Toolbar, useAction, useFetch, useToast } from '../../components/ui';
import { LABELS, exportCsv, fmtDate, fmtDateTime, fullName, options } from '../../utils';
import DocumentForm from './DocumentForm';

function expiryBadge(d) {
  if (d.expiryStatus === 'SIN_VENCIMIENTO') return <Badge>Sin vencimiento</Badge>;
  if (d.expiryStatus === 'VENCIDO') return <Badge tone="red">Vencido hace {-d.daysLeft} d</Badge>;
  if (d.expiryStatus === 'POR_VENCER') return <Badge tone={d.daysLeft <= 7 ? 'red' : 'amber'}>{d.daysLeft === 0 ? 'Vence hoy' : `Vence en ${d.daysLeft} d`}</Badge>;
  return <Badge tone="green">Vigente</Badge>;
}

export default function Documents() {
  const { can } = useAuth();
  const all = can('documents.view');
  const edit = can('documents.edit');
  const [expiry, setExpiry] = useState(all ? 'POR_VENCER' : '');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const state = useFetch(() => api.get('/documents', { expiry, type, q }), [expiry, type, q]);
  const [form, setForm] = useState(null);
  const [alerts, setAlerts] = useState(false);
  const [run] = useAction();
  const toast = useToast();

  const exportRows = () =>
    exportCsv('documentos', [
      { label: 'Trabajador', value: (d) => fullName(d.employee) },
      { label: 'Documento identidad', value: (d) => d.employee.docNumber },
      { label: 'Tipo', value: (d) => LABELS.docType[d.type] },
      { label: 'Documento', key: 'name' },
      { label: 'Emisor', key: 'issuer' },
      { label: 'Emisión', value: (d) => fmtDate(d.issueDate) },
      { label: 'Vencimiento', value: (d) => fmtDate(d.expiryDate) },
      { label: 'Días restantes', key: 'daysLeft' },
      { label: 'Estado', value: (d) => LABELS.expiry[d.expiryStatus] },
    ], state.data || []);

  return (
    <>
      <PageHeader
        title={all ? 'Certificados, contratos y documentos' : 'Mis documentos'}
        subtitle="Control de vigencia con alertas automáticas por correo"
        actions={
          <>
            {all && <button className="btn" onClick={exportRows} disabled={!state.data?.length}>Exportar</button>}
            {can('documents.edit', 'settings.manage') && <button className="btn" onClick={() => setAlerts(true)}>🔔 Alertas por correo</button>}
            {edit && <button className="btn btn-primary" onClick={() => setForm({})}>+ Registrar documento</button>}
          </>
        }
      />
      <Tabs
        value={expiry}
        onChange={setExpiry}
        tabs={[
          { value: 'POR_VENCER', label: 'Por vencer' },
          { value: 'VENCIDO', label: 'Vencidos' },
          { value: 'VIGENTE', label: 'Vigentes' },
          { value: 'SIN_VENCIMIENTO', label: 'Sin vencimiento' },
          { value: '', label: 'Todos' },
        ]}
      />
      <Toolbar>
        {all && <input type="search" placeholder="Buscar por documento, trabajador o DNI…" value={q} onChange={(e) => setQ(e.target.value)} />}
        <Select value={type} onChange={(e) => setType(e.target.value)} placeholder="Todos los tipos" options={options(LABELS.docType)} />
      </Toolbar>
      <Card pad={false}>
        <Loader state={state}>
          {(list) => (
            <Table
              rows={list}
              empty="No hay documentos en esta categoría."
              columns={[
                ...(all ? [{ label: 'Trabajador', render: (d) => (<><Link to={`/personal/${d.employee.id}`} className="cell-main">{fullName(d.employee)}</Link><div className="cell-sub">{d.employee.docNumber}</div></>) }] : []),
                { label: 'Documento', render: (d) => (<><div className="cell-main">{d.name}</div><div className="cell-sub">{LABELS.docType[d.type]}{d.issuer ? ` · ${d.issuer}` : ''}{d.training ? ` · ${d.training.name}` : ''}</div></>) },
                { label: 'Emisión', render: (d) => fmtDate(d.issueDate), className: 'nowrap' },
                { label: 'Vencimiento', render: (d) => fmtDate(d.expiryDate), className: 'nowrap' },
                { label: 'Estado', render: expiryBadge },
                { label: 'Última alerta', render: (d) => <span className="small muted">{d.lastAlertAt ? fmtDateTime(d.lastAlertAt) : '—'}</span> },
                {
                  label: '',
                  className: 'right nowrap',
                  render: (d) => (
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      {d.fileName && <button className="btn btn-sm" onClick={() => downloadFile(`/documents/${d.id}/file`, d.fileName).catch((e) => toast(e.message, 'error'))}>Descargar</button>}
                      {edit && <button className="btn btn-sm" onClick={() => setForm(d)}>{d.expiryStatus === 'VENCIDO' || d.expiryStatus === 'POR_VENCER' ? 'Renovar' : 'Editar'}</button>}
                      {edit && <button className="btn btn-sm btn-danger" onClick={async () => window.confirm('¿Eliminar documento?') && (await run(() => api.del(`/documents/${d.id}`), 'Documento eliminado')) && state.reload()}>×</button>}
                    </div>
                  ),
                },
              ]}
            />
          )}
        </Loader>
      </Card>
      {form && <DocumentForm doc={form.id ? form : null} onClose={() => setForm(null)} onSaved={() => { setForm(null); state.reload(); }} />}
      {alerts && <AlertsPanel onClose={() => { setAlerts(false); state.reload(); }} />}
    </>
  );
}

function AlertsPanel({ onClose }) {
  const settings = useFetch(() => api.get('/security/settings'));
  const log = useFetch(() => api.get('/documents/alerts/log'));
  const [run, busy] = useAction();
  const { can } = useAuth();

  const send = async (force) => {
    if (await run(() => api.post('/documents/alerts/run', { force }), (r) => r.message)) log.reload();
  };

  return (
    <Modal title="Alertas de vencimiento por correo" onClose={onClose} size="lg">
      <div className="stack">
        {settings.data && (
          <div className={settings.data.mailConfigured ? 'info-box' : 'warn-box'}>
            {settings.data.mailConfigured ? (
              <>Correo configurado: <b>{settings.data.mailUser}</b>. </>
            ) : (
              <>El correo Gmail <b>no está configurado</b>: las alertas se registran solo en la consola del servidor. Configure GMAIL_USER y GMAIL_APP_PASSWORD en el archivo .env. </>
            )}
            Todos los días a las <b>{settings.data.alertHour}</b> se revisan los documentos que vencen en los próximos <b>{settings.data.alertDays}</b> días y se envía un
            resumen a <b>{settings.data.alertEmails || settings.data.mailUser || '(sin destinatarios)'}</b>
            {settings.data.alertNotifyEmployee === 'true' ? ' y un aviso a cada trabajador' : ''}. Un mismo documento se vuelve a alertar cada {settings.data.alertRepeatDays} días.
            {can('settings.manage') && <> <Link to="/configuracion" onClick={onClose}>Cambiar configuración</Link></>}
          </div>
        )}
        <div className="row">
          <button className="btn btn-primary" disabled={busy} onClick={() => send(false)}>Enviar alertas pendientes ahora</button>
          <button className="btn" disabled={busy} onClick={() => send(true)}>Reenviar todas (forzar)</button>
        </div>
        <h3>Historial de envíos</h3>
        <Loader state={log}>
          {(rows) => (
            <Table
              rows={rows}
              empty="Aún no se han enviado alertas."
              columns={[
                { label: 'Fecha', render: (l) => fmtDateTime(l.sentAt), className: 'nowrap' },
                { label: 'Destinatarios', render: (l) => <span className="small">{l.recipients}</span> },
                { label: 'Documentos', key: 'documents' },
                { label: 'Resultado', render: (l) => (l.success ? <Badge tone="green">Enviado</Badge> : <Badge tone="red" >Error</Badge>) },
                { label: 'Detalle', render: (l) => <span className="small muted">{l.error || l.subject}</span> },
              ]}
            />
          )}
        </Loader>
      </div>
    </Modal>
  );
}
