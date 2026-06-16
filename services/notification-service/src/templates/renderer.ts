/**
 * Tiny mustache-style template renderer.
 *
 * Supports `{{ path.to.value }}` interpolation against a plain data object,
 * with dotted paths for nested fields. Missing values render as an empty
 * string so a notification never fails just because one field is absent.
 * Deliberately dependency-free — the templates here are small and fixed, so a
 * full templating engine would be overkill.
 */
export function render(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
    const value = resolvePath(data, path);
    return value === undefined || value === null ? '' : String(value);
  });
}

function resolvePath(data: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, data);
}
