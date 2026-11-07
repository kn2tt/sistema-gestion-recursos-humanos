import { prisma } from '../prisma.js';

/**
 * Registra una acción en la auditoría. Nunca interrumpe la petición si falla.
 * details puede ser texto u objeto (se serializa a JSON).
 */
export async function audit(req, action, entity, entityId = null, details = null) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: req.user?.id ?? null,
        userName: req.user ? `${req.user.name} <${req.user.email}>` : (details?.email ?? null),
        action,
        entity,
        entityId: entityId == null ? null : String(entityId),
        details: details == null ? null : typeof details === 'string' ? details : JSON.stringify(details),
        ip: req.ip,
      },
    });
  } catch (err) {
    console.error('[auditoría] no se pudo registrar:', err.message);
  }
}

/** Devuelve solo los campos que cambiaron entre dos objetos (para auditar ediciones). */
export function diff(before, after) {
  const changes = {};
  for (const [k, v] of Object.entries(after)) {
    const a = before?.[k] instanceof Date ? before[k].toISOString() : before?.[k];
    const b = v instanceof Date ? v.toISOString() : v;
    if (a !== b && !(a == null && b == null)) changes[k] = { de: a ?? null, a: b ?? null };
  }
  return changes;
}
