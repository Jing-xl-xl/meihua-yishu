/**
 * 客户端断开绑定（修复：不能监听 req 的 close）
 *
 * Node 的 `http.IncomingMessage` 在 **请求体读完** 时就会触发 `close`（complete=true），
 * 不是"客户端断开"；用它 abort 会让每个 POST-SSE 请求刚进来就被取消。
 * 正确信号源是 **响应对象**：`res` 的 close 且响应尚未 end（writableEnded=false）
 * 才代表连接被客户端中断。
 */
type ResLike = {
  on: (event: 'close' | 'error', cb: () => void) => void;
  writableEnded: boolean;
};

export function bindClientDisconnect(res: ResLike, ac: AbortController): void {
  res.on('close', () => {
    if (!res.writableEnded) ac.abort();
  });
  res.on('error', () => ac.abort());
}
