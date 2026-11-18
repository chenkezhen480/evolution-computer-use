/**
 * What went wrong and is still wrong; each entry clears when its work next succeeds. Hosts read `list()` to show
 * health, and `onChange` to log it as it happens (the MCP server writes it to stderr).
 */
export class Faults {
  private readonly entries = new Map<string, string>();
  private readonly onChange: ((key: string, text: string | undefined) => void) | undefined;
  constructor(onChange?: (key: string, text: string | undefined) => void) { this.onChange = onChange; }
  set(key: string, text: string): void {
    if (this.entries.get(key) === text) return;
    this.entries.set(key, text); this.onChange?.(key, text);
  }
  clear(...keys: string[]): void { for (const key of keys) if (this.entries.delete(key)) this.onChange?.(key, undefined); }
  list(): string[] { return [...this.entries.values()]; }
}
export const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
