// ==UserScript==
// @name         Prompt Fission
// @namespace    http://tampermonkey.net/
// @version      0.9.7
// @description  Enhances chat interfaces with prompt fission capabilities.
// @author       lele
// @match        https://chat.deepseek.com/*
// @match        https://prompt.zheshi.tech/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      prompt.zheshi.tech
// ==/UserScript==

(function () {
    'use strict';

    // --- CONFIGURATION ---
    const API_BASE_URL = 'https://prompt.zheshi.tech/api/v1';
    const LOGIN_URL = 'https://prompt.zheshi.tech';

    // const API_BASE_URL = 'http://192.168.31.112:3000/api/v1';
    // const LOGIN_URL = 'http://192.168.31.112:3000';
    // const TOKEN_SYNC_URL = 'http://192.168.31.112:3000';

    // --- 1. CREATE UI ELEMENTS ---
    const button = document.createElement('div');
    button.id = 'fission-button';
    const buttonIcon = document.createElement('span');
    buttonIcon.id = 'fission-button-icon';
    buttonIcon.textContent = '▶️';
    button.appendChild(buttonIcon);
    const progressRing = document.createElement('div');
    progressRing.id = 'fission-progress-ring';
    progressRing.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="ring-track" cx="50" cy="50" r="45"></circle><circle class="ring-progress" cx="50" cy="50" r="45"></circle></svg>';
    button.appendChild(progressRing);
    document.body.appendChild(button);

    const ringProgressEl = progressRing.querySelector('.ring-progress');
    const R = 45;
    const C = 2 * Math.PI * R;
    ringProgressEl.style.strokeDasharray = String(C);
    ringProgressEl.style.strokeDashoffset = String(C);
    function setButtonProgress(p) {
        const v = Math.max(0, Math.min(100, Number(p) || 0));
        ringProgressEl.style.strokeDashoffset = String(C * (1 - v / 100));
    }

    const dialog = document.createElement('div');
    dialog.id = 'fission-dialog';
    dialog.innerHTML = `
        <div id="fission-dialog-header">
            Prompt Fission <span id="fission-version">V${GM_info.script.version}</span>
        </div>
        <div id="fission-dialog-content">
            <div id="fission-status-container">
                <span id="fission-login-status">Verifying...</span>
                <button id="fission-login-button">Login</button>
            </div>
            <div id="fission-prompt-container">
                <textarea id="fission-prompt-input" placeholder="Enter your prompt here..."></textarea>
                <button id="fission-start-button">Start</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);


    // --- 2. STYLE UI ELEMENTS ---
    GM_addStyle(`
        #fission-button { position: fixed; top: 50%; right: 20px; width: 50px; height: 50px; background-color: #007bff; color: white; border-radius: 50%; display: flex; justify-content: center; align-items: center; cursor: grab; user-select: none; z-index: 9999; transition: right 0.3s ease-in-out; }
        #fission-dialog { display: none; position: fixed; top: 150px; left: 150px; width: 350px; background-color: white; border: 1px solid #ccc; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); z-index: 10000; font-family: sans-serif; }
        #fission-dialog-header { padding: 10px; cursor: move; background-color: #f1f1f1; border-bottom: 1px solid #ccc; border-top-left-radius: 10px; border-top-right-radius: 10px; }
        #fission-dialog-content { padding: 20px; display: flex; flex-direction: column; gap: 15px; }
        #fission-status-container { display: flex; justify-content: space-between; align-items: center; }
        #fission-login-button, #fission-start-button { padding: 5px 10px; cursor: pointer; }
        #fission-prompt-container { display: flex; gap: 10px; }
        #fission-prompt-input { width: 100%; height: 60px; padding: 5px; }
        #fission-button #fission-button-icon { position: relative; z-index: 1; font-size: 20px; }
        #fission-progress-ring { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; }
        #fission-progress-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
        #fission-progress-ring .ring-track { fill: none; stroke: rgba(255,255,255,0.35); stroke-width: 6; }
        #fission-progress-ring .ring-progress { fill: none; stroke: #ffffff; stroke-width: 6; stroke-linecap: round; transition: stroke-dashoffset 0.25s ease; }
        #fission-version { font-size: 0.8em; color: #aaa; margin-left: 10px; font-weight: normal; }
    `);


    // --- 3. IMPLEMENT UI LOGIC ---
    function makeDraggable(element, handle) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        handle.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
            GM_setValue('dialogTop', element.style.top);
            GM_setValue('dialogLeft', element.style.left);
        }
    }

    const savedTop = GM_getValue('dialogTop', null);
    const savedLeft = GM_getValue('dialogLeft', null);
    if (savedTop && savedLeft) {
        dialog.style.top = savedTop;
        dialog.style.left = savedLeft;
    }

    makeDraggable(dialog, dialog.querySelector('#fission-dialog-header'));

    function toggleDialog() { dialog.style.display = (dialog.style.display === 'none' || dialog.style.display === '') ? 'block' : 'none'; }
    button.addEventListener('mousedown', (e) => {
        e.preventDefault();
        let isDragging = false;
        const startX = e.clientX, startY = e.clientY;
        const offsetX = e.clientX - button.getBoundingClientRect().left, offsetY = e.clientY - button.getBoundingClientRect().top;
        button.style.cursor = 'grabbing';
        button.style.transition = 'none';
        function onMouseMove(moveEvent) {
            if (!isDragging && (Math.abs(moveEvent.clientX - startX) > 5 || Math.abs(moveEvent.clientY - startY) > 5)) isDragging = true;
            if (isDragging) {
                let newX = moveEvent.clientX - offsetX, newY = moveEvent.clientY - offsetY;
                const rect = button.getBoundingClientRect();
                newX = Math.max(0, Math.min(newX, window.innerWidth - rect.width));
                newY = Math.max(0, Math.min(newY, window.innerHeight - rect.height));
                button.style.left = `${newX}px`;
                button.style.top = `${newY}px`;
                button.style.right = 'auto';
            }
        }
        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            button.style.cursor = 'grab';
            if (isDragging) {
                button.style.transition = 'right 0.3s ease-in-out';
                button.style.left = 'auto';
                button.style.right = '20px';
            } else {
                toggleDialog();
            }
        }
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });


    // --- 4. IMPLEMENT APPLICATION LOGIC ---
    const loginStatusEl = document.getElementById('fission-login-status');
    const loginButtonEl = document.getElementById('fission-login-button');
    const startButtonEl = document.getElementById('fission-start-button');
    const promptInputEl = document.getElementById('fission-prompt-input');
    

    function updateLoginUI(isLoggedIn, statusText = '') {
        loginStatusEl.textContent = statusText || (isLoggedIn ? 'Logged In' : 'Not Logged In');
        loginButtonEl.textContent = isLoggedIn ? 'Logout' : 'Login';
    }

    function activateNetButton() {
        const netButtonEl = Array.from(document.querySelectorAll('button, [role="button"]'))
            .find(el => el.textContent?.replace(/\s+/g, '').includes('联网搜索'));
        const activated = netButtonEl.classList.contains('ds-toggle-button--selected');
        if (!activated) {
            netButtonEl.click();
        }
    }

    function deactivateDeepThoughtButton() {
        const deepThoughtButtonEl = Array.from(document.querySelectorAll('button, [role="button"]'))
            .find(el => el.textContent?.replace(/\s+/g, '').includes('深度思考'));
        const activated = deepThoughtButtonEl.classList.contains('ds-toggle-button--selected');
        if (activated) {
            deepThoughtButtonEl.click();
        }
    }


    function updateStartButtonUI(isProcessing) {
        buttonIcon.textContent = isProcessing ? '⏸' : '▶️';
        startButtonEl.textContent = isProcessing ? 'Processing...' : 'Start';
        startButtonEl.disabled = isProcessing;
        if (isProcessing) {
            if (!updateStartButtonUI._overlay) {
                const overlay = document.createElement('div');
                overlay.id = 'fission-overlay';
                overlay.style.position = 'fixed';
                overlay.style.top = '0';
                overlay.style.left = '0';
                overlay.style.right = '0';
                overlay.style.bottom = '0';
                overlay.style.zIndex = '2147483647';
                overlay.style.background = 'rgba(0,0,0,0)';
                overlay.style.cursor = 'not-allowed';

                const toast = document.createElement('div');
                toast.id = 'fission-overlay-toast';
                toast.textContent = '正在处理，请勿操作！';
                toast.style.position = 'fixed';
                toast.style.top = '20%';
                toast.style.left = '50%';
                toast.style.transform = 'translate(-50%, -50%)';
                toast.style.background = 'rgba(0,0,0,0.8)';
                toast.style.color = '#fff';
                toast.style.padding = '10px 16px';
                toast.style.borderRadius = '8px';
                toast.style.fontSize = '14px';
                toast.style.fontFamily = 'sans-serif';
                toast.style.display = 'none';
                toast.style.pointerEvents = 'none';
                toast.style.zIndex = '2147483647';
                overlay.appendChild(toast);

                const onInteract = (e) => {
                    if (!e) return;
                    if (typeof e.preventDefault === 'function') e.preventDefault();
                    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
                    if (typeof e.stopPropagation === 'function') e.stopPropagation();
                    if (!updateStartButtonUI._toastTimer && toast.style.display !== 'block') {
                        updateStartButtonUI._toastTimer = setTimeout(() => {
                            toast.style.display = 'block';
                            if (updateStartButtonUI._toastHideTimer) clearTimeout(updateStartButtonUI._toastHideTimer);
                            updateStartButtonUI._toastHideTimer = setTimeout(() => {
                                toast.style.display = 'none';
                            }, 2000);
                            updateStartButtonUI._toastTimer = null;
                        }, 1000);
                    }
                    return false;
                };

                ['pointerdown', 'pointerup', 'click', 'dblclick', 'contextmenu', 'wheel', 'touchstart', 'touchmove', 'touchend', 'mousedown', 'mouseup', 'mousemove'].forEach((ev) => {
                    overlay.addEventListener(ev, onInteract, { capture: true });
                });

                const keyHandler = (e) => onInteract(e);
                ['keydown', 'keypress', 'keyup', 'wheel'].forEach((ev) => {
                    document.addEventListener(ev, keyHandler, true);
                });

                updateStartButtonUI._overlay = overlay;
                updateStartButtonUI._keyHandler = keyHandler;
                document.body.appendChild(overlay);
            }
        } else {
            const overlay = updateStartButtonUI._overlay;
            if (overlay && overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
            updateStartButtonUI._overlay = null;

            const keyHandler = updateStartButtonUI._keyHandler;
            if (keyHandler) {
                ['keydown', 'keypress', 'keyup', 'wheel'].forEach((ev) => {
                    document.removeEventListener(ev, keyHandler, true);
                });
            }
            updateStartButtonUI._keyHandler = null;

            if (updateStartButtonUI._toastTimer) {
                clearTimeout(updateStartButtonUI._toastTimer);
                updateStartButtonUI._toastTimer = null;
            }
            if (updateStartButtonUI._toastHideTimer) {
                clearTimeout(updateStartButtonUI._toastHideTimer);
                updateStartButtonUI._toastHideTimer = null;
            }
        }
    }

    function normalizeArrayFromResponse(resp) {
        if (!resp) return [];
        if (Array.isArray(resp)) return resp;
        if (typeof resp === 'string') {
            try { const j = JSON.parse(resp); return normalizeArrayFromResponse(j); } catch (_) { return []; }
        }
        if (typeof resp === 'object') {
            const cands = ['data', 'items', 'list', 'records', 'rows', 'results', 'prompts', 'tasks'];
            for (const key of cands) {
                const v = resp[key];
                if (Array.isArray(v)) return v;
                if (v && typeof v === 'object') {
                    for (const k2 of cands) {
                        if (Array.isArray(v[k2])) return v[k2];
                    }
                }
            }
        }
        return [];
    }

    function pickField(obj, keys) {
        for (const k of keys) {
            if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null) return obj[k];
        }
        return undefined;
    }

    function normalizeTaskItem(item) {
        if (typeof item === 'string') return { prompt: item, sub_task_id: undefined };
        if (!item || typeof item !== 'object') return null;
        const prompt = pickField(item, ['prompt', 'content', 'text', 'query', 'message', 'instruction', 'input']);
        const subTaskId = pickField(item, ['sub_task_id', 'subTaskId', 'task_id', 'taskId', 'id', '_id']);
        if (!prompt) return null;
        return { prompt, sub_task_id: subTaskId };
    }

    function normalizeTasksFromAny(resp) {
        const arr = normalizeArrayFromResponse(resp);
        const result = [];
        for (const it of arr) {
            const n = normalizeTaskItem(it);
            if (n) result.push(n);
        }
        return result;
    }

    function getCookieValueFromDocument(name) {
        const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'));
        return m ? decodeURIComponent(m[1]) : null;
    }

    function syncAuthCookieFromDocument() {
        const val = getCookieValueFromDocument('auth_token');
        if (val) {
            GM_setValue('cookie_auth_token', val);
            updateLoginUI(true);
        }
    }

    function buildAuthCookieHeader() {
        const saved = GM_getValue('cookie_auth_token', null);
        if (!saved) return null;
        return `auth_token=${saved}`;
    }

    function authHeaderVal(token) {
        if (!token) return '';
        let t = String(token).trim();
        if (/^(Bearer|JWT)\s+/i.test(t)) return t.replace(/^\s+|\s+$/g, '');
        return `Bearer ${t}`;
    }

    function checkLoginStatus() {
        updateLoginUI(false, 'Verifying...');
        const cookieHeader = buildAuthCookieHeader();
        GM_xmlhttpRequest({
            method: 'GET',
            url: `${API_BASE_URL}/profile`,
            anonymous: cookieHeader ? true : false,
            headers: cookieHeader ? { 'Cookie': cookieHeader } : {},
            onload: (response) => {
                if (response.status === 200) {
                    updateLoginUI(true);
                    queryPendingTasks().then(tasks => {
                        if (tasks && tasks.length > 0) {
                            console.log(`[Tampermonkey] 📝 You have ${tasks.length} pending tasks.`);
                            confirmAction(`You have ${tasks.length} pending tasks. Do you want to process them now?`).then(confirmed => {
                                if (confirmed) {
                                    const textareaElement = document.querySelector('textarea[class*="ds-scroll-area"][class*="d96f2d2a"]');
                                    processPromptsFlow(textareaElement, tasks);
                                }
                            });
                        }
                    }).catch(err => {
                        console.error('[Tampermonkey] ❌ Failed to query pending tasks:', err);
                    });
                } else {
                    updateLoginUI(false);
                }
            },
            onerror: () => { updateLoginUI(false, 'Error'); }
        });
    }

    // 查询待处理任务接口
    function queryPendingTasks() {
        return new Promise((resolve, reject) => {
            if (loginButtonEl.textContent !== 'Logout') {
                console.warn('[Tampermonkey] ❌ 未登录，无法查询待处理任务');
                return reject('Not logged in');
            }
            const cookieHeader = buildAuthCookieHeader();
            GM_xmlhttpRequest({
                method: 'GET',
                url: `${API_BASE_URL}/pending-tasks`,
                anonymous: cookieHeader ? true : false,
                headers: cookieHeader ? { 'Cookie': cookieHeader } : {},
                onload: (response) => {
                    try {
                        const data = JSON.parse(response.responseText);
                        const normalized = normalizeTasksFromAny(data);
                        resolve(normalized);
                    } catch (e) {
                        console.error('[Tampermonkey] ❌ Failed to parse response:', e);
                        reject(e);
                    }
                },
                onerror: (error) => {
                    console.error('[Tampermonkey] ❌ Error:', error);
                    reject(error);
                }
            });
        });
    }

    // 弹窗询问确认操作
    function confirmAction(message) {
        return new Promise((resolve) => {
            const confirmation = window.confirm(message);
            resolve(confirmation);
        });
    }

    loginButtonEl.addEventListener('click', () => {
        if (loginButtonEl.textContent === 'Logout') { GM_setValue('cookie_auth_token', null); updateLoginUI(false); }
        else { window.open(LOGIN_URL, '_blank'); }
    });

    function executePromptOnPage() {
        const currentUrl = window.current_url_for_testing || window.location.href;
        if (!currentUrl.startsWith('https://chat.deepseek.com')) return;
        const sendBtn = document.querySelector('div[role="button"][aria-disabled="false"][class*="_7436101"]');
        if (sendBtn) {
            sendBtn.click();
            // 等待发送按钮变为不可用，表示发送完成
            const checkInterval = setInterval(() => {
                const disabledBtn = document.querySelector('div[role="button"][aria-disabled="true"][class*="_7436101"]');
                if (disabledBtn) {
                    clearInterval(checkInterval);
                    // 发送完成后的操作
                    alert('Prompt executed successfully.');
                }
            }, 500);
        } else {
            console.warn('[Tampermonkey] ❌ 未找到发送按钮');
        }
    }

    /**
     * 执行页面上的 Prompt，并返回一个 Promise。
     * Promise 在发送成功后 resolve，在找不到发送按钮时 reject。
     * * @returns {Promise<void>} 一个在 Prompt 发送完成后 resolve 的 Promise。
     */
    function executePromptOnPagePromise() {
        return new Promise((resolve, reject) => {
            const currentUrl = window.current_url_for_testing || window.location.href;
            if (!currentUrl.startsWith('https://chat.deepseek.com')) {
                // 可以在此处选择 reject 或直接返回一个已解决的 Promise，
                // 但如果用户期望在正确的页面才执行操作，reject 更合理。
                console.warn('[Tampermonkey] ❌ URL 不匹配，操作终止。');
                // return resolve(); // 如果不匹配也视为完成，可以 uncomment 这一行
                return reject(new Error('URL does not match https://chat.deepseek.com'));
            }
            // 查找可用的发送按钮
            const sendBtn = document.querySelector('div[role="button"][aria-disabled="false"][class*="_7436101"]');
            if (sendBtn) {
                sendBtn.click(); // 点击发送按钮
                // 等待发送按钮变为不可用，表示发送完成
                const checkInterval = setInterval(() => {
                    // 查找不可用的发送按钮
                    const disabledBtn = document.querySelector('div[role="button"][aria-disabled="true"][class*="_7436101"]');
                    if (disabledBtn) {
                        clearInterval(checkInterval); // 停止检查
                        // 发送完成，解决 Promise
                        resolve();
                    }
                }, 6000);
            } else {
                console.warn('[Tampermonkey] ❌ 未找到发送按钮');
                // 找不到发送按钮，拒绝 Promise
                reject(new Error('Send button not found'));
            }
        });
    }

    function clickOpenNewConversation(timeoutMs = 5000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const tryClick = () => {
                const span = Array.from(document.querySelectorAll('span'))
                    .find(el => el.textContent && el.textContent.trim() === '开启新对话');
                if (span) {
                    const clickable = span.closest('button, a, [role="button"], [onclick], [tabindex]') || span;
                    clickable.click();
                    console.log('[Tampermonkey] ✅ 已点击 “开启新对话”。');
                    resolve();
                    return;
                }
                if (Date.now() - start >= timeoutMs) {
                    console.warn('[Tampermonkey] ❌ 未在超时前找到 “开启新对话”。');
                    reject(new Error('“开启新对话”元素未找到'));
                    return;
                }
                setTimeout(tryClick, 300);
            };
            tryClick();
        });
    }

    startButtonEl.addEventListener('click', () => {
        setButtonProgress(0);
        if (loginButtonEl.textContent !== 'Logout') { alert('Please log in first.'); updateStartButtonUI(false); return; }
        const prompt = promptInputEl.value;
        if (!prompt.trim()) { alert('Please enter a prompt.'); updateStartButtonUI(false); return; }
        updateStartButtonUI(true);
        const cookieHeader = buildAuthCookieHeader();
        GM_xmlhttpRequest({
            method: 'POST',
            url: `${API_BASE_URL}/prompt-fission`,
            headers: Object.assign({ 'Content-Type': 'application/json' }, cookieHeader ? { 'Cookie': cookieHeader } : {}),
            anonymous: cookieHeader ? true : false,
            data: JSON.stringify({ prompt }),
            // onprogress: (e) => { if (e.lengthComputable) progressBarEl.style.width = `${(e.loaded / e.total) * 100}%`; },
            onload: (response) => {
                // progressBarEl.style.width = '100%';
                try {
                    const raw = JSON.parse(response.responseText);
                    const prompts = normalizeTasksFromAny(raw);
                    // console.log('[Tampermonkey] 📥 Received response:', data);
                    if (prompts && prompts.length > 0) {
                        const textareaElement = document.querySelector('textarea[class*="ds-scroll-area"][class*="d96f2d2a"]');
                        processPromptsFlow(textareaElement, prompts);
                    } else {
                        alert('No prompts were returned.');
                        updateStartButtonUI(false);
                    }
                } catch (e) {
                    console.error('[Tampermonkey] ❌ Failed to parse response:', e);
                    alert('Failed to process response.');
                    updateStartButtonUI(false);
                }
            },
            onerror: (error) => {
                console.error('[Tampermonkey] ❌ Error:', error);
                alert('An error occurred.');
                setTimeout(() => { setButtonProgress(0); }, 2000);
                updateStartButtonUI(false);
            }
        });
    });

    /**
 * 异步处理一系列 prompts 流程。
 *
 * @param {HTMLElement} textareaElement - 用于输入 prompt 的文本区域元素。
 * @param {string[]} prompts - 要处理的 prompt 字符串数组。
 */
    async function processPromptsFlow(textareaElement, prompts) {
        updateStartButtonUI(true);
        activateNetButton();
        deactivateDeepThoughtButton();
        setButtonProgress(0);
        const normalizedPrompts = normalizeTasksFromAny(prompts);
        if (!Array.isArray(normalizedPrompts) || normalizedPrompts.length === 0) {
            console.log("[Tampermonkey] ⚠️ No prompts provided or prompts is not an array.");
            updateStartButtonUI(false);
            return;
        }

        console.log(`[Tampermonkey] 🚀 Starting to process ${normalizedPrompts.length} prompts...`);

        // 使用 for...of 循环按顺序处理每个 prompt
        for (let i = 0; i < normalizedPrompts.length; i++) {
            const prompt = normalizedPrompts[i].prompt;
            const subTaskId = normalizedPrompts[i].sub_task_id;
            try {
                console.log(`[Tampermonkey] ⏳ Processing prompt: "${prompt.substring(0, 10)}..."`);

                // 1. 点击开启新对话
                await clickOpenNewConversation();
                console.log(`[Tampermonkey] ✅ New conversation opened successfully.`);

                // 2. 模拟输入/粘贴 prompt
                await simulateInputAtCursor(textareaElement, prompt);
                console.log(`[Tampermonkey] ✅ Prompt pasted successfully.`);

                // 3. 执行 prompt
                await executePromptOnPagePromise();
                console.log(`[Tampermonkey] ✅ Prompt executed successfully.`);

                // 3. 上传蒸馏数据
                await uploadDistillationData(prompt, subTaskId);
                console.log(`[Tampermonkey] ✅ Distillation data uploaded successfully.`);

                // 4. 更新环形进度
                setButtonProgress(((i + 1) / normalizedPrompts.length) * 100);
                // 可选：等待一段时间，以便观察或等待页面加载
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                // 如果一个 prompt 失败，记录错误并继续处理下一个 prompt (或选择中断)
                console.error(`[Tampermonkey] ❌ Failed to process prompt: "${prompt.substring(0, 10)}..."`, error);
                // 如果希望失败时停止整个流程，可以在这里加上 `throw error;` 或 `return;`
                alert(`Failed to process prompt: "${prompt.substring(0, 10)}..." Error: ${error.message}`);
                updateStartButtonUI(false);
                throw error; // 取消注释以在失败时停止整个流程
            }
        }

        console.log("[Tampermonkey] 🎉 All prompts processed successfully (or finished execution).");
        updateStartButtonUI(false);
    }

    function uploadDistillationData(prompt, subTaskId) {
        return new Promise((resolve, reject) => {
            if (loginButtonEl.textContent !== 'Logout') {
                console.warn('[Tampermonkey] ❌ 未登录，无法上传蒸馏数据');
                return reject('Not logged in');
            }
            // const thinkingContents = document.querySelectorAll('div[class*="ds-think-content"]');
            const outputContents = document.querySelectorAll('div[class*="ds-markdown"]');
            if (outputContents.length === 0) {
                console.warn('[Tampermonkey] ❌ 未找到蒸馏内容区域');
                alert('未找到推理过程，请打开【深度思考】后再试。');
                reject('Thinking content area not found');
                return;
            }
            // const thinkingContent = thinkingContents[thinkingContents.length - 1];
            // const thinkingData = thinkingContent.innerText;
            const outputContent = outputContents[outputContents.length - 1];
            const outputData = outputContent.innerText;
            const payload = {
                sub_task_id: subTaskId,
                subTaskId: subTaskId,
                prompt: prompt,
                content: prompt,
                // inference_process: thinkingData,
                // inferenceProcess: thinkingData,
                model_output: outputData,
                modelOutput: outputData
            };
            const jsonData = JSON.stringify(payload);
            // console.log('[Tampermonkey] 📤 上传蒸馏数据:', jsonData);
            const cookieHeader = buildAuthCookieHeader();
            GM_xmlhttpRequest({
                method: 'POST',
                url: `${API_BASE_URL}/distillation-data`,
                headers: Object.assign({ 'Content-Type': 'application/json' }, cookieHeader ? { 'Cookie': cookieHeader } : {}),
                anonymous: cookieHeader ? true : false,
                data: jsonData,
                onload: (response) => {
                    try {
                        const data = JSON.parse(response.responseText);
                        // console.log('[Tampermonkey] 📤 蒸馏数据上传成功:', data);
                        resolve();
                    } catch (e) {
                        console.error('[Tampermonkey] ❌ Failed to parse response:', e);
                        alert('Failed to process response.');
                        reject(e);
                    }
                },
                onerror: (error) => {
                    console.error('[Tampermonkey] ❌ Error:', error);
                    reject(error);
                }
            });
        });
    }

    // 模拟执行粘贴，尝试所有的可能方式，每0.5秒钟检查一次是否有可输入的焦点元素，持续5s
    function simulateInputAtCursor(activeElement, message) {
        return new Promise((resolve, reject) => {
            const maxWaitTime = 5000; // 最大等待时间（毫秒）
            const checkInterval = 500; // 检查间隔（毫秒）
            let attempts = 0;
            const interval = setInterval(() => {
                if (activeElement && (
                    activeElement instanceof HTMLInputElement ||
                    activeElement instanceof HTMLTextAreaElement ||
                    (activeElement.isContentEditable && activeElement.contentEditable === 'true')
                )) {
                    clearInterval(interval);
                    activeElement.focus();

                    // 方式一：尝试使用 document.execCommand 插入文本
                    if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
                        try {
                            document.execCommand('insertText', false, message);
                            console.log('[Tampermonkey] 粘贴成功（方式一）');
                            resolve();
                        } catch (e) {
                            // console.warn('方式一失败，尝试其他方法');
                            reject(e);
                        }
                    }

                    // 方式二：如果 execCommand 失败，尝试直接设置值
                    else if (activeElement.setSelectionRange) {
                        const start = activeElement.selectionStart;
                        const end = activeElement.selectionEnd;
                        activeElement.value = activeElement.value.substring(0, start) + message + activeElement.value.substring(end);
                        activeElement.setSelectionRange(start + message.length, start + message.length);
                        console.log('[Tampermonkey] 粘贴成功（方式二）');
                        resolve();
                    }

                    // 方式三：如果是 contenteditable 元素
                    else if (activeElement.isContentEditable) {
                        const selection = window.getSelection();
                        if (selection.rangeCount > 0) {
                            const range = selection.getRangeAt(0);
                            range.deleteContents();
                            const textNode = document.createTextNode(message);
                            range.insertNode(textNode);
                            range.setEndAfter(textNode);
                            range.collapse(false);
                            selection.removeAllRanges();
                            selection.addRange(range);
                            console.log('[Tampermonkey] 粘贴成功（方式三）');
                            resolve();
                        }
                    }

                    else {
                        // 方式四：如果 setSelectionRange 和 contenteditable 也不支持，尝试模拟按键事件
                        for (let i = 0; i < message.length; i++) {
                            const keyEvent = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: message[i] });
                            activeElement.dispatchEvent(keyEvent);
                            const inputEvent = new InputEvent('input', { bubbles: true, cancelable: true, data: message[i] });
                            activeElement.dispatchEvent(inputEvent);
                        }
                        console.log('[Tampermonkey] 粘贴成功（方式四）');
                        resolve();
                    }
                } else {
                    // 如果还没有超过最大等待时间，继续检查
                    attempts++;
                    if (attempts * checkInterval >= maxWaitTime) {
                        // 超过最大等待时间，停止查找并打印错误信息
                        clearInterval(interval);
                        // console.error('在五秒内未找到可输入的焦点元素，放弃执行粘贴动作。');
                        reject(new Error('No focusable input element found within 5 seconds.'));
                    }
                }
            }, checkInterval);
        });
    }

    // --- 5. INITIALIZE SCRIPT ---
    const currentUrl = window.current_url_for_testing || window.location.href;
    if (currentUrl.startsWith(LOGIN_URL)) {
        syncAuthCookieFromDocument();
    }
    else {
        checkLoginStatus();
    }

})();