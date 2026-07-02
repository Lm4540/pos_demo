// RG Simple POS - Helpers de Interfaz de Usuario (Toasts y Modales)

// --- SISTEMA DE TOASTS ---
window.showToast = (message, type = 'info') => {
  // Crear el contenedor de toasts si no existe
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'fixed bottom-5 right-5 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none';
    document.body.appendChild(container);
  }

  // Crear el elemento del toast
  const toast = document.createElement('div');
  toast.className = 'transform translate-y-5 opacity-0 transition-all duration-300 pointer-events-auto flex items-center p-4 rounded-xl border shadow-xl bg-neutral-900 ';
  
  // Asignar colores según el tipo
  let iconColor = 'text-blue-500 border-blue-900/60 bg-blue-950/40';
  let iconSvg = `<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
  
  if (type === 'success') {
    toast.classList.add('border-emerald-800/80');
    iconColor = 'text-emerald-400';
    iconSvg = `<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
  } else if (type === 'error') {
    toast.classList.add('border-red-800/80');
    iconColor = 'text-red-400';
    iconSvg = `<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
  } else if (type === 'warning') {
    toast.classList.add('border-amber-800/80');
    iconColor = 'text-amber-400';
    iconSvg = `<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>`;
  } else {
    toast.classList.add('border-neutral-800');
    iconColor = 'text-blue-400';
  }

  toast.innerHTML = `
    <div class="mr-3 flex-shrink-0 ${iconColor}">
      ${iconSvg}
    </div>
    <div class="text-sm font-medium text-white flex-grow">${message}</div>
    <button onclick="this.parentElement.remove()" class="ml-4 text-neutral-500 hover:text-white cursor-pointer transition-colors">
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
    </button>
  `;

  container.appendChild(toast);

  // Trigger animation (reflow to apply transform)
  setTimeout(() => {
    toast.classList.remove('translate-y-5', 'opacity-0');
  }, 10);

  // Auto remove after 3.5 seconds
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3500);
};

// --- SISTEMA DE CONFIRMACIÓN MODAL ---
window.showConfirm = (message, onConfirm, onCancel = null) => {
  // Crear el overlay si no existe
  let overlay = document.getElementById('confirm-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'confirm-overlay';
    overlay.className = 'fixed inset-0 bg-neutral-950/80 backdrop-blur-sm hidden flex items-center justify-center p-4 z-50 transition-opacity duration-300';
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div class="bg-neutral-900 border border-neutral-800 w-full max-w-md p-6 rounded-2xl shadow-2xl relative transform scale-95 opacity-0 transition-all duration-300" id="confirm-card">
      <div class="flex items-start gap-4">
        <div class="h-10 w-10 rounded-xl bg-amber-950/60 border border-amber-800 text-amber-500 flex items-center justify-center flex-shrink-0">
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div>
          <h3 class="text-lg font-bold text-white">¿Confirmar Acción?</h3>
          <p class="text-neutral-400 text-sm mt-2">${message}</p>
        </div>
      </div>
      
      <div class="flex justify-end gap-3 pt-4 mt-2">
        <button id="confirm-btn-cancel" class="px-4 py-2.5 text-sm font-semibold text-neutral-400 bg-neutral-800 hover:bg-neutral-750 rounded-xl transition-all cursor-pointer">
          Cancelar
        </button>
        <button id="confirm-btn-accept" class="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all cursor-pointer shadow-md shadow-blue-500/10">
          Aceptar
        </button>
      </div>
    </div>
  `;

  const card = document.getElementById('confirm-card');

  // Trigger modal visibility
  overlay.classList.remove('hidden');
  setTimeout(() => {
    card.classList.remove('scale-95', 'opacity-0');
  }, 10);

  const closeConfirm = () => {
    card.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
      overlay.classList.add('hidden');
    }, 200);
  };

  document.getElementById('confirm-btn-accept').onclick = () => {
    closeConfirm();
    if (onConfirm) onConfirm();
  };

  document.getElementById('confirm-btn-cancel').onclick = () => {
    closeConfirm();
    if (onCancel) onCancel();
  };
};
