// Date utilities

const Dates = {
    // Get today's date in YYYY-MM-DD format
    today() {
        return this.format(new Date());
    },

    // Format date to YYYY-MM-DD
    format(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    // Format for display (e.g., "Mon 15 Jan")
    formatDisplay(dateStr) {
        const date = new Date(dateStr);
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
    },

    // Get date X days ago
    daysAgo(days) {
        const date = new Date();
        date.setDate(date.getDate() - days);
        return this.format(date);
    },

    // Get current month in YYYY-MM format
    currentMonth() {
        const date = new Date();
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
};
