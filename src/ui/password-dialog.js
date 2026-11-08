/**
 * Sovereign Password Dialog
 * Prompts user for password to decrypt encrypted PDFs without blocking alerts.
 */

export class PasswordDialog {
  constructor() {
    this.modalEl = null;
    this.pendingCallback = null;
  }

  show(reason = 1) {
    return new Promise((resolve) => {
      let modal = document.getElementById('password-dialog-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'password-dialog-modal';
        modal.className = 'extract-modal-backdrop';
        document.body.appendChild(modal);
      }
      this.modalEl = modal;

      const isRetry = reason === 2; // PDF.js PasswordResponses.NEED_PASSWORD with incorrect password

      modal.innerHTML = `
        <div class="extract-modal-card glass stagger" style="max-width: 400px;">
          <div class="extract-modal-header">
            <div class="extract-header-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="extract-icon">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <div>
                <h3>Password Protected</h3>
                <p>${isRetry ? 'Incorrect password. Try again.' : 'This document is encrypted.'}</p>
              </div>
            </div>
            <button class="b sm rip" id="btn-pwd-close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div class="extract-modal-body" style="padding-top: 12px;">
            <label style="font-size: 13px; font-weight: 500; color: var(--tx2); margin-bottom: 6px; display: block;">
              Document Password
            </label>
            <div style="position: relative;">
              <input type="password" id="pdf-password-input" class="extract-input ${isRetry ? 'error' : ''}" placeholder="Enter password to unlock..." autofocus style="padding-right: 38px;" />
              <button type="button" id="btn-pwd-toggle-visibility" class="b sm" style="position: absolute; right: 4px; top: 4px; padding: 6px; border: none; background: transparent;" title="Show/Hide">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
            </div>
          </div>

          <div class="extract-modal-footer">
            <button class="btn-cancel rip" id="btn-pwd-cancel">Cancel</button>
            <button class="btn-primary rip" id="btn-pwd-submit">Unlock Document</button>
          </div>
        </div>
      `;

      modal.classList.add('on');

      const input = modal.querySelector('#pdf-password-input');
      const submitBtn = modal.querySelector('#btn-pwd-submit');
      const cancelBtn = modal.querySelector('#btn-pwd-cancel');
      const closeBtn = modal.querySelector('#btn-pwd-close');
      const toggleVisBtn = modal.querySelector('#btn-pwd-toggle-visibility');

      const cleanup = (val) => {
        modal.classList.remove('on');
        resolve(val);
      };

      const submit = () => {
        const pwd = input.value;
        if (!pwd) return;
        cleanup(pwd);
      };

      submitBtn.addEventListener('click', submit);
      cancelBtn.addEventListener('click', () => cleanup(null));
      closeBtn.addEventListener('click', () => cleanup(null));

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') cleanup(null);
      });

      toggleVisBtn.addEventListener('click', () => {
        input.type = input.type === 'password' ? 'text' : 'password';
      });

      setTimeout(() => input.focus(), 60);
    });
  }

  hide() {
    if (this.modalEl) {
      this.modalEl.classList.remove('on');
    }
  }
}

export const passwordDialog = new PasswordDialog();
