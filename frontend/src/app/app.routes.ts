import { Routes } from '@angular/router';
import { unsavedChangesGuard } from './features/settings/unsaved-changes.guard';
import { Shell } from './layout/shell';

export const routes: Routes = [
  {
    path: '',
    component: Shell,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'sinottico' },
      {
        path: 'sinottico',
        title: 'Sinottico — Serbatoi',
        loadComponent: () => import('./features/overview/overview').then((m) => m.Overview),
      },
      {
        path: 'serbatoi/:code',
        title: 'Dettaglio serbatoio',
        loadComponent: () => import('./features/tank-detail/tank-detail').then((m) => m.TankDetail),
      },
      {
        path: 'allarmi',
        title: 'Allarmi — Serbatoi',
        loadComponent: () => import('./features/alarms/alarms').then((m) => m.Alarms),
      },
      {
        path: 'trend',
        title: 'Trend — Serbatoi',
        loadComponent: () => import('./features/trends/trends').then((m) => m.Trends),
      },
      {
        path: 'configurazione',
        title: 'Configurazione — Serbatoi',
        loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'travaso',
        title: 'Travaso — Serbatoi',
        loadComponent: () => import('./features/placeholder/placeholder').then((m) => m.Placeholder),
        data: { title: 'Travaso G-H → A-B', note: 'Funzione predisposta, non attiva.' },
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
