import { useState } from 'react';
import { useAuth } from '../auth';
import { ErrorBox } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-side">
        <div className="brand">
          <span className="brand-mark">GP</span>
          <div>
            <strong>Gestión de Personal</strong>
            <small>Recursos Humanos</small>
          </div>
        </div>
        <div>
          <h1>Todo tu personal en un solo lugar</h1>
          <ul>
            <li>Legajo del trabajador, CV e historial laboral</li>
            <li>Asistencia en oficina y técnicos de campo</li>
            <li>Permisos, vacaciones y aprobaciones</li>
            <li>Proyectos y asignación de técnicos</li>
            <li>Certificados con alertas de vencimiento por correo</li>
          </ul>
        </div>
        <small style={{ color: '#94a3b8' }}>Acceso exclusivo para personal autorizado.</small>
      </div>
      <div className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <div>
            <h1>Iniciar sesión</h1>
            <p className="muted">Ingrese con su correo corporativo.</p>
          </div>
          <label className="field">
            <span className="field-label">Correo</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
          </label>
          <label className="field">
            <span className="field-label">Contraseña</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          <ErrorBox error={error} />
          <button className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
