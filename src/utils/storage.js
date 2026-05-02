import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

const DIR = Directory.Data;

export async function writeJson(path, data) {
  try {
    // If it's a deep path like jarvis-journals/2026-05-02.json, ensure directory exists
    if (path.includes('/')) {
      const parts = path.split('/');
      parts.pop();
      const dirPath = parts.join('/');
      try {
        await Filesystem.mkdir({
          path: dirPath,
          directory: DIR,
          recursive: true
        });
      } catch (e) {} // Exists
    }

    await Filesystem.writeFile({
      path,
      data: JSON.stringify(data, null, 2),
      directory: DIR,
      encoding: Encoding.UTF8,
    });
    return true;
  } catch (e) {
    console.error(`[Storage] Failed to write ${path}:`, e);
    return false;
  }
}

export async function readJson(path) {
  try {
    const res = await Filesystem.readFile({
      path,
      directory: DIR,
      encoding: Encoding.UTF8,
    });
    return JSON.parse(res.data);
  } catch (e) {
    return null; // Not found or invalid
  }
}

export async function listJsonFiles(pathDir) {
  try {
    const res = await Filesystem.readdir({
      path: pathDir,
      directory: DIR,
    });
    // Capacitor v4+ returns objects for files, older versions returned strings. Handle both.
    return res.files
      .map(f => typeof f === 'string' ? f : f.name)
      .filter(n => n && n.endsWith('.json'));
  } catch {
    return [];
  }
}
