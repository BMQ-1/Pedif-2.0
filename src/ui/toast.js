/**
 * iOS-Style Floating Toast Notification
 */

export function showToast(message, icon = 'check', duration = 2200) {
  let toastEl = document.getElementById('toast');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'toast';
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }

  let iconSvg = '';
  if (icon === 'check') {
    iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px;display:inline-block;vertical-align:-2px;margin-right:6px;"><polyline points="20 6 9 17 4 12"/></svg>';
  } else if (icon === 'star') {
    iconSvg = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" style="width:16px;height:16px;display:inline-block;vertical-align:-2px;margin-right:6px;color:#ffcc00;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
  } else if (icon === 'trash') {
    iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;display:inline-block;vertical-align:-2px;margin-right:6px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
  }

  toastEl.innerHTML = `${iconSvg}<span>${message}</span>`;
  toastEl.classList.add('on');

  if (toastEl._timer) clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => {
    toastEl.classList.remove('on');
  }, duration);
}
