import crypto from "node:crypto";

const config = {
  spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "14RmSfROInL8xHnp4xRpXBeyzNuCpfMS4FDgKM5sGVjY",
  sheetName: process.env.GOOGLE_SHEETS_SHEET_NAME || "指導中",
  columnRange: process.env.GOOGLE_SHEETS_COLUMN_RANGE || "K:K",
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  slackChannelId: process.env.SLACK_CHANNEL_ID || "G089NM0JUSK",
  slackToken: process.env.SLACK_BOT_TOKEN,
  googleClientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  googlePrivateKey: normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY),
  timezone: process.env.REPORT_TIMEZONE || "Asia/Tokyo"
};

async function main() {
  validateConfig();

  const accessToken = await getGoogleAccessToken();
  const values = await fetchSheetColumn(accessToken);
  const total = sumCurrencyColumn(values);

  const message = `${formatDate(config.timezone)}時点の売り上げ合計（${config.sheetName} ${config.columnRange}/月額料金）は ${formatYen(total)} です。`;

  await postSlackMessage(message);
  console.log(JSON.stringify({ total, rowCount: values.length - 1, message }));
}

function validateConfig() {
  const required = [
    ["GOOGLE_SERVICE_ACCOUNT_EMAIL", config.googleClientEmail],
    ["GOOGLE_PRIVATE_KEY", config.googlePrivateKey]
  ];

  if (!config.slackWebhookUrl && !config.slackToken) {
    throw new Error("Missing Slack credentials: set SLACK_WEBHOOK_URL or SLACK_BOT_TOKEN.");
  }

  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

function normalizePrivateKey(value) {
  if (!value) return value;
  return value.replace(/\\n/g, "\n");
}

async function getGoogleAccessToken() {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 3600;
  const scope = "https://www.googleapis.com/auth/spreadsheets.readonly";
  const audience = "https://oauth2.googleapis.com/token";

  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claimSet = base64UrlEncode(
    JSON.stringify({
      iss: config.googleClientEmail,
      scope,
      aud: audience,
      exp: expiresAt,
      iat: issuedAt
    })
  );

  const unsignedToken = `${header}.${claimSet}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign(config.googlePrivateKey);
  const assertion = `${unsignedToken}.${base64UrlEncode(signature)}`;

  const response = await fetch(audience, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(`Failed to get Google access token: ${JSON.stringify(data)}`);
  }

  return data.access_token;
}

async function fetchSheetColumn(accessToken) {
  const encodedRange = encodeURIComponent(`${config.sheetName}!${config.columnRange}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${encodedRange}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Failed to read Google Sheets range: ${JSON.stringify(data)}`);
  }

  if (!Array.isArray(data.values)) {
    throw new Error("Google Sheets response did not contain values.");
  }

  return data.values;
}

function sumCurrencyColumn(values) {
  return values
    .slice(1)
    .map((row) => parseNumericValue(row?.[0]))
    .filter((value) => value !== null)
    .reduce((sum, value) => sum + value, 0);
}

function parseNumericValue(value) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[^0-9.-]/g, "");
  if (normalized === "") return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDate(timezone) {
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}/${month}/${day}`;
}

function formatYen(value) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0
  }).format(value);
}

async function postSlackMessage(text) {
  if (config.slackWebhookUrl) {
    const webhookResponse = await fetch(config.slackWebhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({ text })
    });

    const webhookText = await webhookResponse.text();
    if (!webhookResponse.ok || webhookText.trim() !== "ok") {
      throw new Error(`Failed to post Slack webhook message: ${webhookText}`);
    }

    return { ok: true, mode: "webhook" };
  }

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.slackToken}`,
      "content-type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      channel: config.slackChannelId,
      text
    })
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(`Failed to post Slack message: ${JSON.stringify(data)}`);
  }

  return data;
}

function base64UrlEncode(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
