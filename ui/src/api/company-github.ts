import { api } from "./client";

export type CompanyGithubIntegration = {
  configured: boolean;
  provider: string;
  allowedRepoFullNames: string[];
  patSecretId: string | null;
};

export type GithubRepoListItem = {
  fullName: string;
  htmlUrl: string;
  private: boolean;
  defaultBranch: string | null;
};

export const companyGithubApi = {
  getIntegration: (companyId: string) =>
    api.get<CompanyGithubIntegration>(`/companies/${encodeURIComponent(companyId)}/github/integration`),
  listRepos: (companyId: string) =>
    api.get<{ repos: GithubRepoListItem[] }>(
      `/companies/${encodeURIComponent(companyId)}/github/repos`,
    ).then((r) => r.repos),
  putIntegration: (
    companyId: string,
    body: { pat?: string; allowedRepoFullNames: string[] },
  ) =>
    api.put<CompanyGithubIntegration>(
      `/companies/${encodeURIComponent(companyId)}/github/integration`,
      body,
    ),
};
