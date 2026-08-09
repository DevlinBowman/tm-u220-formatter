// Owns browser file selection and atomic writes for receipt source documents.
const pickerTypes = [{
  description: "U220 receipt source",
  accept: { "text/plain": [".u220", ".txt"] },
}];

function fallbackOpen(input) {
  return new Promise((resolve) => {
    const finish = (file) => {
      input.removeEventListener("change", onChange);
      input.removeEventListener("cancel", onCancel);
      resolve(file || null);
    };
    const onChange = () => finish(input.files?.[0]);
    const onCancel = () => finish(null);
    input.value = "";
    input.addEventListener("change", onChange, { once: true });
    input.addEventListener("cancel", onCancel, { once: true });
    input.click();
  });
}

export async function openBrowserFile(input) {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: pickerTypes });
      const file = await handle.getFile();
      return { handle, name: file.name, source: await file.text() };
    } catch (error) {
      if (error.name === "AbortError") return null;
    }
  }
  const file = await fallbackOpen(input);
  return file ? { handle: null, name: file.name, source: await file.text() } : null;
}

export async function writeBrowserFile(handle, source) {
  const writable = await handle.createWritable();
  await writable.write(source);
  await writable.close();
}

function downloadCopy(source, name) {
  const url = URL.createObjectURL(new Blob([source], { type: "text/plain;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveBrowserCopy(source, suggestedName) {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: pickerTypes,
      });
      await writeBrowserFile(handle, source);
      return { handle, name: handle.name, downloaded: false };
    } catch (error) {
      if (error.name === "AbortError") return null;
    }
  }
  downloadCopy(source, suggestedName);
  return { handle: null, name: suggestedName, downloaded: true };
}
