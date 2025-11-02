// =======================================================================
// グローバル変数：HTML要素の取得
// =======================================================================
const urlInput = document.getElementById('url-input');
const processButton = document.getElementById('process-button');
const outputFrame = document.getElementById('output-frame');
const statusText = document.getElementById('status');
const adblockCheckbox = document.getElementById('adblock-checkbox');
const sandboxCheckbox = document.getElementById('sandbox-checkbox');

// =======================================================================
// 定数：プロキシサーバーのリスト
// =======================================================================
const PROXY_LIST = [
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url='
];

// =======================================================================
// 【重要】iframeの中から呼び出される「司令室」関数
// =======================================================================
/**
 * iframe内のリンクがクリックされたときに呼び出され、ページの再処理をトリガーする
 * @param {string} newUrl - クリックされたリンクのURL
 */
function handleFrameNavigation(newUrl) {
    if (newUrl && typeof newUrl === 'string' && newUrl.startsWith('http')) {
        // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
        // ★ ここです！この一行が、URL入力欄を更新する処理です ★
        // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
        urlInput.value = newUrl;
        
        // メインの処理を再実行
        processUrl();
    }
}

// =======================================================================
// メイン処理：URLを取得し、ページを処理・表示する
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

// ボタンがクリックされたら、メイン処理関数を呼び出す
processButton.addEventListener('click', processUrl);

// =======================================================================
// 補助関数群
// =======================================================================

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
            return decoder.decode(buffer);
        } catch (error) {
            console.warn(`プロキシ ${new URL(proxy).hostname} で失敗しました。次を試します...`, error);
        }
    }
    throw new Error('すべてのプロキシサーバーへの接続に失敗しました。');
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