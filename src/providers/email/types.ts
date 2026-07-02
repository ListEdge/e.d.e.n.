/** Email provider contract. */
export interface EmailProvider {
  readonly id: string;
  available(): boolean;
  send(to: string, subject: string, body: string): Promise<void>;
  listRecent(limit?: number): Promise<Array<{ from: string; subject: string; at: string }>>;
}
