// ==UserScript==
// @name         Prompt Fission
// @namespace    http://tampermonkey.net/
// @version      0.10.0
// @description  Enhances chat interfaces with prompt fission capabilities.
// @author       lele
// @match        https://chat.deepseek.com/*
// @match        https://prompt.zheshi.tech/*
// @match        https://www.doubao.com/*
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
        #fission-popup-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; z-index: 2147483648; }
        #fission-popup { width: 360px; max-width: calc(100% - 40px); background: #fff; border: 1px solid #ccc; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-family: sans-serif; overflow: hidden; }
        #fission-popup-header { padding: 10px 14px; background: #f1f1f1; border-bottom: 1px solid #ccc; }
        #fission-popup-content { padding: 16px; color: #333; font-size: 14px; line-height: 1.5; }
        #fission-popup-actions { padding: 10px 14px; display: flex; justify-content: flex-end; gap: 8px; background: #fafafa; border-top: 1px solid #eee; }
        .fission-btn { padding: 6px 12px; border-radius: 6px; border: 1px solid #ccc; background: #fff; cursor: pointer; font-size: 14px; }
        .fission-btn.primary { background: #007bff; color: #fff; border-color: #007bff; }
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

    function showPluginAlert(message, options = {}) {
        const title = options.title || 'Prompt Fission';
        const okText = options.okText || 'OK';
        const existing = document.getElementById('fission-popup-overlay');
        if (showPluginAlert._activeKeydown) {
            document.removeEventListener('keydown', showPluginAlert._activeKeydown, true);
            showPluginAlert._activeKeydown = null;
        }
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
        const overlay = document.createElement('div');
        overlay.id = 'fission-popup-overlay';
        const popup = document.createElement('div');
        popup.id = 'fission-popup';
        const header = document.createElement('div');
        header.id = 'fission-popup-header';
        header.textContent = title;
        const content = document.createElement('div');
        content.id = 'fission-popup-content';
        content.textContent = String(message || '');
        const actions = document.createElement('div');
        actions.id = 'fission-popup-actions';
        const okBtn = document.createElement('button');
        okBtn.className = 'fission-btn primary';
        okBtn.textContent = okText;
        actions.appendChild(okBtn);
        popup.appendChild(header);
        popup.appendChild(content);
        popup.appendChild(actions);
        overlay.appendChild(popup);
        document.body.appendChild(overlay);
        return new Promise((resolve) => {
            const onKey = (e) => {
                if (e.key === 'Escape' || e.key === 'Enter') {
                    e.preventDefault();
                    close(true);
                }
            };
            showPluginAlert._activeKeydown = onKey;
            const close = (result) => {
                if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
                if (showPluginAlert._activeKeydown === onKey) {
                    document.removeEventListener('keydown', onKey, true);
                    showPluginAlert._activeKeydown = null;
                }
                resolve(result);
            };
            okBtn.addEventListener('click', () => close(true));
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) close(true);
            }, { capture: true });
            document.addEventListener('keydown', onKey, true);
        });
    }

    function showPluginConfirm(message, options = {}) {
        const title = options.title || 'Prompt Fission';
        const okText = options.okText || 'OK';
        const cancelText = options.cancelText || 'Cancel';
        const existing = document.getElementById('fission-popup-overlay');
        if (showPluginConfirm._activeKeydown) {
            document.removeEventListener('keydown', showPluginConfirm._activeKeydown, true);
            showPluginConfirm._activeKeydown = null;
        }
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
        const overlay = document.createElement('div');
        overlay.id = 'fission-popup-overlay';
        const popup = document.createElement('div');
        popup.id = 'fission-popup';
        const header = document.createElement('div');
        header.id = 'fission-popup-header';
        header.textContent = title;
        const content = document.createElement('div');
        content.id = 'fission-popup-content';
        content.textContent = String(message || '');
        const actions = document.createElement('div');
        actions.id = 'fission-popup-actions';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'fission-btn';
        cancelBtn.textContent = cancelText;
        const okBtn = document.createElement('button');
        okBtn.className = 'fission-btn primary';
        okBtn.textContent = okText;
        actions.appendChild(cancelBtn);
        actions.appendChild(okBtn);
        popup.appendChild(header);
        popup.appendChild(content);
        popup.appendChild(actions);
        overlay.appendChild(popup);
        document.body.appendChild(overlay);
        return new Promise((resolve) => {
            const onKey = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    close(false);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    close(true);
                }
            };
            showPluginConfirm._activeKeydown = onKey;
            const close = (result) => {
                if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
                if (showPluginConfirm._activeKeydown === onKey) {
                    document.removeEventListener('keydown', onKey, true);
                    showPluginConfirm._activeKeydown = null;
                }
                resolve(result);
            };
            okBtn.addEventListener('click', () => close(true));
            cancelBtn.addEventListener('click', () => close(false));
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) close(false);
            }, { capture: true });
            document.addEventListener('keydown', onKey, true);
        });
    }

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
    

    const SiteKey = (() => {
        const u = window.current_url_for_testing || window.location.href;
        if (u.startsWith('https://chat.deepseek.com')) return 'deepseek';
        if (u.startsWith('https://www.doubao.com')) return 'doubao';
        return 'unknown';
    })();

    function isEditableEl(el) {
        if (!el) return false;
        if (el instanceof HTMLInputElement) return true;
        if (el instanceof HTMLTextAreaElement) return true;
        if (el.isContentEditable && el.contentEditable === 'true') return true;
        if (el.getAttribute && el.getAttribute('role') === 'textbox') return true;
        return false;
    }

    function findEditableInput() {
        const cands = [
            'textarea[class*="ds-scroll-area"][class*="d96f2d2a"]',
            'textarea[placeholder]',
            'textarea',
            '[contenteditable="true"]',
            '[role="textbox"]',
            'div[aria-multiline="true"]',
            'div[data-slate-editor="true"]'
        ];
        for (const sel of cands) {
            const list = Array.from(document.querySelectorAll(sel));
            const el = list.find(e => isEditableEl(e) && e.offsetParent !== null);
            if (el) return el;
        }
        const ae = document.activeElement;
        return isEditableEl(ae) ? ae : null;
    }

    function findSendButton() {
        if (SiteKey === 'deepseek') {
            const ds = Array.from(document.querySelectorAll('div[role="button"][class*="_7436101"]')).find(el => el.getAttribute('aria-disabled') === 'false');
            if (ds) return ds;
        }
        const list = Array.from(document.querySelectorAll('button, [role="button"], [aria-label]')).filter(e => e.offsetParent !== null);
        const el = list.find(e => {
            const t = (e.textContent || e.getAttribute('aria-label') || '').replace(/\s+/g, '');
            return ['发送', 'Send', '发送消息', '提交', '提问', 'Ask'].some(k => t.includes(k));
        });
        return el || null;
    }

    function pressEnter(target) {
        if (!target) return false;
        target.focus();
        const fire = (opts) => {
            const ev1 = new KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' }, opts));
            const ev2 = new KeyboardEvent('keypress', Object.assign({ bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' }, opts));
            const ev3 = new KeyboardEvent('keyup', Object.assign({ bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' }, opts));
            target.dispatchEvent(ev1);
            target.dispatchEvent(ev2);
            target.dispatchEvent(ev3);
        };
        fire({});
        fire({ ctrlKey: true });
        fire({ metaKey: true });
        return true;
    }

    function sendPrompt() {
        const btn = findSendButton();
        if (btn) { btn.click(); return true; }
        const input = findEditableInput();
        if (input) { return pressEnter(input); }
        return false;
    }

    function textIncludes(el, arr) {
        const txt = ((el && (el.textContent || el.getAttribute('aria-label'))) || '').replace(/\s+/g, '');
        return arr.some(k => txt.includes(k.replace(/\s+/g, '')));
    }

    function findClickableNear(el) {
        if (!el) return null;
        const clickableSel = 'button, [role="button"], [role="switch"], input[type="checkbox"], [aria-pressed], [aria-checked], [onclick], [tabindex], a';
        let clickable = el.closest(clickableSel);
        if (!clickable) {
            const container = el.closest('li, div, section, header, footer, article, main, nav') || el.parentElement;
            if (container) {
                const within = container.querySelector(clickableSel);
                if (within) clickable = within;
            }
            if (!clickable && el.parentElement) {
                const sibling = el.parentElement.querySelector(clickableSel);
                if (sibling) clickable = sibling;
            }
        }
        return clickable || el;
    }

    function findVisibleElsWithText(text) {
        const nodes = Array.from(document.querySelectorAll('div,button,a,span')).filter(e => e && e.offsetParent !== null);
        return nodes.filter(el => ((el.textContent || '').trim().includes(text)));
    }

    function toggleDoubaoSwitchByLabel(label, desiredOn) {
        if (SiteKey !== 'doubao') return false;
        const preferLabs = Array.from(document.querySelectorAll('div.flex.items-center')).filter(e => e && e.offsetParent !== null && ((e.textContent || '').includes(label)));
        const labels = preferLabs.length ? preferLabs : findVisibleElsWithText(label);
        for (const labEl of labels) {
            const container = labEl.closest('li, div, section, header, footer, article, main, nav') || labEl.parentElement;
            if (!container) continue;
            const switchEl = container.querySelector('button[role="switch"], [role="switch"], input[type="checkbox"], [aria-checked]');
            if (switchEl) {
                let state = null;
                if (switchEl instanceof HTMLInputElement && switchEl.type === 'checkbox') state = !!switchEl.checked;
                else if (switchEl.getAttribute) {
                    const val = switchEl.getAttribute('aria-checked') || switchEl.getAttribute('aria-pressed') || switchEl.getAttribute('data-state');
                    if (val != null) state = /^(true|on|checked|active)$/i.test(String(val));
                }
                if (state == null) state = buttonOnState(switchEl);
                if ((desiredOn && !state) || (!desiredOn && state)) switchEl.click();
                return true;
            }
            const clickable = findClickableNear(labEl);
            if (clickable) {
                const state = buttonOnState(clickable);
                if ((desiredOn && !state) || (!desiredOn && state)) clickable.click();
                return true;
            }
        }
        return false;
    }

    function doubaoClickNewChat(timeoutMs = 3000) {
        return new Promise((resolve, reject) => {
            if (SiteKey !== 'doubao') { reject(new Error('not doubao')); return; }
            const start = Date.now();
            const loop = () => {
                const prefer = Array.from(document.querySelectorAll('div.text-14.font-semibold.leading-22.select-none.grow.flex-1')).filter(e => e && e.offsetParent !== null && ((e.textContent || '').includes('新对话')));
                const labels = prefer.length ? prefer : findVisibleElsWithText('新对话');
                if (labels.length) {
                    const clickable = findClickableNear(labels[0]);
                    clickable.click();
                    resolve();
                    return;
                }
                if (Date.now() - start >= timeoutMs) { reject(new Error('新对话未找到')); return; }
                setTimeout(loop, 300);
            };
            loop();
        });
    }

    function buttonOnState(el) {
        if (!el) return null;
        if (el instanceof HTMLInputElement && el.type === 'checkbox') return !!el.checked;
        if (el.getAttribute && (el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-selected') === 'true')) return true;
        const ds = el.getAttribute && el.getAttribute('data-state');
        if (ds && /^(on|true|checked|active)$/i.test(ds)) return true;
        const cls = (el.className || '');
        if (/\bselected\b|\bactive\b|\bon\b/.test(cls)) return true;
        if (cls.includes('ds-toggle-button--selected')) return true;
        return false;
    }

    function toggleButtonByTexts(candidates, desiredOn) {
        const els = Array.from(document.querySelectorAll('button, [role="button"], [aria-pressed], [aria-checked], [onclick], [tabindex], a, div')).filter(e => e.offsetParent !== null);
        const el = els.find(e => textIncludes(e, candidates));
        if (!el) return;
        const clickable = findClickableNear(el);
        const state = buttonOnState(clickable);
        if ((desiredOn && !state) || (!desiredOn && state)) clickable.click();
    }

    function getOutputNodes() {
        if (SiteKey === 'deepseek') {
            const ds = Array.from(document.querySelectorAll('div[class*="ds-markdown"]'));
            if (ds.length) return ds;
        }
        const sels = [
            '.markdown',
            '.markdown-body',
            'div[class*="markdown"]',
            'div[class*="message-content"]',
            'div[class*="chat-message"]',
            'article',
            'div[role="article"]'
        ];
        for (const sel of sels) {
            const nodes = Array.from(document.querySelectorAll(sel));
            if (nodes.length) return nodes;
        }
        return [];
    }

    function extractLatestOutputText() {
        const nodes = getOutputNodes();
        if (!nodes.length) return null;
        const last = nodes[nodes.length - 1];
        const txt = (last.innerText || last.textContent || '').trim();
        return txt || null;
    }

    function waitForNewOutput(prevCount, timeoutMs = 60000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const baselineNodes = getOutputNodes();
            const baselineLastLen = baselineNodes.length ? ((baselineNodes[baselineNodes.length - 1].innerText || '').length) : 0;
            const loop = () => {
                const nodes = getOutputNodes();
                const lastLenNow = nodes.length ? ((nodes[nodes.length - 1].innerText || '').length) : 0;
                if (nodes.length > prevCount || lastLenNow > baselineLastLen) {
                    let lastLen = lastLenNow;
                    const idleCheck = () => {
                        const curNodes = getOutputNodes();
                        const curTextLen = ((curNodes[curNodes.length - 1] || {}).innerText || '').length;
                        if (curTextLen === lastLen) { resolve(); }
                        else { lastLen = curTextLen; setTimeout(idleCheck, 1000); }
                    };
                    setTimeout(idleCheck, 1500);
                    return;
                }
                if (Date.now() - start > timeoutMs) { reject(new Error('Response timeout')); return; }
                setTimeout(loop, 800);
            };
            loop();
        });
    }

    function clickOpenByTexts(texts, timeoutMs = 5000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const tryClick = () => {
                const els = Array.from(document.querySelectorAll('button, a, [role="button"], span, div, [onclick], [tabindex]')).filter(e => e.offsetParent !== null);
                const target = els.find(el => texts.some(t => (el.textContent || '').trim().includes(t)));
                if (target) {
                    const clickable = findClickableNear(target);
                    clickable.click();
                    resolve();
                    return;
                }
                if (Date.now() - start >= timeoutMs) { reject(new Error('“开启新对话”元素未找到')); return; }
                setTimeout(tryClick, 300);
            };
            tryClick();
        });
    }

    function updateLoginUI(isLoggedIn, statusText = '') {
        loginStatusEl.textContent = statusText || (isLoggedIn ? 'Logged In' : 'Not Logged In');
        loginButtonEl.textContent = isLoggedIn ? 'Logout' : 'Login';
    }

    function activateNetButton() {
        toggleButtonByTexts(['联网搜索', '联网', 'Web', 'Search'], true);
    }

    function deactivateDeepThoughtButton() {
        if (SiteKey === 'doubao') {
            if (toggleDoubaoSwitchByLabel('深度思考', false)) return;
        }
        toggleButtonByTexts(['深度思考', '思考', 'Deep', 'Thinking', '推理'], false);
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
                                    processPromptsFlow(null, tasks);
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
        return showPluginConfirm(message);
    }

    loginButtonEl.addEventListener('click', () => {
        if (loginButtonEl.textContent === 'Logout') { GM_setValue('cookie_auth_token', null); updateLoginUI(false); }
        else { window.open(LOGIN_URL, '_blank'); }
    });


    /**
     * 执行页面上的 Prompt，并返回一个 Promise。
     * Promise 在发送成功后 resolve，在找不到发送按钮时 reject。
     * * @returns {Promise<void>} 一个在 Prompt 发送完成后 resolve 的 Promise。
     */
    function executePromptOnPagePromise() {
        return new Promise((resolve, reject) => {
            const currentUrl = window.current_url_for_testing || window.location.href;
            if (!(currentUrl.startsWith('https://chat.deepseek.com') || currentUrl.startsWith('https://www.doubao.com'))) {
                console.warn('[Tampermonkey] ❌ URL 不匹配，操作终止。');
                return reject(new Error('Unsupported site'));
            }
            const prev = getOutputNodes().length;
            const ok = sendPrompt();
            if (!ok) {
                console.warn('[Tampermonkey] ❌ 未找到发送按钮');
                reject(new Error('Send button not found'));
                return;
            }
            waitForNewOutput(prev, 60000).then(() => resolve()).catch(err => reject(err));
        });
    }

    function clickOpenNewConversation(timeoutMs = 5000) {
        const cands = ['开启新对话', '新对话', '新建对话', '新建会话', '新聊天', '开始新对话', 'New chat', 'New conversation', 'New Chat'];
        if (SiteKey === 'doubao') {
            return doubaoClickNewChat(Math.min(timeoutMs, 3000)).catch(() => clickOpenByTexts(cands, timeoutMs));
        }
        return clickOpenByTexts(cands, timeoutMs);
    }

    startButtonEl.addEventListener('click', () => {
        setButtonProgress(0);
        if (loginButtonEl.textContent !== 'Logout') { showPluginAlert('Please log in first.'); updateStartButtonUI(false); return; }
        const prompt = promptInputEl.value;
        if (!prompt.trim()) { showPluginAlert('Please enter a prompt.'); updateStartButtonUI(false); return; }
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
                        processPromptsFlow(null, prompts);
                    } else {
                        showPluginAlert('No prompts were returned.');
                        updateStartButtonUI(false);
                    }
                } catch (e) {
                    console.error('[Tampermonkey] ❌ Failed to parse response:', e);
                    showPluginAlert('Failed to process response.');
                    updateStartButtonUI(false);
                }
            },
            onerror: (error) => {
                console.error('[Tampermonkey] ❌ Error:', error);
                showPluginAlert('An error occurred.');
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
                try {
                    await clickOpenNewConversation();
                    console.log(`[Tampermonkey] ✅ New conversation opened successfully.`);
                } catch (e) {
                    console.log('[Tampermonkey] ⚠️ 未找到“新对话”入口，继续在当前对话执行。');
                }

                // 2. 模拟输入/粘贴 prompt
                const editableEl = findEditableInput();
                await simulateInputAtCursor(editableEl || textareaElement, prompt);
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
                showPluginAlert(`Failed to process prompt: "${prompt.substring(0, 10)}..." Error: ${error.message}`);
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
            const outputText = extractLatestOutputText();
            if (!outputText) {
                console.warn('[Tampermonkey] ❌ 未找到蒸馏内容区域');
                showPluginAlert('未找到输出内容。');
                reject('Output content area not found');
                return;
            }
            const outputData = outputText;
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
                        showPluginAlert('Failed to process response.');
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
                let targetEl = activeElement;
                if (!isEditableEl(targetEl)) {
                    targetEl = findEditableInput();
                }
                if (isEditableEl(targetEl)) {
                    clearInterval(interval);
                    targetEl.focus();

                    let done = false;

                    // 方式一：尝试使用 document.execCommand 插入文本
                    if (!done && document.queryCommandSupported && document.queryCommandSupported('insertText')) {
                        try {
                            document.execCommand('insertText', false, message);
                            console.log('[Tampermonkey] 粘贴成功（方式一）');
                            done = true;
                        } catch (_) { /* ignore and try next */ }
                    }

                    // 方式二：如果 execCommand 失败，尝试直接设置值
                    if (!done && typeof targetEl.setSelectionRange === 'function') {
                        try {
                            const start = targetEl.selectionStart ?? targetEl.value.length ?? 0;
                            const end = targetEl.selectionEnd ?? start;
                            targetEl.value = String(targetEl.value || '').substring(0, start) + message + String(targetEl.value || '').substring(end);
                            try { targetEl.setSelectionRange(start + message.length, start + message.length); } catch (_) {}
                            try { targetEl.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
                            try { targetEl.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
                            console.log('[Tampermonkey] 粘贴成功（方式二）');
                            done = true;
                        } catch (_) { /* ignore and try next */ }
                    }

                    // 方式三：如果是 contenteditable 元素
                    if (!done && targetEl.isContentEditable) {
                        try {
                            const selection = window.getSelection();
                            if (selection && selection.rangeCount > 0) {
                                const range = selection.getRangeAt(0);
                                range.deleteContents();
                                const textNode = document.createTextNode(message);
                                range.insertNode(textNode);
                                range.setEndAfter(textNode);
                                range.collapse(false);
                                selection.removeAllRanges();
                                selection.addRange(range);
                                try { targetEl.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
                                console.log('[Tampermonkey] 粘贴成功（方式三）');
                                done = true;
                            }
                        } catch (_) { /* ignore and try next */ }
                    }

                    // 方式四：如果 setSelectionRange 和 contenteditable 也不支持，尝试模拟按键事件
                    if (!done) {
                        try {
                            for (let i = 0; i < message.length; i++) {
                                const keyEvent = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: message[i] });
                                targetEl.dispatchEvent(keyEvent);
                                const inputEvent = new InputEvent('input', { bubbles: true, cancelable: true, data: message[i] });
                                targetEl.dispatchEvent(inputEvent);
                            }
                            console.log('[Tampermonkey] 粘贴成功（方式四）');
                            done = true;
                        } catch (_) { /* ignore */ }
                    }

                    if (done) return resolve();
                    return reject(new Error('Failed to inject text'));
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