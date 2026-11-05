import type { Checklist } from './checklist';

// Home screen widgets exist only on Android. See widgetBridge.android.tsx.
export function registerWidgets(): void {}

export function updateWidgets(_list: Checklist): void {}
