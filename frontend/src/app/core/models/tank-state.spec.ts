import { tankCondition, tankNote } from './tank-state';
import { TankStatus, TankThresholds } from './tank.models';

const NO_THRESHOLDS: TankThresholds = { fillLiters: null, tooFullLiters: null, lowWarningLiters: null, lowStopLiters: null };
const WITH_THRESHOLDS: TankThresholds = { fillLiters: 8500, tooFullLiters: 9350, lowWarningLiters: 2000, lowStopLiters: 1000 };

function tank(overrides: Partial<TankStatus>): TankStatus {
  return {
    code: 'A',
    name: 'Serbatoio A',
    zone: 'AB',
    capacityLiters: 10000,
    levelPercent: 50,
    levelLiters: 5000,
    levelValid: true,
    full: false,
    tooFull: false,
    tooFullFault: false,
    thresholds: NO_THRESHOLDS,
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

  it('allarme con sensore di massimo intervenuto', () => {
    expect(tankCondition(tank({ tooFull: true }))).toBe('alarm');
  });

  it('warning con guasto sensore di massimo', () => {
    expect(tankCondition(tank({ tooFullFault: true }))).toBe('warning');
  });

  it('senza soglie dal DB4 il livello basso non genera allarmi', () => {
    expect(tankCondition(tank({ levelLiters: 100 }))).toBe('normal');
  });

  it('con soglie configurate usa livello basso e minimo', () => {
    expect(tankCondition(tank({ thresholds: WITH_THRESHOLDS, levelLiters: 1500 }))).toBe('warning');
    expect(tankCondition(tank({ thresholds: WITH_THRESHOLDS, levelLiters: 1000 }))).toBe('alarm');
  });
});

describe('tankNote', () => {
  it('troppo pieno prima di pieno', () => {
    expect(tankNote(tank({ full: true, tooFull: true }))?.label).toBe('Troppo pieno');
  });

  it('pieno in arancio, troppo pieno in rosso lampeggiante', () => {
    expect(tankNote(tank({ full: true }))).toEqual({ label: 'Pieno', css: 'full', blink: false });
    expect(tankNote(tank({ tooFull: true }))).toEqual({ label: 'Troppo pieno', css: 'alarm', blink: true });
  });

  it('nessuna nota in condizioni normali', () => {
    expect(tankNote(tank({}))).toBeNull();
  });
});
