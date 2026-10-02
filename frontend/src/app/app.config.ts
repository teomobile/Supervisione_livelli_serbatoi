import { registerLocaleData } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import localeIt from '@angular/common/locales/it';
import {
  ApplicationConfig,
  LOCALE_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideEchartsCore } from 'ngx-echarts';
import { providePrimeNG } from 'primeng/config';

import { routes } from './app.routes';
import { provideTankApi } from './core/api/api.providers';
import { AppConfigService } from './core/config/app-config';
import { PRIMENG_IT } from './primeng-it';
import { PlantPreset } from './theme';

registerLocaleData(localeIt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
    provideRouter(routes, withComponentInputBinding()),
    provideAppInitializer(() => inject(AppConfigService).load()),
    provideTankApi(),
    // ECharts caricato solo quando serve un grafico.
    provideEchartsCore({ echarts: () => import('./echarts-setup').then((m) => m.echarts) }),
    providePrimeNG({
      theme: { preset: PlantPreset, options: { darkModeSelector: false } },
      ripple: false,
      translation: PRIMENG_IT,
    }),
    { provide: LOCALE_ID, useValue: 'it-IT' },
  ],
};
