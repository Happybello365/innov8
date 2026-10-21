import apiClient from './client';

/** A client-readable feature flag resolved for the signed-in wallet (#269). */
export interface ClientFeatureFlag {
  name: string;
  enabled: boolean;
  /** Optional numeric setting, e.g. a USDC threshold. */
  value: number | null;
}

export const featuresApi = {
  async getFlag(name: string): Promise<ClientFeatureFlag> {
    const response = await apiClient.get(`/features/${encodeURIComponent(name)}`);
    return response.data;
  },
};
