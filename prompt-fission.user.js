// ==UserScript==
// @name         Prompt Fission
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Enhances chat interfaces with prompt fission capabilities.
// @author       You
// @match        https://chat.deepseek.com/*
// @match        http://127.0.0.1:8082/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      127.0.0.1
// ==/UserScript==

(function() {
    'use strict';

    // --- CONFIGURATION ---
    const API_BASE_URL = 'http://127.0.0.1:8081/api/v1';
    const LOGIN_URL = 'http://127.0.0.1:8082';
    const TOKEN_SYNC_URL = 'http://127.0.0.1:8082';

    // --- 1. CREATE UI ELEMENTS ---
    const button = document.createElement('div');
    button.textContent = 'P';
    button.id = 'fission-button';
    document.body.appendChild(button);

    const dialog = document.createElement('div');
    dialog.id = 'fission-dialog';
    dialog.innerHTML = `
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
        #fission-dialog { display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 350px; background-color: white; border: 1px solid #ccc; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); z-index: 10000; padding: 20px; font-family: sans-serif; }
        #fission-dialog-content { display: flex; flex-direction: column; gap: 15px; }
        #fission-status-container { display: flex; justify-content: space-between; align-items: center; }
        #fission-login-button, #fission-start-button { padding: 5px 10px; cursor: pointer; }
        #fission-prompt-container { display: flex; gap: 10px; }
        #fission-prompt-input { width: 100%; height: 60px; padding: 5px; }
        #fission-progress-bar-container { width: 100%; height: 20px; background-color: #e0e0e0; border-radius: 5px; }
        #fission-progress-bar { width: 0%; height: 100%; background-color: #4caf50; border-radius: 5px; transition: width 0.3s; }
    `);


    // --- 3. IMPLEMENT UI LOGIC ---
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
                if (response.status === 200) updateLoginUI(true);
                else { GM_setValue('authToken', null); updateLoginUI(false); }
            },
            onerror: () => { GM_setValue('authToken', null); updateLoginUI(false, 'Error'); }
        });
    }

    loginButtonEl.addEventListener('click', () => {
        if (loginButtonEl.textContent === 'Logout') { GM_setValue('authToken', null); updateLoginUI(false); }
        else { window.location.href = LOGIN_URL; }
    });

    function executePromptOnPage(prompt) {
        const currentUrl = window.current_url_for_testing || window.location.href;
        if (!currentUrl.startsWith('https://chat.deepseek.com')) return;
        const textarea = document.querySelector('textarea');
        const sendButton = document.querySelector('div.ds-icon-button__hover-bg');
        if (textarea && sendButton) {
            textarea.value = prompt;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            sendButton.click();
        } else {
            console.error('Could not find textarea or send button.');
        }
    }

    startButtonEl.addEventListener('click', () => {
        const token = GM_getValue('authToken', null);
        if (!token || loginButtonEl.textContent !== 'Logout') return alert('Please log in first.');
        const prompt = promptInputEl.value;
        if (!prompt.trim()) return alert('Please enter a prompt.');
        GM_xmlhttpRequest({
            method: 'POST',
            url: `${API_BASE_URL}/prompt-fission`,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            data: JSON.stringify({ prompt }),
            onprogress: (e) => { if (e.lengthComputable) progressBarEl.style.width = `${(e.loaded / e.total) * 100}%`; },
            onload: (response) => {
                progressBarEl.style.width = '100%';
                try {
                    const data = JSON.parse(response.responseText);
                    if (data.prompts && data.prompts.length > 0) {
                        executePromptOnPage(data.prompts[0]);
                        alert('First prompt is being executed.');
                    } else {
                        alert('No prompts were returned.');
                    }
                } catch (e) {
                    console.error('Failed to parse response:', e);
                    alert('Failed to process response.');
                }
                setTimeout(() => { progressBarEl.style.width = '0%'; }, 2000);
            },
            onerror: (error) => {
                console.error('Error:', error);
                progressBarEl.style.backgroundColor = 'red';
                alert('An error occurred.');
                setTimeout(() => { progressBarEl.style.width = '0%'; progressBarEl.style.backgroundColor = '#4caf50'; }, 2000);
            }
        });
    });


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