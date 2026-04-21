document.addEventListener('DOMContentLoaded', () => {
    // --- 1. UI Utilities ---
    const toastEl = document.getElementById('toast');
    function toast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        setTimeout(() => toastEl.classList.remove('show'), 2500);
    }
    const statusBadge = document.getElementById('status-badge');
    const statusText = document.getElementById('status-text');
    function setStatus(text, type = '') {
        statusText.textContent = text;
        statusBadge.className = 'status-badge' + (type ? ` ${type}` : '');
    }

    // --- 2. Canvas Setup ---
    const container = document.getElementById('canvas-container');
    const canvas = new fabric.Canvas('c', { 
        isDrawingMode: false, 
        selection: true, 
        preserveObjectStacking: true,
        targetFindTolerance: 15
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
    const DB_NAME = 'nota_db';
    const STORE = 'pages';
    async function openDB() {
        return new Promise(res => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = e => e.target.result.createObjectStore(STORE);
            req.onsuccess = () => res(req.result);
        });
    }
    async function saveToIDB(data) {
        const db = await openDB();
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(data, 'currentPages');
    }
    async function loadFromIDB() {
        const db = await openDB();
        return new Promise(res => {
            const r = db.transaction(STORE, 'readonly').objectStore(STORE).get('currentPages');
            r.onsuccess = () => res(r.result);
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
        if (!history.length || history[history.length - 1] !== json) { history.push(json); hIdx++; }
    }
    function requestAutoSave() {
        setStatus('保存中...', 'saving');
        clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
            snapshot();
            await saveToIDB(pages);
            setStatus('保存完了', 'saved');
        }, 1000);
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

    const handlePageJump = () => {
        let val = parseInt(pageInput.value);
        if (isNaN(val) || val < 1 || val > pages.length) {
            toast('ページが見つかりません');
            pageInput.value = curP + 1;
            return;
        }
        if (val - 1 !== curP) switchPage(val - 1);
    };

    pageInput.onchange = handlePageJump;
    pageInput.onkeydown = (e) => { if(e.key === 'Enter') { handlePageJump(); pageInput.blur(); } };

    // --- 5. Mode & Locks ---
    const penConfigs = { 1: { color: '#000000', width: 2 }, 2: { color: '#f87171', width: 4 } };
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
            activePenId = penId;
            document.getElementById(penId === 1 ? 'pen1Btn' : 'pen2Btn').classList.add('active');
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
            if(document.getElementById(btnId)) document.getElementById(btnId).classList.add('active');
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

    // --- 6. Drawing & Shape Logic ---
    let isMouseDown = false;
    let shapeStart = { x: 0, y: 0 };
    let activeObj = null;

    canvas.on('mouse:down', (options) => {
        if (currentMode !== 'shape' || !currentShape) return;
        const pointer = canvas.getPointer(options.e);
        shapeStart = { x: pointer.x, y: pointer.y };
        const color = penConfigs[activePenId].color;
        const sw = penConfigs[activePenId].width;

        if (currentShape === 'text') {
            const t = new fabric.IText('テキスト', { left: shapeStart.x, top: shapeStart.y, fontSize: 24, fill: color });
            canvas.add(t); canvas.setActiveObject(t); setMode('move'); return;
        }

        isMouseDown = true;
        const common = { stroke: color, strokeWidth: sw, fill: 'transparent', selectable: false, evented: false };
        if (currentShape === 'line' || currentShape === 'arrow') activeObj = new fabric.Line([shapeStart.x, shapeStart.y, shapeStart.x, shapeStart.y], common);
        else if (currentShape === 'rect') activeObj = new fabric.Rect({ ...common, left: shapeStart.x, top: shapeStart.y, width: 0, height: 0 });
        else if (currentShape === 'circle') activeObj = new fabric.Ellipse({ ...common, left: shapeStart.x, top: shapeStart.y, rx: 0, ry: 0 });
        else if (currentShape === 'star') activeObj = new fabric.Polygon(getStarPoints(), { ...common, left: shapeStart.x, top: shapeStart.y });
        
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
            const s = Math.max(w, h) / 70;
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
                const path = [`M ${x1} ${y1} L ${x2} ${y2}`, `M ${x2} ${y2} L ${x2 - head * Math.cos(angle - Math.PI/6)} ${y2 - head * Math.sin(angle - Math.PI/6)}`, `M ${x2} ${y2} L ${x2 - head * Math.cos(angle + Math.PI/6)} ${y2 - head * Math.sin(angle + Math.PI/6)}`].join(' ');
                canvas.remove(activeObj);
                canvas.add(new fabric.Path(path, { stroke, strokeWidth, fill: 'transparent', selectable: false }));
            }
            activeObj.setCoords();
            applyModeLocks();
            activeObj = null;
            requestAutoSave();
        }
    });

    function getStarPoints() {
        const pts = [], n = 5, r1 = 15, r2 = 35;
        for (let i = 0; i < 10; i++) {
            const r = (i % 2 === 0) ? r2 : r1, a = (i * Math.PI) / n;
            pts.push({ x: r * Math.sin(a) + r2, y: -r * Math.cos(a) + r2 });
        }
        return pts;
    }

    // --- 7. Eraser & Trash ---
    let isErasing = false;
    canvas.on('mouse:down', (o) => { if (currentMode === 'eraser') isErasing = true; eraseTarget(o); });
    canvas.on('mouse:move', (o) => { if (isErasing) eraseTarget(o); });
    canvas.on('mouse:up', () => isErasing = false);
    function eraseTarget(o) {
        if (isErasing && currentMode === 'eraser' && o.target) {
            canvas.remove(o.target);
            requestAutoSave();
        }
    }

    document.getElementById('delSelected').onclick = () => {
        const active = canvas.getActiveObjects();
        if (active.length > 0) {
            active.forEach(o => canvas.remove(o));
            canvas.discardActiveObject().requestRenderAll();
            requestAutoSave();
        } else { toast('オブジェクトを選択してください'); }
    };

    // --- 8. Event Bindings ---
    document.getElementById('modeMove').onclick = () => setMode('move');
    document.getElementById('pen1Btn').onclick = () => setMode('pen', 1);
    document.getElementById('pen2Btn').onclick = () => setMode('pen', 2);
    document.getElementById('modeEraser').onclick = () => setMode('eraser');
    ['Line','Arrow','Rect','Circle','Star','Text'].forEach(s => {
        const el = document.getElementById('shape'+s);
        if(el) el.onclick = () => setMode('shape', null, s.toLowerCase());
    });

    document.getElementById('penColor').onchange = (e) => {
        penConfigs[activePenId].color = e.target.value;
        if(currentMode === 'pen') setMode('pen', activePenId);
    };
    document.getElementById('penSize').oninput = (e) => {
        const val = parseInt(e.target.value);
        penConfigs[activePenId].width = val;
        document.getElementById('penSizeLabel').textContent = val + 'px';
        if(currentMode === 'pen') canvas.freeDrawingBrush.width = val;
    };

    document.getElementById('undoBtn').onclick = () => { if (hIdx > 0) { hIdx--; restore(); } };
    document.getElementById('redoBtn').onclick = () => { if (hIdx < history.length - 1) { hIdx++; restore(); } };
    function restore() {
        suppressHistory = true;
        canvas.loadFromJSON(history[hIdx], () => { 
            applyBackground(canvas); 
            applyModeLocks(); 
            suppressHistory = false; 
            canvas.renderAll();
        });
    }

    document.getElementById('openNotebookLM').onclick = () => {
        window.open('https://notebooklm.google.com/', '_blank');
    };

    // --- NEW: Export All Pages as Images ZIP ---
    document.getElementById('exportAllImages').onclick = async () => {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.style.display = 'flex';
        
        try {
            snapshot(); // 現在のページを保存
            const zip = new JSZip();
            const folder = zip.folder("notes_images");

            for (let i = 0; i < pages.length; i++) {
                const data = pages[i];
                // ページをロード
                await new Promise((resolve) => {
                    if (data) {
                        canvas.loadFromJSON(data, () => {
                            applyBackground(canvas);
                            canvas.renderAll();
                            resolve();
                        });
                    } else {
                        canvas.clear();
                        applyBackground(canvas);
                        resolve();
                    }
                });

                // PNGとしてデータ化
                const dataURL = canvas.toDataURL({ format: 'png', quality: 1 });
                const base64Data = dataURL.replace(/^data:image\/png;base64,/, "");
                folder.file(`page_${i + 1}.png`, base64Data, {base64: true});
            }

            // 元のページに戻す
            await new Promise((resolve) => {
                canvas.loadFromJSON(pages[curP], () => {
                    applyBackground(canvas);
                    applyModeLocks();
                    resolve();
                });
            });

            const content = await zip.generateAsync({ type: "blob" });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(content);
            a.download = `Note_Images.zip`;
            a.click();
            toast('ZIPをダウンロードしました');
        } catch (err) {
            console.error(err);
            toast('書き出しに失敗しました');
        } finally {
            if (overlay) overlay.style.display = 'none';
        }
    };

    document.getElementById('saveFile').onclick = async () => {
        snapshot();
        const zip = new JSZip(); 
        zip.file("note.json", JSON.stringify(pages));
        const b = await zip.generateAsync({ type: "blob" });
        const a = document.createElement('a'); 
        a.href = URL.createObjectURL(b); a.download = `Note.nota`; a.click();
    };

    document.getElementById('loadBtn').onclick = () => document.getElementById('loadFile').click();
    document.getElementById('loadFile').onchange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        const zip = await JSZip.loadAsync(f);
        pages = JSON.parse(await zip.file("note.json").async("string"));
        await saveToIDB(pages);
        switchPage(0, true);
        toast('読み込み完了');
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

    // --- 9. Startup ---
    (async () => {
        const d = await loadFromIDB(); 
        if (d && Array.isArray(d)) pages = d;
        switchPage(0, true);
    })();
});