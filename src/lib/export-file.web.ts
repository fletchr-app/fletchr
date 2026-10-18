/** In the browser: download the file. (The native file modules are not loaded here.) */
export async function saveJson(filename: string, text: string): Promise<'saved' | 'shared'> {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return 'saved';
}
