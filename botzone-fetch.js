#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const https = require('https');

const DEFAULT_GAME_ID = '5e37dcf74019f43051e53201';
const DEFAULT_HOST = 'https://en.botzone.org.cn';
const USER_AGENT = 'Mozilla/5.0 (compatible; botzone-public-fetcher/1.0)';

function printHelp() {
  console.log(`Usage: node botzone-fetch.js [options]

Fetch public Botzone match lists and optional per-match lite JSON.

Options:
  --game <id>          Botzone game id (default: ${DEFAULT_GAME_ID})
  --pages <n>          Match-list pages to fetch (default: 1)
  --limit <n>          Maximum matches to include (default: all fetched)
  --out <path>         Write JSON output to this file (default: stdout)
  --host <url>         Botzone host (default: ${DEFAULT_HOST})
  --startid <id>       Start from matches older than this match id
  --endid <id>         Start from matches newer than this match id
  --delay-ms <n>       Delay between detail requests (default: 250)
  --no-details         Only parse list rows; do not fetch /match/<id>?lite=true
  --help               Show this help message

Examples:
  node botzone-fetch.js --pages 2 --limit 10 --out botzone.json
  node botzone-fetch.js --game ${DEFAULT_GAME_ID} --no-details
`);
}

function parseArgs(argv) {
  const options = {
    game: DEFAULT_GAME_ID,
    pages: 1,
    limit: Infinity,
    out: '',
    host: DEFAULT_HOST,
    startid: '',
    endid: '',
    delayMs: 250,
    details: true
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${arg} requires a value`);
      return argv[++i];
    };

    if (arg === '--game') options.game = next();
    else if (arg === '--pages') options.pages = positiveInt(next(), arg);
    else if (arg === '--limit') options.limit = positiveInt(next(), arg);
    else if (arg === '--out') options.out = next();
    else if (arg === '--host') options.host = next().replace(/\/+$/, '');
    else if (arg === '--startid') options.startid = next();
    else if (arg === '--endid') options.endid = next();
    else if (arg === '--delay-ms') options.delayMs = nonNegativeInt(next(), arg);
    else if (arg === '--no-details') options.details = false;
    else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.startid && options.endid) {
    throw new Error('Use only one of --startid or --endid');
  }
  return options;
}

function positiveInt(value, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a positive integer`);
  return n;
}

function nonNegativeInt(value, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a non-negative integer`);
  return n;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildListUrl(options, cursor) {
  const url = new URL('/globalmatchlist', options.host);
  url.searchParams.set('game', options.game);
  if (cursor && cursor.startid) url.searchParams.set('startid', cursor.startid);
  if (cursor && cursor.endid) url.searchParams.set('endid', cursor.endid);
  return url.toString();
}

function buildMatchLiteUrl(host, matchId) {
  return new URL(`/match/${matchId}?lite=true`, host).toString();
}

function requestText(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'http:' ? http : https;
    const req = lib.request(parsed, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8'
      },
      timeout: 30000
    }, res => {
      const location = res.headers.location;
      if (location && [301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.resume();
        if (redirects <= 0) {
          reject(new Error(`Too many redirects for ${url}`));
          return;
        }
        resolve(requestText(new URL(location, url).toString(), redirects - 1));
        return;
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '');
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`GET ${url} failed with ${res.statusCode}: ${body.slice(0, 200)}`));
          return;
        }
        resolve(body);
      });
    });

    req.on('timeout', () => req.destroy(new Error(`GET ${url} timed out`)));
    req.on('error', reject);
    req.end();
  });
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function cleanCell(html) {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function extractCells(rowHtml) {
  const cells = [];
  const pattern = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
  let match;
  while ((match = pattern.exec(rowHtml))) {
    cells.push(match[1]);
  }
  return cells;
}

function parseMatchList(html, pageUrl) {
  const tableRows = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowPattern.exec(html))) {
    const row = rowMatch[1];
    if (!/\/match\/[0-9a-f]{24}/i.test(row)) continue;
    const cells = extractCells(row);
    const matchId = (row.match(/\/match\/([0-9a-f]{24})/i) || [])[1];
    if (!matchId) continue;
    tableRows.push({
      id: matchId,
      createTime: cleanCell(cells[0] || ''),
      gameName: cleanCell(cells[1] || ''),
      status: cleanCell(cells[2] || ''),
      playersText: cleanCell(cells[3] || ''),
      likeCount: Number(cleanCell(cells[5] || '0')) || 0,
      viewUrl: new URL(`/match/${matchId}`, pageUrl).toString()
    });
  }

  const nextMatch = html.match(/href="([^"]*\/globalmatchlist\?[^"]*startid=([0-9a-f]{24})[^"]*)"[^>]*>\s*Next/i);
  const previousMatch = html.match(/href="([^"]*\/globalmatchlist\?[^"]*endid=([0-9a-f]{24})[^"]*)"[^>]*>/i);

  return {
    matches: tableRows,
    nextStartId: nextMatch ? nextMatch[2] : '',
    previousEndId: previousMatch ? previousMatch[2] : ''
  };
}

async function fetchMatchLite(host, matchId) {
  const url = buildMatchLiteUrl(host, matchId);
  const text = await requestText(url);
  const json = JSON.parse(text);
  return {
    success: json.success,
    status: json.status,
    players: json.players || [],
    logs: json.logs || [],
    initdata: json.initdata || '',
    viewurl: json.viewurl || ''
  };
}

async function fetchBotzone(options) {
  const result = {
    fetchedAt: new Date().toISOString(),
    source: 'botzone-public-fetcher',
    game: options.game,
    host: options.host,
    pagesRequested: options.pages,
    pagesFetched: 0,
    detailsFetched: options.details,
    matches: []
  };

  let cursor = {};
  if (options.startid) cursor.startid = options.startid;
  if (options.endid) cursor.endid = options.endid;
  const seen = new Set();

  for (let page = 0; page < options.pages && result.matches.length < options.limit; page++) {
    const pageUrl = buildListUrl(options, cursor);
    console.error(`Fetching list page ${page + 1}: ${pageUrl}`);
    const html = await requestText(pageUrl);
    const parsed = parseMatchList(html, pageUrl);
    result.pagesFetched++;

    for (const match of parsed.matches) {
      if (seen.has(match.id)) continue;
      seen.add(match.id);
      result.matches.push(match);
      if (result.matches.length >= options.limit) break;
    }

    if (!parsed.nextStartId) break;
    cursor = { startid: parsed.nextStartId };
  }

  if (options.details) {
    for (let i = 0; i < result.matches.length; i++) {
      const match = result.matches[i];
      console.error(`Fetching match ${i + 1}/${result.matches.length}: ${match.id}`);
      match.detail = await fetchMatchLite(options.host, match.id);
      if (options.delayMs > 0 && i < result.matches.length - 1) {
        await sleep(options.delayMs);
      }
    }
  }

  return result;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      return;
    }
    const result = await fetchBotzone(options);
    const output = JSON.stringify(result, null, 2);
    if (options.out) {
      fs.writeFileSync(options.out, output + '\n', 'utf8');
      console.error(`Wrote ${result.matches.length} matches to ${options.out}`);
    } else {
      process.stdout.write(output + '\n');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseMatchList,
  fetchBotzone,
  buildListUrl,
  buildMatchLiteUrl
};
