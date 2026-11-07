// Datos iniciales: roles, usuario administrador y catálogos básicos.
// Con el argumento --demo agrega trabajadores, proyectos y registros de ejemplo.
//   node prisma/seed.js          → solo datos base
//   node prisma/seed.js --demo   → datos base + demo
import '../src/config.js';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { addDays, ymd } from '../src/utils.js';

const prisma = new PrismaClient();
const DEMO = process.argv.includes('--demo');

const ROLES = [
  { name: 'Administrador', description: 'Acceso total al sistema', isSystem: true, permissions: ['*'] },
  {
    name: 'Recursos Humanos',
    description: 'Gestión completa del personal',
    isSystem: true,
    permissions: [
      'dashboard.view', 'reports.view', 'employees.view', 'employees.edit', 'employees.salary', 'org.edit',
      'attendance.mark', 'attendance.view', 'attendance.edit', 'leave.request', 'leave.view', 'leave.approve',
      'projects.view', 'projects.edit', 'trainings.view', 'trainings.edit', 'documents.view', 'documents.edit',
    ],
  },
  {
    name: 'Supervisor',
    description: 'Jefe de área o de proyecto',
    isSystem: true,
    permissions: [
      'dashboard.view', 'reports.view', 'employees.view', 'attendance.mark', 'attendance.view',
      'leave.request', 'leave.view', 'leave.approve', 'projects.view', 'projects.edit', 'trainings.view', 'documents.view',
    ],
  },
  {
    name: 'Empleado',
    description: 'Marca asistencia y gestiona sus solicitudes',
    isSystem: true,
    permissions: ['attendance.mark', 'leave.request'],
  },
];

async function base() {
  for (const r of ROLES) {
    await prisma.role.upsert({
      where: { name: r.name },
      update: {},
      create: { ...r, permissions: JSON.stringify(r.permissions) },
    });
  }
  const admin = await prisma.role.findUnique({ where: { name: 'Administrador' } });
  const email = (process.env.ADMIN_EMAIL || 'admin@empresa.com').toLowerCase();
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: 'Administrador', passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin123*', 10), roleId: admin.id },
  });

  await prisma.schedule.upsert({
    where: { name: 'Oficina L-V 08:00-17:00' },
    update: {},
    create: { name: 'Oficina L-V 08:00-17:00', startTime: '08:00', endTime: '17:00', toleranceMin: 10, workDays: '1,2,3,4,5' },
  });
  await prisma.schedule.upsert({
    where: { name: 'Campo L-S 07:00-16:00' },
    update: {},
    create: { name: 'Campo L-S 07:00-16:00', startTime: '07:00', endTime: '16:00', toleranceMin: 5, workDays: '1,2,3,4,5,6' },
  });
  console.log(`✔ Datos base listos. Administrador: ${email}`);
}

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function demo() {
  if ((await prisma.employee.count()) > 0) {
    console.log('• Ya existen trabajadores, se omiten los datos de demostración');
    return;
  }
  const areaNames = ['Gerencia', 'Recursos Humanos', 'Operaciones', 'Mantenimiento', 'Administración y Finanzas'];
  const areas = {};
  for (const name of areaNames) areas[name] = await prisma.area.create({ data: { name } });

  const posDefs = [
    ['Gerente General', 'Gerencia'], ['Analista de RRHH', 'Recursos Humanos'], ['Jefe de Operaciones', 'Operaciones'],
    ['Técnico Electricista', 'Mantenimiento'], ['Técnico Mecánico', 'Mantenimiento'], ['Supervisor de Campo', 'Operaciones'],
    ['Asistente Administrativo', 'Administración y Finanzas'], ['Contador', 'Administración y Finanzas'],
  ];
  const pos = {};
  for (const [name, area] of posDefs) pos[name] = await prisma.position.create({ data: { name, areaId: areas[area].id } });

  const office = await prisma.schedule.findUnique({ where: { name: 'Oficina L-V 08:00-17:00' } });
  const field = await prisma.schedule.findUnique({ where: { name: 'Campo L-S 07:00-16:00' } });

  const people = [
    ['Carlos', 'Mendoza Ríos', 'Gerente General', false],
    ['Lucía', 'Paredes Soto', 'Analista de RRHH', false],
    ['Jorge', 'Quispe Huamán', 'Jefe de Operaciones', false],
    ['Miguel', 'Torres Vega', 'Técnico Electricista', true],
    ['Luis', 'Flores Cárdenas', 'Técnico Electricista', true],
    ['Pedro', 'Castillo Rojas', 'Técnico Mecánico', true],
    ['Andrés', 'Salazar Díaz', 'Técnico Mecánico', true],
    ['Rosa', 'Huamaní Luna', 'Supervisor de Campo', true],
    ['Diego', 'Ramírez Poma', 'Técnico Electricista', true],
    ['María', 'Gutiérrez León', 'Asistente Administrativo', false],
    ['Sofía', 'Chávez Núñez', 'Contador', false],
    ['Raúl', 'Vargas Medina', 'Técnico Mecánico', true],
  ];
  const today = new Date();
  const emps = [];
  for (const [i, [firstName, lastName, position, isField]] of people.entries()) {
    const p = pos[position];
    const hireDate = addDays(today, -(200 + i * 150));
    const e = await prisma.employee.create({
      data: {
        code: `EMP-${String(i + 1).padStart(4, '0')}`,
        docNumber: String(40000000 + i * 1234567).slice(0, 8),
        firstName,
        lastName,
        birthDate: new Date(1980 + (i % 20), i % 12, 5 + i),
        gender: ['María', 'Lucía', 'Rosa', 'Sofía'].includes(firstName) ? 'F' : 'M',
        phone: `9${String(87654321 - i * 1111).padStart(8, '0')}`,
        email: `${firstName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.${lastName.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}@empresa.com`,
        address: 'Lima, Perú',
        hireDate,
        contractType: i % 3 === 0 ? 'INDETERMINADO' : 'PLAZO_FIJO',
        salary: isField ? 2800 + i * 50 : 3500 + i * 300,
        isFieldTech: isField,
        areaId: p.areaId,
        positionId: p.id,
        scheduleId: isField ? field.id : office.id,
      },
    });
    await prisma.employmentHistory.create({ data: { employeeId: e.id, date: hireDate, type: 'INGRESO', description: `Ingreso como ${position}`, createdBy: 'Sistema' } });
    emps.push(e);
  }

  // Usuarios de ejemplo (contraseña: Demo1234)
  const roles = Object.fromEntries((await prisma.role.findMany()).map((r) => [r.name, r]));
  const pw = await bcrypt.hash('Demo1234', 10);
  await prisma.user.create({ data: { email: 'rrhh@empresa.com', name: 'Lucía Paredes', passwordHash: pw, roleId: roles['Recursos Humanos'].id, employeeId: emps[1].id } });
  await prisma.user.create({ data: { email: 'supervisor@empresa.com', name: 'Jorge Quispe', passwordHash: pw, roleId: roles['Supervisor'].id, employeeId: emps[2].id } });
  await prisma.user.create({ data: { email: 'tecnico@empresa.com', name: 'Miguel Torres', passwordHash: pw, roleId: roles['Empleado'].id, employeeId: emps[3].id } });

  // Proyectos y asignaciones
  const projects = [
    await prisma.project.create({ data: { code: 'PRY-001', name: 'Mantenimiento Planta Norte', client: 'Minera Andina S.A.', location: 'Cajamarca', startDate: addDays(today, -60), endDate: addDays(today, 90), status: 'EN_CURSO' } }),
    await prisma.project.create({ data: { code: 'PRY-002', name: 'Instalación Subestación Sur', client: 'Energía del Sur', location: 'Arequipa', startDate: addDays(today, -20), endDate: addDays(today, 45), status: 'EN_CURSO' } }),
    await prisma.project.create({ data: { code: 'PRY-003', name: 'Auditoría eléctrica Lima', client: 'Retail Perú', location: 'Lima', startDate: addDays(today, 15), status: 'PLANIFICADO' } }),
  ];
  const fieldEmps = emps.filter((e) => e.isFieldTech);
  for (const [i, e] of fieldEmps.entries()) {
    const p = projects[i % 2];
    await prisma.assignment.create({ data: { projectId: p.id, employeeId: e.id, role: e.id === emps[7].id ? 'Supervisor' : 'Técnico', startDate: p.startDate, status: 'EN_CAMPO' } });
  }

  // Asistencia de los últimos 20 días
  for (let d = 20; d >= 1; d--) {
    const date = addDays(today, -d);
    const dow = date.getDay();
    for (const e of emps) {
      const works = e.isFieldTech ? dow >= 1 && dow <= 6 : dow >= 1 && dow <= 5;
      if (!works) continue;
      const roll = Math.random();
      const dateStr = ymd(date);
      if (roll < 0.05) {
        await prisma.attendance.create({ data: { employeeId: e.id, date: dateStr, status: 'FALTA', source: 'AUTOMATICO', notes: 'Sin marcación' } });
        continue;
      }
      const startH = e.isFieldTech ? 7 : 8;
      const late = roll > 0.85 ? 12 + Math.floor(Math.random() * 30) : Math.floor(Math.random() * 8);
      const checkIn = new Date(date);
      checkIn.setHours(startH, late - 5, 0, 0);
      const checkOut = new Date(date);
      checkOut.setHours(startH + 9, Math.floor(Math.random() * 30), 0, 0);
      const tol = e.isFieldTech ? 5 : 10;
      const lateMin = late - 5 > tol ? late - 5 : 0;
      const assign = e.isFieldTech ? projects[fieldEmps.indexOf(e) % 2] : null;
      await prisma.attendance.create({
        data: {
          employeeId: e.id,
          date: dateStr,
          checkIn,
          checkOut,
          status: lateMin ? 'TARDANZA' : 'PUNTUAL',
          lateMinutes: lateMin,
          workedMinutes: Math.round((checkOut - checkIn) / 60000),
          isField: Boolean(assign),
          projectId: assign?.id ?? null,
          location: assign?.location ?? 'Oficina principal',
        },
      });
    }
  }

  // Solicitudes
  const t = (n) => ymd(addDays(today, n));
  await prisma.leaveRequest.create({ data: { employeeId: emps[9].id, type: 'VACACIONES', startDate: t(-3), endDate: t(4), days: 8, reason: 'Vacaciones programadas', status: 'APROBADO', reviewedAt: today } });
  await prisma.leaveRequest.create({ data: { employeeId: emps[4].id, type: 'VACACIONES', startDate: t(10), endDate: t(24), days: 15, reason: 'Viaje familiar', status: 'PENDIENTE' } });
  await prisma.leaveRequest.create({ data: { employeeId: emps[5].id, type: 'PERMISO', startDate: t(2), endDate: t(2), days: 1, reason: 'Trámite personal', status: 'PENDIENTE' } });
  await prisma.leaveRequest.create({ data: { employeeId: emps[10].id, type: 'DESCANSO_MEDICO', startDate: t(-15), endDate: t(-13), days: 3, reason: 'Descanso médico', status: 'APROBADO', reviewedAt: today } });
  await prisma.leaveRequest.create({ data: { employeeId: emps[6].id, type: 'VACACIONES', startDate: t(20), endDate: t(29), days: 10, status: 'APROBADO', reviewedAt: today } });

  // Capacitaciones y certificados
  const trainings = [
    await prisma.training.create({ data: { name: 'Trabajos en altura', provider: 'SafeWork Perú', modality: 'PRESENCIAL', startDate: addDays(today, -340), hours: 16, validityDays: 365 } }),
    await prisma.training.create({ data: { name: 'Riesgo eléctrico NFPA 70E', provider: 'Instituto Eléctrico', modality: 'MIXTA', startDate: addDays(today, -120), hours: 24, validityDays: 730 } }),
    await prisma.training.create({ data: { name: 'Primeros auxilios', provider: 'Cruz Roja', modality: 'PRESENCIAL', startDate: addDays(today, -40), hours: 8, validityDays: 365 } }),
    await prisma.training.create({ data: { name: 'Excel avanzado', provider: 'Capacitación Online', modality: 'VIRTUAL', startDate: addDays(today, -10), hours: 12 } }),
  ];
  for (const e of fieldEmps) {
    for (const tr of trainings.slice(0, 3)) {
      await prisma.trainingParticipant.create({ data: { trainingId: tr.id, employeeId: e.id, status: 'APROBADO', score: 14 + Math.floor(Math.random() * 6) } });
      await prisma.document.create({
        data: {
          employeeId: e.id,
          type: 'CERTIFICADO',
          name: `Certificado ${tr.name}`,
          issuer: tr.provider,
          issueDate: tr.startDate,
          expiryDate: addDays(tr.startDate, tr.validityDays + (fieldEmps.indexOf(e) % 3) * 4),
          trainingId: tr.id,
        },
      });
    }
    await prisma.document.create({ data: { employeeId: e.id, type: 'SCTR', name: 'Póliza SCTR', issuer: 'Rímac Seguros', issueDate: addDays(today, -300), expiryDate: addDays(today, 65 - fieldEmps.indexOf(e) * 12) } });
  }
  for (const e of emps.filter((x) => !x.isFieldTech)) {
    await prisma.trainingParticipant.create({ data: { trainingId: trainings[3].id, employeeId: e.id, status: 'INSCRITO' } });
  }
  for (const e of emps.filter((x) => x.contractType === 'PLAZO_FIJO')) {
    await prisma.document.create({ data: { employeeId: e.id, type: 'CONTRATO', name: 'Contrato a plazo fijo', issueDate: addDays(today, -180), expiryDate: addDays(today, 20 + e.id * 9) } });
  }
  console.log('✔ Datos de demostración creados. Usuarios demo: rrhh@, supervisor@, tecnico@empresa.com (clave: Demo1234)');
}

try {
  await base();
  if (DEMO) await demo();
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
