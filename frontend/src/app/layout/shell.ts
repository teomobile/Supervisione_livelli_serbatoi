import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ActiveAlarmsStore } from '../core/state/active-alarms.store';
import { SystemStatusStore } from '../core/state/system-status.store';
import { plural } from '../core/time/duration';

interface NavItem {
  label: string;
  path: string;
  disabled?: boolean;
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DatePipe],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  protected readonly store = inject(SystemStatusStore);
  protected readonly alarms = inject(ActiveAlarmsStore);
  protected readonly plural = plural;

  protected readonly nav: NavItem[] = [
    { label: 'Sinottico', path: '/sinottico' },
    { label: 'Trend', path: '/trend' },
    { label: 'Allarmi', path: '/allarmi' },
    { label: 'Configurazione', path: '/configurazione' },
    { label: 'Travaso', path: '/travaso', disabled: true },
  ];

  protected readonly plcState = computed(() => {
    const s = this.store.status();
    if (!s || this.store.isStale()) return { label: 'Nessun dato', css: 'invalid' };
    if (!s.plc.plcReady) return { label: 'Non pronto', css: 'alarm' };
    if (!this.store.plcCommunicationOk()) return { label: 'Com. persa', css: 'alarm' };
    return { label: 'OK', css: '' };
  });
}
