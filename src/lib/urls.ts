const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function withBase(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  if (path === basePath || path.startsWith(`${basePath}/`)) return path;
  return `${basePath}${path}`;
}
