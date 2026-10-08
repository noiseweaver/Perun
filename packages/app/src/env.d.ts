// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

interface ImportMetaEnv {
  /** The app's version (root package.json), set by vite.config.ts. */
  readonly APP_VERSION: string;
  /** The git commit the build was made from (short SHA), or "" outside a checkout. */
  readonly APP_COMMIT: string;
  /** The build date, yyyy-mm-dd. */
  readonly APP_BUILD_DATE: string;
}
