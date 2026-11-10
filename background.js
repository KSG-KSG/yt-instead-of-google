// YouTube 홈(현재 브라우저 쿠키 그대로)에서 왼쪽 위부터 순서대로 영상 ID 후보를 뽑는다.
// 홈 피드가 비어 있으면(완전 첫 방문·기록 없음) YouTube 공식 '음악' 채널의 인기 영상으로 대체.

const HOME_URL = "https://www.youtube.com/";
const FALLBACK_URL = "https://www.youtube.com/channel/UC-9-kyTW8ZkZNDHQJ6FgpwQ"; // YouTube 음악
const MAX_CANDIDATES = 10;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "GET_VIDEOS") return;
  getCandidates()
    .then((ids) => sendResponse({ ids }))
    .catch((err) => {
      console.warn("[yt-first] 실패:", err);
      sendResponse({ ids: [] });
    });
  return true; // 비동기 응답
});

async function getCandidates() {
  let ids = await idsFrom(HOME_URL, true);
  if (ids.length === 0) ids = await idsFrom(FALLBACK_URL, false);
  return ids;
}

async function idsFrom(url, gridOnly) {
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  const data = extractInitialData(await res.text());
  if (!data) return [];
  const root = gridOnly ? findKey(data, "richGridRenderer")?.contents : data;
  const out = [];
  // 홈 피드에선 선반(쇼츠/뉴스 묶음)을 건너뛰지만, 대체 채널은 영상이 선반 안에 있음
  collect(root, out, gridOnly ? SKIP_KEYS : SKIP_KEYS_FALLBACK);
  return [...new Set(out)].slice(0, MAX_CANDIDATES);
}

function extractInitialData(html) {
  const marker = html.match(/(?:var\s+ytInitialData|window\["ytInitialData"\])\s*=\s*/);
  if (!marker) return null;
  const start = marker.index + marker[0].length;
  const end = findJsonEnd(html, start);
  if (end < 0) return null;
  try {
    return JSON.parse(html.slice(start, end));
  } catch {
    return null;
  }
}

// 문자열 내부의 괄호를 무시하며 JSON 객체의 끝 위치를 찾는다.
function findJsonEnd(s, start) {
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i + 1;
  }
  return -1;
}

// 광고·쇼츠·선반(뉴스/쇼츠 묶음) 등은 건너뛴다.
const SKIP_KEYS = new Set([
  "adSlotRenderer",
  "richSectionRenderer",
  "reelItemRenderer",
  "shortsLockupViewModel",
  "promotedSparklesWebRenderer",
  "statementBannerRenderer",
  "brandVideoShelfRenderer",
]);
const SKIP_KEYS_FALLBACK = new Set([...SKIP_KEYS].filter((k) => k !== "richSectionRenderer"));

function collect(node, out, skip) {
  if (!node || typeof node !== "object" || out.length >= MAX_CANDIDATES * 2) return;
  if (Array.isArray(node)) {
    for (const item of node) collect(item, out, skip);
    return;
  }
  if (node.videoRenderer?.videoId) {
    out.push(node.videoRenderer.videoId);
    return;
  }
  if (node.gridVideoRenderer?.videoId) {
    out.push(node.gridVideoRenderer.videoId);
    return;
  }
  const lv = node.lockupViewModel;
  if (lv?.contentId) {
    if (/VIDEO/.test(lv.contentType ?? "")) out.push(lv.contentId);
    return; // 재생목록 등은 무시
  }
  for (const [k, v] of Object.entries(node)) {
    if (!skip.has(k)) collect(v, out, skip);
  }
}

function findKey(node, key) {
  if (!node || typeof node !== "object") return null;
  if (key in node) return node[key];
  for (const v of Object.values(node)) {
    const r = findKey(v, key);
    if (r) return r;
  }
  return null;
}
