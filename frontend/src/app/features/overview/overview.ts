import { Component, computed, inject } from '@angular/core';
import { SystemStatusStore } from '../../core/state/system-status.store';
import { TankStatus, ZONE_LABELS, ZoneCode } from '../../core/models/tank.models';
import { TankTile } from './tank-tile/tank-tile';

/** Destinazione d'uso note dal capitolato: travaso futuro da G-H verso A-B. */
const ZONE_ROLE: Partial<Record<ZoneCode, string>> = {
  AB: 'Produzione',
  GH: 'Stoccaggio',
};

interface ZoneView {
  code: ZoneCode;
  label: string;
  role: string | null;
  hornActive: boolean;
  tanks: TankStatus[];
}

@Component({
  selector: 'app-overview',
  imports: [TankTile],
  templateUrl: './overview.html',
  styleUrl: './overview.scss',
})
export class Overview {
  protected readonly store = inject(SystemStatusStore);

  protected readonly zones = computed<ZoneView[]>(() => {
    const s = this.store.status();
    if (!s) return [];
    return (Object.keys(ZONE_LABELS) as ZoneCode[]).map((code) => ({
      code,
      label: ZONE_LABELS[code],
      role: ZONE_ROLE[code] ?? null,
      hornActive: s.horns.find((h) => h.zone === code)?.active ?? false,
      tanks: s.tanks.filter((t) => t.zone === code),
    }));
  });
}
