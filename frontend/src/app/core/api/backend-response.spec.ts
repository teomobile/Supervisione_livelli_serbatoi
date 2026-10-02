import { firstValueFrom, of } from 'rxjs';
import { BackendError, BackendResponse, unwrapList, unwrapResponse } from './backend-response';

function response<T>(statusCode: number, listItem: T | null, statusMessage: string | null = null): BackendResponse<T> {
  return { statusCode, statusMessage, listItem };
}

describe('unwrapResponse', () => {
  it('restituisce listItem quando statusCode è 2xx', async () => {
    const value = await firstValueFrom(of(response(200, { a: 1 })).pipe(unwrapResponse()));
    expect(value).toEqual({ a: 1 });
  });

  it('lancia BackendError con il messaggio del backend se statusCode non è 2xx', async () => {
    const result = firstValueFrom(of(response(500, null, 'Errore SQL')).pipe(unwrapResponse()));
    await expect(result).rejects.toBeInstanceOf(BackendError);
    await expect(result).rejects.toThrow('Errore SQL');
  });

  it('lancia BackendError se listItem manca', async () => {
    await expect(firstValueFrom(of(response(200, null)).pipe(unwrapResponse()))).rejects.toBeInstanceOf(BackendError);
  });
});

describe('unwrapList', () => {
  it('lista vuota quando listItem è null', async () => {
    expect(await firstValueFrom(of(response<number[]>(204, null)).pipe(unwrapList()))).toEqual([]);
  });

  it('lancia BackendError se statusCode non è 2xx', async () => {
    await expect(firstValueFrom(of(response<number[]>(400, null)).pipe(unwrapList()))).rejects.toBeInstanceOf(BackendError);
  });
});
