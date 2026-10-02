import { tankCondition } from './tank-state';
import { TankStatus } from './tank.models';

function tank(overrides: Partial<TankStatus>): TankStatus {
  return {
    code: 'A',
    name: 'Serbatoio A',
    zone: 'AB',
    capacityLiters: 1000,
    levelPercent: 50,
    levelLiters: 500,
    levelValid: true,
    full: false,
    tooFull: false,
    tooFullFault: false,
    thresholds: { fillLiters: 850, lowWarningLiters: 200, lowStopLiters: 100 },
    timestamp: '2026-10-02T08:00:00Z',
    ...overrides,
  };
}

describe('tankCondition', () => {
  it('normale a metà serbatoio', () => {
    expect(tankCondition(tank({}))).toBe('normal');
  });

  it('misura non valida ha la precedenza su tutto', () => {
    expect(tankCondition(tank({ levelValid: false, tooFull: true }))).toBe('invalid');
    expect(tankCondition(tank({ levelLiters: null }))).toBe('invalid');
  });

  it('allarme con sensore di massimo intervenuto o sotto il minimo', () => {
    expect(tankCondition(tank({ tooFull: true }))).toBe('alarm');
    expect(tankCondition(tank({ levelLiters: 100 }))).toBe('alarm');
  });

  it('warning con livello basso o guasto sensore di massimo', () => {
    expect(tankCondition(tank({ levelLiters: 150 }))).toBe('warning');
    expect(tankCondition(tank({ tooFullFault: true }))).toBe('warning');
  });
});
