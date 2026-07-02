/** Deployment provider contract (Vercel first; others later). */
export interface DeploymentProvider {
  readonly id: string;
  available(): boolean;
  deployPreview(repo: string, branch: string): Promise<{ url: string }>;
  deployProduction(repo: string): Promise<{ url: string }>;
}
