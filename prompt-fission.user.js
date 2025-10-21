// ==UserScript==
// @name         Prompt Fission
// @namespace    http://tampermonkey.net/
// @version      0.5
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
    const TOKEN_SYNC_URL = 'https://prompt.zheshi.tech';

    // --- 1. CREATE UI ELEMENTS ---
    const button = document.createElement('div');
    button.textContent = 'P';
    button.id = 'fission-button';
    document.body.appendChild(button);

    const dialog = document.createElement('div');
    dialog.id = 'fission-dialog';
    dialog.innerHTML = `
        <div id="fission-dialog-header">Prompt Fission</div>
        <div id="fission-dialog-content">
            <div id="fission-status-container">
                <span id="fission-login-status">Verifying...</span>
                <button id="fission-login-button">Login</button>
            </div>
            <div id="fission-prompt-container">
                <textarea id="fission-prompt-input" placeholder="Enter your prompt here..."></textarea>
                <button id="fission-start-button">Start</button>
            </div>
            <div id="fission-progress-bar-container">
                <div id="fission-progress-bar"></div>
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
        #fission-progress-bar-container { width: 100%; height: 20px; background-color: #e0e0e0; border-radius: 5px; }
        #fission-progress-bar { width: 0%; height: 100%; background-color: #4caf50; border-radius: 5px; transition: width 0.3s; }
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
    const progressBarEl = document.getElementById('fission-progress-bar');

    function updateLoginUI(isLoggedIn, statusText = '') {
        loginStatusEl.textContent = statusText || (isLoggedIn ? 'Logged In' : 'Not Logged In');
        loginButtonEl.textContent = isLoggedIn ? 'Logout' : 'Login';
    }

    function checkLoginStatus() {
        const token = GM_getValue('authToken', null);
        if (!token) return updateLoginUI(false);
        updateLoginUI(false, 'Verifying...');
        GM_xmlhttpRequest({
            method: 'GET',
            url: `${API_BASE_URL}/profile`,
            headers: { 'Authorization': `Bearer ${token}` },
            onload: (response) => {
                if (response.status === 200) {
                    updateLoginUI(true);
                    queryPendingTasks().then(tasks => {
                        if (tasks && tasks.length > 0) {
                            console.log(`[Tampermonkey] 📝 You have ${tasks.length} pending tasks.`);
                            confirmAction(`You have ${tasks.length} pending tasks. Do you want to process them now?`).then(confirmed => {
                                if (confirmed) {
                                    const textareaElement = document.querySelector('textarea[class*="ds-scroll-area"][class*="d96f2d2a"]');
                                    // const prompts = tasks.map(task => ({ sub_task_id: task.id, prompt: task.prompt }));
                                    processPromptsFlow(textareaElement, tasks);
                                }
                            });
                        }
                    }).catch(err => {
                        console.error('[Tampermonkey] ❌ Failed to query pending tasks:', err);
                    });
                }
                else { GM_setValue('authToken', null); updateLoginUI(false); }
            },
            onerror: () => { GM_setValue('authToken', null); updateLoginUI(false, 'Error'); }
        });
    }

    // 查询待处理任务接口
    function queryPendingTasks() {
        return new Promise((resolve, reject) => {
            const token = GM_getValue('authToken', null);
            if (!token || loginButtonEl.textContent !== 'Logout') {
                console.warn('[Tampermonkey] ❌ 未登录，无法查询待处理任务');
                return reject('Not logged in');
            }
            GM_xmlhttpRequest({
                method: 'GET',
                url: `${API_BASE_URL}/pending-tasks`,
                headers: { 'Authorization': `Bearer ${token}` },
                onload: (response) => {
                    try {
                        const data = JSON.parse(response.responseText);
                        resolve(data);
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
        if (loginButtonEl.textContent === 'Logout') { GM_setValue('authToken', null); updateLoginUI(false); }
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

    startButtonEl.addEventListener('click', () => {
        progressBarEl.style.width = '0%';
        const token = GM_getValue('authToken', null);
        if (!token || loginButtonEl.textContent !== 'Logout') return alert('Please log in first.');
        const prompt = promptInputEl.value;
        if (!prompt.trim()) return alert('Please enter a prompt.');
        GM_xmlhttpRequest({
            method: 'POST',
            url: `${API_BASE_URL}/prompt-fission`,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            data: JSON.stringify({ prompt }),
            // onprogress: (e) => { if (e.lengthComputable) progressBarEl.style.width = `${(e.loaded / e.total) * 100}%`; },
            onload: (response) => {
                // progressBarEl.style.width = '100%';
                try {
                    const prompts = JSON.parse(response.responseText);
                    // console.log('[Tampermonkey] 📥 Received response:', data);
                    if (prompts && prompts.length > 0) {
                        const textareaElement = document.querySelector('textarea[class*="ds-scroll-area"][class*="d96f2d2a"]');
                        processPromptsFlow(textareaElement, prompts);
                    } else {
                        alert('No prompts were returned.');
                    }
                } catch (e) {
                    console.error('[Tampermonkey] ❌ Failed to parse response:', e);
                    alert('Failed to process response.');
                }
            },
            onerror: (error) => {
                console.error('[Tampermonkey] ❌ Error:', error);
                progressBarEl.style.backgroundColor = 'red';
                alert('An error occurred.');
                setTimeout(() => { progressBarEl.style.width = '0%'; progressBarEl.style.backgroundColor = '#4caf50'; }, 2000);
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
        progressBarEl.style.width = '0%';
        // 确保 prompts 是一个数组，并且有内容
        if (!Array.isArray(prompts) || prompts.length === 0) {
            console.log("[Tampermonkey] ⚠️ No prompts provided or prompts is not an array.");
            return;
        }

        console.log(`[Tampermonkey] 🚀 Starting to process ${prompts.length} prompts...`);

        // 使用 for...of 循环按顺序处理每个 prompt
        for (let i = 0; i < prompts.length; i++) {
            const prompt = prompts[i].prompt;
            const subTaskId = prompts[i].sub_task_id;
            try {
                console.log(`[Tampermonkey] ⏳ Processing prompt: "${prompt.substring(0, 10)}..."`);

                // 1. 模拟输入/粘贴 prompt
                await simulateInputAtCursor(textareaElement, prompt);
                console.log(`[Tampermonkey] ✅ Prompt pasted successfully.`);

                // 2. 执行 prompt
                await executePromptOnPagePromise();
                console.log(`[Tampermonkey] ✅ Prompt executed successfully.`);

                // 3. 上传蒸馏数据
                await uploadDistillationData(prompt, subTaskId);
                console.log(`[Tampermonkey] ✅ Distillation data uploaded successfully.`);

                // 4. 更新进度条（如果有的话）
                progressBarEl.style.width = `${((i + 1) / prompts.length) * 100}%`;
                // 可选：等待一段时间，以便观察或等待页面加载
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                // 如果一个 prompt 失败，记录错误并继续处理下一个 prompt (或选择中断)
                console.error(`[Tampermonkey] ❌ Failed to process prompt: "${prompt.substring(0, 10)}..."`, error);
                // 如果希望失败时停止整个流程，可以在这里加上 `throw error;` 或 `return;`
            }
        }

        console.log("[Tampermonkey] 🎉 All prompts processed successfully (or finished execution).");
    }

    function uploadDistillationData(prompt, subTaskId) {
        return new Promise((resolve, reject) => {
            const token = GM_getValue('authToken', null);
            if (!token || loginButtonEl.textContent !== 'Logout') {
                console.warn('[Tampermonkey] ❌ 未登录，无法上传蒸馏数据');
                return reject('Not logged in');
            }
            const thinkingContents = document.querySelectorAll('div[class*="ds-think-content"]');
            const outputContents = document.querySelectorAll('div[class*="ds-markdown"]');
            if (thinkingContents.length === 0 || outputContents.length === 0) {
                console.warn('[Tampermonkey] ❌ 未找到蒸馏内容区域');
                reject('Thinking content area not found');
            }
            const thinkingContent = thinkingContents[thinkingContents.length - 1];
            const thinkingData = thinkingContent.innerText;
            const outputContent = outputContents[outputContents.length - 1];
            const outputData = outputContent.innerText;
            const jsonData = JSON.stringify({ sub_task_id: subTaskId, prompt: prompt, inference_process: thinkingData, model_output: outputData });
            // console.log('[Tampermonkey] 📤 上传蒸馏数据:', jsonData);
            GM_xmlhttpRequest({
                method: 'POST',
                url: `${API_BASE_URL}/distillation-data`,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
                            // console.log('粘贴成功（方式一）');
                            resolve();
                        } catch (e) {
                            // console.warn('方式一失败，尝试其他方法');
                            reject(e);
                        }
                    }

                    // 方式二：如果 execCommand 失败，尝试直接设置值
                    if (activeElement.setSelectionRange) {
                        const start = activeElement.selectionStart;
                        const end = activeElement.selectionEnd;
                        activeElement.value = activeElement.value.substring(0, start) + message + activeElement.value.substring(end);
                        activeElement.setSelectionRange(start + message.length, start + message.length);
                        // console.log('粘贴成功（方式二）');
                        resolve();
                    }

                    // 方式三：如果是 contenteditable 元素
                    if (activeElement.isContentEditable) {
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
                            // console.log('粘贴成功（方式三）');
                            resolve();
                        }
                    }

                    // 方式四：如果 setSelectionRange 和 contenteditable 也不支持，尝试模拟按键事件
                    for (let i = 0; i < message.length; i++) {
                        const keyEvent = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: message[i] });
                        activeElement.dispatchEvent(keyEvent);
                        const inputEvent = new InputEvent('input', { bubbles: true, cancelable: true, data: message[i] });
                        activeElement.dispatchEvent(inputEvent);
                    }
                    // console.log('粘贴成功（方式四）');
                    resolve();
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
    if (currentUrl.startsWith(TOKEN_SYNC_URL)) {
        const token = localStorage.getItem('token');
        if (token) {
            GM_setValue('authToken', token);
            checkLoginStatus();
        }
    } else {
        checkLoginStatus();
    }

})();