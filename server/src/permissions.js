// Catálogo de permisos del sistema. Los roles guardan un arreglo con estas claves;
// "*" concede todos los permisos.
export const PERMISSIONS = [
  { key: 'dashboard.view', group: 'Dashboard', label: 'Ver dashboard' },
  { key: 'reports.view', group: 'Dashboard', label: 'Ver y exportar reportes' },

  { key: 'employees.view', group: 'Personal', label: 'Ver trabajadores' },
  { key: 'employees.edit', group: 'Personal', label: 'Registrar y editar trabajadores' },
  { key: 'employees.salary', group: 'Personal', label: 'Ver datos salariales y bancarios' },
  { key: 'org.edit', group: 'Personal', label: 'Gestionar áreas, cargos y horarios' },

  { key: 'attendance.mark', group: 'Asistencia', label: 'Marcar su propia asistencia' },
  { key: 'attendance.view', group: 'Asistencia', label: 'Ver asistencia de todo el personal' },
  { key: 'attendance.edit', group: 'Asistencia', label: 'Registrar/corregir asistencia y generar faltas' },

  { key: 'leave.request', group: 'Permisos y vacaciones', label: 'Solicitar permisos/vacaciones propios' },
  { key: 'leave.view', group: 'Permisos y vacaciones', label: 'Ver solicitudes de todo el personal' },
  { key: 'leave.approve', group: 'Permisos y vacaciones', label: 'Aprobar o rechazar solicitudes' },

  { key: 'projects.view', group: 'Proyectos', label: 'Ver proyectos y asignaciones' },
  { key: 'projects.edit', group: 'Proyectos', label: 'Gestionar proyectos y asignar técnicos' },

  { key: 'trainings.view', group: 'Capacitaciones y documentos', label: 'Ver capacitaciones' },
  { key: 'trainings.edit', group: 'Capacitaciones y documentos', label: 'Gestionar capacitaciones' },
  { key: 'documents.view', group: 'Capacitaciones y documentos', label: 'Ver documentos (certificados, contratos)' },
  { key: 'documents.edit', group: 'Capacitaciones y documentos', label: 'Subir y editar documentos' },

  { key: 'users.manage', group: 'Seguridad', label: 'Gestionar usuarios' },
  { key: 'roles.manage', group: 'Seguridad', label: 'Gestionar roles y permisos' },
  { key: 'audit.view', group: 'Seguridad', label: 'Ver auditoría' },
  { key: 'settings.manage', group: 'Seguridad', label: 'Configurar sistema y alertas de correo' },
];

export const ALL_KEYS = PERMISSIONS.map((p) => p.key);

export function parsePermissions(json) {
  try {
    const arr = JSON.parse(json || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
