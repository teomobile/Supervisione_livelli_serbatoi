import { TankConfig, validateTankConfig } from './tank-config';

function cfg(overrides: Partial<TankConfig>): TankConfig {
  return { code: 'A', name: 'Serbatoio A', tooFullLiters: 9500, fullLiters: 8700, updatedAt: null, ...overrides };
}

describe('validateTankConfig', () => {
  it('configurazione predefinita valida', () => {
    expect(validateTankConfig(cfg({}))).toEqual([]);
  });

  it('nome obbligatorio', () => {
    expect(validateTankConfig(cfg({ name: '   ' }))).toContain('Nome obbligatorio');
  });

  it('troppo pieno fuori intervallo o vuoto', () => {
    expect(validateTankConfig(cfg({ tooFullLiters: 50, fullLiters: 40 })).length).toBe(1);
    expect(validateTankConfig(cfg({ tooFullLiters: null as unknown as number })).length).toBeGreaterThan(0);
  });

  it('soglia pieno deve stare sotto il troppo pieno', () => {
    expect(validateTankConfig(cfg({ fullLiters: 9500 }))).toContain('La soglia pieno deve essere sotto il troppo pieno');
  });

  it('soglia pieno obbligatoria', () => {
    expect(validateTankConfig(cfg({ fullLiters: null as unknown as number }))).toContain('Soglia pieno obbligatoria');
  });
});
