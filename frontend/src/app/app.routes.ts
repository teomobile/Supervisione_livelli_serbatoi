import { Routes } from '@angular/router';
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
        loadComponent: () => import('./features/placeholder/placeholder').then((m) => m.Placeholder),
        data: { title: 'Trend comparato', note: 'Confronto di più serbatoi sullo stesso grafico: prossimo passo.' },
      },
      {
        path: 'configurazione',
        title: 'Configurazione — Serbatoi',
        loadComponent: () => import('./features/placeholder/placeholder').then((m) => m.Placeholder),
        data: {
          title: 'Configurazione',
          note: 'Capacità e soglie per serbatoio: da definire insieme al backend (scrittura su PLC).',
        },
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
