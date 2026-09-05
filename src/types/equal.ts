// SPDX-License-Identifier: GPL-3.0-only

// Type-only. Safe to import from content, Mini protocol, and privileged
// schemas without crossing a Zod isolation wall.
//
// Prettier drops the parentheses around the second function type and
// changes two-way equality into a weaker parse.
// prettier-ignore
export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
