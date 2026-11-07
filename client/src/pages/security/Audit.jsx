import { useState } from 'react';
import { api } from '../../api';
import { Badge, Card, Field, Loader, Modal, PageHeader, Select, Table, Toolbar, useFetch } from '../../components/ui';
import { fmtDateTime } from '../../utils';

const TONE = { CREAR: 'green', EDITAR: 'blue', ELIMINAR: 'red', LOGIN: 'gray', LOGIN_FALLIDO: 'red', APROBAR: 'green', RECHAZAR: 'red' };

function prettyDetails(s) {
  if (!s) return '';
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

export default function Audit() {
  const facets = useFetch(() => api.get('/security/audit/facets'));
  const users = useFetch(() => api.get('/security/users'));
  const [f, setF] = useState({ from: '', to: '', userId: '', action: '', entity: '', q: '', page: 1 });
  const state = useFetch(() => api.get('/security/audit', { ...f, size: 50 }), [JSON.stringify(f)]);
  const [detail, setDetail] = useState(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value, page: 1 }));

  return (
    <>
      <PageHeader title="Auditoría" subtitle="Registro de todas las acciones realizadas en el sistema" />
      <Toolbar>
        <Field label="Desde"><input type="date" value={f.from} onChange={set('from')} /></Field>
        <Field label="Hasta"><input type="date" value={f.to} onChange={set('to')} /></Field>
        <Field label="Usuario"><Select value={f.userId} onChange={set('userId')} placeholder="Todos" options={(users.data || []).map((u) => ({ value: u.id, label: u.name }))} /></Field>
        <Field label="Acción"><Select value={f.action} onChange={set('action')} placeholder="Todas" options={(facets.data?.actions || []).map((a) => ({ value: a, label: a }))} /></Field>
        <Field label="Módulo"><Select value={f.entity} onChange={set('entity')} placeholder="Todos" options={(facets.data?.entities || []).map((a) => ({ value: a, label: a }))} /></Field>
        <Field label="Buscar"><input type="search" value={f.q} onChange={set('q')} placeholder="Texto en detalle…" /></Field>
      </Toolbar>
      <Card pad={false}>
        <Loader state={state}>
          {(d) => (
            <>
              <Table
                rows={d.items}
                onRowClick={setDetail}
                empty="Sin registros."
                columns={[
                  { label: 'Fecha y hora', render: (l) => <span className="nowrap">{fmtDateTime(l.createdAt)}</span> },
                  { label: 'Usuario', render: (l) => <span className="small">{l.userName || '—'}</span> },
                  { label: 'Acción', render: (l) => <Badge tone={TONE[l.action] || 'violet'}>{l.action}</Badge> },
                  { label: 'Módulo', render: (l) => `${l.entity}${l.entityId ? ` #${l.entityId}` : ''}` },
                  { label: 'Detalle', render: (l) => <span className="small muted" style={{ display: 'inline-block', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.details}</span> },
                  { label: 'IP', render: (l) => <span className="small muted">{l.ip}</span> },
                ]}
              />
              <div className="pagination">
                <span className="muted small">{d.total} registros · página {d.page} de {Math.max(1, Math.ceil(d.total / d.size))}</span>
                <button className="btn btn-sm" disabled={d.page <= 1} onClick={() => setF((s) => ({ ...s, page: s.page - 1 }))}>Anterior</button>
                <button className="btn btn-sm" disabled={d.page * d.size >= d.total} onClick={() => setF((s) => ({ ...s, page: s.page + 1 }))}>Siguiente</button>
              </div>
            </>
          )}
        </Loader>
      </Card>
      {detail && (
        <Modal title={`${detail.action} · ${detail.entity}`} onClose={() => setDetail(null)}>
          <dl className="dl" style={{ marginBottom: '1rem' }}>
            <div><dt>Fecha</dt><dd>{fmtDateTime(detail.createdAt)}</dd></div>
            <div><dt>Usuario</dt><dd>{detail.userName || '—'}</dd></div>
            <div><dt>Registro</dt><dd>{detail.entityId || '—'}</dd></div>
            <div><dt>IP</dt><dd>{detail.ip || '—'}</dd></div>
          </dl>
          <pre style={{ background: 'var(--surface-2)', padding: '0.75rem', borderRadius: 8, overflowX: 'auto', fontSize: '0.8rem' }}>{prettyDetails(detail.details) || 'Sin detalle'}</pre>
        </Modal>
      )}
    </>
  );
}
