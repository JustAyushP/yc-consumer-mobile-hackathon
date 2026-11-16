export function storyDestination(token: string | null): "/world" | "/demo" {
  return token ? "/world" : "/demo";
}

export function isViewerLink(t: string | string[] | undefined): boolean {
  return t !== undefined;
}
