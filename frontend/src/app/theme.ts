import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/**
 * Tema sobrio da sala controllo: grigi neutri, angoli quasi squadrati,
 * nessuna transizione. Il colore resta riservato agli stati anomali.
 */
export const PlantPreset = definePreset(Aura, {
  primitive: {
    borderRadius: { none: '0', xs: '1px', sm: '2px', md: '2px', lg: '3px', xl: '4px' },
  },
  semantic: {
    transitionDuration: '0s',
    primary: {
      50: '{slate.50}', 100: '{slate.100}', 200: '{slate.200}', 300: '{slate.300}', 400: '{slate.400}',
      500: '{slate.500}', 600: '{slate.600}', 700: '{slate.700}', 800: '{slate.800}', 900: '{slate.900}', 950: '{slate.950}',
    },
    colorScheme: {
      light: {
        primary: {
          color: '{slate.700}',
          contrastColor: '#ffffff',
          hoverColor: '{slate.800}',
          activeColor: '{slate.900}',
        },
        surface: {
          0: '#ffffff', 50: '{neutral.50}', 100: '{neutral.100}', 200: '{neutral.200}', 300: '{neutral.300}', 400: '{neutral.400}',
          500: '{neutral.500}', 600: '{neutral.600}', 700: '{neutral.700}', 800: '{neutral.800}', 900: '{neutral.900}', 950: '{neutral.950}',
        },
      },
    },
  },
});
