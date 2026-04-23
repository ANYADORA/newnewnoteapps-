/* ============================================
   Nota — Smart Note App
   Application Logic (Optimized for iPad & AI)
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. UI Utilities ---
    const toastEl = document.getElementById('toast');
    function toast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        setTimeout(() => toastEl.classList.remove('show'), 3000);
    }
    const statusBadge = document.getElementById('status-badge');
    const statusText = document.getElementById('status-text');
    function setStatus(text, type = '') {
        statusText.textContent = text;
        statusBadge.className = 'status-badge' + (type ? ` ${type}` : '');
    }

    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    function showLoading(msg) { loadingText.textContent = msg; overlay.style.display = 'flex'; }
    function hideLoading() { overlay.style.display = 'none'; }

    // --- 2. Canvas Setup ---
    const container = document.getElementById('canvas-container');
    const canvas = new fabric.Canvas('c', { 
        isDrawingMode: false, 
        selection: true, 
        preserveObjectStacking: true,
        targetFindTolerance: 20, // iPad touch friendliness
        perPixelTargetFind: true
    });
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);

    function applyBackground(target) {
        const tile = document.createElement('canvas');
        tile.width = 40; tile.height = 40;
        const ctx = tile.getContext('2d');
        ctx.fillStyle = '#fffdf5'; ctx.fillRect(0, 0, 40, 40);
        ctx.beginPath(); ctx.moveTo(0, 39); ctx.lineTo(40, 39);
        ctx.strokeStyle = '#c8d8e8'; ctx.lineWidth = 1; ctx.stroke();
        target.setBackgroundColor(new fabric.Pattern({ source: tile, repeat: 'repeat' }), target.renderAll.bind(target));
    }

    function resize() {
        canvas.setWidth(container.clientWidth);
        canvas.setHeight(container.clientHeight);
        applyBackground(canvas);
    }
    window.addEventListener('resize', resize);
    setTimeout(resize, 50);

    // --- 3. Storage (IndexedDB) ---
    const DB_NAME = 'nota_db_v2'; // Version bump for stability
    const STORE = 'pages';
    async function openDB() {
        return new Promise(res => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = e => e.target.result.createObjectStore(STORE);
            req.onsuccess = () => res(req.result);
        });
    }
    async function saveToIDB(data) {
        try {
            const db = await openDB();
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(data, 'currentPages');
        } catch (e) { console.error('IDB Save Error', e); }
    }
    async function loadFromIDB() {
        const db = await openDB();
        return new Promise(res => {
            const r = db.transaction(STORE, 'readonly').objectStore(STORE).get('currentPages');
            r.onsuccess = () => res(r.result);
            r.onerror = () => res(null);
        });
    }

    // --- 4. State & Navigation ---
    let pages = [null];
    let curP = 0;
    let history = [];
    let hIdx = -1;
    let suppressHistory = false;
    let saveTimer = null;

    function snapshot() { pages[curP] = JSON.stringify(canvas.toJSON()); }
    
    function pushHistory() {
        if (suppressHistory) return;
        const json = JSON.stringify(canvas.toJSON());
        if (hIdx < history.length - 1) history = history.slice(0, hIdx + 1);
        if (!history.length || history[history.length - 1] !== json) { 
            history.push(json); 
            hIdx++; 
            if (history.length > 30) history.shift(), hIdx--; // Cap history for memory
        }
    }

    function requestAutoSave() {
        if (suppressHistory) return;
        setStatus('保存中...', 'saving');
        clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
            snapshot();
            await saveToIDB(pages);
            setStatus('保存完了', 'saved');
        }, 1500);
    }

    const pageInput = document.getElementById('pageInput');
    const pageTotal = document.getElementById('pageTotal');

    function switchPage(idx, skipSnapshot = false) {
        if (!skipSnapshot) snapshot();
        curP = idx;
        canvas.clear();
        history = []; hIdx = -1;
        const data = pages[idx];
        suppressHistory = true;
        if (data) {
            canvas.loadFromJSON(data, () => {
                applyBackground(canvas);
                applyModeLocks();
                suppressHistory = false;
                updatePageUI();
            });
        } else {
            applyBackground(canvas);
            suppressHistory = false;
            updatePageUI();
        }
    }

    function updatePageUI() {
        pageInput.value = curP + 1;
        pageTotal.textContent = `/ ${pages.length}`;
        pushHistory();
        canvas.renderAll();
    }

    pageInput.onchange = () => {
        let val = Math.min(Math.max(1, parseInt(pageInput.value) || 1), pages.length);
        if (val - 1 !== curP) switchPage(val - 1);
    };

    // --- 5. Mode & Tools ---
    const penConfigs = { 1: { color: '#ffffff', width: 2 }, 2: { color: '#f87171', width: 4 } };
    let activePenId = 1;
    let currentMode = 'move';
    let currentShape = null;

    function setMode(mode, penId = null, shape = null) {
        canvas.discardActiveObject();
        currentMode = mode;
        currentShape = shape;
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('pen-settings').style.display = 'none';

        if (mode === 'move') {
            document.getElementById('modeMove').classList.add('active');
            canvas.isDrawingMode = false;
        } else if (mode === 'pen') {
            canvas.isDrawingMode = true;
            activePenId = penId || activePenId;
            document.getElementById(activePenId === 1 ? 'pen1Btn' : 'pen2Btn').classList.add('active');
            const conf = penConfigs[activePenId];
            canvas.freeDrawingBrush.color = conf.color;
            canvas.freeDrawingBrush.width = conf.width;
            document.getElementById('penColor').value = conf.color;
            document.getElementById('penSize').value = conf.width;
            document.getElementById('penSizeLabel').textContent = conf.width + 'px';
            document.getElementById('pen-settings').style.display = 'flex';
        } else if (mode === 'eraser') {
            document.getElementById('modeEraser').classList.add('active');
            canvas.isDrawingMode = false;
        } else if (mode === 'shape') {
            const btnId = 'shape' + shape.charAt(0).toUpperCase() + shape.slice(1);
            const el = document.getElementById(btnId);
            if(el) el.classList.add('active');
            canvas.isDrawingMode = false;
        }
        applyModeLocks();
    }

    function applyModeLocks() {
        const isMove = (currentMode === 'move');
        canvas.getObjects().forEach(o => {
            o.set({ 
                selectable: isMove, 
                evented: isMove || currentMode === 'eraser', 
                hoverCursor: isMove ? 'move' : 'default' 
            });
        });
        canvas.selection = isMove;
        canvas.renderAll();
    }

    // --- 6. Shape & Arrow Drawing ---
    let isMouseDown = false;
    let shapeStart = { x: 0, y: 0 };
    let activeObj = null;

    canvas.on('mouse:down', (options) => {
        if (currentMode !== 'shape' || !currentShape) return;
        const p = canvas.getPointer(options.e);
        shapeStart = { x: p.x, y: p.y };
        const color = penConfigs[activePenId].color;
        const sw = penConfigs[activePenId].width;

        if (currentShape === 'text') {
            const t = new fabric.IText('ここに入力', { left: shapeStart.x, top: shapeStart.y, fontSize: 24, fill: color, fontFamily: 'sans-serif' });
            canvas.add(t); canvas.setActiveObject(t); setMode('move'); return;
        }

        isMouseDown = true;
        const common = { stroke: color, strokeWidth: sw, fill: 'transparent', selectable: false, evented: false };
        if (currentShape === 'line' || currentShape === 'arrow') activeObj = new fabric.Line([shapeStart.x, shapeStart.y, shapeStart.x, shapeStart.y], common);
        else if (currentShape === 'rect') activeObj = new fabric.Rect({ ...common, left: shapeStart.x, top: shapeStart.y, width: 0, height: 0 });
        else if (currentShape === 'circle') activeObj = new fabric.Ellipse({ ...common, left: shapeStart.x, top: shapeStart.y, rx: 0, ry: 0 });
        else if (currentShape === 'star') activeObj = new fabric.Polygon(getStarPoints(5, 1, 2), { ...common, left: shapeStart.x, top: shapeStart.y });
        
        if (activeObj) canvas.add(activeObj);
    });

    canvas.on('mouse:move', (options) => {
        if (!isMouseDown || !activeObj) return;
        const p = canvas.getPointer(options.e);
        const w = Math.abs(shapeStart.x - p.x), h = Math.abs(shapeStart.y - p.y);
        
        if (currentShape === 'line' || currentShape === 'arrow') activeObj.set({ x2: p.x, y2: p.y });
        else if (currentShape === 'rect') activeObj.set({ left: Math.min(shapeStart.x, p.x), top: Math.min(shapeStart.y, p.y), width: w, height: h });
        else if (currentShape === 'circle') activeObj.set({ left: Math.min(shapeStart.x, p.x), top: Math.min(shapeStart.y, p.y), rx: w/2, ry: h/2 });
        else if (currentShape === 'star') {
            const s = Math.max(w, h) / 10;
            activeObj.set({ left: Math.min(shapeStart.x, p.x), top: Math.min(shapeStart.y, p.y), scaleX: s, scaleY: s });
        }
        canvas.renderAll();
    });

    canvas.on('mouse:up', () => {
        if (!isMouseDown) return;
        isMouseDown = false;
        if (activeObj) {
            if (currentShape === 'arrow') {
                const { x1, y1, x2, y2, stroke, strokeWidth } = activeObj;
                const angle = Math.atan2(y2 - y1, x2 - x1);
                const head = 15 + strokeWidth;
                const path = [`M ${x1} ${y1} L ${x2} ${y2}`, 
                             `M ${x2} ${y2} L ${x2 - head * Math.cos(angle - Math.PI/6)} ${y2 - head * Math.sin(angle - Math.PI/6)}`, 
                             `M ${x2} ${y2} L ${x2 - head * Math.cos(angle + Math.PI/6)} ${y2 - head * Math.sin(angle + Math.PI/6)}`].join(' ');
                canvas.remove(activeObj);
                activeObj = new fabric.Path(path, { stroke, strokeWidth, fill: 'transparent', selectable: true });
                canvas.add(activeObj);
            }
            activeObj.setCoords();
            activeObj = null;
            applyModeLocks();
            requestAutoSave();
        }
    });

    function getStarPoints(n, r1, r2) {
        const pts = [];
        for (let i = 0; i < 2 * n; i++) {
            const r = (i % 2 === 0) ? r2 : r1, a = (i * Math.PI) / n;
            pts.push({ x: r * Math.sin(a), y: -r * Math.cos(a) });
        }
        return pts;
    }

    // --- 7. Eraser Logic ---
    let isErasing = false;
    canvas.on('mouse:down', (o) => { if (currentMode === 'eraser') isErasing = true; doErase(o); });
    canvas.on('mouse:move', (o) => { if (isErasing) doErase(o); });
    canvas.on('mouse:up', () => isErasing = false);
    function doErase(o) {
        if (isErasing && currentMode === 'eraser' && o.target) {
            canvas.remove(o.target);
            requestAutoSave();
        }
    }

    // --- 8. AI Chat & Gemini Bridge ---
    const aiWindow = document.getElementById('ai-window');
    const aiHistory = document.getElementById('ai-chat-history');
    const aiBridgeContent = document.getElementById('ai-bridge-content');
    const aiApiContent = document.getElementById('ai-api-content');
    const aiInputArea = document.getElementById('ai-input-area');
    const bridgeStatus = document.getElementById('bridge-status');

    let geminiKey = localStorage.getItem('gemini_api_key') || '';

    function setAIMode(mode) {
        document.getElementById('mode-bridge-btn').classList.toggle('active', mode === 'bridge');
        document.getElementById('mode-api-btn').classList.toggle('active', mode === 'api');
        aiBridgeContent.style.display = mode === 'bridge' ? 'flex' : 'none';
        aiApiContent.style.display = mode === 'api' ? 'flex' : 'none';
        aiInputArea.style.display = mode === 'api' ? 'flex' : 'none';
    }

    document.getElementById('mode-bridge-btn').onclick = () => setAIMode('bridge');
    document.getElementById('mode-api-btn').onclick = () => setAIMode('api');

    async function copyToGemini() {
        showLoading('Gemini向けにデータを準備中...');
        try {
            // 1. プロンプト生成 (テキスト抽出)
            let textContent = "";
            canvas.getObjects().forEach(obj => {
                if (obj.type === 'i-text' || obj.type === 'text') {
                    textContent += `- ${obj.text}\n`;
                }
            });

            const prompt = `以下のノートの内容について質問です。\n\n【ノートのテキスト内容】\n${textContent || "（テキストなし）"}\n\n【指示】\n添付した画像は現在のキャンバスの様子です。これをもとにアドバイスや解説をお願いします。`;

            // 2. 画像Blob取得
            const blob = await new Promise(res => canvas.toCanvasElement().toBlob(res, 'image/png'));
            
            // 3. クリップボードへの書き込み (画像 + テキスト)
            const data = [new ClipboardItem({ 
                'image/png': blob,
                'text/plain': new Blob([prompt], { type: 'text/plain' })
            })];
            
            await navigator.clipboard.write(data);
            
            bridgeStatus.style.display = 'block';
            setTimeout(() => bridgeStatus.style.display = 'none', 5000);
            toast('画像とプロンプトをクリップボードにコピーしました！');
        } catch (e) {
            console.error(e);
            toast('コピーに失敗しました。ブラウザの権限を確認してください。');
        }
        hideLoading();
    }

    document.getElementById('ai-bridge-copy-btn').onclick = copyToGemini;
    document.getElementById('open-gemini-site').onclick = () => window.open('https://gemini.google.com/', '_blank');

    // --- API Mode Logic ---
    const aiInput = document.getElementById('ai-text-input');
    const aiMessages = document.getElementById('ai-messages');
    const keyModal = document.getElementById('key-modal');
    const keyInput = document.getElementById('api-key-input');
    
    function addChatMsg(text, sender) {
        const div = document.createElement('div');
        div.className = `chat-msg ${sender}`;
        div.textContent = text;
        aiMessages.appendChild(div);
        aiMessages.scrollTop = aiMessages.scrollHeight;
    }

    async function callGemini(prompt, imageData = null) {
        if (!geminiKey) { keyModal.style.display = 'flex'; return; }
        
        const model = imageData ? 'gemini-1.5-flash' : 'gemini-pro';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
        
        const contents = [{ parts: [{ text: prompt }] }];
        if (imageData) {
            contents[0].parts.push({
                inline_data: { mime_type: "image/png", data: imageData.split(',')[1] }
            });
        }

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents })
            });
            const data = await res.json();
            return data.candidates[0].content.parts[0].text;
        } catch (e) {
            console.error(e);
            return "エラーが発生しました。APIキーを確認してください。";
        }
    }

    document.getElementById('ai-send-btn').onclick = async () => {
        const text = aiInput.value.trim();
        if (!text) return;
        aiInput.value = '';
        addChatMsg(text, 'user');
        const reply = await callGemini(text);
        if (reply) addChatMsg(reply, 'ai');
    };

    document.getElementById('ai-vision-btn').onclick = async () => {
        addChatMsg("現在のキャンバスを分析しています...", 'user');
        const dataURL = canvas.toDataURL({ format: 'png', quality: 0.8 });
        const reply = await callGemini("この画像について説明して、アドバイスをください。", dataURL);
        if (reply) addChatMsg(reply, 'ai');
    };

    // AI Window Control
    document.getElementById('ai-toggle-btn').onclick = () => {
        aiWindow.style.display = aiWindow.style.display === 'flex' ? 'none' : 'flex';
    };
    document.getElementById('ai-minimize-btn').onclick = () => aiWindow.classList.toggle('minimized');
    document.getElementById('ai-close-btn').onclick = () => aiWindow.style.display = 'none';
    document.getElementById('ai-settings-btn').onclick = () => keyModal.style.display = 'flex';
    document.getElementById('save-key-btn').onclick = () => {
        geminiKey = keyInput.value.trim();
        localStorage.setItem('gemini_api_key', geminiKey);
        keyModal.style.display = 'none';
        toast('APIキーを保存しました');
    };
    document.getElementById('close-modal-btn').onclick = () => keyModal.style.display = 'none';

    // AI Window Dragging (Desktop & iPad)
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };
    const aiHeader = document.getElementById('ai-header');

    const startDrag = (e) => {
        isDragging = true;
        const clientX = e.clientX || e.touches[0].clientX;
        const clientY = e.clientY || e.touches[0].clientY;
        dragOffset.x = clientX - aiWindow.offsetLeft;
        dragOffset.y = clientY - aiWindow.offsetTop;
    };
    const onDrag = (e) => {
        if (!isDragging) return;
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        aiWindow.style.left = (clientX - dragOffset.x) + 'px';
        aiWindow.style.top = (clientY - dragOffset.y) + 'px';
        aiWindow.style.bottom = 'auto'; aiWindow.style.right = 'auto';
    };
    aiHeader.addEventListener('mousedown', startDrag);
    aiHeader.addEventListener('touchstart', startDrag);
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('touchmove', onDrag);
    window.addEventListener('mouseup', () => isDragging = false);
    window.addEventListener('touchend', () => isDragging = false);

    // --- 9. Robust Save/Load (.nota ZIP with Image Separation) ---
    async function prepareNotaData() {
        snapshot();
        const images = {};
        let imgCount = 0;
        const processedPages = pages.map(pj => {
            if (!pj) return null;
            const pd = JSON.parse(pj);
            if (pd.objects) {
                pd.objects.forEach(obj => {
                    if (obj.type === 'image' && obj.src && obj.src.startsWith('data:')) {
                        const id = `img_${imgCount++}`;
                        images[id] = obj.src;
                        obj.src = `__REF__${id}`;
                    }
                });
            }
            return JSON.stringify(pd);
        });
        return { processedPages, images };
    }

    document.getElementById('saveFile').onclick = async () => {
        showLoading('ファイルを圧縮中...');
        try {
            const { processedPages, images } = await prepareNotaData();
            const zip = new JSZip();
            zip.file("data.json", JSON.stringify(processedPages));
            const imgFolder = zip.folder("images");
            for (const [id, data] of Object.entries(images)) {
                const base64 = data.split(',')[1];
                imgFolder.file(`${id}.png`, base64, { base64: true });
            }
            const blob = await zip.generateAsync({ type: "blob" });
            const name = `Note_${Date.now()}.nota`;
            
            if (navigator.share) {
                const file = new File([blob], name, { type: "application/zip" });
                await navigator.share({ files: [file], title: 'Nota Save' });
            } else {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob); a.download = name; a.click();
            }
            toast('保存完了');
        } catch (e) { toast('保存に失敗しました'); }
        hideLoading();
    };

    document.getElementById('loadBtn').onclick = () => document.getElementById('loadFile').click();
    document.getElementById('loadFile').onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        showLoading('データを展開中...');
        try {
            const zip = await JSZip.loadAsync(f);
            const dataStr = await zip.file("data.json").async("string");
            const loadedPages = JSON.parse(dataStr);
            const imgRefs = {};
            const imgFolder = zip.folder("images");
            if (imgFolder) {
                const files = []; imgFolder.forEach((path, file) => files.push({ path, file }));
                for (const item of files) {
                    const id = item.path.replace('.png', '');
                    const base64 = await item.file.async("base64");
                    imgRefs[id] = `data:image/png;base64,${base64}`;
                }
            }
            pages = loadedPages.map(pj => {
                if (!pj) return null;
                const pd = JSON.parse(pj);
                if (pd.objects) {
                    pd.objects.forEach(o => {
                        if (o.type === 'image' && o.src && o.src.startsWith('__REF__')) {
                            o.src = imgRefs[o.src.replace('__REF__', '')] || o.src;
                        }
                    });
                }
                return JSON.stringify(pd);
            });
            await saveToIDB(pages);
            switchPage(0, true);
            toast('読み込み完了');
        } catch (e) { toast('読み込みに失敗しました'); }
        hideLoading();
    };

    // --- 10. iPad Optimization: All Page Image Export ---
    document.getElementById('exportAllImages').onclick = async () => {
        showLoading('画像を生成中...');
        try {
            snapshot();
            const zip = new JSZip();
            for (let i = 0; i < pages.length; i++) {
                loadingText.textContent = `${i+1} / ${pages.length} ページ目を処理中...`;
                const data = pages[i];
                await new Promise(res => {
                    if (data) canvas.loadFromJSON(data, () => { applyBackground(canvas); res(); });
                    else { canvas.clear(); applyBackground(canvas); res(); }
                });
                const blob = await new Promise(res => canvas.toCanvasElement().toBlob(res, 'image/png'));
                zip.file(`page_${i+1}.png`, blob);
            }
            const content = await zip.generateAsync({ type: "blob" });
            const name = `Nota_Images_${Date.now()}.zip`;
            
            if (navigator.share) {
                const file = new File([content], name, { type: "application/zip" });
                await navigator.share({ files: [file], title: 'Exported Images' });
            } else {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(content); a.download = name; a.click();
            }
            switchPage(curP, true); // Restore
            toast('書き出し完了');
        } catch (e) { toast('エラーが発生しました'); }
        hideLoading();
    };

    // --- 11. Other Bindings ---
    document.getElementById('modeMove').onclick = () => setMode('move');
    document.getElementById('pen1Btn').onclick = () => setMode('pen', 1);
    document.getElementById('pen2Btn').onclick = () => setMode('pen', 2);
    document.getElementById('modeEraser').onclick = () => setMode('eraser');
    ['Line','Arrow','Rect','Circle','Star','Text'].forEach(s => {
        const el = document.getElementById('shape'+s);
        if(el) el.onclick = () => setMode('shape', null, s.toLowerCase());
    });

    document.getElementById('penColor').onchange = (e) => { penConfigs[activePenId].color = e.target.value; setMode('pen'); };
    document.getElementById('penSize').oninput = (e) => { 
        const v = parseInt(e.target.value); penConfigs[activePenId].width = v; 
        document.getElementById('penSizeLabel').textContent = v + 'px';
        canvas.freeDrawingBrush.width = v;
    };

    document.getElementById('undoBtn').onclick = () => { if (hIdx > 0) { hIdx--; restore(); } };
    document.getElementById('redoBtn').onclick = () => { if (hIdx < history.length - 1) { hIdx++; restore(); } };
    function restore() {
        suppressHistory = true;
        canvas.loadFromJSON(history[hIdx], () => { applyBackground(canvas); applyModeLocks(); suppressHistory = false; canvas.renderAll(); });
    }

    document.getElementById('delSelected').onclick = () => {
        canvas.getActiveObjects().forEach(o => canvas.remove(o));
        canvas.discardActiveObject().requestRenderAll();
        requestAutoSave();
    };

    document.getElementById('prevPage').onclick = () => { if (curP > 0) switchPage(curP - 1); };
    document.getElementById('nextPage').onclick = () => {
        if (curP < pages.length - 1) switchPage(curP + 1);
        else { pages.push(null); switchPage(curP + 1); }
    };

    document.getElementById('imgBtn').onclick = () => document.getElementById('imgInput').click();
    document.getElementById('imgInput').onchange = (e) => {
        const f = e.target.files[0]; if (!f) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            fabric.Image.fromURL(ev.target.result, (img) => {
                img.scaleToWidth(canvas.width * 0.4);
                img.set({ left: canvas.width/2, top: canvas.height/2, originX:'center', originY:'center' });
                canvas.add(img); setMode('move'); requestAutoSave();
            });
        };
        reader.readAsDataURL(f);
    };

    canvas.on('object:added', () => { pushHistory(); requestAutoSave(); });
    canvas.on('object:modified', () => { pushHistory(); requestAutoSave(); });
    canvas.on('path:created', () => { pushHistory(); requestAutoSave(); });

    // --- 12. Startup ---
    (async () => {
        const d = await loadFromIDB(); 
        if (d && Array.isArray(d)) pages = d;
        switchPage(0, true);
    })();
});
