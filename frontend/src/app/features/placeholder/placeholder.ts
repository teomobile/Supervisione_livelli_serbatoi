import { Component, input } from '@angular/core';

/** Pagina segnaposto per le sezioni previste nelle fasi successive. */
@Component({
  selector: 'app-placeholder',
  template: `
    <div class="page">
      <div class="page-title"><h1>{{ title() }}</h1></div>
      <div class="panel body">{{ note() }}</div>
    </div>
  `,
  styles: `
    .body {
      padding: 24px;
      color: var(--hmi-text-muted);
    }
  `,
})
export class Placeholder {
  readonly title = input('');
  readonly note = input('');
}
