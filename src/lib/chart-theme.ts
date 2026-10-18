import { useColorScheme } from 'react-native';

// Chart colours from the reference palette (references/palette.md of the dataviz skill). One series, so
// slot 1 blue: checked with the palette validator on the light and the dark chart surface.
const LIGHT = {
  surface: '#fcfcfb',
  primary: '#0b0b0b',
  secondary: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  baseline: '#c3c2b7',
  border: 'rgba(11,11,11,0.10)',
  series: '#2a78d6',
};
const DARK: typeof LIGHT = {
  surface: '#1a1a19',
  primary: '#f0efec',
  secondary: '#c3c2b7',
  muted: '#898781',
  grid: '#2c2c2a',
  baseline: '#383835',
  border: 'rgba(255,255,255,0.10)',
  series: '#3987e5',
};

export const useChartColors = () => (useColorScheme() === 'dark' ? DARK : LIGHT);
