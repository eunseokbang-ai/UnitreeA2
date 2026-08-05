let backdrop = null;

export function openModal(innerHtml, { onMount, wide = false } = {}) {
  closeModal();
  backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''}">${innerHtml}</div>`;
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });
  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';
  const modalEl = backdrop.querySelector('.modal');
  if (onMount) onMount(modalEl);
  return modalEl;
}

export function closeModal() {
  if (backdrop) {
    backdrop.remove();
    backdrop = null;
    document.body.style.overflow = '';
  }
}
