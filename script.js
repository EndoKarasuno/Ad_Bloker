// =======================================================================
// ステップ1：HTML要素を変数に格納する
// =======================================================================
const urlInput = document.getElementById('url-input');
const processButton = document.getElementById('process-button');
const outputFrame = document.getElementById('output-frame');
const statusText = document.getElementById('status');
const adblockCheckbox = document.getElementById('adblock-checkbox');
const sandboxCheckbox = document.getElementById('sandbox-checkbox');

// =======================================================================
// ステップ2：使用するプロキシサーバーのリストを定義
// =======================================================================
const PROXY_LIST = [
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url='
];

// =======================================================================
// ステップ3：コンテンツ取得用の関数
// =======================================================================
async function fetchAndDecode(url) { /* この関数は変更なし */ }

// =======================================================================
// 【改良点１】iframeの中から呼び出される「司令室」関数を新設
// =======================================================================
/**
 * iframe内のリンクがクリックされたときに呼び出されるグローバル関数
 * @param {string} newUrl - クリックされたリンクのURL
 */
function handleFrameNavigation(newUrl) {
    // 予期せぬ動作を防ぐため、URLを検証
    if (newUrl && typeof newUrl === 'string' && newUrl.startsWith('http')) {
        console.log(`iframeナビゲーションを検知: ${newUrl}`);
        // URL入力欄を更新
        urlInput.value = newUrl;
        // メインの処理を再実行
        processUrl();
    }
}

// =======================================================================
// 【改良点２】メイン処理を独立した関数にリファクタリング
// =======================================================================
async function processUrl() {
    let targetUrl = urlInput.value.trim();
    if (!targetUrl) {
        alert('URLを入力してください。');
        return;
    }
    targetUrl = targetUrl.split('#')[0];
    if (!targetUrl.startsWith('http')) {
        targetUrl = 'https://' + targetUrl;
    }

    if (sandboxCheckbox.checked) {
        outputFrame.sandbox = "allow-scripts";
    } else {
        outputFrame.sandbox = "allow-scripts allow-same-origin allow-forms allow-popups";
    }

    outputFrame.srcdoc = "<html><body><p>処理中です。お待ちください...</p></body></html>";

    try {
        const htmlString = await fetchAndDecode(targetUrl);
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');
        let finalHtml;
        const doAdblock = adblockCheckbox.checked;

        if (doc.querySelector('frameset')) {
            statusText.textContent = 'フレームセットを検出。ページを再構成します...';
            finalHtml = await rebuildFramesetPage(doc, targetUrl, doAdblock);
        } else {
            statusText.textContent = '通常ページとして処理します...';
            finalHtml = processHtmlContent(doc, targetUrl, doAdblock);
        }
        
        outputFrame.srcdoc = finalHtml;
        statusText.textContent = '処理が完了しました。';
    } catch (error) {
        console.error('エラー:', error);
        statusText.textContent = `エラー: ${error.message}`;
        alert('エラーが発生しました。プロキシが不安定か、サイトが対応していない可能性があります。');
    }
}

// ボタンがクリックされたら、新しいメイン処理関数を呼び出す
processButton.addEventListener('click', processUrl);


// =======================================================================
// ステップ5：HTMLを加工するための補助関数
// =======================================================================

async function rebuildFramesetPage(doc, baseUrl, doAdblock) { /* この関数は変更なし */ }

/**
 * HTMLコンテンツを実際に加工する関数
 */
function processHtmlContent(doc, baseUrl, doAdblock) {
    if (doAdblock) {
        doc.querySelectorAll('div[class*="ad"], div[id*="ad"], iframe[class*="ad"], div[data-ad-unit]').forEach(el => el.remove());
    }

    const baseDomain = new URL(baseUrl).hostname;
    doc.querySelectorAll('a[href]').forEach(a => {
        try {
            const href = a.getAttribute('href');
            if (!href || href.trim().toLowerCase().startsWith('javascript:')) return;

            const absoluteHref = new URL(href, baseUrl).href;
            const linkDomain = new URL(absoluteHref).hostname;

            if (linkDomain !== baseDomain && !linkDomain.endsWith(`.${baseDomain}`)) {
                // 外部リンクはこれまで通り無効化
                a.removeAttribute('href');
                a.style.cssText = 'color: #999; text-decoration: line-through;';
                a.title = '外部リンクのため無効化';
            } else {
                // 【改良点３】サイト内リンクを「司令室を呼び出す」ように改造
                a.setAttribute('onclick', `window.parent.handleFrameNavigation(this.href); return false;`);
            }
        } catch (e) { /* ignore */ }
    });

    // これより下の処理は変更なし
    doc.querySelectorAll('[href], [src]').forEach(el => { /* ... */ });
    doc.querySelector('base')?.remove();
    let head = doc.querySelector('head');
    if (!head) { /* ... */ }
    if (!head.querySelector('meta[charset]')) { /* ... */ }
    
    return doc.documentElement.outerHTML;
}

// --- 変更のない関数のためのダミー（実際には全コードを貼り付けてください）---
async function fetchAndDecode(url) {
    for (const proxy of PROXY_LIST) {
        const proxyUrl = `${proxy}${encodeURIComponent(url)}`;
        try {
            statusText.textContent = `プロキシ (${new URL(proxy).hostname}) 経由で取得中...`;
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error(`HTTPエラー: ${response.status}`);
            const buffer = await response.arrayBuffer();
            let charset;
            if (window.jschardet) {
                const uInt8Array = new Uint8Array(buffer);
                const detected = jschardet.detect(uInt8Array);
                if (detected && detected.confidence > 0.9) { charset = detected.encoding.toLowerCase(); }
            }
            if (!charset) {
                const contentType = response.headers.get('content-type') || '';
                const match = contentType.match(/charset=([^;]+)/);
                if (match) { const detectedCharset = match[1].toLowerCase(); if (['shift_jis', 'euc-jp', 'utf-8'].includes(detectedCharset)) { charset = detectedCharset; } }
            }
            if (!charset) { charset = 'utf-8'; }
            const decoder = new TextDecoder(charset);
            return decoder.decode(buffer);
        } catch (error) { console.warn(`プロキシ ${new URL(proxy).hostname} で失敗...`, error); }
    }
    throw new Error('すべてのプロキシへの接続に失敗しました。');
}
async function rebuildFramesetPage(doc, baseUrl, doAdblock) {
    const frameset = doc.querySelector('frameset');
    const isColsLayout = frameset.hasAttribute('cols');
    const layoutDefinition = frameset.getAttribute(isColsLayout ? 'cols' : 'rows') || '*,*';
    const layout = layoutDefinition.split(',');
    const frameUrls = Array.from(doc.querySelectorAll('frame[src]')).map(frame => new URL(frame.getAttribute('src'), baseUrl).href);
    statusText.textContent = `フレーム(${frameUrls.length}個)のコンテンツを取得中...`;
    const frameContents = await Promise.all(
        frameUrls.map(async (url) => {
            try {
                const html = await fetchAndDecode(url);
                const frameDoc = new DOMParser().parseFromString(html, 'text/html');
                return processHtmlContent(frameDoc, url, doAdblock);
            } catch (e) { return `<div>フレームの読み込みに失敗: ${url}</div>`; }
        })
    );
    const containerStyle = `display: flex; flex-direction: ${isColsLayout ? 'row' : 'column'}; width: 100%; height: 100vh; margin: 0; padding: 0;`;
    const frameDivs = frameContents.map((content, i) => {
        const size = layout[i];
        let frameStyle = `overflow: auto; border: 1px solid #ccc;`;
        if (size.includes('%')) { frameStyle += `flex-basis: ${size};`; }
        else if (size.includes('*')) { frameStyle += `flex-grow: ${size.replace('*', '') || '1'};`; }
        else { frameStyle += isColsLayout ? `width: ${size}px;` : `height: ${size}px;`; }
        return `<div style="${frameStyle}">${content}</div>`;
    }).join('');
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>再構成ページ</title></head><body style="${containerStyle.replace(/\s+/g, ' ').trim()}">${frameDivs}</body></html>`;
}
function processHtmlContent(doc, baseUrl, doAdblock) {
    if (doAdblock) { doc.querySelectorAll('div[class*="ad"], div[id*="ad"], iframe[class*="ad"], div[data-ad-unit]').forEach(el => el.remove()); }
    const baseDomain = new URL(baseUrl).hostname;
    doc.querySelectorAll('a[href]').forEach(a => {
        try {
            const href = a.getAttribute('href');
            if (!href || href.trim().toLowerCase().startsWith('javascript:')) return;
            const absoluteHref = new URL(href, baseUrl).href;
            const linkDomain = new URL(absoluteHref).hostname;
            if (linkDomain !== baseDomain && !linkDomain.endsWith(`.${baseDomain}`)) {
                a.removeAttribute('href');
                a.style.cssText = 'color: #999; text-decoration: line-through;';
                a.title = '外部リンクのため無効化';
            } else {
                a.setAttribute('onclick', `window.parent.handleFrameNavigation(this.href); return false;`);
            }
        } catch (e) { /* ignore */ }
    });
    doc.querySelectorAll('[href], [src]').forEach(el => {
        const attr = el.hasAttribute('href') ? 'href' : 'src';
        const originalPath = el.getAttribute(attr);
        if (originalPath && !originalPath.startsWith('http') && !originalPath.startsWith('data:') && !originalPath.trim().toLowerCase().startsWith('javascript:')) {
            try { el.setAttribute(attr, new URL(originalPath, baseUrl).href); } catch (e) { /* ignore */ }
        }
    });
    doc.querySelector('base')?.remove();
    let head = doc.querySelector('head');
    if (!head) { head = doc.createElement('head'); doc.documentElement.prepend(head); }
    if (!head.querySelector('meta[charset]')) { const meta = doc.createElement('meta'); meta.setAttribute('charset', 'UTF-8'); head.prepend(meta); }
    return doc.documentElement.outerHTML;
}