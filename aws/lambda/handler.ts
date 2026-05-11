import { createHash } from 'crypto';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';

const dynamo = new DynamoDBClient({});
const TABLE = process.env.DYNAMO_TABLE_NAME!;
const API_KEY = process.env.SCRYDEX_API_KEY!;
const SCRYDEX_BASE = 'https://api.scrydex.io';

function buildCacheKey(path: string, params: Record<string, string> | null): string {
  const sorted = params
    ? Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&')
    : '';
  return createHash('sha256').update(`${path}?${sorted}`).digest('hex');
}

function getTtl(path: string): number {
  const now = Math.floor(Date.now() / 1000);
  if (/^\/cards\/[^/]+$/.test(path)) return now + 7 * 24 * 3600;
  if (/\/prices|pricing/.test(path)) return now + 3600;
  if (path.startsWith('/cards')) return now + 24 * 3600;
  return now + 24 * 3600;
}

async function fetchFromDynamo(cacheKey: string): Promise<string | null> {
  const result = await dynamo.send(new GetItemCommand({
    TableName: TABLE,
    Key: { cacheKey: { S: cacheKey } },
  }));
  if (!result.Item) return null;
  const ttl = Number(result.Item.ttl?.N ?? 0);
  if (ttl < Math.floor(Date.now() / 1000)) return null;
  return result.Item.data?.S ?? null;
}

async function storeToDynamo(cacheKey: string, data: string, ttl: number): Promise<void> {
  await dynamo.send(new PutItemCommand({
    TableName: TABLE,
    Item: {
      cacheKey: { S: cacheKey },
      data: { S: data },
      ttl: { N: String(ttl) },
    },
  }));
}

async function fetchFromScrydex(path: string, params: Record<string, string> | null): Promise<{ status: number; body: string }> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const url = `${SCRYDEX_BASE}${path}${qs}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: 'application/json',
    },
  });

  const body = await response.text();
  return { status: response.status, body };
}

export async function handler(event: {
  rawPath?: string;
  requestContext?: { http?: { path?: string } };
  queryStringParameters?: Record<string, string> | null;
}): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  const path = event.rawPath ?? event.requestContext?.http?.path ?? '/';
  const params = event.queryStringParameters ?? null;

  const cacheKey = buildCacheKey(path, params);

  const cached = await fetchFromDynamo(cacheKey);
  if (cached !== null) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
      body: cached,
    };
  }

  const { status, body } = await fetchFromScrydex(path, params);

  if (status >= 200 && status < 300) {
    const ttl = getTtl(path);
    await storeToDynamo(cacheKey, body, ttl);
  }

  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
    body,
  };
}
