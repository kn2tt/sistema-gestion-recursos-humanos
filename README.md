# Sistema de Gestión de Personal

Aplicación web para Recursos Humanos: personal, asistencia (oficina y técnicos de campo), permisos y vacaciones, proyectos, capacitaciones y certificados con alertas por correo, usuarios/roles/auditoría y dashboard con reportes.

- **Backend:** Node.js + Express 5 + Prisma ORM (SQLite por defecto; PostgreSQL/MySQL en producción)
- **Frontend:** React 19 + Vite + Recharts
- **Correo:** Gmail vía Nodemailer · **Tareas diarias:** node-cron

## Módulos

| Módulo | Qué incluye |
|---|---|
| Gestión de personal | Registro de trabajadores, datos personales y laborales, áreas, cargos, horarios, historial de movimientos (automático al cambiar cargo/área/estado), experiencia previa, subida de CV |
| Asistencia | Marcación de entrada/salida con geolocalización, técnicos de campo con proyecto del día, cálculo de tardanzas por horario y tolerancia, faltas automáticas al cierre del día, registro manual y correcciones, exportación |
| Permisos y vacaciones | Solicitudes con sustento adjunto, saldo de vacaciones, aprobación/rechazo con aviso por correo, historial, calendario mensual |
| Proyectos | Registro de proyectos, asignación de técnicos con detección de cruces, seguimiento de estados (asignado → en campo → finalizado) |
| Capacitaciones y documentos | Cursos, participantes y notas, certificados, contratos, SCTR, exámenes médicos, fechas de vencimiento y **alertas por correo** (resumen a RRHH + aviso a cada trabajador) |
| Usuarios y seguridad | Usuarios vinculados a trabajadores, roles con permisos por módulo, auditoría de todas las acciones (incluye inicios de sesión fallidos) |
| Reportes y dashboard | Indicadores de asistencia, personal activo, vacaciones, permisos, capacitaciones, personal por proyecto; exportación a Excel (CSV) |

## Instalación (desarrollo)

Requisitos: **Node.js 20 o superior**.

```bash
npm run install:all          # instala dependencias de raíz, server y client
cp server/.env.example server/.env   # en Windows: copy server\.env.example server\.env
# edite server/.env (JWT_SECRET, correo, admin)
npm run setup                # crea la base de datos y el usuario administrador
#   o bien: npm run setup:demo   → además carga datos de demostración
npm run dev                  # API en :4000 y web en http://localhost:5173
```

Usuario inicial: el definido en `ADMIN_EMAIL` / `ADMIN_PASSWORD` (por defecto `admin@empresa.com` / `Admin123*`). **Cámbielo al primer ingreso** desde *Mi perfil*.

Con datos de demostración también existen `rrhh@empresa.com`, `supervisor@empresa.com` y `tecnico@empresa.com` (clave `Demo1234`).

## Configurar Gmail para las alertas

1. En la cuenta de Google que enviará los correos, active la **verificación en dos pasos**.
2. Cree una **contraseña de aplicación** en https://myaccount.google.com/apppasswords.
3. En `server/.env`:
   ```
   GMAIL_USER=alertas.rrhh@gmail.com
   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
   ```
4. Reinicie el servidor. En **Configuración** indique los correos de RRHH, los días de anticipación y la hora de envío, y use *Enviar prueba*.

Sin credenciales, el sistema funciona igual y muestra los correos en la consola del servidor (“correo simulado”).

Cada día, a la hora configurada, se revisan los documentos que vencen dentro del plazo (por defecto 30 días) o ya vencidos; se envía un resumen a RRHH y un aviso a cada trabajador. Un mismo documento se vuelve a alertar cada N días (por defecto 7) hasta que se renueve. Al actualizar la fecha de vencimiento, el control se reinicia.

## Roles incluidos

| Rol | Acceso |
|---|---|
| Administrador | Todo |
| Recursos Humanos | Todo excepto usuarios, roles, auditoría y configuración |
| Supervisor | Consulta de personal, asistencia y reportes; aprueba solicitudes; gestiona proyectos |
| Empleado | Marca su asistencia, ve sus registros y documentos, solicita permisos/vacaciones |

Los roles se editan en **Roles y permisos**. Para que un usuario marque asistencia o haga solicitudes, debe estar **vinculado a su ficha de trabajador** (en Usuarios).

## Puesta en producción

1. **Base de datos:** se recomienda PostgreSQL. En `server/prisma/schema.prisma` cambie `provider = "sqlite"` por `"postgresql"`, ajuste `DATABASE_URL`, elimine la carpeta `server/prisma/migrations` y ejecute `npx prisma migrate dev --name init` una vez (en un entorno de pruebas) para generar las migraciones de PostgreSQL. En el servidor use `npm run db:deploy --prefix server` y `npm run db:seed --prefix server`.
2. **Variables:** `NODE_ENV=production`, un `JWT_SECRET` aleatorio de 32+ caracteres, `CLIENT_URL` con el dominio real y `TZ` con la zona horaria de la empresa.
3. **Compilar y arrancar:**
   ```bash
   npm run build     # genera client/dist
   npm start         # la API sirve también el frontend en el puerto PORT
   ```
   Use un gestor de procesos (PM2, servicio de Windows o systemd) y un proxy con **HTTPS** (Nginx, IIS o Caddy). La geolocalización del navegador solo funciona con HTTPS.
4. **Respaldos:** respalde diariamente la base de datos y la carpeta `server/uploads/` (CV, certificados, contratos y sustentos).

## Estructura

```
server/
  prisma/schema.prisma   modelo de datos
  prisma/seed.js         roles, admin y datos demo
  src/routes/            API por módulo (employees, attendance, leaves, projects, trainings, documents, security, reports)
  src/services/          alertas, correo, asistencia, tareas programadas, configuración
  src/middleware/        autenticación/permisos, auditoría, subida de archivos
  uploads/               archivos subidos (no se publican; se descargan con sesión)
client/
  src/pages/             pantallas por módulo
  src/components/        layout y componentes de interfaz
```

## Seguridad implementada

- Contraseñas con bcrypt, sesiones JWT con expiración, límite de 10 intentos de inicio de sesión cada 15 minutos.
- Permisos verificados en el servidor en cada endpoint (el menú solo oculta opciones).
- Sueldos y cuentas bancarias visibles solo con el permiso *Ver datos salariales*.
- Archivos subidos con nombre aleatorio, tipos permitidos (PDF, Word, Excel, imágenes) y máximo 10 MB; se descargan solo con permiso.
- Un trabajador cesado queda con su usuario desactivado automáticamente; nadie puede aprobar su propia solicitud.
- Auditoría de creación, edición (con valores antes/después), eliminación, aprobaciones, inicios de sesión y envío de alertas.
