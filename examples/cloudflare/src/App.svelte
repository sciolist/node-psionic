<script lang="ts">
  import { server, ready } from "./api";
  let prompt = "";

  let chatlog: HTMLDivElement | null = null;

  let pending = false;
  let conversation: any[] = [];
  let newMessage: any[] = [];

  async function call() {
    conversation = [...conversation, { from: 'user', content: prompt }];
    const sent = prompt;
    prompt = "";

    pending = true;
    try {
      if (!$server.prompt) return;
      for await (const result of $server.prompt(sent)) {
        if (result.type === "response.output_text.delta") {
          newMessage = [...newMessage, result.delta];
        }
      }
    } catch (ex: any) {
      newMessage = [...newMessage, `\n\nError: ${ex.message}\n\n---\n\n`];
    } finally {
      pending = false;
      conversation = [...conversation, { from: 'assistant', content: newMessage.join("") }];
      newMessage = [];
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && !pending) {
      e.preventDefault();
      call();
    }
  }

  function setupMutationObserver(node: HTMLDivElement) {
    if (!node) return;
    const observer = new MutationObserver(updateScroll);
    updateScroll();
    observer.observe(node, { childList: true, subtree: true });
    function updateScroll() {
      window.requestAnimationFrame(() => {
        if (!chatlog) return;
        chatlog.scrollTop = chatlog.scrollHeight;
      });
    }
    return {
      destroy() {
        observer.disconnect();
      },
    };
  }
</script>

<div class="shell">
  <!-- Ambient background glow -->
  <div class="glow glow-1"></div>
  <div class="glow glow-2"></div>

  <header class="topbar">
    <div class="logo-mark">
      <svg viewBox="0 0 28 28" width="28" height="28" fill="none">
        <rect x="2" y="2" width="24" height="24" rx="7" stroke="url(#g1)" stroke-width="2"/>
        <circle cx="10" cy="14" r="2" fill="url(#g1)"/>
        <circle cx="18" cy="14" r="2" fill="url(#g1)"/>
        <path d="M9 18.5c1.5 1.5 3 2 5 2s3.5-.5 5-2" stroke="url(#g1)" stroke-width="1.5" stroke-linecap="round"/>
        <defs>
          <linearGradient id="g1" x1="0" y1="0" x2="28" y2="28">
            <stop stop-color="#6ee7b7"/>
            <stop offset="1" stop-color="#3b82f6"/>
          </linearGradient>
        </defs>
      </svg>
    </div>
    <div class="topbar-text">
      <span class="topbar-title">Chat</span>
      <span class="topbar-status" class:live={$ready}>
        <span class="status-dot"></span>
        {$ready ? 'Connected' : 'Offline'}
      </span>
    </div>
  </header>

  <div class="chatlog" bind:this={chatlog} use:setupMutationObserver>
    {#each conversation as message, i (i)}
      <div class="msg-row" class:is-user={message.from === 'user'} class:no-anim={message.from === 'assistant'}>
        {#if message.from === 'assistant'}
          <div class="avatar assistant-avatar">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
              <circle cx="7" cy="10" r="1.5" fill="#6ee7b7"/>
              <circle cx="13" cy="10" r="1.5" fill="#3b82f6"/>
            </svg>
          </div>
        {/if}
        <div class="bubble" class:user-bubble={message.from === 'user'} class:assistant-bubble={message.from === 'assistant'}>
          <span class="msg-text">{message.content}</span>
        </div>
      </div>
    {/each}

    {#if pending}
      <div class="msg-row">
        <div class="avatar assistant-avatar">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
            <circle cx="7" cy="10" r="1.5" fill="#6ee7b7"/>
            <circle cx="13" cy="10" r="1.5" fill="#3b82f6"/>
          </svg>
        </div>
        <div class="bubble assistant-bubble streaming">
          {#each newMessage as result, i (i)}
            <span class="msg-text">{result}</span>
          {/each}
          <span class="caret"></span>
        </div>
      </div>
    {/if}
  </div>

  {#if $server.prompt}
    <div class="composer">
      <div class="composer-inner">
        <textarea
          bind:value={prompt}
          on:keydown={handleKeydown}
          placeholder="Message…"
          rows="1"
        ></textarea>
        <button
          class="send-btn"
          on:click={call}
          disabled={pending || !prompt.trim()}
          title="Send"
          class:ready={!pending && prompt.trim()}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="19" x2="12" y2="5"/>
            <polyline points="5 12 12 5 19 12"/>
          </svg>
        </button>
      </div>
      <span class="composer-hint">Enter to send · Shift+Enter for new line</span>
    </div>
  {/if}
</div>

<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&family=JetBrains+Mono:wght@400;500&display=swap');

  :global(body) {
    margin: 0;
    padding: 0;
    background: #0a0a0f;
    overflow: hidden;
  }

  * {
    box-sizing: border-box;
  }

  .shell {
    position: relative;
    max-width: 44em;
    margin: 0 auto;
    height: 100vh;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    font-family: 'DM Sans', sans-serif;
    font-size: 0.9rem;
    color: #e4e4e7;
    background: #0c0c14;
    overflow: hidden;
  }

  /* ── Ambient glows ── */
  .glow {
    position: absolute;
    border-radius: 50%;
    filter: blur(100px);
    opacity: 0.15;
    pointer-events: none;
    z-index: 0;
  }
  .glow-1 {
    width: 400px;
    height: 400px;
    background: #6ee7b7;
    top: -120px;
    left: -80px;
    animation: drift1 12s ease-in-out infinite alternate;
  }
  .glow-2 {
    width: 350px;
    height: 350px;
    background: #3b82f6;
    bottom: -100px;
    right: -60px;
    animation: drift2 14s ease-in-out infinite alternate;
  }
  @keyframes drift1 {
    to { transform: translate(60px, 40px); }
  }
  @keyframes drift2 {
    to { transform: translate(-50px, -30px); }
  }

  /* ── Header ── */
  .topbar {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 0.75em;
    padding: 1em 1.25em;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    backdrop-filter: blur(20px);
    background: rgba(12,12,20,0.7);
  }
  .logo-mark {
    display: grid;
    place-items: center;
  }
  .topbar-text {
    display: flex;
    flex-direction: column;
    gap: 0.1em;
  }
  .topbar-title {
    font-weight: 600;
    font-size: 0.95rem;
    letter-spacing: -0.01em;
    color: #f4f4f5;
  }
  .topbar-status {
    display: flex;
    align-items: center;
    gap: 0.35em;
    font-size: 0.7rem;
    color: #71717a;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #52525b;
    transition: background 0.3s;
  }
  .topbar-status.live .status-dot {
    background: #34d399;
    box-shadow: 0 0 6px #34d39988;
  }

  /* ── Chat log ── */
  .chatlog {
    position: relative;
    z-index: 1;
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 1.5em 1.25em;
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.08) transparent;
  }
  .chatlog::-webkit-scrollbar {
    width: 5px;
  }
  .chatlog::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.08);
    border-radius: 10px;
  }

  /* ── Messages ── */
  .msg-row {
    display: flex;
    align-items: flex-end;
    gap: 0.5em;
  }
  .msg-row.is-user {
    justify-content: flex-end;
    animation: fadeUp 0.25s ease-out both;
  }

  .msg-row.no-anim {
    animation: none;
  }

  @keyframes fadeUp {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .avatar {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    margin-bottom: 2px;
  }
  .assistant-avatar {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
  }

  .bubble {
    max-width: 75%;
    padding: 0.65em 0.9em;
    border-radius: 1.1em;
    line-height: 1.55;
    font-size: 0.88rem;
    position: relative;
  }
  .user-bubble {
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    color: #f0f6ff;
    border-bottom-right-radius: 0.3em;
    box-shadow: 0 2px 12px rgba(37,99,235,0.25);
  }
  .assistant-bubble {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.07);
    color: #d4d4d8;
    border-bottom-left-radius: 0.3em;
    backdrop-filter: blur(8px);
  }

  .msg-text {
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* ── Streaming caret ── */
  .caret {
    display: inline-block;
    width: 2px;
    height: 1.05em;
    margin-left: 1px;
    vertical-align: text-bottom;
    border-radius: 1px;
    background: linear-gradient(to bottom, #6ee7b7, #3b82f6);
    animation: caretPulse 0.8s ease-in-out infinite;
  }
  @keyframes caretPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.2; }
  }

  /* ── Composer ── */
  .composer {
    position: relative;
    z-index: 2;
    padding: 0.75em 1.25em 1em;
    display: flex;
    flex-direction: column;
    gap: 0.4em;
    border-top: 1px solid rgba(255,255,255,0.06);
    backdrop-filter: blur(20px);
    background: rgba(12,12,20,0.7);
  }
  .composer-inner {
    display: flex;
    align-items: flex-end;
    gap: 0.5em;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 1em;
    padding: 0.35em 0.4em 0.35em 0.85em;
    transition: border-color 0.2s;
  }
  .composer-inner:focus-within {
    border-color: rgba(59,130,246,0.5);
    box-shadow: 0 0 0 3px rgba(59,130,246,0.08);
  }
  .composer-hint {
    font-size: 0.65rem;
    color: #3f3f46;
    text-align: center;
    letter-spacing: 0.02em;
  }

  textarea {
    flex: 1;
    resize: none;
    border: none;
    background: transparent;
    padding: 0.5em 0;
    font: inherit;
    font-size: 0.88rem;
    color: #e4e4e7;
    outline: none;
    line-height: 1.5;
    min-height: 1.5em;
    max-height: 8em;
  }
  textarea::placeholder {
    color: #52525b;
  }

  .send-btn {
    display: grid;
    place-items: center;
    width: 2.2em;
    height: 2.2em;
    border: none;
    border-radius: 0.7em;
    background: rgba(255,255,255,0.06);
    color: #52525b;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.2s ease;
    margin-bottom: 4px;
  }
  .send-btn.ready {
    background: linear-gradient(135deg, #34d399, #3b82f6);
    color: white;
    box-shadow: 0 2px 10px rgba(59,130,246,0.3);
  }
  .send-btn.ready:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(59,130,246,0.4);
  }
  .send-btn:disabled {
    cursor: default;
  }
  .send-btn.ready:active {
    transform: translateY(0);
  }

  /* ── Scrollbar for Webkit ── */
  .chatlog::-webkit-scrollbar-track {
    background: transparent;
  }
</style>
