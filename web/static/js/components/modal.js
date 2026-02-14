// Modal component

const Modal = {
    overlay: null,
    modal: null,
    titleEl: null,
    contentEl: null,

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

    open(title, content) {
        this.titleEl.textContent = title;
        
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
    }
};
