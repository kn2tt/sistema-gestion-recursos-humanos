import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import Icon from './Icon';

// Menú lateral: cada entrada se muestra solo si el usuario tiene alguno de sus permisos.
export const NAV = [
  { section: null, items: [
    { to: '/', label: 'Dashboard', icon: 'dashboard', perms: ['dashboard.view'], end: true },
    { to: '/mi-asistencia', label: 'Marcar asistencia', icon: 'clock', perms: ['attendance.mark'] },
  ] },
  { section: 'Personal', items: [
    { to: '/personal', label: 'Trabajadores', icon: 'users', perms: ['employees.view'] },
    { to: '/organizacion', label: 'Áreas, cargos y horarios', icon: 'building', perms: ['org.edit', 'employees.view'] },
  ] },
  { section: 'Asistencia', items: [
    { to: '/asistencia', label: 'Registros de asistencia', icon: 'list', perms: ['attendance.view', 'attendance.mark'], end: true },
    { to: '/asistencia/campo', label: 'Técnicos de campo', icon: 'map', perms: ['attendance.view', 'projects.view'] },
  ] },
  { section: 'Permisos y vacaciones', items: [
    { to: '/solicitudes', label: 'Solicitudes', icon: 'inbox', perms: ['leave.request', 'leave.view', 'leave.approve'] },
    { to: '/calendario', label: 'Calendario de vacaciones', icon: 'calendar', perms: ['leave.request', 'leave.view', 'leave.approve'] },
  ] },
  { section: 'Proyectos', items: [
    { to: '/proyectos', label: 'Proyectos', icon: 'briefcase', perms: ['projects.view'] },
    { to: '/asignaciones', label: 'Asignaciones', icon: 'link', perms: ['projects.view'] },
  ] },
  { section: 'Capacitaciones y documentos', items: [
    { to: '/capacitaciones', label: 'Capacitaciones', icon: 'award', perms: ['trainings.view'] },
    { to: '/documentos', label: 'Certificados y contratos', icon: 'file', perms: ['documents.view', 'attendance.mark', 'leave.request'] },
  ] },
  { section: 'Análisis', items: [
    { to: '/reportes', label: 'Reportes', icon: 'chart', perms: ['reports.view'] },
  ] },
  { section: 'Seguridad', items: [
    { to: '/usuarios', label: 'Usuarios', icon: 'user', perms: ['users.manage'] },
    { to: '/roles', label: 'Roles y permisos', icon: 'shield', perms: ['roles.manage'] },
    { to: '/auditoria', label: 'Auditoría', icon: 'eye', perms: ['audit.view'] },
    { to: '/configuracion', label: 'Configuración', icon: 'settings', perms: ['settings.manage'] },
  ] },
];

export default function Layout() {
  const { user, logout, can } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => setOpen(false), [location.pathname]);

  const initials = user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className={`app ${open ? 'nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">GP</span>
          <div>
            <strong>Gestión de Personal</strong>
            <small>Recursos Humanos</small>
          </div>
        </div>
        <nav>
          {NAV.map((group, gi) => {
            const items = group.items.filter((i) => can(...i.perms));
            if (!items.length) return null;
            return (
              <div key={gi} className="nav-group">
                {group.section && <div className="nav-section">{group.section}</div>}
                {items.map((i) => (
                  <NavLink key={i.to} to={i.to} end={i.end} className="nav-link">
                    <Icon name={i.icon} />
                    <span>{i.label}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="backdrop" onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(!open)} aria-label="Menú">
            <Icon name="menu" size={20} />
          </button>
          <div className="topbar-spacer" />
          <button className="user-chip" onClick={() => navigate('/perfil')} title="Mi perfil">
            <span className="avatar">{initials}</span>
            <span className="user-meta">
              <strong>{user.name}</strong>
              <small>{user.role}</small>
            </span>
          </button>
          <button className="icon-btn" onClick={logout} title="Cerrar sesión" aria-label="Cerrar sesión">
            <Icon name="logout" size={20} />
          </button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
