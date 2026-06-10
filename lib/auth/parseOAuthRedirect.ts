import * as Linking from 'expo-linking';

export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
}

/**
 * Extract the Supabase session tokens from an OAuth redirect URL.
 * Supabase appends them in the URL fragment; some browser flows surface
 * them as query params instead, so check both.
 */
export function parseOAuthRedirect(url: string): OAuthTokens | null {
  const fragment = url.split('#')[1] ?? '';
  const params = new URLSearchParams(fragment);
  const parsed = Linking.parse(url);
  const access_token =
    params.get('access_token') ??
    (parsed.queryParams?.access_token as string | undefined);
  const refresh_token =
    params.get('refresh_token') ??
    (parsed.queryParams?.refresh_token as string | undefined);
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}
