export default async function handler(req, res) {
  const env = {
    has_POSTGRES_URL: Boolean(process.env.POSTGRES_URL),
    has_POSTGRES_URL_NON_POOLING: Boolean(process.env.POSTGRES_URL_NON_POOLING),
    node: process.version
  };
  res.status(200).json({ ok: true, env });
}

