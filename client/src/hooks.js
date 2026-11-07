import { useEffect, useState } from 'react';
import { api } from './api';
import { fullName } from './utils';

/** Catálogos de organización (áreas, cargos, horarios) para formularios y filtros. */
export function useCatalogs() {
  const [c, setC] = useState({ areas: [], positions: [], schedules: [] });
  useEffect(() => {
    Promise.all([api.get('/org/areas'), api.get('/org/positions'), api.get('/org/schedules')])
      .then(([areas, positions, schedules]) => setC({ areas, positions, schedules }))
      .catch(() => {});
  }, []);
  return c;
}

/** Lista de trabajadores para selectores. */
export function useEmployeeOptions(params = {}) {
  const [list, setList] = useState([]);
  const key = JSON.stringify(params);
  useEffect(() => {
    api.get('/employees/options', params).then(setList).catch(() => setList([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return list.map((e) => ({ value: e.id, label: `${fullName(e)} (${e.code})`, raw: e }));
}
