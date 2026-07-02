/** File storage provider contract. */
export interface StorageProvider {
  readonly id: string;
  available(): boolean;
  put(path: string, data: ArrayBuffer | string): Promise<string>;
  get(path: string): Promise<ArrayBuffer | null>;
  remove(path: string): Promise<void>;
}
