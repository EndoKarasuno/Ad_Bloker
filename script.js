// =======================================================================
// ステップ1：HTML要素を変数に格納する（チェックボックスを追加）
// =======================================================================
const urlInput = document.getElementById('url-input');
const processButton = document.getElementById('process-button');
const outputFrame = document.getElementById('output-frame');
const statusText = document.getElementById('status');
const securityModeCheckbox = document.getElementById('security-mode-checkbox'); // 【追加】

// (プロキシリストとfetchAndDecode関数は変更なし)
const PROXY_LIST = [ 'https://corsproxy.io/?', 'https://api.allorigins.win/raw?url=' ];
async function fetchAndDecode(url) { /* ...変更なし... */ }

// =======================================================================
// ステップ4：ボタンが押されたときのメインの処理（サンドボックス設定を動的に）
// =======================================================================
processButton.addEventListener('click', async () => {
    let targetUrl = urlInput.value.trim();
    // (URLの正規化処理は変更なし)
    if (!targetUrl) { /* ... */ }
    targetUrl = targetUrl.split('#')[0];
    if (!targetUrl.startsWith('http')) { /* ... */ }

    // 【改良点】モードに応じてiframeのサンドボックス設定を変更
    if (securityModeCheckbox.checked) {
        // 最大セキュリティモード：厳しいサンドボックス
        outputFrame.sandbox = "allow-scripts";
    } else {
        // 機能優先モード：緩いサンドボックス（ゲームなどが動くようになるが、安全性は低下）
        outputFrame.sandbox = "allow-scripts allow-same-origin allow-forms allow-popups";
    }

    outputFrame.srcdoc = "<html><body><p>処理中です。お待ちください...</p></body></html>";
    try {
        const htmlString = await fetchAndDecode(targetUrl);
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');
        let finalHtml;

        // 【改良点】モード情報を渡して処理を分岐させる
        const isSecurityMode = securityModeCheckbox.checked;

        if (doc.querySelector('frameset')) {
            statusText.textContent = 'フレームセットを検出。ページを再構成します...';
            finalHtml = await rebuildFramesetPage(doc, targetUrl, isSecurityMode);
        } else {
            statusText.textContent = '通常ページとして処理します...';
            finalHtml = processHtmlContent(doc, targetUrl, isSecurityMode);
        }
        outputFrame.srcdoc = finalHtml;
        statusText.textContent = '処理が完了しました。';
    } catch (error) { /* ...変更なし... */ }
});

// =======================================================================
// ステップ5：HTMLを加工するための補助関数（モードに応じて処理内容を変更）
// =======================================================================

// rebuildFramesetPage関数も、isSecurityModeを下の階層に渡すように変更
async function rebuildFramesetPage(doc, baseUrl, isSecurityMode) {
    // ... 大部分のロジックは変更なし ...
    const frameContents = await Promise.all(
        frameUrls.map(async (url) => {
            try {
                const html = await fetchAndDecode(url);
                const frameDoc = new DOMParser().parseFromString(html, 'text/html');
                // ここでisSecurityModeを渡す
                return processHtmlContent(frameDoc, url, isSecurityMode);
            } catch (e) { /* ... */ }
        })
    );
    // ... 残りのロジックは変更なし ...
}

/**
 * HTMLコンテンツを実際に加工する関数
 * @param {Document} doc - 解析済みのDOM
 * @param {string} baseUrl - 元のページのURL
 * @param {boolean} isSecurityMode - 最大セキュリティモードかどうか
 */
function processHtmlContent(doc, baseUrl, isSecurityMode) {
    // 【改良点】モードに応じて処理を分岐
    if (isSecurityMode) {
        // 最大セキュリティモードでは、広告ブロックも行う
        doc.querySelectorAll('div[class*="ad"], div[id*="ad"], iframe[class*="ad"], div[data-ad-unit]').forEach(el => el.remove());
    }

    // --- 外部リンクの無効化は、どちらのモードでも共通の機能 ---
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
            }
        } catch (e) { /* ignore */ }
    });

    // --- これより下のパス修正や文字コード設定は、どちらのモードでも共通 ---
    doc.querySelectorAll('[href], [src]').forEach(el => { /* ...変更なし... */ });
    doc.querySelector('base')?.remove();
    let head = doc.querySelector('head');
    if (!head) { /* ... */ }
    if (!head.querySelector('meta[charset]')) { /* ... */ }

    return doc.documentElement.outerHTML;
}


// --- 変更のない関数のためのダミー ---
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
                if (detected && detected.confidence > 0.9) {
                    charset = detected.encoding.toLowerCase();
                }
            }
            if (!charset) {
                const contentType = response.headers.get('content-type') || '';
                const match = contentType.match(/charset=([^;]+)/);
                if (match) {
                    const detectedCharset = match[1].toLowerCase();
                    if (['shift_jis', 'euc-jp', 'utf-8'].includes(detectedCharset)) {
                        charset = detectedCharset;
                    }
                }
            }
            if (!charset) {
                charset = 'utf-8';
            }
            const decoder = new TextDecoder(charset);
            const htmlString = decoder.decode(buffer);
            return htmlString;
        } catch (error) {
            console.warn(`プロキシ ${new URL(proxy).hostname} で失敗しました。次を試します...`, error);
        }
    }
    throw new Error('すべてのプロキシサーバーへの接続に失敗しました。');
}

function processHtmlContent(doc, baseUrl, isSecurityMode) {
    if (isSecurityMode) {
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
                a.removeAttribute('href');
                a.style.cssText = 'color: #999; text-decoration: line-through;';
                a.title = '外部リンクのため無効化';
            }
        } catch (e) { /* ignore */ }
    });
    doc.querySelectorAll('[href], [src]').forEach(el => {
        const attr = el.hasAttribute('href') ? 'href' : 'src';
        const originalPath = el.getAttribute(attr);
        if (originalPath && !originalPath.startsWith('http') && !originalPath.startsWith('data:') && !originalPath.trim().toLowerCase().startsWith('javascript:')) {
            try {
                el.setAttribute(attr, new URL(originalPath, baseUrl).href);
            } catch (e) { /* ignore */ }
        }
    });
    doc.querySelector('base')?.remove();
    let head = doc.querySelector('head');
    if (!head) {
        head = doc.createElement('head');
        doc.documentElement.prepend(head);
    }
    if (!head.querySelector('meta[charset]')) {
        const meta = doc.createElement('meta');
        meta.setAttribute('charset', 'UTF-8');
        head.prepend(meta);
    }
    return doc.documentElement.outerHTML;
}

async function rebuildFramesetPage(doc, baseUrl, isSecurityMode) {
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
                return processHtmlContent(frameDoc, url, isSecurityMode);
            } catch (e) {
                return `<div>フレームの読み込みに失敗: ${url}</div>`;
            }
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