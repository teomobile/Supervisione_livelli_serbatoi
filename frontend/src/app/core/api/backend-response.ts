import { map, OperatorFunction } from 'rxjs';

/**
 * Involucro restituito dai controller del ServiceBackend (classe Response).
 * Forma ipotizzata: da allineare alla classe ServiceBackend.Model.Response reale.
 */
export interface BackendResponse<T> {
  data: T;
}

export function unwrapResponse<T>(): OperatorFunction<BackendResponse<T>, T> {
  return map((r) => r.data);
}
