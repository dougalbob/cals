// Modal component

const Modal = {
    overlay: null,
    modal: null,
    titleEl: null,
    contentEl: null,
    onCloseCallback: null,

    init() {
        this.overlay = document.getElementById('modal-overlay');
        this.modal = document.getElementById('modal');
        this.titleEl = this.modal.querySelector('.modal-title');
        this.contentEl = this.modal.querySelector('.modal-content');

        // Close on overlay click
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.close();
            }
        });

        // Close button
        this.modal.querySelector('.modal-close').addEventListener('click', () => {
            this.close();
        });

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.overlay.classList.contains('active')) {
                this.close();
            }
        });
    },

    open(title, content, onClose = null) {
        this.titleEl.textContent = title;
        this.onCloseCallback = onClose;
        
        if (typeof content === 'string') {
            this.contentEl.innerHTML = content;
        } else {
            this.contentEl.innerHTML = '';
            this.contentEl.appendChild(content);
        }

        this.overlay.classList.add('active');
    },

    close() {
        this.overlay.classList.remove('active');
        if (this.onCloseCallback) {
            const callback = this.onCloseCallback;
            this.onCloseCallback = null;
            // Small delay to let the modal close animation complete
            setTimeout(() => callback(), 100);
        }
    },

    // Close without triggering callback (for when we're navigating to another modal)
    closeWithoutCallback() {
        this.onCloseCallback = null;
        this.overlay.classList.remove('active');
    }
};
