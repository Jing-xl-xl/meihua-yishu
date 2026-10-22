type CryptoLike = {
  randomUUID?: () => string;
};

/** 优先 Web Crypto；Node 22 全局亦提供 globalThis.crypto */
export function newId(): string {
  const c = (globalThis as { crypto?: CryptoLike }).crypto;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  throw new Error('crypto.randomUUID is not available');
}
