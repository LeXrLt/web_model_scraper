// ==UserScript==
// @name         Prompt Fission
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Enhances chat interfaces with prompt fission capabilities.
// @author       You
// @match        https://chat.deepseek.com/*
// @match        http://192.168.2.155:8082/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      192.168.2.155
// ==/UserScript==

(function() {
    'use strict';

    // --- 1. CREATE UI ELEMENTS ---

    // Create the floating button
    const button = document.createElement('div');
    button.textContent = 'P';
    button.id = 'fission-button';
    document.body.appendChild(button);

    // Create the dialog box
    const dialog = document.createElement('div');
    dialog.id = 'fission-dialog';
    dialog.innerHTML = `
        <div id="fission-dialog-content">
            <div id="fission-status-container">
                <span id="fission-login-status">Not Logged In</span>
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
        #fission-button {
            position: fixed;
            top: 50%;
            right: 20px;
            width: 50px;
            height: 50px;
            background-color: #007bff;
            color: white;
            border-radius: 50%;
            display: flex;
            justify-content: center;
            align-items: center;
            cursor: grab;
            user-select: none;
            z-index: 9999;
            transition: right 0.3s ease-in-out;
        }
        #fission-dialog {
            display: none; /* Hidden by default */
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 350px;
            background-color: white;
            border: 1px solid #ccc;
            border-radius: 10px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            z-index: 10000;
            padding: 20px;
            font-family: sans-serif;
        }
        #fission-dialog-content {
            display: flex;
            flex-direction: column;
            gap: 15px;
        }
        #fission-status-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        #fission-login-button, #fission-start-button {
            padding: 5px 10px;
            cursor: pointer;
        }
        #fission-prompt-container {
            display: flex;
            gap: 10px;
        }
        #fission-prompt-input {
            width: 100%;
            height: 60px;
            padding: 5px;
        }
        #fission-progress-bar-container {
            width: 100%;
            height: 20px;
            background-color: #e0e0e0;
            border-radius: 5px;
        }
        #fission-progress-bar {
            width: 0%;
            height: 100%;
            background-color: #4caf50;
            border-radius: 5px;
            transition: width 0.3s;
        }
    `);


    // --- 3. IMPLEMENT UI LOGIC ---

    // Function to toggle dialog visibility
    function toggleDialog() {
        if (dialog.style.display === 'none' || dialog.style.display === '') {
            dialog.style.display = 'block';
        } else {
            dialog.style.display = 'none';
        }
    }

    // Drag and Click logic for the floating button
    button.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevents text selection during drag

        let isDragging = false;
        const startX = e.clientX;
        const startY = e.clientY;
        const offsetX = e.clientX - button.getBoundingClientRect().left;
        const offsetY = e.clientY - button.getBoundingClientRect().top;

        button.style.cursor = 'grabbing';
        button.style.transition = 'none';

        function onMouseMove(moveEvent) {
            if (!isDragging && (Math.abs(moveEvent.clientX - startX) > 5 || Math.abs(moveEvent.clientY - startY) > 5)) {
                isDragging = true;
            }

            if (isDragging) {
                let newX = moveEvent.clientX - offsetX;
                let newY = moveEvent.clientY - offsetY;

                // Constrain movement within the viewport
                const buttonRect = button.getBoundingClientRect();
                if (newX < 0) newX = 0;
                if (newY < 0) newY = 0;
                if (newX + buttonRect.width > window.innerWidth) newX = window.innerWidth - buttonRect.width;
                if (newY + buttonRect.height > window.innerHeight) newY = window.innerHeight - buttonRect.height;

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
                // Snap back to the right edge after dragging
                button.style.transition = 'right 0.3s ease-in-out';
                button.style.left = 'auto';
                button.style.right = '20px';
            } else {
                // This was a click, not a drag
                toggleDialog();
            }
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    // --- 4. IMPLEMENT APPLICATION LOGIC ---

    // Get element references
    const loginStatusEl = document.getElementById('fission-login-status');
    const loginButtonEl = document.getElementById('fission-login-button');
    const startButtonEl = document.getElementById('fission-start-button');
    const promptInputEl = document.getElementById('fission-prompt-input');
    const progressBarEl = document.getElementById('fission-progress-bar');

    // Login status check
    function checkLoginStatus() {
        const token = GM_getValue('authToken', null);
        if (token) {
            loginStatusEl.textContent = 'Logged In';
            loginButtonEl.textContent = 'Logout';
        } else {
            loginStatusEl.textContent = 'Not Logged In';
            loginButtonEl.textContent = 'Login';
        }
    }

    // Login/Logout button handler
    loginButtonEl.addEventListener('click', () => {
        const token = GM_getValue('authToken', null);
        if (token) {
            GM_setValue('authToken', null);
            checkLoginStatus();
        } else {
            window.location.href = 'http://192.168.2.155';
        }
    });

    // "Start" button handler for API call
    startButtonEl.addEventListener('click', () => {
        const token = GM_getValue('authToken', null);
        if (!token) {
            alert('Please log in first.');
            return;
        }

        const prompt = promptInputEl.value;
        if (!prompt.trim()) {
            alert('Please enter a prompt.');
            return;
        }

        GM_xmlhttpRequest({
            method: 'POST',
            url: 'http://192.168.2.155/api/v1/prompt-fission',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            data: JSON.stringify({ prompt: prompt }),
            onprogress: (e) => {
                if (e.lengthComputable) {
                    const percentComplete = (e.loaded / e.total) * 100;
                    progressBarEl.style.width = `${percentComplete}%`;
                }
            },
            onload: (response) => {
                console.log('Response:', response.responseText);
                progressBarEl.style.width = '100%';
                alert('Prompt fission complete! Check the console for the response.');
                setTimeout(() => { progressBarEl.style.width = '0%'; }, 2000);
            },
            onerror: (error) => {
                console.error('Error:', error);
                progressBarEl.style.backgroundColor = 'red';
                alert('An error occurred during prompt fission.');
                setTimeout(() => {
                    progressBarEl.style.width = '0%';
                    progressBarEl.style.backgroundColor = '#4caf50';
                }, 2000);
            }
        });
    });

    // --- 5. INITIALIZE SCRIPT ---
    checkLoginStatus();

})();