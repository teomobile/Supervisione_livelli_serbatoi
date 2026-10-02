import { Provider, inject } from '@angular/core';
import { AppConfigService } from '../config/app-config';
import { HttpTankApi } from './http-tank-api';
import { MockTankApi } from './mock-tank-api';
import { TankApi } from './tank-api';

export function provideTankApi(): Provider {
  return {
    provide: TankApi,
    useFactory: () => (inject(AppConfigService).config.useMock ? inject(MockTankApi) : inject(HttpTankApi)),
  };
}
