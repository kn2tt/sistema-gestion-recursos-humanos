// Utilidades de fechas y validación compartidas por las rutas.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const pad = (n) => String(n).padStart(2, '0');

/** Fecha local (zona TZ del servidor) como "YYYY-MM-DD". */
export function ymd(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD" → Date a medianoche local. */
export function parseYmd(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) throw new HttpError(400, `Fecha inválida: ${s}`);
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** Días calendario entre dos "YYYY-MM-DD", ambos inclusive. */
export function daysBetween(start, end) {
  return Math.round((parseYmd(end) - parseYmd(start)) / 86400000) + 1;
}

/** Lista de "YYYY-MM-DD" entre dos fechas inclusive. */
export function eachDay(start, end) {
  const out = [];
  for (let d = parseYmd(start); d <= parseYmd(end); d = addDays(d, 1)) out.push(ymd(d));
  return out;
}

/** "HH:MM" → minutos desde medianoche. */
export function timeToMin(t) {
  const [h, m] = String(t || '0:0').split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minutesOfDay(date) {
  const d = new Date(date);
  return d.getHours() * 60 + d.getMinutes();
}

/** Convierte un valor de formulario en Date o null. Acepta "YYYY-MM-DD" o ISO. */
export function toDate(v) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return parseYmd(v);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `Fecha inválida: ${v}`);
  return d;
}

export function toInt(v) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new HttpError(400, `Número inválido: ${v}`);
  return n;
}

export function toFloat(v) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = Number(v);
  if (Number.isNaN(n)) throw new HttpError(400, `Número inválido: ${v}`);
  return n;
}

export function toBool(v) {
  if (v === undefined) return undefined;
  return v === true || v === 'true' || v === 1 || v === '1';
}

export function str(v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

export function required(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || String(body[f]).trim() === '');
  if (missing.length) throw new HttpError(400, `Campos obligatorios: ${missing.join(', ')}`);
}

/** Quita claves undefined para que Prisma no las toque. */
export function clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

export function idParam(req, name = 'id') {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n)) throw new HttpError(400, 'Identificador inválido');
  return n;
}

export function paging(req, max = 200) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(max, Math.max(1, Number(req.query.size) || 50));
  return { skip: (page - 1) * size, take: size, page, size };
}
