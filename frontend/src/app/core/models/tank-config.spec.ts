import { TankConfig, validateTankConfig } from './tank-config';

function cfg(overrides: Partial<TankConfig>): TankConfig {
  return { code: 'A', name: 'Serbatoio A', capacityLiters: 10000, fullPercent: 85, tooFullPercent: 95, updatedAt: null, ...overrides };
}

describe('validateTankConfig', () => {
  it('configurazione predefinita valida', () => {
    expect(validateTankConfig(cfg({}))).toEqual([]);
  });

  it('nome obbligatorio', () => {
    expect(validateTankConfig(cfg({ name: '   ' }))).toContain('Nome obbligatorio');
  });

  it('capacità fuori intervallo o vuota', () => {
    expect(validateTankConfig(cfg({ capacityLiters: 50 })).length).toBe(1);
    expect(validateTankConfig(cfg({ capacityLiters: null as unknown as number })).length).toBe(1);
  });

  it('soglia pieno deve stare sotto il troppo pieno', () => {
    expect(validateTankConfig(cfg({ fullPercent: 95, tooFullPercent: 95 }))).toContain(
      'La soglia pieno deve essere sotto il troppo pieno',
    );
  });
});
