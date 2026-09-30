/**
 * 把一段二进制内容保存为本地文件。
 *
 * 走浏览器下载流程，不会打扰正在输入的内容。文本导出与图片导出共用这一条路径，
 * 免得两处各写一遍「造 URL → 造 a → 点一下 → 回收 URL」。
 */
export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * 把文本保存为本地文件（写作导出 Markdown 等场景）。
 */
export function downloadTextFile(fileName: string, text: string): void {
  downloadBlob(fileName, new Blob([text], { type: 'text/plain;charset=utf-8' }));
}
