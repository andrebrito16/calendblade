/**
 * Privacy-first Sentry data collection: no user info, cookies, headers,
 * bodies, query strings, SQL parameters or local variables (they could carry
 * session cookies, OAuth tokens or calendar content).
 */
export const sentryDataCollection: {
  userInfo: boolean;
  cookies: boolean;
  httpHeaders: boolean;
  httpBodies: never[];
  urlQueryParams: boolean;
  databaseQueryData: boolean;
  stackFrameVariables: boolean;
} = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  databaseQueryData: false,
  stackFrameVariables: false,
};
