/**
 * Minimal ANSI color helpers.
 * All functions are no-ops when stdout is not a TTY (piped output, --json, CI).
 */
const tty = Boolean(process.stdout.isTTY);

const ansi =
  (code: string) =>
  (s: string): string =>
    tty ? `\x1b[${code}m${s}\x1b[0m` : s;

export const bold = ansi("1");
export const dim = ansi("2");
export const green = ansi("32");
export const yellow = ansi("33");
export const cyan = ansi("36");
export const gray = ansi("90");

/** Inline-bold a word inside a regular string. */
export const b = bold;

/** A dim horizontal rule. */
export const rule = (width = 58): string => dim("─".repeat(width));

/** Format a CLI command for display. */
export const cmd = (s: string): string => cyan(s);

/** Format a file path for display. */
export const file = (s: string): string => gray(s);

/** Format a positive marker. */
export const plus = (): string => green("+");

/** Format a warning marker. */
export const warn = (): string => yellow("!");

/** Format a missing/error marker. */
export const minus = (): string => yellow("-");

/**
 * The marker for what a write actually did.
 *
 * Every write used to print as `+`, so a preserved file was indistinguishable from a created
 * one and the CLI reported writes it had decided not to perform.
 */
export const mark = (kind: "create" | "update" | "preserve" | "suggest" | "skip"): string =>
  ({
    create: green("+"),
    update: cyan("~"),
    preserve: gray("="),
    suggest: yellow("!"),
    skip: gray("·"),
  })[kind];
