// api/cors.js
export function withCors(handler) {
  return async (req, res) => {
    try {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') return res.status(200).end();
      return await handler(req, res);
    } catch (err) {
      console.error('API error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: String(err?.message || err) });
      }
    }
  };
}

