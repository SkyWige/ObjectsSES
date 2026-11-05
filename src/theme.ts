import type { TextColorName } from './checklist';

export type ThemeName = 'light' | 'dark';

export const THEMES = {
  light: {
    background: '#FFFFFF',
    surface: '#F4F4F4',
    text: '#171717',
    muted: '#666666',
    line: '#E2E2E2',
    accent: '#1F6FEB',
    onAccent: '#FFFFFF',
    bannerBackground: '#EAF2FE',
    danger: '#C62828',
  },
  dark: {
    background: '#141414',
    surface: '#242424',
    text: '#F2F2F2',
    muted: '#A3A3A3',
    line: '#333333',
    accent: '#7CB0FF',
    onAccent: '#141414',
    bannerBackground: '#1F2A3A',
    danger: '#FF8A80',
  },
} as const;

export type Colors = { [Key in keyof typeof THEMES.light]: string };

/** Each colour keeps at least 4.5:1 contrast on its theme's background. */
export const TEXT_COLORS: Record<ThemeName, Record<TextColorName, `#${string}`>> = {
  light: {
    red: '#C62828',
    orange: '#B45309',
    green: '#2E7D32',
    blue: '#1565C0',
    purple: '#6A1B9A',
  },
  dark: {
    red: '#FF8A80',
    orange: '#FFB74D',
    green: '#81C784',
    blue: '#64B5F6',
    purple: '#CE93D8',
  },
};

export const TEXT_COLOR_LABELS: Record<TextColorName, string> = {
  red: 'Красный',
  orange: 'Оранжевый',
  green: 'Зелёный',
  blue: 'Синий',
  purple: 'Фиолетовый',
};
