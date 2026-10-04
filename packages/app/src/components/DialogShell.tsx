// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { openDialog } from '../commands.ts';

/** A modal dialog with a title; closing it clears the store's dialog. */
export function Shell(props: {
  title: string;
  description?: string | undefined;
  wide?: boolean;
  /** Extra class for the content box (custom sizes). */
  className?: string;
  children: ReactNode;
  onClose?: () => void;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(o) => {
        if (o) return;
        props.onClose?.();
        openDialog(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className={`dialog-content${props.wide ? ' dialog-wide' : ''}${props.className ? ' ' + props.className : ''}`}
        >
          <Dialog.Title className="dialog-title">{props.title}</Dialog.Title>
          {props.description !== undefined ? (
            <Dialog.Description className="dialog-description">
              {props.description}
            </Dialog.Description>
          ) : (
            <Dialog.Description className="visually-hidden">{props.title}</Dialog.Description>
          )}
          {props.children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
