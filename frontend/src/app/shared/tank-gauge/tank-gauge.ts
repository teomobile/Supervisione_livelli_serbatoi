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
    const pct = (liters: number) => (liters / t.capacityLiters) * 100;
    return [
      { key: 'fill', pos: pct(t.thresholds.fillLiters), title: `Riempimento ${t.thresholds.fillLiters} l` },
      { key: 'warn', pos: pct(t.thresholds.lowWarningLiters), title: `Livello basso ${t.thresholds.lowWarningLiters} l` },
      { key: 'stop', pos: pct(t.thresholds.lowStopLiters), title: `Livello minimo ${t.thresholds.lowStopLiters} l` },
    ];
  });

  protected readonly ticks = [100, 75, 50, 25, 0];
}
