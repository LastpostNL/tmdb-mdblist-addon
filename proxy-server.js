const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

function logRequest(req, res, next) {
  console.log(`[Proxy] ${req.method} ${req.originalUrl} - query:`, req.query);
  next();
}

function logResponse(proxyRes, req, res) {
  let body = [];
  proxyRes.on('data', chunk => {
    body.push(chunk);
  });
  proxyRes.on('end', () => {
    body = Buffer.concat(body).toString();
    console.log(`[Proxy Response] ${req.method} ${req.originalUrl} - body:`, body);
  });
}

const commonProxyOptions = {
  target: 'https://api.mdblist.com',
  changeOrigin: true,
  onProxyReq(proxyReq, req, res) {
    // Zet headers mee, bijvoorbeeld Accept en User-Agent
    proxyReq.setHeader('Accept', 'application/json');
    proxyReq.setHeader('User-Agent', 'TMDB-Addon-Proxy/1.0');
  },
  onProxyRes: logResponse,
  logLevel: 'debug',
};

// Proxy voor user info
app.use('/api/user', logRequest, createProxyMiddleware({
  ...commonProxyOptions,
  pathRewrite: { '^/api/user': '/user' },
}));

// Proxy voor lists van user
app.use('/api/lists/user', logRequest, createProxyMiddleware({
  ...commonProxyOptions,
  pathRewrite: { '^/api/lists/user': '/lists/user' },
}));

const PORT = 7000;
app.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`);
});