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
      { key: 'fill', liters: t.thresholds.fillLiters, label: 'Soglia pieno' },
      { key: 'warn', liters: t.thresholds.lowWarningLiters, label: 'Livello basso' },
      { key: 'stop', liters: t.thresholds.lowStopLiters, label: 'Livello minimo' },
    ];
    return marks
      .filter((m): m is { key: string; liters: number; label: string } => m.liters !== null)
      .map((m) => ({ key: m.key, pos: (m.liters / t.capacityLiters) * 100, title: `${m.label} ${m.liters} l` }));
  });

  protected readonly ticks = [100, 75, 50, 25, 0];
}
