import { endpoints } from '@config/endpoints';
import { assertCredentialsConfigured, env } from '@config/env';
import type { HttpClient } from '@core/http-client';
import type { HttpResult } from '@core/types';
import { BaseService } from './base.service';

export interface TokenResponse {
  access_token: string;
  token_type?: string;
}

export interface UserPublic {
  id?: number;
  email?: string;
  active?: boolean;
}

export class AuthService extends BaseService {
  constructor(http: HttpClient) {
    super(http);
  }

  async requestToken(username: string, password: string): Promise<HttpResult<TokenResponse>> {
    return this.http.post<TokenResponse>(endpoints.auth.accessToken, {
      form: { username, password },
    });
  }

  async login(): Promise<string> {
    assertCredentialsConfigured();

    const { username, password } = env.api.credentials;
    const response = await this.requestToken(username, password);

    if (response.status !== 200 || !response.body?.access_token) {
      throw new Error(
        `Falha ao autenticar em ${endpoints.auth.accessToken} ` +
          `(HTTP ${response.status}): ${response.text.slice(0, 300)}`,
      );
    }

    return response.body.access_token;
  }
}
