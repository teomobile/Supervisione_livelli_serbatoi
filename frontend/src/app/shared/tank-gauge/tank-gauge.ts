import { Component, computed, input } from '@angular/core';
import { tankCondition } from '../../core/models/tank-state';
import { TankStatus } from '../../core/models/tank.models';

/** Serbatoio verticale con scala e linee di soglia. */
@Component({
  selector: 'app-tank-gauge',
  templateUrl: './tank-gauge.html',
  styleUrl: './tank-gauge.scss',
  host: { '[style.height.px]': 'height()' },
})
export class TankGauge {
  readonly tank = input.required<TankStatus>();
  readonly height = input(150);

  protected readonly condition = computed(() => tankCondition(this.tank()));

  protected readonly fillPercent = computed(() => {
    const p = this.tank().levelPercent;
    return p === null ? 0 : Math.min(100, Math.max(0, p));
  });

  protected readonly marks = computed(() => {
    const t = this.tank();
    const marks = [
      { key: 'toofull', liters: t.thresholds.tooFullLiters, short: 'Max', label: 'Sensore troppo pieno' },
      { key: 'fill', liters: t.thresholds.fillLiters, short: 'Pieno', label: 'Soglia pieno' },
      { key: 'warn', liters: t.thresholds.lowWarningLiters, short: 'Basso', label: 'Livello basso' },
      { key: 'stop', liters: t.thresholds.lowStopLiters, short: 'Min', label: 'Livello minimo' },
    ];
    return marks
      .filter((m): m is (typeof marks)[number] & { liters: number } => m.liters !== null)
      .map((m) => ({
        key: m.key,
        short: m.short,
        pos: (m.liters / t.capacityLiters) * 100,
        title: `${m.label}: ${m.liters.toLocaleString('it-IT')} l`,
      }));
  });

  protected readonly ticks = [100, 75, 50, 25, 0];
}
