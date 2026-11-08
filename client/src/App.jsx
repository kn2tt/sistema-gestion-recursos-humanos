import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import EmployeeList from './pages/employees/EmployeeList';
import EmployeeDetail from './pages/employees/EmployeeDetail';
import Organization from './pages/Organization';
import MarkAttendance from './pages/attendance/MarkAttendance';
import AttendanceRecords from './pages/attendance/AttendanceRecords';
import FieldTechs from './pages/attendance/FieldTechs';
import Leaves from './pages/leaves/Leaves';
import LeaveCalendar from './pages/leaves/LeaveCalendar';
import Projects from './pages/projects/Projects';
import ProjectDetail from './pages/projects/ProjectDetail';
import Assignments from './pages/projects/Assignments';
import Trainings from './pages/trainings/Trainings';
import TrainingDetail from './pages/trainings/TrainingDetail';
import Documents from './pages/documents/Documents';
import Reports from './pages/Reports';
import Users from './pages/security/Users';
import Roles from './pages/security/Roles';
import Audit from './pages/security/Audit';
import Settings from './pages/security/Settings';
import Profile from './pages/Profile';

function Guard({ perms, children }) {
  const { can } = useAuth();
  if (!can(...perms)) {
    return (
      <div className="card card-body">
        <h2>Acceso restringido</h2>
        <p className="muted">Su rol no tiene permiso para ver esta sección. Solicite acceso al administrador.</p>
      </div>
    );
  }
  return children;
}

function Home() {
  const { can } = useAuth();
  if (can('dashboard.view')) return <Dashboard />;
  if (can('attendance.mark')) return <Navigate to="/mi-asistencia" replace />;
  return <Navigate to="/perfil" replace />;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Iniciando…" />;
  if (!user) return <Login />;

  const g = (perms, el) => <Guard perms={perms}>{el}</Guard>;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="mi-asistencia" element={g(['attendance.mark'], <MarkAttendance />)} />
        <Route path="personal" element={g(['employees.view'], <EmployeeList />)} />
        <Route path="personal/:id" element={<EmployeeDetail />} />
        <Route path="organizacion" element={g(['org.edit', 'employees.view'], <Organization />)} />
        <Route path="asistencia" element={g(['attendance.view', 'attendance.mark'], <AttendanceRecords />)} />
        <Route path="asistencia/campo" element={g(['attendance.view', 'projects.view'], <FieldTechs />)} />
        <Route path="solicitudes" element={g(['leave.request', 'leave.view', 'leave.approve'], <Leaves />)} />
        <Route path="calendario" element={g(['leave.request', 'leave.view', 'leave.approve'], <LeaveCalendar />)} />
        <Route path="proyectos" element={g(['projects.view'], <Projects />)} />
        <Route path="proyectos/:id" element={g(['projects.view'], <ProjectDetail />)} />
        <Route path="asignaciones" element={g(['projects.view'], <Assignments />)} />
        <Route path="capacitaciones" element={g(['trainings.view'], <Trainings />)} />
        <Route path="capacitaciones/:id" element={g(['trainings.view'], <TrainingDetail />)} />
        <Route path="documentos" element={<Documents />} />
        <Route path="reportes" element={g(['reports.view'], <Reports />)} />
        <Route path="usuarios" element={g(['users.manage'], <Users />)} />
        <Route path="roles" element={g(['roles.manage'], <Roles />)} />
        <Route path="auditoria" element={g(['audit.view'], <Audit />)} />
        <Route path="configuracion" element={g(['settings.manage'], <Settings />)} />
        <Route path="perfil" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
