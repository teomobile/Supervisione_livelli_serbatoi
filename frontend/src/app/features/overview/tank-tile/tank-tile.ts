import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { tankCondition, tankNote } from '../../../core/models/tank-state';
import { TankStatus } from '../../../core/models/tank.models';
import { TankGauge } from '../../../shared/tank-gauge/tank-gauge';

@Component({
  selector: 'app-tank-tile',
  imports: [TankGauge, RouterLink, DecimalPipe, DatePipe],
  templateUrl: './tank-tile.html',
  styleUrl: './tank-tile.scss',
})
export class TankTile {
  readonly tank = input.required<TankStatus>();

  protected readonly condition = computed(() => tankCondition(this.tank()));

  protected readonly note = computed(() => tankNote(this.tank()));
}
