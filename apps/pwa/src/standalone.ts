interface StandaloneEnv {
  // userAgent is only here so the real Navigator shares a property with this all-optional type.
  navigator: { standalone?: boolean; userAgent?: string };
  matchMedia(query: string): { matches: boolean };
}

/** True when the page runs as a home-screen app, whose storage can be separate from Safari. */
export function isStandaloneMode(win: StandaloneEnv): boolean {
  return win.navigator.standalone === true || win.matchMedia("(display-mode: standalone)").matches;
}
