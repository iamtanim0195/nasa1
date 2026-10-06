'use client';

import { create } from 'zustand';
import { uid } from '@/lib/utils';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  /** Auto-dismiss delay in ms; 0 keeps the toast until dismissed. */
  duration: number;
  createdAt: number;
}

export interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id' | 'createdAt' | 'duration'> & { duration?: number }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

/**
 * Transient notifications. Kept separate from `appStore` so that components
 * that only raise toasts do not subscribe to the whole mission state.
 */
export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],

  push: ({ duration = 4_500, ...toast }) => {
    const id = uid('toast');
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id, duration, createdAt: Date.now() }].slice(-4),
    }));
    return id;
  },

  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/** Convenience helpers usable outside React (e.g. in query callbacks). */
export const toast = {
  info: (title: string, description?: string) =>
    useToastStore.getState().push({ title, description, variant: 'info' }),
  success: (title: string, description?: string) =>
    useToastStore.getState().push({ title, description, variant: 'success' }),
  warning: (title: string, description?: string) =>
    useToastStore.getState().push({ title, description, variant: 'warning' }),
  error: (title: string, description?: string) =>
    useToastStore.getState().push({ title, description, variant: 'error', duration: 7_000 }),
};
