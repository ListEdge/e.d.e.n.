/** Payments provider contract. Every purchase requires explicit approval. */
export interface PaymentsProvider {
  readonly id: string;
  available(): boolean;
  charge(amountCents: number, currency: string, description: string): Promise<{ receiptId: string }>;
}
