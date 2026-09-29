/**
 * 把文本保存为本地文件（写作导出 Markdown 等场景）。
 * 走浏览器下载流程，不会打扰正在输入的内容。
 */
export function downloadTextFile(fileName: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
