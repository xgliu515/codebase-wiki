import { randomBytes } from 'node:crypto';

export function generateState(): string {
  return randomBytes(16).toString('hex');
}

export function buildAuthorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: 'read:user user:email',
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

export type GitHubUser = {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  email: string | null;
};

export async function exchangeCodeForToken(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const res = await fetcher('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  });
  if (!res.ok) throw new Error(`oauth_upstream_failed: ${res.status}`);
  const body = (await res.json()) as { access_token?: string; error?: string };
  if (!body.access_token) throw new Error(`oauth_upstream_failed: ${body.error ?? 'no token'}`);
  return body.access_token;
}

export async function fetchGitHubUser(
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<GitHubUser> {
  const res = await fetcher('https://api.github.com/user', {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`oauth_upstream_failed: ${res.status}`);
  return (await res.json()) as GitHubUser;
}
