export function requireAdmin(req, res) {
const hdr = req.headers['authorization'] || '';
const token = hdr.startsWith('Basic ') ? hdr.slice(6) : '';
const [user, pass] = Buffer.from(token, 'base64').toString('utf8').split(':');
if (user !== process.env.ADMIN_USER || pass !== process.env.ADMIN_PASS) {
if (res) res.setHeader('WWW-Authenticate', 'Basic realm="FFL Admin"');
const err = new Error('Unauthorized');
err.statusCode = 401;
throw err;
}
}
