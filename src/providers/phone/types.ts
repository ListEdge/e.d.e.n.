/**
 * Phone provider contract.
 * Eden always identifies itself honestly on calls:
 * "Hello, this is Eden, an AI assistant calling on behalf of its owner."
 */
export interface PhoneProvider {
  readonly id: string;
  available(): boolean;
  call(number: string, script: string): Promise<{ callId: string }>;
  transcript(callId: string): Promise<string | null>;
}
