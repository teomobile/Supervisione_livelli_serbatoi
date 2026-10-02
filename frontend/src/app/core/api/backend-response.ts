import { OperatorFunction, map } from 'rxjs';

/**
 * Involucro restituito dai controller del ServiceBackend (ServiceBackend.Model.Response).
 * ASP.NET Core serializza in camelCase per impostazione predefinita.
 */
export interface BackendResponse<T> {
  statusCode: number;
  statusMessage: string | null;
  listItem: T | null;
}

/**
 * Errore applicativo: il backend risponde HTTP 200 anche quando l'operazione fallisce,
 * l'esito reale è in statusCode.
 */
export class BackendError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'BackendError';
  }
}

function isSuccess(code: number): boolean {
  return code >= 200 && code < 300;
}

/** Estrae listItem; fallisce se statusCode non è 2xx o se il dato manca. */
export function unwrapResponse<T>(): OperatorFunction<BackendResponse<T>, T> {
  return map((r) => {
    if (!isSuccess(r.statusCode)) {
      throw new BackendError(r.statusCode, r.statusMessage || `Errore backend (${r.statusCode})`);
    }
    if (r.listItem === null || r.listItem === undefined) {
      throw new BackendError(r.statusCode, r.statusMessage || 'Risposta senza dati');
    }
    return r.listItem;
  });
}

/** Come unwrapResponse, ma per le liste: assenza di dati = lista vuota. */
export function unwrapList<T>(): OperatorFunction<BackendResponse<T[]>, T[]> {
  return map((r) => {
    if (!isSuccess(r.statusCode)) {
      throw new BackendError(r.statusCode, r.statusMessage || `Errore backend (${r.statusCode})`);
    }
    return r.listItem ?? [];
  });
}
