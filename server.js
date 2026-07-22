const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const peers = new Map();

function serveStatic(req, res) {
  const filePath = path.join(__dirname, 'index.html');
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'POST' && url.pathname === '/signal/offer') {
      const b = await readJsonBody(req);
      const peerId = b.peerId || crypto.randomBytes(6).toString('hex');
      let p = peers.get(peerId) || { toSender: [], toReceiver: [] };
      p.offer = b.sdp; p.name = b.name || 'Singer'; p.claimed = false;
      peers.set(peerId, p);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ peerId }));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/signal/offers') {
      const list = [];
      for (const [id, p] of peers) if (p.offer && !p.claimed) list.push({ peerId: id, sdp: p.offer, name: p.name });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ offers: list }));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/signal/answer') {
      const b = await readJsonBody(req);
      const p = peers.get(b.peerId);
      if (p) { p.answer = b.sdp; p.claimed = true; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/signal/answer/')) {
      const p = peers.get(url.pathname.split('/').pop());
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sdp: p ? p.answer : null }));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/signal/candidate') {
      const b = await readJsonBody(req);
      const p = peers.get(b.peerId);
      if (p) {
        if (b.from === 'sender') p.toReceiver.push(b.candidate);
        else p.toSender.push(b.candidate);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/signal/candidates/')) {
      const p = peers.get(url.pathname.split('/')[3]);
      const from = url.searchParams.get('from');
      const list = p ? (from === 'sender' ? p.toReceiver.splice(0) : p.toSender.splice(0)) : [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ candidates: list }));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/signal/leave') {
      const b = await readJsonBody(req);
      peers.delete(b.peerId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    serveStatic(req, res);
  } catch (e) {
    res.writeHead(500); res.end(e.toString());
  }
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));