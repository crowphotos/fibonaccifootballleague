export default async function handler(req, res) {
  const hasUrl = !!process.env.POSTGRES_URL;
  res.status(200).json({
    ok: true,
    node: process.version,
    hasPostgresUrl: hasUrl
  });
}

