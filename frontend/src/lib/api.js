// Client for the FastAPI planning service. Every call is stateless: the selections
// travel with each request, together with the CSV when one is uploaded.
import bundled from '../data/sample-result.json';

async function call(path, { method = 'GET', form } = {}) {
  const res = await fetch(path, { method, body: form });
  if (!res.ok) {
    let message = `The server returned ${res.status}.`;
    try {
      const body = await res.json();
      if (typeof body.detail === 'string') message = body.detail;
    } catch { /* not JSON */ }
    throw new Error(message);
  }
  return res;
}

function formFor(config, file) {
  const form = new FormData();
  form.append('config', JSON.stringify(config));
  if (file) form.append('file', file);
  return form;
}

export const api = {
  async health() {
    try {
      const res = await call('/api/health');
      return { online: true, ...(await res.json()) };
    } catch {
      return { online: false };
    }
  },

  async inspect(file) {
    const form = new FormData();
    form.append('file', file);
    return (await call('/api/inspect', { method: 'POST', form })).json();
  },

  async run(config, file) {
    return (await call('/api/runs', { method: 'POST', form: formFor(config, file) })).json();
  },

  async workbook(config, file, fileName) {
    const res = await call('/api/export', { method: 'POST', form: formFor(config, file) });
    const blob = await res.blob();
    return { blob, filename: fileName };
  },
};

export const bundledResult = bundled;
