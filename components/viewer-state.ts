export type ViewerState = { token: string | null; ready: boolean; link: string | undefined };

export function acceptLink(state: ViewerState, link: string | undefined): ViewerState {
  if (link === undefined || link === state.link) return state;
  return { token: link || null, ready: true, link };
}

export function restoreViewer(state: ViewerState, token: string | null): ViewerState {
  if (state.link !== undefined) return state;
  return { ...state, token, ready: true };
}
