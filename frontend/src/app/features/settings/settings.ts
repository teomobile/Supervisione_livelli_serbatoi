import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TankApi } from '../../core/api/tank-api';
import { CONFIG_LIMITS, TankConfig, validateTankConfig } from '../../core/models/tank-config';
import { TankCode } from '../../core/models/tank.models';
import { HasUnsavedChanges } from './unsaved-changes.guard';

type EditableField = 'name' | 'capacityLiters' | 'fullPercent' | 'tooFullPercent';

const EDITABLE: EditableField[] = ['name', 'capacityLiters', 'fullPercent', 'tooFullPercent'];

@Component({
  selector: 'app-settings',
  imports: [FormsModule, DatePipe, DecimalPipe, TableModule, InputNumberModule, InputTextModule, ButtonModule, ConfirmDialogModule],
  providers: [ConfirmationService],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings implements HasUnsavedChanges {
  private readonly api = inject(TankApi);
  private readonly confirm = inject(ConfirmationService);

  protected readonly limits = CONFIG_LIMITS;

  /** Ultima configurazione letta o salvata sul backend. */
  private readonly saved = signal<TankConfig[]>([]);
  /** Copia modificabile mostrata in tabella. */
  protected readonly draft = signal<TankConfig[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly savedAt = signal<Date | null>(null);

  /** Valori della riga "tutti i serbatoi", applicati solo alla bozza. */
  protected readonly bulk = signal({ capacityLiters: 10_000, fullPercent: 85, tooFullPercent: 95 });

  protected readonly errors = computed(() => {
    const map = new Map<TankCode, string[]>();
    for (const c of this.draft()) map.set(c.code, validateTankConfig(c));
    return map;
  });

  protected readonly changedCodes = computed(() => {
    const before = new Map(this.saved().map((c) => [c.code, c]));
    return this.draft()
      .filter((c) => EDITABLE.some((f) => before.get(c.code)?.[f] !== c[f]))
      .map((c) => c.code);
  });

  protected readonly hasErrors = computed(() => [...this.errors().values()].some((e) => e.length > 0));
  protected readonly canSave = computed(() => this.changedCodes().length > 0 && !this.hasErrors() && !this.saving());

  constructor() {
    this.load();
  }

  hasUnsavedChanges(): boolean {
    return this.changedCodes().length > 0;
  }

  /** Avviso del browser se si chiude o ricarica la pagina con modifiche non salvate. */
  @HostListener('window:beforeunload', ['$event'])
  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) event.preventDefault();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.api.getTankConfig().subscribe({
      next: (rows) => {
        this.saved.set(rows);
        this.draft.set(rows.map((r) => ({ ...r })));
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(true);
        this.loading.set(false);
      },
    });
  }

  protected setField<K extends EditableField>(code: TankCode, field: K, value: TankConfig[K]): void {
    this.draft.update((rows) => rows.map((r) => (r.code === code ? { ...r, [field]: value } : r)));
    this.savedAt.set(null);
  }

  protected setBulk(field: 'capacityLiters' | 'fullPercent' | 'tooFullPercent', value: number): void {
    this.bulk.update((b) => ({ ...b, [field]: value }));
  }

  protected applyBulk(): void {
    const b = this.bulk();
    this.draft.update((rows) => rows.map((r) => ({ ...r, ...b })));
    this.savedAt.set(null);
  }

  protected discard(): void {
    this.draft.set(this.saved().map((r) => ({ ...r })));
    this.saveError.set(null);
  }

  protected isChanged(code: TankCode, field?: EditableField): boolean {
    const before = this.saved().find((c) => c.code === code);
    const after = this.draft().find((c) => c.code === code);
    if (!before || !after) return false;
    return field ? before[field] !== after[field] : EDITABLE.some((f) => before[f] !== after[f]);
  }

  protected liters(row: TankConfig, percent: number | null): number | null {
    return percent === null || !row.capacityLiters ? null : (row.capacityLiters * percent) / 100;
  }

  protected askSave(): void {
    const codes = this.changedCodes();
    const fullChanged = codes.some((c) => this.isChanged(c, 'fullPercent'));
    this.confirm.confirm({
      header: 'Salvare la configurazione?',
      message:
        `Modifiche a ${codes.length === 1 ? 'il serbatoio' : codes.length + ' serbatoi'}: ${codes.join(', ')}.` +
        (fullChanged
          ? '<br><br><b>La soglia di pieno è cambiata.</b> Va modificata anche nel programma del PLC, ' +
            'altrimenti la linea "Pieno" non corrisponde più al segnale X_Full.'
          : ''),
      acceptLabel: 'Salva',
      rejectLabel: 'Annulla',
      rejectButtonProps: { outlined: true },
      accept: () => this.save(),
    });
  }

  private save(): void {
    const codes = new Set(this.changedCodes());
    const changes = this.draft().filter((c) => codes.has(c.code));
    this.saving.set(true);
    this.saveError.set(null);
    this.api.saveTankConfig(changes).subscribe({
      next: (rows) => {
        this.saved.set(rows);
        this.draft.set(rows.map((r) => ({ ...r })));
        this.saving.set(false);
        this.savedAt.set(new Date());
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.saveError.set(err instanceof Error ? err.message : 'Salvataggio non riuscito');
      },
    });
  }
}
